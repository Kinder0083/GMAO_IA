import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import {
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Download,
  FileText,
  Package,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Terminal,
} from 'lucide-react';
import { useToast } from '../hooks/use-toast';
import axios from 'axios';
import { BACKEND_URL } from '../utils/config';

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

const CommandBlock = ({ title, command, onCopy }) => (
  <div className="space-y-2">
    {title && <p className="text-sm font-medium text-gray-700">{title}</p>}
    <div className="flex items-start gap-2 rounded-lg bg-gray-900 p-3 text-green-300">
      <pre className="flex-1 overflow-x-auto whitespace-pre-wrap text-xs leading-relaxed">{command}</pre>
      <Button
        variant="ghost"
        size="sm"
        className="text-green-300 hover:bg-gray-800 hover:text-white"
        onClick={() => onCopy(command)}
      >
        <Copy size={14} />
      </Button>
    </div>
  </div>
);

const StatusBadge = ({ ok, children }) => (
  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${ok ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
    {children}
  </span>
);

const Updates = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [prechecking, setPrechecking] = useState(false);
  const [currentVersion, setCurrentVersion] = useState('');
  const [latestVersion, setLatestVersion] = useState(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [workflow, setWorkflow] = useState(null);
  const [archiveBackups, setArchiveBackups] = useState([]);
  const [backupRoot, setBackupRoot] = useState('');
  const [changelog, setChangelog] = useState([]);
  const [history, setHistory] = useState([]);
  const [serverLog, setServerLog] = useState('');
  const [serverLogInfo, setServerLogInfo] = useState(null);
  const [serverLogLoading, setServerLogLoading] = useState(false);
  const [expandedServerLog, setExpandedServerLog] = useState(false);
  const [expandedChangelog, setExpandedChangelog] = useState(false);
  const [expandedHistory, setExpandedHistory] = useState(false);
  const [expandedBackups, setExpandedBackups] = useState(true);
  const [precheckResult, setPrecheckResult] = useState(null);

  useEffect(() => {
    loadUpdateInfo();
  }, []);

  const copyCommand = async (command) => {
    try {
      await navigator.clipboard.writeText(command);
      toast({ title: 'Commande copiée', description: 'Vous pouvez la coller dans le shell Proxmox.' });
    } catch (error) {
      toast({ title: 'Copie impossible', description: 'Sélectionnez la commande manuellement.', variant: 'destructive' });
    }
  };

  const loadServerLog = async () => {
    try {
      setServerLogLoading(true);
      const response = await axios.get(`${BACKEND_URL}/api/updates/log`, {
        headers: authHeaders(),
        timeout: 15000,
      });

      if (response.data.found) {
        setServerLog(response.data.content || '');
        setServerLogInfo({
          path: response.data.path,
          size: response.data.size,
          in_progress: response.data.in_progress,
          status: response.data.status,
          success: response.data.success,
        });
      } else {
        setServerLog('');
        setServerLogInfo(null);
      }
    } catch (error) {
      const detail = error.response?.data?.detail || error.message || 'Erreur inconnue';
      setServerLog(`Impossible de charger les logs du serveur.\n\nErreur: ${detail}`);
    } finally {
      setServerLogLoading(false);
    }
  };

  const loadUpdateInfo = async () => {
    try {
      setLoading(true);
      const [currentRes, checkRes, workflowRes, changelogRes, historyRes, backupsRes] = await Promise.allSettled([
        axios.get(`${BACKEND_URL}/api/updates/current`, { headers: authHeaders() }),
        axios.get(`${BACKEND_URL}/api/updates/check`, { headers: authHeaders() }),
        axios.get(`${BACKEND_URL}/api/updates/deployment-workflow`, { headers: authHeaders() }),
        axios.get(`${BACKEND_URL}/api/updates/changelog`, { headers: authHeaders() }),
        axios.get(`${BACKEND_URL}/api/updates/history`, { headers: authHeaders() }),
        axios.get(`${BACKEND_URL}/api/updates/archive-backups`, { headers: authHeaders() }),
      ]);

      if (currentRes.status === 'fulfilled') {
        setCurrentVersion(currentRes.value.data.version || '');
      }

      if (checkRes.status === 'fulfilled') {
        const data = checkRes.value.data;
        setCurrentVersion(data.current_version || currentRes.value?.data?.version || '');
        setLatestVersion(data.latest_version || null);
        setUpdateAvailable(Boolean(data.update_available));
        if (data.deployment_workflow) setWorkflow(data.deployment_workflow);
      }

      if (workflowRes.status === 'fulfilled') {
        setWorkflow(workflowRes.value.data);
      }

      if (changelogRes.status === 'fulfilled') {
        setChangelog(changelogRes.value.data.changelog || []);
      }

      if (historyRes.status === 'fulfilled') {
        const data = historyRes.value.data;
        setHistory(data.history || data.data || []);
      }

      if (backupsRes.status === 'fulfilled') {
        setArchiveBackups(backupsRes.value.data.backups || []);
        setBackupRoot(backupsRes.value.data.backup_root || '');
      }
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Impossible de charger les informations de mise à jour.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setChecking(true);
    await loadUpdateInfo();
    setChecking(false);
    toast({
      title: 'Vérification terminée',
      description: updateAvailable ? 'Une nouvelle version semble disponible.' : 'Aucune mise à jour détectée.',
    });
  };

  const runArchivePrecheck = async () => {
    try {
      setPrechecking(true);
      setPrecheckResult(null);
      const response = await axios.post(`${BACKEND_URL}/api/updates/archive-precheck`, {}, {
        headers: authHeaders(),
        timeout: 210000,
      });
      setPrecheckResult(response.data);
      if (response.data.can_execute) {
        toast({
          title: response.data.success ? 'Pré-vérification réussie' : 'Pré-vérification terminée avec erreurs',
          description: response.data.success ? 'Le --check a été exécuté.' : 'Consultez la sortie affichée.',
          variant: response.data.success ? 'default' : 'destructive',
        });
      } else {
        toast({
          title: 'Action à faire depuis Proxmox',
          description: 'Copiez la commande et lancez-la sur l’hôte Proxmox.',
        });
      }
    } catch (error) {
      setPrecheckResult({
        success: false,
        message: error.response?.data?.detail || error.message || 'Erreur inconnue',
      });
      toast({ title: 'Erreur pré-vérification', description: 'Impossible de lancer la pré-vérification.', variant: 'destructive' });
    } finally {
      setPrechecking(false);
    }
  };

  const installCommand = workflow?.scripts?.install?.recommended_command || 'chmod +x gmao-iris-install.sh && ./gmao-iris-install.sh --check && ./gmao-iris-install.sh';
  const updateCommand = workflow?.scripts?.update?.recommended_command || 'chmod +x gmao-iris-update.sh && ./gmao-iris-update.sh --check && ./gmao-iris-update.sh';
  const rollbackCommand = workflow?.scripts?.rollback?.recommended_command || 'chmod +x gmao-iris-rollback.sh && ./gmao-iris-rollback.sh';

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
          <RefreshCw className="mx-auto h-10 w-10 animate-spin text-blue-600" />
          <p className="mt-4 text-gray-600">Chargement de la section mise à jour...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Mise à jour</h1>
          <p className="mt-1 text-gray-600">Pilotage guidé de la mise à jour par archive Proxmox.</p>
        </div>
        <Button variant="outline" onClick={handleRefresh} disabled={checking}>
          <RefreshCw size={18} className={`mr-2 ${checking ? 'animate-spin' : ''}`} />
          Vérifier
        </Button>
      </div>

      <Card className={updateAvailable ? 'border-blue-500 border-2' : ''}>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <div>
              <div className="mb-2 flex items-center gap-3">
                <Package size={24} className="text-gray-600" />
                <h3 className="text-lg font-semibold text-gray-900">Version actuelle</h3>
              </div>
              <p className="text-3xl font-bold text-gray-900">{currentVersion || 'Inconnue'}</p>
            </div>
            <div>
              <div className="mb-2 flex items-center gap-3">
                <Download size={24} className={updateAvailable ? 'text-blue-600' : 'text-gray-600'} />
                <h3 className="text-lg font-semibold text-gray-900">Dernière version</h3>
              </div>
              <p className="text-3xl font-bold text-blue-600">{latestVersion?.version || latestVersion?.new_version || currentVersion || 'Inconnue'}</p>
              {updateAvailable ? (
                <p className="mt-2 text-sm text-blue-600">Nouvelle version détectée.</p>
              ) : (
                <p className="mt-2 text-sm text-green-600">Vous semblez à jour.</p>
              )}
            </div>
            <div>
              <div className="mb-2 flex items-center gap-3">
                <ShieldCheck size={24} className="text-gray-600" />
                <h3 className="text-lg font-semibold text-gray-900">Mode déploiement</h3>
              </div>
              <p className="text-lg font-semibold text-gray-900">{workflow?.mode || 'archive_proxmox'}</p>
              <div className="mt-2">
                <StatusBadge ok={!workflow?.requires_proxmox_host}>
                  {workflow?.requires_proxmox_host ? 'À lancer depuis Proxmox' : 'Exécutable localement'}
                </StatusBadge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-blue-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-700">
            <Terminal size={20} />
            Procédure officielle par archive Proxmox
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
            <p className="font-medium">{workflow?.message || 'Les actions lourdes doivent être lancées depuis l’hôte Proxmox.'}</p>
            <p className="mt-2">Cette interface ne fait plus de <code>git pull</code> dans le conteneur. La mise à jour officielle passe par une archive préparée sur l’hôte Proxmox, puis transférée dans le LXC.</p>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <CommandBlock title="Installation neuve" command={installCommand} onCopy={copyCommand} />
            <CommandBlock title="Mise à jour" command={updateCommand} onCopy={copyCommand} />
            <CommandBlock title="Rollback applicatif" command={rollbackCommand} onCopy={copyCommand} />
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-gray-600">
              <p>Ordre conseillé : pré-vérification, mise à jour, puis rollback uniquement en cas de problème applicatif.</p>
            </div>
            <Button onClick={runArchivePrecheck} disabled={prechecking}>
              <RefreshCw size={18} className={`mr-2 ${prechecking ? 'animate-spin' : ''}`} />
              Lancer / afficher le pré-check
            </Button>
          </div>

          {precheckResult && (
            <div className="rounded-lg border bg-gray-50 p-4">
              <div className="mb-3 flex items-center gap-2">
                {precheckResult.success ? <CheckCircle size={18} className="text-green-600" /> : <AlertCircle size={18} className="text-amber-600" />}
                <h4 className="font-semibold text-gray-900">Résultat pré-vérification</h4>
              </div>
              <p className="mb-3 text-sm text-gray-700">{precheckResult.message || (precheckResult.can_execute ? 'Pré-vérification exécutée.' : 'À lancer depuis l’hôte Proxmox.')}</p>
              {precheckResult.command && <CommandBlock command={precheckResult.command} onCopy={copyCommand} />}
              {(precheckResult.stdout || precheckResult.stderr) && (
                <pre className="mt-3 max-h-80 overflow-y-auto rounded bg-gray-900 p-3 text-xs text-green-300 whitespace-pre-wrap">
                  {precheckResult.stdout}
                  {precheckResult.stderr ? `\n--- STDERR ---\n${precheckResult.stderr}` : ''}
                </pre>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          className="cursor-pointer hover:bg-gray-50"
          onClick={() => setExpandedBackups(!expandedBackups)}
        >
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <RotateCcw size={20} />
              Sauvegardes applicatives archive
              <span className="text-sm font-normal text-gray-500">({archiveBackups.length})</span>
            </CardTitle>
            {expandedBackups ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
          </div>
        </CardHeader>
        {expandedBackups && (
          <CardContent>
            <p className="mb-4 text-sm text-gray-600">
              Dossier recherché : <code>{backupRoot || '/opt/gmao-iris-backups'}</code>. Ces sauvegardes restaurent les fichiers applicatifs, pas MongoDB.
            </p>
            {archiveBackups.length === 0 ? (
              <div className="rounded-lg bg-gray-50 p-4 text-center text-gray-500">
                Aucune sauvegarde applicative détectée. Elles apparaîtront après une mise à jour par archive.
              </div>
            ) : (
              <div className="space-y-2">
                {archiveBackups.map((backup) => (
                  <div key={backup.path} className="rounded-lg border bg-gray-50 p-3">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="font-medium text-gray-900">{backup.timestamp}</p>
                        <p className="text-xs text-gray-500">{backup.path}</p>
                        {backup.modified_at && <p className="text-xs text-gray-500">Modifiée le {new Date(backup.modified_at).toLocaleString('fr-FR')}</p>}
                      </div>
                      <Button variant="outline" size="sm" onClick={() => copyCommand(rollbackCommand)}>
                        <Copy size={14} className="mr-2" />
                        Copier commande rollback
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      <Card className="border-amber-200">
        <CardHeader
          className="cursor-pointer hover:bg-amber-50"
          onClick={() => {
            const next = !expandedServerLog;
            setExpandedServerLog(next);
            if (next && !serverLog) loadServerLog();
          }}
        >
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-amber-700">
              <FileText size={20} />
              Logs serveur et diagnostic
              {serverLogInfo?.in_progress && <span className="text-xs font-normal text-amber-600">Mise à jour en cours...</span>}
            </CardTitle>
            <div className="flex items-center gap-2">
              {expandedServerLog && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-amber-700"
                  onClick={(e) => { e.stopPropagation(); loadServerLog(); }}
                  disabled={serverLogLoading}
                >
                  <RefreshCw size={14} className={serverLogLoading ? 'animate-spin' : ''} />
                </Button>
              )}
              {expandedServerLog ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
            </div>
          </div>
        </CardHeader>
        {expandedServerLog && (
          <CardContent>
            {serverLogLoading && !serverLog ? (
              <div className="flex items-center justify-center py-8 text-gray-600">
                <RefreshCw size={24} className="mr-2 animate-spin text-amber-600" />
                Chargement des logs...
              </div>
            ) : serverLog ? (
              <pre className="max-h-96 overflow-y-auto rounded-lg bg-gray-900 p-4 text-xs leading-relaxed text-green-300 whitespace-pre-wrap">
                {serverLog}
              </pre>
            ) : (
              <div className="text-center py-6 text-gray-500">Aucun log disponible.</div>
            )}
          </CardContent>
        )}
      </Card>

      {changelog.length > 0 && (
        <Card>
          <CardHeader className="cursor-pointer hover:bg-gray-50" onClick={() => setExpandedChangelog(!expandedChangelog)}>
            <div className="flex items-center justify-between">
              <CardTitle>📝 Nouveautés</CardTitle>
              {expandedChangelog ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
            </div>
          </CardHeader>
          {expandedChangelog && (
            <CardContent>
              <div className="space-y-4">
                {changelog.map((log, index) => (
                  <div key={`${log.version || index}-${index}`}>
                    <h4 className="mb-2 font-semibold text-gray-900">Version {log.version || 'non précisée'}</h4>
                    <ul className="space-y-1 text-sm text-gray-700">
                      {(log.changes || []).map((change, idx) => <li key={idx}>• {change}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      <Card>
        <CardHeader className="cursor-pointer hover:bg-gray-50" onClick={() => setExpandedHistory(!expandedHistory)}>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Clock size={20} />
              Historique des mises à jour
            </CardTitle>
            {expandedHistory ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
          </div>
        </CardHeader>
        {expandedHistory && (
          <CardContent>
            {history.length === 0 ? (
              <p className="py-4 text-center text-gray-500">Aucune mise à jour enregistrée.</p>
            ) : (
              <div className="space-y-3">
                {history.map((item, index) => (
                  <div key={item.id || index} className="rounded-lg bg-gray-50 p-3">
                    <div className="flex items-start gap-3">
                      {item.success ? <CheckCircle size={20} className="text-green-600" /> : <AlertCircle size={20} className="text-red-600" />}
                      <div>
                        <p className="font-medium text-gray-900">{item.version_before || '?'} → {item.version_after || '?'}</p>
                        <p className="text-sm text-gray-600">{item.started_at ? new Date(item.started_at).toLocaleString('fr-FR') : 'Date inconnue'}</p>
                        {item.summary?.errors?.length > 0 && (
                          <div className="mt-2 text-xs text-red-600">
                            {item.summary.errors.map((err, i) => <p key={i}>❌ {err}</p>)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
};

export default Updates;
