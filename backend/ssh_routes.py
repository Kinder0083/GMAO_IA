"""
SSH Terminal - WebSocket + PTY
Utilise le binaire SSH du système pour une compatibilité maximale.
Fonctionne exactement comme PuTTY.
+ Système de macros (CRUD) pour exécuter des commandes prédéfinies.
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
    WebSocket pour terminal SSH interactif via PTY + binaire ssh système.
    """
    await websocket.accept()
    child_pid = None
    master_fd = None

    try:
        # 1. Authentification applicative
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

        host = auth_data.get("host", "localhost")
        port = int(auth_data.get("port", 22))
        username = auth_data.get("username", "root")
        password = auth_data.get("password", "")

        is_local = host in ("localhost", "127.0.0.1", "::1")

        # 2. Vérification du mot de passe pour les connexions locales
        # (remplace /bin/login -f qui échoue sur Debian 12+ à cause de pam_securetty)
        if is_local:
            if not _verify_password_shadow(username, password):
                await websocket.send_json({"type": "error", "data": "Mot de passe incorrect"})
                await websocket.close()
                return

        # 3. Créer un PTY et lancer le processus
        (child_pid, master_fd) = pty.fork()

        if child_pid == 0:
            # === Processus enfant ===
            env = os.environ.copy()
            env["TERM"] = "xterm-256color"
            env["LANG"] = "en_US.UTF-8"

            if is_local:
                # Connexion locale : shell direct sans passer par /bin/login
                # Le mot de passe a déjà été vérifié ci-dessus via /etc/shadow
                env["HOME"] = f"/root" if username == "root" else f"/home/{username}"
                env["USER"] = username
                env["LOGNAME"] = username
                env["SHELL"] = "/bin/bash"
                os.execvpe("/bin/bash", ["-bash"], env)
            else:
                # Connexion distante: utiliser ssh
                os.execvpe("/usr/bin/ssh", [
                    "ssh",
                    "-o", "StrictHostKeyChecking=no",
                    "-o", "UserKnownHostsFile=/dev/null",
                    "-p", str(port),
                    f"{username}@{host}"
                ], env)
            os._exit(1)

        # === Processus parent ===
        logger.info(f"SSH PTY started: pid={child_pid}, fd={master_fd}, target={username}@{host}:{port}")

        # Taille initiale du terminal
        winsize = struct.pack("HHHH", 40, 120, 0, 0)
        fcntl.ioctl(master_fd, termios.TIOCSWINSZ, winsize)

        await websocket.send_json({"type": "connected", "data": f"Connecté à {username}@{host}:{port}"})

        # Pour les connexions distantes, envoyer le mot de passe quand SSH le demande
        if not is_local:
            # Attendre le prompt de mot de passe SSH
            password_sent = False
            for _ in range(50):  # max 5 secondes
                await asyncio.sleep(0.1)
                try:
                    r, _, _ = select.select([master_fd], [], [], 0)
                    if r:
                        data = os.read(master_fd, 4096)
                        if data:
                            text = data.decode("utf-8", errors="replace").lower()
                            await websocket.send_bytes(data)
                            if "password" in text and not password_sent:
                                os.write(master_fd, (password + "\n").encode("utf-8"))
                                password_sent = True
                                break
                except Exception:
                    break

        # 3. Boucle bidirectionnelle PTY <-> WebSocket
        async def read_pty():
            """Lire la sortie du PTY et l'envoyer au WebSocket."""
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
            """Lire le WebSocket et écrire dans le PTY."""
            while True:
                try:
                    message = await websocket.receive()
                    if message.get("type") == "websocket.disconnect":
                        break

                    if "bytes" in message:
                        os.write(master_fd, message["bytes"])
                    elif "text" in message:
                        text = message["text"]
                        # Vérifier si c'est un message de resize
                        try:
                            msg = json.loads(text)
                            if msg.get("type") == "resize":
                                cols = msg.get("cols", 120)
                                rows = msg.get("rows", 40)
                                winsize = struct.pack("HHHH", rows, cols, 0, 0)
                                fcntl.ioctl(master_fd, termios.TIOCSWINSZ, winsize)
                                # Envoyer SIGWINCH au processus enfant
                                os.kill(child_pid, signal.SIGWINCH)
                                continue
                        except (json.JSONDecodeError, ValueError):
                            pass
                        os.write(master_fd, text.encode("utf-8"))
                except WebSocketDisconnect:
                    break
                except Exception:
                    break

        read_task = asyncio.create_task(read_pty())
        write_task = asyncio.create_task(write_pty())

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
        except:
            pass
    finally:
        if master_fd is not None:
            try:
                os.close(master_fd)
            except:
                pass
        if child_pid and child_pid > 0:
            try:
                os.kill(child_pid, signal.SIGTERM)
                os.waitpid(child_pid, os.WNOHANG)
            except:
                pass
        try:
            await websocket.close()
        except:
            pass
