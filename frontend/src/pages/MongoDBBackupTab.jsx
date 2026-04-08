import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Database, Play, RefreshCw, Trash2, RotateCcw, Clock, CheckCircle,
  XCircle, AlertTriangle, Download, Settings, FileText, HardDrive,
  ChevronDown, ChevronRight, Package
} from 'lucide-react';
import { useToast } from '../hooks/use-toast';
import axios from 'axios';
import { getBackendURL } from '../utils/config';

const backend_url = getBackendURL();
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

const fmt = (iso) => iso ? new Date(iso).toLocaleString('fr-FR') : '-';
const fmtHour = (h, m) => `${String(h).padStart(2, '0')}h${String(m).padStart(2, '0')}`;

const StatusBadge = ({ ok, yes, no }) => ok
  ? <span className="inline-flex items-center gap-1 text-green-600 text-sm font-medium"><CheckCircle size={14} />{yes}</span>
  : <span className="inline-flex items-center gap-1 text-red-500 text-sm font-medium"><XCircle size={14} />{no}</span>;

const SectionCard = ({ title, icon: Icon, children, defaultOpen = true }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card>
      <CardHeader className="pb-2 cursor-pointer select-none" onClick={() => setOpen(o => !o)}>
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2"><Icon size={18} className="text-blue-600" />{title}</span>
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </CardTitle>
      </CardHeader>
      {open && <CardContent>{children}</CardContent>}
    </Card>
  );
};

