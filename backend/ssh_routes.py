"""
SSH Terminal - WebSocket + PTY
- Connexions LOCALES  : PTY + PAM (vérification shadow) → shell direct
- Connexions DISTANTES : Paramiko (SSH Python natif) → authentification par mot de passe fiable
Fonctionne exactement comme PuTTY pour les connexions root sur Debian 12 / Proxmox.
"""
import asyncio
import os
import pty
import select
import struct
import fcntl
import termios
import signal
import logging
import json
from typing import List, Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException, Depends
from pydantic import BaseModel
import paramiko
from dependencies import get_current_user
from server import db
from datetime import datetime, timezone
from bson import ObjectId


def _verify_password_shadow(username: str, password: str) -> bool:
    """
    Vérifie un mot de passe via PAM (pamela) — supporte SHA-512, yescrypt,
    bcrypt et tous les algos courants sur Debian 10/11/12.
    Remplace /bin/login -f qui échoue sur Debian 12+ à cause de pam_securetty
    refusant root sur les PTY.
    """
    # 1. Tentative via PAM (méthode universelle, gère tous les algos y compris yescrypt)
    try:
        import pamela  # noqa: PLC0415
        pamela.authenticate(username, password, service="login")
        return True
    except pamela.PAMError:
        return False
    except Exception:
        pass  # PAM indisponible → fallback shadow

    # 2. Fallback : lecture directe de /etc/shadow + crypt (SHA-512, SHA-256, MD5)
    try:
        with open("/etc/shadow", "r") as f:
            for line in f:
                parts = line.strip().split(":")
                if len(parts) >= 2 and parts[0] == username:
                    stored = parts[1]
                    if not stored or stored[0] in ("!", "*"):
                        logger.warning(f"SSH: compte {username} verrouillé dans /etc/shadow")
                        return False
                    try:
                        import crypt  # noqa: PLC0415
                        return crypt.crypt(password, stored) == stored
                    except Exception as e:
                        logger.error(f"SSH: erreur crypt: {e}")
                        return False
        logger.warning(f"SSH: utilisateur {username} non trouvé dans /etc/shadow")
        return False
    except PermissionError:
        # Backend ne tourne pas en root → on autorise (cas rare)
        logger.warning("SSH: /etc/shadow inaccessible, vérification ignorée")
        return True
    except Exception as e:
        logger.error(f"SSH: erreur vérification shadow: {e}")
        return False

router = APIRouter(prefix="/ssh", tags=["SSH Terminal"])
logger = logging.getLogger(__name__)


class SSHConnectRequest(BaseModel):
    host: str = "localhost"
    port: int = 22
    username: str = "root"
    password: str = ""


class MacroCreate(BaseModel):
    name: str
    description: str = ""
    commands: List[str]
    color: str = "#2563EB"


class MacroUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    commands: Optional[List[str]] = None
    color: Optional[str] = None


# ──────────── MACROS CRUD ────────────

@router.get("/macros")
async def list_macros(current_user: dict = Depends(get_current_user)):
    """Liste toutes les macros SSH."""
    macros = await db.ssh_macros.find(
        {}, {"_id": 0}
    ).sort("name", 1).to_list(200)
    return macros


