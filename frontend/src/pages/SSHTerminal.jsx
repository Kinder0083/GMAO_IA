import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import {
  Terminal as TerminalIcon, AlertTriangle, Wifi, WifiOff, Lock,
  Play, Plus, Pencil, Trash2, ChevronRight, ChevronDown, ListOrdered, X, Zap
} from 'lucide-react';
import { useToast } from '../hooks/use-toast';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';

function SSHTerminal() {
  const { toast } = useToast();
  const [status, setStatus] = useState('disconnected');
  const [host, setHost] = useState('localhost');
  const [port, setPort] = useState('22');
  const [username, setUsername] = useState('root');
  const [password, setPassword] = useState('');
  const termRef = useRef(null);
  const termContainerRef = useRef(null);
  const wsRef = useRef(null);
  const fitAddonRef = useRef(null);

  // Macros state
  const [macros, setMacros] = useState([]);
  const [macrosOpen, setMacrosOpen] = useState(true);
  const [macroDialogOpen, setMacroDialogOpen] = useState(false);
  const [editingMacro, setEditingMacro] = useState(null);
  const [macroForm, setMacroForm] = useState({ name: '', description: '', commands: [''], color: '#2563EB' });
  const [macroRunning, setMacroRunning] = useState(null);

  const COLORS = ['#2563EB', '#059669', '#D97706', '#DC2626', '#7C3AED', '#0891B2', '#BE185D', '#4338CA'];

  // Load macros
  const fetchMacros = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${BACKEND_URL}/api/ssh/macros`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setMacros(await res.json());
    } catch (e) { /* silently fail */ }
  }, []);

  useEffect(() => { fetchMacros(); }, [fetchMacros]);

  // Init xterm
  const initTerminal = useCallback(async () => {
    if (termRef.current) return;
    const { Terminal } = await import('@xterm/xterm');
    const { FitAddon } = await import('@xterm/addon-fit');
    const { WebLinksAddon } = await import('@xterm/addon-web-links');
    await import('@xterm/xterm/css/xterm.css');

    const term = new Terminal({
      cursorBlink: true, cursorStyle: 'block', fontSize: 14,
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", "Consolas", monospace',
      theme: {
        background: '#1a1b26', foreground: '#c0caf5', cursor: '#c0caf5',
        selectionBackground: '#33467c',
        black: '#15161e', red: '#f7768e', green: '#9ece6a', yellow: '#e0af68',
        blue: '#7aa2f7', magenta: '#bb9af7', cyan: '#7dcfff', white: '#a9b1d6',
        brightBlack: '#414868', brightRed: '#f7768e', brightGreen: '#9ece6a',
        brightYellow: '#e0af68', brightBlue: '#7aa2f7', brightMagenta: '#bb9af7',
        brightCyan: '#7dcfff', brightWhite: '#c0caf5',
      },
      scrollback: 5000, allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);

    if (termContainerRef.current) {
      term.open(termContainerRef.current);
      fitAddon.fit();
    }

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    term.writeln('\x1b[1;34m=== FSAO Iris - Terminal SSH ===\x1b[0m');
    term.writeln('\x1b[90mEntrez vos identifiants SSH et cliquez sur Connecter.\x1b[0m');
    term.writeln('');
  }, []);

  useEffect(() => {
    initTerminal();
    const handleResize = () => {
      if (fitAddonRef.current) try { fitAddonRef.current.fit(); } catch {}
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (wsRef.current) wsRef.current.close();
      if (termRef.current) { termRef.current.dispose(); termRef.current = null; }
    };
  }, [initTerminal]);

  const connect = useCallback(() => {
    if (!password) {
      toast({ title: 'Erreur', description: 'Veuillez saisir le mot de passe SSH', variant: 'destructive' });
      return;
    }
    const term = termRef.current;
    if (!term) return;

    setStatus('connecting');
    term.writeln(`\x1b[33mConnexion à ${username}@${host}:${port}...\x1b[0m`);

    // Si BACKEND_URL est vide (prod sans variable d'env), utiliser window.location
    const wsProtocol = BACKEND_URL
      ? (BACKEND_URL.startsWith('https') ? 'wss' : 'ws')
      : (window.location.protocol === 'https:' ? 'wss' : 'ws');
    const wsHost = BACKEND_URL
      ? BACKEND_URL.replace(/^https?:\/\//, '')
      : window.location.host;
    const ws = new WebSocket(`${wsProtocol}://${wsHost}/api/ssh/ws`);
    wsRef.current = ws;
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      const token = localStorage.getItem('token');
      ws.send(JSON.stringify({ type: 'auth', token, host, port: parseInt(port), username, password }));
    };

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        term.write(new TextDecoder().decode(event.data));
      } else {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'connected') {
            setStatus('connected');
            term.writeln(`\x1b[32m${msg.data}\x1b[0m`);
            term.writeln('');
            const dims = fitAddonRef.current?.proposeDimensions();
            if (dims) ws.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
          } else if (msg.type === 'error') {
            setStatus('disconnected');
            term.writeln(`\x1b[31mErreur: ${msg.data}\x1b[0m`);
          }
        } catch { term.write(event.data); }
      }
    };

    ws.onclose = () => { setStatus('disconnected'); term.writeln(''); term.writeln('\x1b[33mConnexion fermée.\x1b[0m'); };
    ws.onerror = () => { setStatus('disconnected'); term.writeln('\x1b[31mErreur de connexion WebSocket.\x1b[0m'); };

    const dataHandler = term.onData((data) => { if (ws.readyState === WebSocket.OPEN) ws.send(new TextEncoder().encode(data)); });
    const resizeHandler = term.onResize(({ cols, rows }) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'resize', cols, rows })); });
    ws.addEventListener('close', () => { dataHandler.dispose(); resizeHandler.dispose(); });
  }, [host, port, username, password, toast]);

  const disconnect = useCallback(() => {
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    setStatus('disconnected');
  }, []);

  // ────── Macro execution ──────
  const executeMacro = useCallback(async (macro) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      toast({ title: 'Erreur', description: 'Connectez-vous au terminal SSH avant d\'exécuter une macro', variant: 'destructive' });
      return;
    }
    setMacroRunning(macro.macro_id);
    for (let i = 0; i < macro.commands.length; i++) {
      const cmd = macro.commands[i];
      ws.send(new TextEncoder().encode(cmd + '\n'));
      // Small delay between commands to let the shell process
      await new Promise(r => setTimeout(r, 300));
    }
    setMacroRunning(null);
    toast({ title: 'Macro exécutée', description: `"${macro.name}" — ${macro.commands.length} commande(s)` });
  }, [toast]);

  // ────── Macro CRUD ──────
  const openCreateDialog = () => {
    setEditingMacro(null);
    setMacroForm({ name: '', description: '', commands: [''], color: '#2563EB' });
    setMacroDialogOpen(true);
  };

  const openEditDialog = (macro) => {
    setEditingMacro(macro);
    setMacroForm({
      name: macro.name,
      description: macro.description || '',
      commands: macro.commands.length > 0 ? [...macro.commands] : [''],
      color: macro.color || '#2563EB',
    });
    setMacroDialogOpen(true);
  };

  const saveMacro = async () => {
    const token = localStorage.getItem('token');
    const body = {
      name: macroForm.name,
      description: macroForm.description,
      commands: macroForm.commands.filter(c => c.trim()),
      color: macroForm.color,
    };
    if (body.commands.length === 0 || !body.name.trim()) {
      toast({ title: 'Erreur', description: 'Nom et au moins une commande requis', variant: 'destructive' });
      return;
    }
    try {
      const url = editingMacro ? `${BACKEND_URL}/api/ssh/macros/${editingMacro.macro_id}` : `${BACKEND_URL}/api/ssh/macros`;
      const method = editingMacro ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail || 'Erreur'); }
      toast({ title: editingMacro ? 'Macro modifiée' : 'Macro créée' });
      setMacroDialogOpen(false);
      fetchMacros();
    } catch (e) {
      toast({ title: 'Erreur', description: e.message, variant: 'destructive' });
    }
  };

  const deleteMacro = async (macroId) => {
    if (!window.confirm('Supprimer cette macro ?')) return;
    const token = localStorage.getItem('token');
    try {
      await fetch(`${BACKEND_URL}/api/ssh/macros/${macroId}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      });
      toast({ title: 'Macro supprimée' });
      fetchMacros();
    } catch (e) {
      toast({ title: 'Erreur', description: e.message, variant: 'destructive' });
    }
  };

  const addCommandLine = () => setMacroForm(f => ({ ...f, commands: [...f.commands, ''] }));
  const removeCommandLine = (idx) => setMacroForm(f => ({ ...f, commands: f.commands.filter((_, i) => i !== idx) }));
  const updateCommandLine = (idx, val) => setMacroForm(f => {
    const cmds = [...f.commands];
    cmds[idx] = val;
    return { ...f, commands: cmds };
  });

  const isConnected = status === 'connected';
  const isConnecting = status === 'connecting';

  return (
    <div className="flex gap-4 p-6 h-[calc(100vh-80px)]" data-testid="ssh-terminal-page">
      {/* ──── Left: Terminal ──── */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <TerminalIcon className="h-6 w-6" />
              Terminal SSH
            </h1>
            <p className="text-sm text-gray-500">Console interactive du container LXC</p>
          </div>
          <div className="flex items-center gap-3">
            {isConnected ? (
              <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium" data-testid="ssh-status-connected">
                <Wifi size={16} />
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                Connecté
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-sm text-gray-400" data-testid="ssh-status-disconnected">
                <WifiOff size={16} />
                Déconnecté
              </span>
            )}
            {isConnected && (
              <Button variant="destructive" size="sm" onClick={disconnect} data-testid="ssh-disconnect-btn">
                Déconnecter
              </Button>
            )}
          </div>
        </div>

        <Alert variant="destructive" className="py-2 mb-3">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-sm">
            <strong>ATTENTION :</strong> Accès direct au système. Commandes interactives supportées (vim, top, htop...).
          </AlertDescription>
        </Alert>

        {!isConnected && (
          <Card className="mb-3">
            <CardHeader className="py-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Lock size={16} />
                Identifiants SSH
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Hôte</label>
                  <Input value={host} onChange={e => setHost(e.target.value)} placeholder="localhost" disabled={isConnecting} data-testid="ssh-host" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Port</label>
                  <Input value={port} onChange={e => setPort(e.target.value)} placeholder="22" disabled={isConnecting} data-testid="ssh-port" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Utilisateur</label>
                  <Input value={username} onChange={e => setUsername(e.target.value)} placeholder="root" disabled={isConnecting} data-testid="ssh-username" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Mot de passe</label>
                  <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Mot de passe SSH" disabled={isConnecting} onKeyDown={e => e.key === 'Enter' && connect()} data-testid="ssh-password" />
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <Button onClick={connect} disabled={isConnecting || !password} data-testid="ssh-connect-btn">
                  {isConnecting ? 'Connexion...' : 'Connecter'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="overflow-hidden flex-1">
          <CardContent className="p-0 h-full">
            <div
              ref={termContainerRef}
              data-testid="ssh-terminal-container"
              style={{ height: '100%', background: '#1a1b26', padding: '8px' }}
            />
          </CardContent>
        </Card>
      </div>

      {/* ──── Right: Macros Panel ──── */}
      <div className="w-80 flex-shrink-0 flex flex-col" data-testid="ssh-macros-panel">
        <Card className="flex-1 flex flex-col overflow-hidden">
          <CardHeader className="py-3 px-4 border-b cursor-pointer select-none" onClick={() => setMacrosOpen(o => !o)}>
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Zap size={16} className="text-amber-500" />
                Macros
                <span className="text-xs bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">{macros.length}</span>
              </span>
              {macrosOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </CardTitle>
          </CardHeader>
          {macrosOpen && (
            <CardContent className="p-3 flex-1 overflow-y-auto space-y-2">
              <Button size="sm" variant="outline" className="w-full justify-start gap-2" onClick={openCreateDialog} data-testid="ssh-macro-create-btn">
                <Plus size={14} /> Nouvelle macro
              </Button>

              {macros.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-4">
                  Aucune macro enregistrée.<br />Créez-en une pour exécuter des commandes en un clic.
                </p>
              )}

              {macros.map((m) => (
                <div
                  key={m.macro_id}
                  className="border rounded-lg p-3 group hover:shadow-sm transition-shadow"
                  data-testid={`ssh-macro-${m.macro_id}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: m.color || '#2563EB' }} />
                      <span className="font-medium text-sm truncate">{m.name}</span>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button
                        onClick={() => openEditDialog(m)}
                        className="p-1 hover:bg-gray-100 rounded"
                        title="Modifier"
                        data-testid={`ssh-macro-edit-${m.macro_id}`}
                      >
                        <Pencil size={12} className="text-gray-500" />
                      </button>
                      <button
                        onClick={() => deleteMacro(m.macro_id)}
                        className="p-1 hover:bg-red-50 rounded"
                        title="Supprimer"
                        data-testid={`ssh-macro-delete-${m.macro_id}`}
                      >
                        <Trash2 size={12} className="text-red-400" />
                      </button>
                    </div>
                  </div>
                  {m.description && (
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{m.description}</p>
                  )}
                  <div className="mt-2 space-y-1">
                    {m.commands.map((cmd, i) => (
                      <code key={i} className="block text-[11px] bg-gray-50 rounded px-2 py-0.5 font-mono text-gray-700 truncate">
                        {cmd}
                      </code>
                    ))}
                  </div>
                  <Button
                    size="sm"
                    className="w-full mt-2 gap-1.5"
                    onClick={() => executeMacro(m)}
                    disabled={!isConnected || macroRunning === m.macro_id}
                    data-testid={`ssh-macro-run-${m.macro_id}`}
                  >
                    <Play size={12} />
                    {macroRunning === m.macro_id ? 'Exécution...' : 'Exécuter'}
                  </Button>
                </div>
              ))}
            </CardContent>
          )}
        </Card>
      </div>

      {/* ──── Macro Dialog ──── */}
      <Dialog open={macroDialogOpen} onOpenChange={setMacroDialogOpen}>
        <DialogContent className="sm:max-w-lg" data-testid="ssh-macro-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ListOrdered size={18} />
              {editingMacro ? 'Modifier la macro' : 'Nouvelle macro'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium block mb-1">Nom *</label>
              <Input
                value={macroForm.name}
                onChange={e => setMacroForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Mise à jour système"
                data-testid="ssh-macro-form-name"
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Description</label>
              <Input
                value={macroForm.description}
                onChange={e => setMacroForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Ex: Met à jour les paquets et redémarre les services"
                data-testid="ssh-macro-form-description"
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Couleur</label>
              <div className="flex gap-2 flex-wrap">
                {COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setMacroForm(f => ({ ...f, color: c }))}
                    className={`w-7 h-7 rounded-full border-2 transition-transform ${macroForm.color === c ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Commandes *</label>
              <p className="text-xs text-gray-500 mb-2">Chaque ligne sera exécutée séquentiellement dans le terminal SSH.</p>
              <div className="space-y-2">
                {macroForm.commands.map((cmd, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <span className="text-xs text-gray-400 w-5 text-right font-mono">{idx + 1}.</span>
                    <Input
                      value={cmd}
                      onChange={e => updateCommandLine(idx, e.target.value)}
                      placeholder="Ex: apt update && apt upgrade -y"
                      className="font-mono text-sm flex-1"
                      data-testid={`ssh-macro-form-cmd-${idx}`}
                    />
                    {macroForm.commands.length > 1 && (
                      <button onClick={() => removeCommandLine(idx)} className="p-1 hover:bg-red-50 rounded" data-testid={`ssh-macro-form-remove-cmd-${idx}`}>
                        <X size={14} className="text-red-400" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <Button variant="ghost" size="sm" className="mt-2 gap-1 text-xs" onClick={addCommandLine} data-testid="ssh-macro-form-add-cmd">
                <Plus size={12} /> Ajouter une commande
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMacroDialogOpen(false)}>Annuler</Button>
            <Button onClick={saveMacro} data-testid="ssh-macro-form-save">
              {editingMacro ? 'Enregistrer' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default SSHTerminal;
