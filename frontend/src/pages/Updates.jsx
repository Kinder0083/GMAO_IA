import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import {
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  FileText,
  Package,
  RefreshCw,
  RotateCcw,
  Settings,
  ShieldCheck,
  Terminal,
} from 'lucide-react';
import { useToast } from '../hooks/use-toast';
import axios from 'axios';
import { BACKEND_URL } from '../utils/config';
import { formatErrorMessage } from '../utils/errorFormatter';

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

const StatusBadge = ({ type = 'neutral', children }) => {
  const classes = {
    ok: 'bg-green-100 text-green-700',
    warning: 'bg-amber-100 text-amber-700',
    error: 'bg-red-100 text-red-700',
    neutral: 'bg-gray-100 text-gray-700',
    info: 'bg-blue-100 text-blue-700',
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${classes[type]}`}>{children}</span>;
};

const LogBox = ({ content }) => (
  <pre className="max-h-96 overflow-y-auto rounded-lg bg-gray-900 p-4 text-xs leading-relaxed text-green-300 whitespace-pre-wrap">
    {content || 'Aucun contenu.'}
  </pre>
);

const InputField = ({ label, value, onChange, placeholder, help }) => (
  <div className="space-y-1">
    <label className="text-sm font-medium text-gray-700">{label}</label>
    <input
      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
    {help && <p className="text-xs text-gray-500">{help}</p>}
  </div>
);

const Updates = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [prechecking, setPrechecking] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [repoSaving, setRepoSaving] = useState(false);
  const [repoTesting, setRepoTesting] = useState(false);
  const [currentVersion, setCurrentVersion] = useState('');
  const [latestVersion, setLatestVersion] = useState(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [workflow, setWorkflow] = useState(null);
  const [repositoryConfig, setRepositoryConfig] = useState(null);
  const [repoForm, setRepoForm] = useState({ github_user: '', github_repo: '', github_branch: 'main', github_url: '' });
  const [repoTestResult, setRepoTestResult] = useState(null);
  const [backups, setBackups] = useState([]);
  const [backupRoot, setBackupRoot] = useState('');
  const [changelog, setChangelog] = useState([]);
  const [history, setHistory] = useState([]);
  const [serverLog, setServerLog] = useState('');
  const [serverLogInfo, setServerLogInfo] = useState(null);
  const [serverLogLoading, setServerLogLoading] = useState(false);
  const [expandedServerLog, setExpandedServerLog] = useState(true);
  const [expandedChangelog, setExpandedChangelog] = useState(false);
  const [expandedHistory, setExpandedHistory] = useState(false);
  const [expandedBackups, setExpandedBackups] = useState(false);
  const [expandedRepoSettings, setExpandedRepoSettings] = useState(false);
  const [precheckResult, setPrecheckResult] = useState(null);
  const [updateLogs, setUpdateLogs] = useState([]);

  useEffect(() => {
    loadUpdateInfo();
    loadServerLog(false);
  }, []);

  const syncRepoForm = (config) => {
    if (!config) return;
    setRepositoryConfig(config);
    setRepoForm({
      github_user: config.github_user || '',
      github_repo: config.github_repo || '',
      github_branch: config.github_branch || 'main',
      github_url: config.github_url || '',
    });
  };

  const loadServerLog = async (showToast = true) => {
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
          in_progress: response.data.in_progress,
          status: response.data.status,
          success: response.data.success,
        });
      } else {
        setServerLog('');
        setServerLogInfo(null);
      }
      if (showToast) toast({ title: 'Logs rafraîchis', description: 'Les derniers logs disponibles ont été chargés.' });
    } catch (error) {
      const detail = error.response?.data?.detail || error.message || 'Erreur inconnue';
      setServerLog(`Impossible de charger les logs du serveur.\n\nErreur: ${detail}`);
      if (showToast) toast({ title: 'Erreur logs', description: 'Impossible de charger les logs.', variant: 'destructive' });
    } finally {
      setServerLogLoading(false);
    }
  };

  const loadUpdateInfo = async () => {
    try {
      setLoading(true);
      const [currentRes, checkRes, workflowRes, repoRes, changelogRes, historyRes, backupsRes] = await Promise.allSettled([
        axios.get(`${BACKEND_URL}/api/updates/current`, { headers: authHeaders() }),
        axios.get(`${BACKEND_URL}/api/updates/check`, { headers: authHeaders() }),
        axios.get(`${BACKEND_URL}/api/updates/deployment-workflow`, { headers: authHeaders() }),
        axios.get(`${BACKEND_URL}/api/updates/repository-config`, { headers: authHeaders() }),
        axios.get(`${BACKEND_URL}/api/updates/changelog`, { headers: authHeaders() }),
        axios.get(`${BACKEND_URL}/api/updates/history`, { headers: authHeaders() }),
        axios.get(`${BACKEND_URL}/api/updates/app-backups`, { headers: authHeaders() }),
      ]);

      if (currentRes.status === 'fulfilled') setCurrentVersion(currentRes.value.data.version || '');
      if (checkRes.status === 'fulfilled') {
        const data = checkRes.value.data;
        setCurrentVersion(data.current_version || currentRes.value?.data?.version || '');
        setLatestVersion(data.latest_version || null);
        setUpdateAvailable(Boolean(data.update_available));
        if (data.deployment_workflow) setWorkflow(data.deployment_workflow);
        if (data.repository_config) syncRepoForm(data.repository_config);
      }
      if (workflowRes.status === 'fulfilled') {
        setWorkflow(workflowRes.value.data);
        if (workflowRes.value.data.repository) syncRepoForm(workflowRes.value.data.repository);
      }
      if (repoRes.status === 'fulfilled') syncRepoForm(repoRes.value.data.config);
      if (changelogRes.status === 'fulfilled') setChangelog(changelogRes.value.data.changelog || []);
      if (historyRes.status === 'fulfilled') setHistory(historyRes.value.data.history || historyRes.value.data.data || []);
      if (backupsRes.status === 'fulfilled') {
        setBackups(backupsRes.value.data.backups || []);
        setBackupRoot(backupsRes.value.data.backup_root || '');
      }
    } catch (error) {
      toast({ title: 'Erreur', description: 'Impossible de charger les informations de mise à jour.', variant: 'destructive' });
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

  const runPrecheck = async () => {
    try {
      setPrechecking(true);
      setPrecheckResult(null);
      const response = await axios.post(`${BACKEND_URL}/api/updates/precheck`, {}, {
        headers: authHeaders(),
        timeout: 240000,
      });
      setPrecheckResult(response.data);
      if (response.data.repository_config) syncRepoForm(response.data.repository_config);
      setExpandedServerLog(true);
      if (response.data.stdout || response.data.stderr) {
        setServerLog(`${response.data.stdout || ''}${response.data.stderr ? `\n--- STDERR ---\n${response.data.stderr}` : ''}`);
        setServerLogInfo({ path: 'Pré-vérification LXC', in_progress: false, success: response.data.success });
      }
      toast({
        title: response.data.success ? 'Pré-vérification réussie' : 'Pré-vérification avec erreurs',
        description: response.data.success ? 'Le conteneur LXC est prêt pour la mise à jour.' : 'Consultez les logs affichés.',
        variant: response.data.success ? 'default' : 'destructive',
      });
    } catch (error) {
      setPrecheckResult({ success: false, message: error.response?.data?.detail || error.message || 'Erreur inconnue' });
      toast({ title: 'Erreur pré-vérification', description: 'Impossible de lancer la pré-vérification.', variant: 'destructive' });
    } finally {
      setPrechecking(false);
    }
  };

  const testRepositoryConfig = async () => {
    try {
      setRepoTesting(true);
      setRepoTestResult(null);
      const response = await axios.post(`${BACKEND_URL}/api/updates/repository-config/test`, repoForm, {
        headers: authHeaders(),
        timeout: 20000,
      });
      setRepoTestResult(response.data);
      toast({
        title: response.data.success ? 'Dépôt accessible' : 'Test terminé avec erreur',
        description: response.data.success ? 'La configuration proposée répond correctement.' : 'Vérifiez le dépôt, la branche ou l’accès GitHub.',
        variant: response.data.success ? 'default' : 'destructive',
      });
    } catch (error) {
      setRepoTestResult({ success: false, detail: error.response?.data?.detail || error.message });
      toast({ title: 'Erreur test dépôt', description: error.response?.data?.detail || 'Configuration non valide.', variant: 'destructive' });
    } finally {
      setRepoTesting(false);
    }
  };

  const saveRepositoryConfig = async () => {
    try {
      setRepoSaving(true);
      const response = await axios.put(`${BACKEND_URL}/api/updates/repository-config`, repoForm, {
        headers: authHeaders(),
        timeout: 15000,
      });
      syncRepoForm(response.data.config);
      toast({ title: 'Dépôt enregistré', description: 'La prochaine vérification et la prochaine mise à jour utiliseront ce dépôt.' });
      await loadUpdateInfo();
    } catch (error) {
      toast({ title: 'Erreur enregistrement', description: error.response?.data?.detail || 'Impossible d’enregistrer le dépôt.', variant: 'destructive' });
    } finally {
      setRepoSaving(false);
    }
  };

  const waitForBackendReady = async (expectedVersion) => {
    const token = localStorage.getItem('token');
    setUpdateLogs(prev => [...prev, '⏳ Attente du redémarrage des services...']);
    await new Promise(resolve => setTimeout(resolve, 5000));

    for (let attempt = 1; attempt <= 60; attempt += 1) {
      try {
        const response = await axios.get(`${BACKEND_URL}/api/updates/current`, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 3000,
        });
        if (response.status === 200) {
          const current = response.data.version;
          setUpdateLogs(prev => [...prev, `✅ Backend disponible - version ${current}`]);
          try {
            const resultRes = await axios.get(`${BACKEND_URL}/api/updates/last-result`, {
              headers: { Authorization: `Bearer ${token}` },
              timeout: 5000,
            });
            if (resultRes.data?.has_result) {
              const result = resultRes.data;
              if (result.success && result.code_updated) {
                setUpdateLogs(prev => [...prev, '✅ Code source mis à jour avec succès']);
                toast({ title: 'Mise à jour réussie', description: `Version ${result.version_after || expectedVersion || current} installée.` });
              } else if (result.success) {
                setUpdateLogs(prev => [...prev, '⚠️ Script terminé mais code_updated=false. Consultez les logs.']);
              } else {
                setUpdateLogs(prev => [...prev, '❌ La mise à jour a échoué. Consultez les logs.']);
                toast({ title: 'Mise à jour échouée', description: 'Le script a signalé une erreur.', variant: 'destructive' });
                setUpdating(false);
                await loadServerLog(false);
                return;
              }
            }
          } catch (_) {
            setUpdateLogs(prev => [...prev, '⚠️ Résultat détaillé non encore disponible.']);
          }
          await loadUpdateInfo();
          await loadServerLog(false);
          setUpdating(false);
          return;
        }
      } catch (_) {
        setUpdateLogs(prev => [...prev, `⏳ Tentative ${attempt}/60 - backend indisponible...`]);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    setUpdateLogs(prev => [...prev, '⚠️ Délai dépassé. Rafraîchissez les logs ou reconnectez-vous dans quelques instants.']);
    toast({ title: 'Redémarrage long', description: 'Le backend met plus longtemps que prévu à revenir.', variant: 'warning' });
    setUpdating(false);
  };

  const handleApplyUpdate = async () => {
    const version = latestVersion?.version || latestVersion?.new_version || currentVersion || 'latest';
    const repoLabel = repositoryConfig?.full_name ? `${repositoryConfig.full_name}:${repositoryConfig.github_branch}` : `${repoForm.github_user}/${repoForm.github_repo}:${repoForm.github_branch}`;
    const confirmed = window.confirm(
      `Lancer la mise à jour depuis le dépôt ${repoLabel} ?\n\n` +
      'Cette action va prévenir les utilisateurs, sauvegarder les données, mettre à jour le code, reconstruire l’application et redémarrer les services.\n\n' +
      'Continuer ?'
    );
    if (!confirmed) return;

    try {
      setUpdating(true);
      setUpdateLogs([`📦 Dépôt sélectionné : ${repoLabel}`, '📢 Envoi de l’avertissement aux utilisateurs connectés...']);
      const token = localStorage.getItem('token');
      try {
        const warningRes = await axios.post(`${BACKEND_URL}/api/updates/broadcast-warning`, null, {
          params: { version },
          headers: { Authorization: `Bearer ${token}` },
        });
        setUpdateLogs(prev => [...prev, `✅ Avertissement envoyé à ${warningRes.data?.connected_users || 0} utilisateur(s)`]);
      } catch (_) {
        setUpdateLogs(prev => [...prev, '⚠️ Avertissement utilisateurs impossible, non bloquant.']);
      }

      setUpdateLogs(prev => [...prev, '⏳ Attente de 30 secondes avant lancement...']);
      await new Promise(resolve => setTimeout(resolve, 30000));
      setUpdateLogs(prev => [...prev, '🚀 Lancement de MAJ_FSAO.sh dans le LXC...']);

      try {
        const response = await axios.post(`${BACKEND_URL}/api/updates/apply`, {}, {
          params: { version },
          headers: { Authorization: `Bearer ${token}` },
          timeout: 30000,
        });
        if (response.data.accepted || response.data.success) {
          setUpdateLogs(prev => [...prev, `✅ Mise à jour acceptée - ID ${response.data.update_id || 'n/a'}`]);
          setUpdateLogs(prev => [...prev, '📦 Installation en cours dans le conteneur...']);
        }
      } catch (applyError) {
        if (applyError.code === 'ERR_NETWORK' || applyError.code === 'ECONNABORTED' || applyError.response?.status === 502 || applyError.response?.status === 503) {
          setUpdateLogs(prev => [...prev, '🔄 Connexion interrompue : redémarrage probablement en cours...']);
        } else {
          throw applyError;
        }
      }
      await waitForBackendReady(version);
    } catch (error) {
      setUpdateLogs(prev => [...prev, `❌ ${error.response?.data?.detail || error.message || 'Erreur inconnue'}`]);
      toast({ title: 'Erreur de mise à jour', description: formatErrorMessage(error, 'Échec de la mise à jour.'), variant: 'destructive' });
      setUpdating(false);
    }
  };

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
          <p className="mt-1 text-gray-600">Mise à jour graphique exécutée directement dans le conteneur LXC.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleRefresh} disabled={checking || updating}>
            <RefreshCw size={18} className={`mr-2 ${checking ? 'animate-spin' : ''}`} />
            Vérifier
          </Button>
          <Button variant="outline" onClick={runPrecheck} disabled={prechecking || updating}>
            <ShieldCheck size={18} className={`mr-2 ${prechecking ? 'animate-spin' : ''}`} />
            Pré-vérifier
          </Button>
          <Button onClick={handleApplyUpdate} disabled={updating} className="bg-blue-600 hover:bg-blue-700 text-white">
            <Download size={18} className={`mr-2 ${updating ? 'animate-spin' : ''}`} />
            {updating ? 'Mise à jour en cours...' : 'Mettre à jour maintenant'}
          </Button>
        </div>
      </div>

      <Card className={updateAvailable ? 'border-blue-500 border-2' : ''}>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
            <div>
              <div className="mb-2 flex items-center gap-3"><Package size={24} className="text-gray-600" /><h3 className="text-lg font-semibold text-gray-900">Version actuelle</h3></div>
              <p className="text-3xl font-bold text-gray-900">{currentVersion || 'Inconnue'}</p>
            </div>
            <div>
              <div className="mb-2 flex items-center gap-3"><Download size={24} className={updateAvailable ? 'text-blue-600' : 'text-gray-600'} /><h3 className="text-lg font-semibold text-gray-900">Dernière version</h3></div>
              <p className="text-3xl font-bold text-blue-600">{latestVersion?.version || latestVersion?.new_version || currentVersion || 'Inconnue'}</p>
              {updateAvailable ? <p className="mt-2 text-sm text-blue-600">Nouvelle version détectée.</p> : <p className="mt-2 text-sm text-green-600">Vous semblez à jour.</p>}
            </div>
            <div>
              <div className="mb-2 flex items-center gap-3"><Terminal size={24} className="text-gray-600" /><h3 className="text-lg font-semibold text-gray-900">Mode d’action</h3></div>
              <p className="text-lg font-semibold text-gray-900">{workflow?.mode || 'lxc_in_app'}</p>
              <div className="mt-2"><StatusBadge type="ok">Interface graphique • LXC</StatusBadge></div>
            </div>
            <div>
              <div className="mb-2 flex items-center gap-3"><Settings size={24} className="text-gray-600" /><h3 className="text-lg font-semibold text-gray-900">Dépôt</h3></div>
              <p className="text-lg font-semibold text-gray-900">{repositoryConfig?.full_name || `${repoForm.github_user}/${repoForm.github_repo}`}</p>
              <p className="mt-1 text-sm text-gray-500">Branche {repositoryConfig?.github_branch || repoForm.github_branch || 'main'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {precheckResult && (
        <Card className={precheckResult.success ? 'border-green-200' : 'border-red-200'}>
          <CardHeader><CardTitle className="flex items-center gap-2">{precheckResult.success ? <CheckCircle size={20} className="text-green-600" /> : <AlertCircle size={20} className="text-red-600" />}Résultat de la pré-vérification</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-gray-700">{precheckResult.success ? 'Les prérequis principaux sont validés.' : 'Un ou plusieurs prérequis sont en erreur. Consultez les logs.'}</p></CardContent>
        </Card>
      )}

      {updating && updateLogs.length > 0 && (
        <Card className="bg-gray-900 text-white">
          <CardHeader><CardTitle className="text-white">Suivi de la mise à jour</CardTitle></CardHeader>
          <CardContent><div className="max-h-64 overflow-y-auto space-y-1 font-mono text-sm">{updateLogs.map((line, index) => <div key={index}>{line}</div>)}</div></CardContent>
        </Card>
      )}

      <Card className="border-amber-200">
        <CardHeader className="cursor-pointer hover:bg-amber-50" onClick={() => { const next = !expandedServerLog; setExpandedServerLog(next); if (next && !serverLog) loadServerLog(false); }}>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-amber-700"><FileText size={20} />Logs serveur et diagnostic {serverLogInfo?.in_progress && <StatusBadge type="warning">En cours</StatusBadge>}</CardTitle>
            <div className="flex items-center gap-2">{expandedServerLog && <Button variant="ghost" size="sm" className="text-amber-700" onClick={(e) => { e.stopPropagation(); loadServerLog(true); }} disabled={serverLogLoading}><RefreshCw size={14} className={serverLogLoading ? 'animate-spin' : ''} /></Button>}{expandedServerLog ? <ChevronDown size={20} /> : <ChevronRight size={20} />}</div>
          </div>
        </CardHeader>
        {expandedServerLog && <CardContent><LogBox content={serverLog} /></CardContent>}
      </Card>

      <Card>
        <CardHeader className="cursor-pointer hover:bg-gray-50" onClick={() => setExpandedBackups(!expandedBackups)}>
          <div className="flex items-center justify-between"><CardTitle className="flex items-center gap-2"><RotateCcw size={20} />Sauvegardes locales <span className="text-sm font-normal text-gray-500">({backups.length})</span></CardTitle>{expandedBackups ? <ChevronDown size={20} /> : <ChevronRight size={20} />}</div>
        </CardHeader>
        {expandedBackups && (
          <CardContent>
            <p className="mb-4 text-sm text-gray-600">Dossier : <code>{backupRoot || '/opt/gmao-iris/backups'}</code></p>
            {backups.length === 0 ? <p className="py-4 text-center text-gray-500">Aucune sauvegarde détectée.</p> : <div className="space-y-2">{backups.map((backup) => <div key={backup.path} className="rounded-lg border bg-gray-50 p-3"><div className="flex items-center justify-between gap-3"><div><p className="font-medium text-gray-900">{backup.name}</p><p className="text-xs text-gray-500">{backup.path}</p><p className="text-xs text-gray-500">{backup.type === 'mongodb' ? 'Sauvegarde MongoDB' : 'Sauvegarde applicative'}</p></div><StatusBadge type={backup.type === 'mongodb' ? 'info' : 'ok'}>{backup.type}</StatusBadge></div></div>)}</div>}
          </CardContent>
        )}
      </Card>

      {changelog.length > 0 && (
        <Card>
          <CardHeader className="cursor-pointer hover:bg-gray-50" onClick={() => setExpandedChangelog(!expandedChangelog)}><div className="flex items-center justify-between"><CardTitle>📝 Nouveautés</CardTitle>{expandedChangelog ? <ChevronDown size={20} /> : <ChevronRight size={20} />}</div></CardHeader>
          {expandedChangelog && <CardContent><div className="space-y-4">{changelog.map((log, index) => <div key={`${log.version || index}-${index}`}><h4 className="mb-2 font-semibold text-gray-900">Version {log.version || 'non précisée'}</h4><ul className="space-y-1 text-sm text-gray-700">{(log.changes || []).map((change, idx) => <li key={idx}>• {change}</li>)}</ul></div>)}</div></CardContent>}
        </Card>
      )}

      <Card>
        <CardHeader className="cursor-pointer hover:bg-gray-50" onClick={() => setExpandedHistory(!expandedHistory)}><div className="flex items-center justify-between"><CardTitle className="flex items-center gap-2"><Clock size={20} />Historique des mises à jour</CardTitle>{expandedHistory ? <ChevronDown size={20} /> : <ChevronRight size={20} />}</div></CardHeader>
        {expandedHistory && <CardContent>{history.length === 0 ? <p className="py-4 text-center text-gray-500">Aucune mise à jour enregistrée.</p> : <div className="space-y-3">{history.map((item, index) => <div key={item.id || index} className="rounded-lg bg-gray-50 p-3"><div className="flex items-start gap-3">{item.success ? <CheckCircle size={20} className="text-green-600" /> : <AlertCircle size={20} className="text-red-600" />}<div><p className="font-medium text-gray-900">{item.version_before || '?'} → {item.version_after || '?'}</p><p className="text-sm text-gray-600">{item.started_at ? new Date(item.started_at).toLocaleString('fr-FR') : 'Date inconnue'}</p>{item.duration_seconds && <p className="text-xs text-gray-500">Durée : {Math.floor(item.duration_seconds / 60)}m {Math.floor(item.duration_seconds % 60)}s</p>}{item.summary?.errors?.length > 0 && <div className="mt-2 text-xs text-red-600">{item.summary.errors.map((err, i) => <p key={i}>❌ {err}</p>)}</div>}</div></div></div>)}</div>}</CardContent>}
      </Card>

      <Card className="border-gray-200">
        <CardHeader className="cursor-pointer hover:bg-gray-50" onClick={() => setExpandedRepoSettings(!expandedRepoSettings)}>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2"><Settings size={20} />Paramétrage du dépôt de mise à jour</CardTitle>
            {expandedRepoSettings ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
          </div>
        </CardHeader>
        {expandedRepoSettings && (
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-blue-50 border border-blue-100 p-4 text-sm text-blue-900">
              <p className="font-medium">Cette configuration est utilisée pour détecter les mises à jour GitHub et lancer MAJ_FSAO.sh depuis le LXC.</p>
              <p className="mt-1">Elle permet de basculer vers un autre dépôt ou une autre branche sans modifier le code.</p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <InputField label="Utilisateur / organisation GitHub" value={repoForm.github_user} onChange={(v) => setRepoForm(prev => ({ ...prev, github_user: v }))} placeholder="Kinder0083" />
              <InputField label="Nom du dépôt" value={repoForm.github_repo} onChange={(v) => setRepoForm(prev => ({ ...prev, github_repo: v }))} placeholder="GMAO_IA" />
              <InputField label="Branche" value={repoForm.github_branch} onChange={(v) => setRepoForm(prev => ({ ...prev, github_branch: v }))} placeholder="main" />
            </div>
            <InputField label="URL Git optionnelle" value={repoForm.github_url} onChange={(v) => setRepoForm(prev => ({ ...prev, github_url: v }))} placeholder="https://github.com/Kinder0083/GMAO_IA.git" help="Laissez vide pour reconstruire automatiquement l’URL depuis l’utilisateur et le dépôt. Pour un dépôt privé, le LXC doit avoir un accès GitHub valide." />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={testRepositoryConfig} disabled={repoTesting || repoSaving || updating}>
                <RefreshCw size={16} className={`mr-2 ${repoTesting ? 'animate-spin' : ''}`} />
                Tester ce dépôt
              </Button>
              <Button onClick={saveRepositoryConfig} disabled={repoTesting || repoSaving || updating} className="bg-gray-900 hover:bg-gray-800 text-white">
                <Settings size={16} className={`mr-2 ${repoSaving ? 'animate-spin' : ''}`} />
                Enregistrer le dépôt
              </Button>
              {repositoryConfig?.source && <StatusBadge type="neutral">Source actuelle : {repositoryConfig.source}</StatusBadge>}
            </div>
            {repoTestResult && (
              <div className={`rounded-lg border p-3 text-sm ${repoTestResult.success ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
                <p className="font-medium">{repoTestResult.success ? 'Test réussi' : 'Test échoué'}</p>
                {repoTestResult.result?.message && <p>{repoTestResult.result.message}</p>}
                {repoTestResult.result?.error && <p>{repoTestResult.result.error}</p>}
                {repoTestResult.result?.details && <p className="mt-1 text-xs">{repoTestResult.result.details}</p>}
                {repoTestResult.detail && <p>{repoTestResult.detail}</p>}
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
};

export default Updates;