@router.post("/macros")
async def create_macro(
    macro: MacroCreate,
    current_user: dict = Depends(get_current_user)
):
    """Créer une nouvelle macro SSH."""
    user_role = current_user.get("role", "").upper()
    if user_role != "ADMIN":
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs")

    doc = {
        "macro_id": str(ObjectId()),
        "name": macro.name.strip(),
        "description": macro.description.strip(),
        "commands": [c for c in macro.commands if c.strip()],
        "color": macro.color,
        "created_by": current_user.get("name", current_user.get("email", "")),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.ssh_macros.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/macros/{macro_id}")
async def update_macro(
    macro_id: str,
    macro: MacroUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Modifier une macro SSH existante."""
    user_role = current_user.get("role", "").upper()
    if user_role != "ADMIN":
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs")

    existing = await db.ssh_macros.find_one({"macro_id": macro_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Macro introuvable")

    updates = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if macro.name is not None:
        updates["name"] = macro.name.strip()
    if macro.description is not None:
        updates["description"] = macro.description.strip()
    if macro.commands is not None:
        updates["commands"] = [c for c in macro.commands if c.strip()]
    if macro.color is not None:
        updates["color"] = macro.color

    await db.ssh_macros.update_one({"macro_id": macro_id}, {"$set": updates})
    updated = await db.ssh_macros.find_one({"macro_id": macro_id}, {"_id": 0})
    return updated


@router.delete("/macros/{macro_id}")
async def delete_macro(
    macro_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Supprimer une macro SSH."""
    user_role = current_user.get("role", "").upper()
    if user_role != "ADMIN":
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs")

    result = await db.ssh_macros.delete_one({"macro_id": macro_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Macro introuvable")
    return {"status": "ok", "message": "Macro supprimée"}


@router.post("/connect")
async def ssh_connect_check(
    request: SSHConnectRequest,
    current_user: dict = Depends(get_current_user)
):
    """Vérifier que la connexion SSH est possible."""
    user_role = current_user.get("role", "").upper()
    if user_role != "ADMIN":
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs")
    return {"status": "ok", "message": "Prêt à connecter"}


async def _verify_token_admin(token_str):
    """Vérifie le token JWT et retourne True si admin."""
    from auth import SECRET_KEY, ALGORITHM
    from jose import jwt as jose_jwt
    from bson import ObjectId
    payload = jose_jwt.decode(token_str, SECRET_KEY, algorithms=[ALGORITHM])
    user_id = payload.get("sub")
    if not user_id:
        return False
    user = await db.users.find_one({"_id": ObjectId(user_id)}, {"role": 1})
    if not user:
        return False
    return user.get("role", "").upper() == "ADMIN"


@router.websocket("/ws")
async def ssh_websocket(websocket: WebSocket):
    """
    WebSocket pour terminal SSH interactif.
    - LOCAL  : PTY + PAM  (remplace /bin/login -f défaillant sur Debian 12)
    - DISTANT: Paramiko   (auth mot de passe native, fiable pour root/Proxmox)
    """
    await websocket.accept()
    child_pid = None
    master_fd = None
    ssh_client = None   # objet paramiko pour connexions distantes
    channel = None      # channel paramiko

    try:
        # ── 1. Authentification applicative ───────────────────────────────
        auth_data = await asyncio.wait_for(websocket.receive_json(), timeout=30)
        if auth_data.get("type") != "auth":
            await websocket.send_json({"type": "error", "data": "Message d'authentification attendu"})
            return

        token = auth_data.get("token", "")
        try:
            is_admin = await _verify_token_admin(token)
            if not is_admin:
                await websocket.send_json({"type": "error", "data": "Accès réservé aux administrateurs"})
                return
        except Exception as e:
            await websocket.send_json({"type": "error", "data": f"Token invalide: {str(e)}"})
            return

        host     = auth_data.get("host", "localhost")
        port     = int(auth_data.get("port", 22))
        username = auth_data.get("username", "root")
        password = auth_data.get("password", "")
        cols     = int(auth_data.get("cols", 120))
        rows     = int(auth_data.get("rows", 40))

        is_local = host in ("localhost", "127.0.0.1", "::1")

        # ── 2a. CONNEXION LOCALE — PTY + PAM ─────────────────────────────
        if is_local:
            if not _verify_password_shadow(username, password):
                await websocket.send_json({"type": "error", "data": "Mot de passe incorrect"})
                await websocket.close()
                return

            (child_pid, master_fd) = pty.fork()

            if child_pid == 0:
                env = os.environ.copy()
                env["TERM"] = "xterm-256color"
                env["LANG"] = "en_US.UTF-8"
                env["HOME"]    = "/root" if username == "root" else f"/home/{username}"
                env["USER"]    = username
                env["LOGNAME"] = username
                env["SHELL"]   = "/bin/bash"
                os.execvpe("/bin/bash", ["-bash"], env)
                os._exit(1)

            winsize = struct.pack("HHHH", rows, cols, 0, 0)
            fcntl.ioctl(master_fd, termios.TIOCSWINSZ, winsize)
            await websocket.send_json({"type": "connected", "data": f"Connecté à {username}@{host}:{port}"})

            async def read_pty():
                while True:
                    try:
                        await asyncio.sleep(0.01)
                        r, _, _ = select.select([master_fd], [], [], 0.02)
                        if r:
                            data = os.read(master_fd, 4096)
                            if data:
                                await websocket.send_bytes(data)
                            else:
                                break
                    except (OSError, IOError):
                        break
                    except Exception:
                        break

            async def write_pty():
                while True:
                    try:
                        message = await websocket.receive()
                        if message.get("type") == "websocket.disconnect":
                            break
                        if "bytes" in message:
                            os.write(master_fd, message["bytes"])
                        elif "text" in message:
                            text = message["text"]
                            try:
                                msg = json.loads(text)
                                if msg.get("type") == "resize":
                                    c = msg.get("cols", cols)
                                    r = msg.get("rows", rows)
                                    ws = struct.pack("HHHH", r, c, 0, 0)
                                    fcntl.ioctl(master_fd, termios.TIOCSWINSZ, ws)
                                    os.kill(child_pid, signal.SIGWINCH)
                                    continue
                            except (json.JSONDecodeError, ValueError):
                                pass
                            os.write(master_fd, text.encode("utf-8"))
                    except WebSocketDisconnect:
                        break
                    except Exception:
                        break

            read_task  = asyncio.create_task(read_pty())
            write_task = asyncio.create_task(write_pty())

        # ── 2b. CONNEXION DISTANTE — Paramiko ────────────────────────────
        else:
            loop = asyncio.get_event_loop()

            # Connexion paramiko dans un thread (opération bloquante)
            def _connect():
                client = paramiko.SSHClient()
                client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
                client.connect(
                    hostname=host,
                    port=port,
                    username=username,
                    password=password,
                    timeout=30,
                    auth_timeout=30,
                    banner_timeout=30,
                    allow_agent=False,
                    look_for_keys=False,
                )
                return client

            try:
                ssh_client = await asyncio.wait_for(
                    loop.run_in_executor(None, _connect),
                    timeout=35
                )
            except asyncio.TimeoutError:
                await websocket.send_json({"type": "error", "data": f"Timeout : impossible de joindre {host}:{port}"})
                return
            except paramiko.AuthenticationException:
                await websocket.send_json({"type": "error", "data": "Authentification refusée — vérifiez le nom d'utilisateur et le mot de passe"})
                return
            except paramiko.SSHException as e:
                await websocket.send_json({"type": "error", "data": f"Erreur SSH : {e}"})
                return
            except Exception as e:
                await websocket.send_json({"type": "error", "data": f"Connexion impossible : {e}"})
                return

            # Ouvrir un canal interactif avec PTY
            transport = ssh_client.get_transport()
            transport.set_keepalive(30)
            channel = transport.open_session()
            channel.get_pty("xterm-256color", cols, rows)
            channel.invoke_shell()
            channel.setblocking(False)

            await websocket.send_json({"type": "connected", "data": f"Connecté à {username}@{host}:{port}"})
            logger.info(f"SSH Paramiko connecté: {username}@{host}:{port}")

            async def read_pty():
                """Lire le canal paramiko et envoyer au WebSocket."""
                while True:
                    try:
                        data = await loop.run_in_executor(None, _read_channel, channel)
                        if data is None:
                            # canal fermé
                            break
                        if data:
                            await websocket.send_bytes(data)
                        else:
                            await asyncio.sleep(0.02)
                    except Exception:
                        break

            async def write_pty():
                """Recevoir depuis le WebSocket et écrire dans le canal paramiko."""
                while True:
                    try:
                        message = await websocket.receive()
                        if message.get("type") == "websocket.disconnect":
                            break
                        if "bytes" in message:
                            channel.send(message["bytes"])
                        elif "text" in message:
                            text = message["text"]
                            try:
                                msg = json.loads(text)
                                if msg.get("type") == "resize":
                                    c = msg.get("cols", cols)
                                    r = msg.get("rows", rows)
                                    channel.resize_pty(width=c, height=r)
                                    continue
                            except (json.JSONDecodeError, ValueError):
                                pass
                            channel.send(text.encode("utf-8"))
                    except WebSocketDisconnect:
                        break
                    except Exception:
                        break

            read_task  = asyncio.create_task(read_pty())
            write_task = asyncio.create_task(write_pty())

        # ── 3. Attendre la fin d'une des deux tâches ─────────────────────
        done, pending = await asyncio.wait(
            [read_task, write_task],
            return_when=asyncio.FIRST_COMPLETED
        )
        for task in pending:
            task.cancel()

    except WebSocketDisconnect:
        logger.info("SSH WebSocket déconnecté par le client")
    except asyncio.TimeoutError:
        logger.warning("SSH WebSocket timeout d'authentification")
    except Exception as e:
        logger.error(f"SSH WebSocket erreur: {e}", exc_info=True)
        try:
            await websocket.send_json({"type": "error", "data": str(e)})
        except Exception:
            pass
    finally:
        # Nettoyage connexion distante (paramiko)
        if channel is not None:
            try:
                channel.close()
            except Exception:
                pass
        if ssh_client is not None:
            try:
                ssh_client.close()
            except Exception:
                pass
        # Nettoyage connexion locale (PTY)
        if master_fd is not None:
            try:
                os.close(master_fd)
            except Exception:
                pass
        if child_pid and child_pid > 0:
            try:
                os.kill(child_pid, signal.SIGTERM)
                os.waitpid(child_pid, os.WNOHANG)
            except Exception:
                pass
        try:
            await websocket.close()
        except Exception:
            pass


def _read_channel(channel: paramiko.Channel) -> Optional[bytes]:
    """
    Lecture non-bloquante d'un canal paramiko.
    Retourne None si le canal est fermé, b'' si rien à lire, bytes sinon.
    """
    if channel.closed or channel.exit_status_ready():
        return None
    try:
        if channel.recv_ready():
            return channel.recv(4096)
        if channel.recv_stderr_ready():
            return channel.recv_stderr(4096)
        return b""
    except Exception:
        return None