const MongoDBBackupTab = () => {
  const { toast } = useToast();
  const [status, setStatus] = useState(null);
  const [backups, setBackups] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [runningBackup, setRunningBackup] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [restoring, setRestoring] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [savingCron, setSavingCron] = useState(false);
  const [removingCron, setRemovingCron] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(null);

  const [cronConfig, setCronConfig] = useState({ hour: 2, minute: 0, retention_days: 7 });

  const load = useCallback(async () => {
    try {
      const [statusRes, backupsRes] = await Promise.all([
        axios.get(`${backend_url}/api/mongodb-backup/status`, { headers: authHeaders() }),
        axios.get(`${backend_url}/api/mongodb-backup/list`, { headers: authHeaders() }),
      ]);
      setStatus(statusRes.data);
      setBackups(backupsRes.data);
      // Pré-remplir le formulaire cron si déjà configuré
      if (statusRes.data.cron_config) {
        const c = statusRes.data.cron_config;
        setCronConfig(prev => ({
          ...prev,
          hour: parseInt(c.hour) || 2,
          minute: parseInt(c.minute) || 0,
        }));
      }
    } catch (e) {
      toast({ title: 'Erreur chargement', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const loadLogs = async () => {
    try {
      const res = await axios.get(`${backend_url}/api/mongodb-backup/logs?lines=100`, { headers: authHeaders() });
      setLogs(res.data.lines || []);
    } catch (e) {
      toast({ title: 'Erreur logs', description: e.message, variant: 'destructive' });
    }
  };

  useEffect(() => { load(); }, [load]);

  const handleInstall = async () => {
    setInstalling(true);
    try {
      const res = await axios.post(`${backend_url}/api/mongodb-backup/install-mongodump`, {}, { headers: authHeaders() });
      toast({ title: 'Installation réussie', description: res.data.message });
      await load();
    } catch (e) {
      toast({ title: 'Échec installation', description: e.response?.data?.detail || e.message, variant: 'destructive' });
    } finally {
      setInstalling(false);
    }
  };

  const handleRunBackup = async () => {
    setRunningBackup(true);
    try {
      const res = await axios.post(`${backend_url}/api/mongodb-backup/run`, {}, { headers: authHeaders() });
      toast({ title: 'Sauvegarde réussie', description: res.data.message });
      await load();
    } catch (e) {
      toast({ title: 'Échec sauvegarde', description: e.response?.data?.detail || e.message, variant: 'destructive' });
    } finally {
      setRunningBackup(false);
    }
  };

  const handleDelete = async (name) => {
    setDeleting(name);
    try {
      await axios.delete(`${backend_url}/api/mongodb-backup/backup/${name}`, { headers: authHeaders() });
      toast({ title: 'Supprimé', description: `Sauvegarde ${name} supprimée` });
      await load();
    } catch (e) {
      toast({ title: 'Erreur suppression', description: e.response?.data?.detail || e.message, variant: 'destructive' });
    } finally {
      setDeleting(null);
    }
  };

  const handleRestore = async (name) => {
    setRestoring(name);
    setConfirmRestore(null);
    try {
      const res = await axios.post(`${backend_url}/api/mongodb-backup/restore/${name}`, {}, { headers: authHeaders() });
      toast({ title: 'Restauration réussie', description: res.data.message });
    } catch (e) {
      toast({ title: 'Échec restauration', description: e.response?.data?.detail || e.message, variant: 'destructive' });
    } finally {
      setRestoring(null);
    }
  };

  const handleSaveCron = async () => {
    setSavingCron(true);
    try {
      const res = await axios.post(`${backend_url}/api/mongodb-backup/cron`, cronConfig, { headers: authHeaders() });
      toast({ title: 'Cron configuré', description: res.data.message });
      await load();
    } catch (e) {
      toast({ title: 'Erreur cron', description: e.response?.data?.detail || e.message, variant: 'destructive' });
    } finally {
      setSavingCron(false);
    }
  };

  const handleRemoveCron = async () => {
    setRemovingCron(true);
    try {
      await axios.delete(`${backend_url}/api/mongodb-backup/cron`, { headers: authHeaders() });
      toast({ title: 'Cron supprimé', description: 'Sauvegarde automatique désactivée' });
      await load();
    } catch (e) {
      toast({ title: 'Erreur', description: e.response?.data?.detail || e.message, variant: 'destructive' });
    } finally {
      setRemovingCron(false);
    }
  };

  const handleClearLogs = async () => {
    try {
      await axios.delete(`${backend_url}/api/mongodb-backup/logs`, { headers: authHeaders() });
      setLogs([]);
      toast({ title: 'Logs effacés' });
    } catch (e) {
      toast({ title: 'Erreur', description: e.message, variant: 'destructive' });
    }
  };

  if (loading) return <div className="text-center py-16 text-gray-500"><RefreshCw className="animate-spin mx-auto mb-3" /><p>Chargement...</p></div>;

  const disk = status?.disk || {};
  const diskPct = disk.used_pct || 0;
  const diskColor = diskPct >= 85 ? 'bg-red-500' : diskPct >= 70 ? 'bg-orange-400' : 'bg-green-500';

  return (
    <div className="space-y-5">

      {/* ── ÉTAT SYSTÈME ── */}
      <SectionCard title="État du système" icon={Settings}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">mongodump</p>
            <StatusBadge ok={status?.mongodump_installed} yes="Installé" no="Non installé" />
            {status?.mongodump_version && <p className="text-xs text-gray-400 mt-1 truncate">{status.mongodump_version}</p>}
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">Démon cron</p>
            <StatusBadge ok={status?.cron_daemon_running} yes="Actif" no="Inactif" />
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">Cron planifié</p>
            <StatusBadge ok={status?.cron_configured} yes="Configuré" no="Non configuré" />
            {status?.cron_config && (
              <p className="text-xs text-gray-400 mt-1">
                {fmtHour(status.cron_config.hour, status.cron_config.minute)} chaque jour
              </p>
            )}
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">Base de données</p>
            <span className="text-sm font-medium text-blue-600">{status?.db_name}</span>
          </div>
        </div>

        {/* Espace disque */}
        {disk.total_gb && (
          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span className="flex items-center gap-1"><HardDrive size={12} />Espace disque ({status?.backup_dir})</span>
              <span>{disk.used_gb} Go / {disk.total_gb} Go ({diskPct}%)</span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${diskColor}`} style={{ width: `${diskPct}%` }} />
            </div>
            <p className="text-xs text-gray-400 mt-1">{disk.free_gb} Go disponibles — {status?.backup_count} sauvegarde(s)</p>
          </div>
        )}

        {/* Installation mongodump */}
        {!status?.mongodump_installed && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm text-amber-800 font-medium flex items-center gap-2">
              <AlertTriangle size={16} />
              mongodump n'est pas installé sur ce serveur
            </p>
            <p className="text-xs text-amber-700 mt-1 mb-3">
              Nécessaire pour les sauvegardes MongoDB natives. L'installation se fait via <code className="bg-amber-100 px-1 rounded">apt-get install mongodb-database-tools</code>.
            </p>
            <Button size="sm" onClick={handleInstall} disabled={installing} className="bg-amber-600 hover:bg-amber-700 text-white">
              {installing ? <><RefreshCw size={14} className="mr-2 animate-spin" />Installation en cours...</> : <><Package size={14} className="mr-2" />Installer mongodump automatiquement</>}
            </Button>
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <Button size="sm" variant="outline" onClick={load}>
            <RefreshCw size={14} className="mr-2" />Actualiser
          </Button>
        </div>
      </SectionCard>

      {/* ── SAUVEGARDE MANUELLE ── */}
      <SectionCard title="Sauvegarde manuelle" icon={Download}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-600">Lance immédiatement une sauvegarde complète de <strong>{status?.db_name}</strong>.</p>
            {status?.last_backup && (
              <p className="text-xs text-gray-400 mt-1">
                Dernière sauvegarde : {fmt(status.last_backup.created_at)} — {status.last_backup.size_mb} MB
              </p>
            )}
          </div>
          <Button
            onClick={handleRunBackup}
            disabled={runningBackup || !status?.mongodump_installed}
            className="bg-blue-600 hover:bg-blue-700 text-white min-w-[160px]"
            data-testid="run-backup-btn"
          >
            {runningBackup
              ? <><RefreshCw size={14} className="mr-2 animate-spin" />Sauvegarde...</>
              : <><Play size={14} className="mr-2" />Lancer maintenant</>}
          </Button>
        </div>
      </SectionCard>

      {/* ── PLANIFICATION AUTOMATIQUE ── */}
      <SectionCard title="Planification automatique (cron)" icon={Clock}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="space-y-1">
            <Label className="text-xs">Heure (0–23)</Label>
            <Input
              type="number" min={0} max={23}
              value={cronConfig.hour}
              onChange={e => setCronConfig(p => ({ ...p, hour: parseInt(e.target.value) || 0 }))}
              data-testid="cron-hour-input"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Minute (0–59)</Label>
            <Input
              type="number" min={0} max={59}
              value={cronConfig.minute}
              onChange={e => setCronConfig(p => ({ ...p, minute: parseInt(e.target.value) || 0 }))}
              data-testid="cron-minute-input"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Rétention (jours)</Label>
            <Input
              type="number" min={1} max={90}
              value={cronConfig.retention_days}
              onChange={e => setCronConfig(p => ({ ...p, retention_days: parseInt(e.target.value) || 7 }))}
              data-testid="cron-retention-input"
            />
          </div>
        </div>
        <p className="text-xs text-gray-400 mb-4">
          Sauvegarde chaque jour à {fmtHour(cronConfig.hour, cronConfig.minute)} — conservation des {cronConfig.retention_days} derniers jours.
          <br />Les fichiers cron et script sont créés automatiquement dans <code className="bg-gray-100 px-1 rounded">/etc/cron.d/</code> et <code className="bg-gray-100 px-1 rounded">/root/</code>.
        </p>
        <div className="flex gap-2">
          <Button
            onClick={handleSaveCron}
            disabled={savingCron || !status?.mongodump_installed}
            className="bg-green-600 hover:bg-green-700 text-white"
            data-testid="save-cron-btn"
          >
            {savingCron ? <><RefreshCw size={14} className="mr-2 animate-spin" />Enregistrement...</> : <><CheckCircle size={14} className="mr-2" />{status?.cron_configured ? 'Mettre à jour le cron' : 'Activer la planification'}</>}
          </Button>
          {status?.cron_configured && (
            <Button
              variant="outline"
              onClick={handleRemoveCron}
              disabled={removingCron}
              className="border-red-300 text-red-600 hover:bg-red-50"
              data-testid="remove-cron-btn"
            >
              {removingCron ? <RefreshCw size={14} className="animate-spin" /> : <><XCircle size={14} className="mr-2" />Désactiver</>}
            </Button>
          )}
        </div>
        {status?.cron_configured && (
          <div className="mt-3 p-2 bg-green-50 border border-green-200 rounded text-xs text-green-700">
            <CheckCircle size={12} className="inline mr-1" />
            Planification active : sauvegarde chaque jour à {fmtHour(status.cron_config?.hour, status.cron_config?.minute)}
          </div>
        )}
      </SectionCard>

      {/* ── LISTE DES SAUVEGARDES ── */}
      <SectionCard title={`Sauvegardes disponibles (${backups.length})`} icon={Database}>
        {backups.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">Aucune sauvegarde trouvée dans {status?.backup_dir}</p>
        ) : (
          <div className="divide-y">
            {backups.map(b => (
              <div key={b.name} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-gray-800">{b.name}</p>
                  <p className="text-xs text-gray-400">{fmt(b.created_at)} — {b.size_mb} MB</p>
                </div>
                <div className="flex gap-2">
                  {confirmRestore === b.name ? (
                    <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-1">
                      <span className="text-xs text-red-700 font-medium">Confirmer la restauration ?</span>
                      <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white h-6 text-xs px-2"
                        onClick={() => handleRestore(b.name)} disabled={restoring === b.name}>
                        {restoring === b.name ? <RefreshCw size={12} className="animate-spin" /> : 'Oui'}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setConfirmRestore(null)}>
                        Annuler
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm" variant="outline"
                      onClick={() => setConfirmRestore(b.name)}
                      disabled={!!restoring}
                      className="text-blue-600 border-blue-300 hover:bg-blue-50"
                      data-testid={`restore-btn-${b.name}`}
                    >
                      <RotateCcw size={14} className="mr-1" />Restaurer
                    </Button>
                  )}
                  <Button
                    size="sm" variant="ghost"
                    onClick={() => handleDelete(b.name)}
                    disabled={deleting === b.name}
                    className="text-red-500 hover:bg-red-50"
                    data-testid={`delete-backup-btn-${b.name}`}
                  >
                    {deleting === b.name ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* ── JOURNAUX ── */}
      <SectionCard title="Journal des sauvegardes" icon={FileText} defaultOpen={false}>
        <div className="flex gap-2 mb-3">
          <Button size="sm" variant="outline" onClick={() => { loadLogs(); setShowLogs(true); }}>
            <FileText size={14} className="mr-2" />Charger les logs
          </Button>
          {logs.length > 0 && (
            <Button size="sm" variant="ghost" onClick={handleClearLogs} className="text-red-500">
              <Trash2 size={14} className="mr-2" />Vider les logs
            </Button>
          )}
        </div>
        {showLogs && (
          logs.length === 0
            ? <p className="text-sm text-gray-400">Aucun log disponible.</p>
            : (
              <div className="bg-gray-900 text-green-400 rounded-lg p-4 font-mono text-xs overflow-auto max-h-72 space-y-0.5">
                {logs.map((line, i) => (
                  <div key={i} className={
                    line.includes('ERREUR') ? 'text-red-400' :
                    line.includes('AVERTISSEMENT') ? 'text-yellow-400' :
                    line.includes('réussie') || line.includes('OK') ? 'text-green-300' : 'text-green-500'
                  }>
                    {line || '\u00A0'}
                  </div>
                ))}
              </div>
            )
        )}
      </SectionCard>

      {/* ── GUIDE INSTALLATION FRAÎCHE ── */}
      <SectionCard title="Guide — Installation fraîche sur LXC" icon={Settings} defaultOpen={false}>
        <div className="space-y-3 text-sm">
          <p className="text-gray-600">Sur un nouveau conteneur LXC, suivez ces étapes si l'installation automatique ne fonctionne pas :</p>
          <div className="space-y-2">
            {[
              { step: '1', label: 'Mettre à jour les paquets', cmd: 'apt-get update' },
              { step: '2', label: 'Installer mongodump', cmd: 'apt-get install -y mongodb-database-tools' },
              { step: '3', label: 'Installer cron si absent', cmd: 'apt-get install -y cron && service cron start' },
              { step: '4', label: 'Vérifier mongodump', cmd: 'mongodump --version' },
              { step: '5', label: 'Tester une sauvegarde manuelle', cmd: `mongodump --db ${status?.db_name || 'gmao_iris'} --out /tmp/test_bak --gzip --quiet && echo "OK"` },
            ].map(({ step, label, cmd }) => (
              <div key={step} className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs font-semibold text-gray-600 mb-1">Étape {step} — {label}</p>
                <code className="text-xs bg-gray-900 text-green-400 block px-3 py-2 rounded select-all">{cmd}</code>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400">Une fois mongodump installé, utilisez le bouton "Installer mongodump automatiquement" ci-dessus ou revenez ici pour relancer la vérification.</p>
        </div>
      </SectionCard>

    </div>
  );
};

export default MongoDBBackupTab;
