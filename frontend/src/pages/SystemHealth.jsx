import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Alert, AlertDescription } from '../components/ui/alert';
import {
  Activity, CheckCircle2, XCircle, AlertTriangle, RefreshCw,
  Shield, ShieldOff, Clock, HardDrive, Database, Cpu, Zap,
  ChevronDown, ChevronUp, RotateCcw, Mail, Plus, X, Send, Bell, BellOff,
  Wifi, WifiOff, Trash2, Upload, FolderSync, Smartphone
} from 'lucide-react';
import { useToast } from '../hooks/use-toast';
import api from '../services/api';
import useOnlineStatus from '../hooks/useOnlineStatus';

const LEVEL_CONFIG = {
  1: { name: 'SOFT', label: 'Restart services', color: '#22c55e', bg: '#f0fdf4' },
  2: { name: 'ROLLBACK', label: 'Retour version', color: '#f59e0b', bg: '#fffbeb' },
  3: { name: 'MEDIUM', label: 'Reinstall deps', color: '#f97316', bg: '#fff7ed' },
  4: { name: 'HARD', label: 'Reset complet', color: '#ef4444', bg: '#fef2f2' },
};

function StatusDot({ status }) {
  const colors = {
    ok: 'bg-green-500',
    warning: 'bg-amber-500 animate-pulse',
    error: 'bg-red-500 animate-pulse',
    unknown: 'bg-gray-400',
  };
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${colors[status] || colors.unknown}`} />;
}

function HealthCard({ icon: Icon, label, status, message, iconColor }) {
  return (
    <Card className="overflow-hidden" data-testid={`health-card-${label.toLowerCase().replace(/\s/g, '-')}`}>
      <CardContent className="p-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
             style={{ backgroundColor: status === 'ok' ? '#f0fdf4' : status === 'warning' ? '#fffbeb' : status === 'error' ? '#fef2f2' : '#f8fafc' }}>
          <Icon size={20} style={{ color: iconColor || (status === 'ok' ? '#22c55e' : status === 'warning' ? '#f59e0b' : status === 'error' ? '#ef4444' : '#94a3b8') }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700">{label}</span>
            <StatusDot status={status} />
          </div>
          <p className="text-xs text-gray-500 truncate">{message}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function TimeAgo({ dateStr }) {
  if (!dateStr) return <span className="text-gray-400">jamais</span>;
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now - d;
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return <span className="text-green-600">a l'instant</span>;
    if (mins < 60) return <span>il y a {mins} min</span>;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return <span>il y a {hours}h</span>;
    const days = Math.floor(hours / 24);
    return <span>il y a {days}j</span>;
  } catch {
    return <span className="text-gray-400">{dateStr}</span>;
  }
}

export default function SystemHealth() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [maintenanceToggling, setMaintenanceToggling] = useState(false);
  const [data, setData] = useState(null);
  const [healthChecks, setHealthChecks] = useState(null);
  const [historyExpanded, setHistoryExpanded] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Notification health state
  const [notifHealth, setNotifHealth] = useState(null);
  const [notifHistory, setNotifHistory] = useState([]);
  const [notifExpanded, setNotifExpanded] = useState(true);
  const [notifChecking, setNotifChecking] = useState(false);

  // Alerts state
  const [alertsConfig, setAlertsConfig] = useState(null);
  const [alertsExpanded, setAlertsExpanded] = useState(true);
  const [alertsSaving, setAlertsSaving] = useState(false);
  const [alertsTesting, setAlertsTesting] = useState(false);
  const [newEmail, setNewEmail] = useState('');

  const ALERT_TYPES_CONFIG = [
    { key: 'app_down', label: 'Application en panne', desc: 'Backend ne répond plus', icon: XCircle, color: '#ef4444', hasThreshold: true, thresholdLabel: 'Après X échec(s)', thresholdUnit: 'échec(s)', min: 1, max: 10 },
    { key: 'recovery_success', label: 'Récupération réussie', desc: 'Système auto-réparé', icon: CheckCircle2, color: '#22c55e' },
    { key: 'recovery_failed', label: 'Récupération échouée', desc: 'Intervention manuelle requise', icon: XCircle, color: '#dc2626' },
    { key: 'disk_warning', label: 'Disque plein', desc: 'Espace disque critique', icon: HardDrive, color: '#f59e0b', hasThreshold: true, thresholdLabel: 'Seuil', thresholdUnit: '%', min: 50, max: 98 },
    { key: 'memory_warning', label: 'Mémoire critique', desc: 'RAM presque pleine', icon: Cpu, color: '#f97316', hasThreshold: true, thresholdLabel: 'Seuil', thresholdUnit: '%', min: 50, max: 98 },
    { key: 'maintenance_changed', label: 'Maintenance changée', desc: 'Activation/désactivation', icon: Shield, color: '#7c3aed' },
  ];

  const fetchStatus = useCallback(async () => {
    try {
      const res = await api.get('/maintenance/status');
      setData(res.data);
    } catch (e) {
      console.error('Erreur fetch status:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAlertsConfig = useCallback(async () => {
    try {
      const res = await api.get('/health/alerts-config');
      setAlertsConfig(res.data);
    } catch (e) {
      console.error('Erreur fetch alerts config:', e);
    }
  }, []);

  const fetchNotifHealth = useCallback(async () => {
    try {
      const res = await api.get('/health/notifications');
      setNotifHealth(res.data);
    } catch (e) {
      console.error('Erreur fetch notif health:', e);
    }
  }, []);

  const fetchNotifHistory = useCallback(async () => {
    try {
      const res = await api.get('/health/notifications/history?limit=24');
      setNotifHistory(res.data?.checks || []);
    } catch (e) {
      console.error('Erreur fetch notif history:', e);
    }
  }, []);

  const forceNotifCheck = async () => {
    setNotifChecking(true);
    try {
      const res = await api.post('/health/notifications/force-check', {});
      setNotifHealth(res.data);
      toast({ title: 'Verification terminee', description: `Statut: ${res.data.overall === 'ok' ? 'Sain' : res.data.overall === 'warning' ? 'Attention' : 'Erreur'}` });
      fetchNotifHistory();
    } catch (e) {
      toast({ title: 'Erreur', description: 'Impossible de verifier les notifications', variant: 'destructive' });
    } finally {
      setNotifChecking(false);
    }
  };

  const runHealthCheck = async () => {
    setChecking(true);
    try {
      const res = await api.post('/health/force-check', {});
      setHealthChecks(res.data);
      toast({ title: 'Health check terminé', description: `Statut global: ${res.data.overall === 'ok' ? 'Sain' : res.data.overall}` });
    } catch (e) {
      toast({ title: 'Erreur', description: 'Impossible de lancer le health check', variant: 'destructive' });
    } finally {
      setChecking(false);
    }
  };

  const toggleMaintenance = async (activate) => {
    if (activate) {
      const msg = 'ATTENTION : Activer la maintenance rendra l\'application INACCESSIBLE pour tous les utilisateurs.\n\nLes utilisateurs verront une page de maintenance à la place de l\'application.\n\nPour désactiver, vous devrez :\n- Cliquer 5 fois sur le logo de la page maintenance\n- Ou vous connecter en SSH au serveur\n\nTapez "MAINTENANCE" pour confirmer :';
      const input = window.prompt(msg);
      if (input !== 'MAINTENANCE') {
        toast({ title: 'Annulé', description: 'Activation de la maintenance annulée' });
        return;
      }
    } else {
      if (!window.confirm('Désactiver la page de maintenance et restaurer l\'accès normal ?')) return;
    }
    setMaintenanceToggling(true);
    try {
      await api.post(activate ? '/maintenance/activate' : '/maintenance/deactivate', {});
      toast({ title: activate ? 'Maintenance activée' : 'Maintenance désactivée' });
      fetchStatus();
    } catch (e) {
      toast({ title: 'Erreur', description: e.response?.data?.detail || 'Opération échouée', variant: 'destructive' });
    } finally {
      setMaintenanceToggling(false);
    }
  };

  const resetFailures = async () => {
    try {
      await api.post('/health/reset-failures', {});
      toast({ title: 'Compteur remis à zéro' });
      fetchStatus();
    } catch (e) {
      toast({ title: 'Erreur', description: 'Impossible de reset le compteur', variant: 'destructive' });
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchAlertsConfig();
    fetchNotifHealth();
    fetchNotifHistory();
    runHealthCheck();
  }, [fetchStatus, fetchAlertsConfig, fetchNotifHealth, fetchNotifHistory]);

  // Auto-refresh every 30s
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => { fetchStatus(); }, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchStatus]);

  // ──── Alert config management ────
  const saveAlertsConfig = async (updatedConfig) => {
    setAlertsSaving(true);
    try {
      await api.put('/health/alerts-config', updatedConfig);
      setAlertsConfig(updatedConfig);
      toast({ title: 'Configuration sauvegardée' });
    } catch (e) {
      toast({ title: 'Erreur', description: 'Impossible de sauvegarder', variant: 'destructive' });
    } finally {
      setAlertsSaving(false);
    }
  };

  const toggleAlertsEnabled = () => {
    const updated = { ...alertsConfig, enabled: !alertsConfig?.enabled };
    saveAlertsConfig(updated);
  };

  const addRecipient = () => {
    const email = newEmail.trim();
    if (!email || !email.includes('@')) { toast({ title: 'Email invalide', variant: 'destructive' }); return; }
    const recipients = [...(alertsConfig?.recipients || [])];
    if (recipients.includes(email)) { toast({ title: 'Email déjà ajouté' }); return; }
    recipients.push(email);
    const updated = { ...alertsConfig, recipients };
    saveAlertsConfig(updated);
    setNewEmail('');
  };

  const removeRecipient = (email) => {
    const recipients = (alertsConfig?.recipients || []).filter(e => e !== email);
    saveAlertsConfig({ ...alertsConfig, recipients });
  };

  const toggleAlertType = (key) => {
    const alerts = { ...(alertsConfig?.alerts || {}) };
    alerts[key] = { ...alerts[key], enabled: !alerts[key]?.enabled };
    saveAlertsConfig({ ...alertsConfig, alerts });
  };

  const updateAlertThreshold = (key, value) => {
    const alerts = { ...(alertsConfig?.alerts || {}) };
    alerts[key] = { ...alerts[key], threshold: parseInt(value) || 0 };
    saveAlertsConfig({ ...alertsConfig, alerts });
  };

  const testAlerts = async () => {
    setAlertsTesting(true);
    try {
      const res = await api.post('/health/alerts-test', {});
      toast({ title: 'Email de test envoyé', description: res.data.message });
    } catch (e) {
      toast({ title: 'Erreur', description: e.response?.data?.detail || 'Échec envoi', variant: 'destructive' });
    } finally {
      setAlertsTesting(false);
    }
  };

  const hs = data?.health_state;
  const history = data?.recovery_history || [];
  const sortedHistory = [...history].reverse();
  const maintenanceActive = data?.maintenance_active || false;
  const failures = hs?.consecutive_failures || 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64" data-testid="system-health-loading">
        <RefreshCw className="animate-spin text-gray-400" size={32} />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6" data-testid="system-health-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2.5">
            <Activity className="text-blue-600" size={24} />
            Santé du Système
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Surveillance, maintenance et récupération automatique
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline" size="sm"
            onClick={() => { fetchStatus(); runHealthCheck(); }}
            disabled={checking}
            data-testid="health-refresh-btn"
          >
            <RefreshCw size={14} className={checking ? 'animate-spin' : ''} />
            {checking ? 'Vérification...' : 'Actualiser'}
          </Button>
          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
            <input
              type="checkbox" checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
              className="rounded border-gray-300"
            />
            Auto 30s
          </label>
        </div>
      </div>

      {/* Maintenance Alert */}
      {maintenanceActive && (
        <Alert variant="destructive" data-testid="maintenance-active-alert">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span><strong>Page de maintenance active</strong> — Les utilisateurs voient la page de maintenance</span>
            <Button size="sm" variant="outline" onClick={() => toggleMaintenance(false)} disabled={maintenanceToggling}>
              Désactiver
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Failures Alert */}
      {failures > 0 && (
        <Alert className="border-amber-200 bg-amber-50" data-testid="failures-alert">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="flex items-center justify-between">
            <span className="text-amber-800">
              <strong>{failures} échec(s) consécutif(s)</strong> — Dernier niveau de récupération : {LEVEL_CONFIG[hs?.last_recovery_level]?.name || 'N/A'}
            </span>
            <Button size="sm" variant="outline" onClick={resetFailures} data-testid="reset-failures-btn">
              <RotateCcw size={12} className="mr-1" /> Reset
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Health Check Cards */}
      {healthChecks && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3" data-testid="health-checks-grid">
          <HealthCard icon={Zap} label="Backend API" status={healthChecks.checks?.backend?.status} message={healthChecks.checks?.backend?.message} />
          <HealthCard icon={Database} label="MongoDB" status={healthChecks.checks?.mongodb?.status} message={healthChecks.checks?.mongodb?.message} />
          <HealthCard icon={HardDrive} label="Disque" status={healthChecks.checks?.disk?.status} message={healthChecks.checks?.disk?.message} />
          <HealthCard icon={Cpu} label="Mémoire" status={healthChecks.checks?.memory?.status} message={healthChecks.checks?.memory?.message} />
          <HealthCard icon={Bell} label="Notifications" status={notifHealth?.overall || 'unknown'} message={notifHealth ? `${notifHealth.web_push_subscriptions?.active || 0} abo. actifs` : 'Chargement...'} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Status + Actions */}
        <div className="space-y-4">
          {/* Health State */}
          <Card data-testid="health-state-card">
            <CardHeader className="py-3 px-4 border-b">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity size={16} className="text-blue-600" />
                État du Health Check
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {hs ? (
                <>
                  <InfoRow label="Dernière vérification" value={<TimeAgo dateStr={hs.last_check} />} />
                  <InfoRow label="Dernier succès" value={<TimeAgo dateStr={hs.last_success} />} />
                  <InfoRow label="Dernier échec" value={<TimeAgo dateStr={hs.last_failure} />} />
                  <InfoRow label="Échecs consécutifs" value={
                    <span className={failures > 0 ? 'text-red-600 font-semibold' : 'text-green-600'}>
                      {failures}
                    </span>
                  } />
                  <InfoRow label="Total récupérations" value={hs.total_recoveries || 0} />
                  <InfoRow label="Dernier niveau" value={
                    hs.last_recovery_level > 0 ? (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                            style={{
                              backgroundColor: LEVEL_CONFIG[hs.last_recovery_level]?.bg,
                              color: LEVEL_CONFIG[hs.last_recovery_level]?.color
                            }}>
                        {LEVEL_CONFIG[hs.last_recovery_level]?.name}
                      </span>
                    ) : <span className="text-gray-400">Aucun</span>
                  } />
                </>
              ) : (
                <p className="text-xs text-gray-400 text-center py-4">
                  Health check non configuré.<br />
                  Lancez <code className="bg-gray-100 px-1 rounded">setup_health_check.sh</code> sur le serveur.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Actions */}
          <Card data-testid="health-actions-card">
            <CardHeader className="py-3 px-4 border-b">
              <CardTitle className="text-sm flex items-center gap-2">
                <Shield size={16} className="text-violet-600" />
                Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-2">
              <Button
                className="w-full justify-start gap-2" variant="outline" size="sm"
                onClick={runHealthCheck} disabled={checking}
                data-testid="force-health-check-btn"
              >
                <RefreshCw size={14} className={checking ? 'animate-spin' : ''} />
                Forcer un health check
              </Button>
              {!maintenanceActive ? (
                <Button
                  className="w-full justify-start gap-2 text-red-600 border-red-200 hover:bg-red-50"
                  variant="outline" size="sm"
                  onClick={() => toggleMaintenance(true)} disabled={maintenanceToggling}
                  data-testid="activate-maintenance-btn"
                >
                  <ShieldOff size={14} />
                  Activer la maintenance
                </Button>
              ) : (
                <Button
                  className="w-full justify-start gap-2 text-green-700 border-green-200 hover:bg-green-50"
                  variant="outline" size="sm"
                  onClick={() => toggleMaintenance(false)} disabled={maintenanceToggling}
                  data-testid="deactivate-maintenance-btn"
                >
                  <Shield size={14} />
                  Désactiver la maintenance
                </Button>
              )}
              {failures > 0 && (
                <Button
                  className="w-full justify-start gap-2" variant="outline" size="sm"
                  onClick={resetFailures}
                  data-testid="reset-failures-action-btn"
                >
                  <RotateCcw size={14} />
                  Reset compteur d'échecs
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Recovery Levels Guide */}
          <Card data-testid="recovery-levels-card">
            <CardHeader className="py-3 px-4 border-b">
              <CardTitle className="text-sm flex items-center gap-2">
                <Zap size={16} className="text-amber-500" />
                Niveaux de récupération
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-2">
              {[1, 2, 3, 4].map(lvl => {
                const cfg = LEVEL_CONFIG[lvl];
                return (
                  <div key={lvl} className="flex items-center gap-3 py-1.5">
                    <span className="w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center text-white" style={{ backgroundColor: cfg.color }}>
                      {lvl}
                    </span>
                    <div>
                      <span className="text-xs font-semibold" style={{ color: cfg.color }}>{cfg.name}</span>
                      <span className="text-xs text-gray-500 ml-2">{cfg.label}</span>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        {/* Right: Recovery History */}
        <div className="lg:col-span-2">
          <Card data-testid="recovery-history-card">
            <CardHeader className="py-3 px-4 border-b cursor-pointer select-none" onClick={() => setHistoryExpanded(e => !e)}>
              <CardTitle className="text-sm flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Clock size={16} className="text-gray-500" />
                  Historique des récupérations
                  <span className="text-xs bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">{history.length}</span>
                </span>
                {historyExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </CardTitle>
            </CardHeader>
            {historyExpanded && (
              <CardContent className="p-0">
                {sortedHistory.length === 0 ? (
                  <div className="p-8 text-center">
                    <CheckCircle2 className="mx-auto text-green-400 mb-2" size={32} />
                    <p className="text-sm text-gray-500">Aucune récupération enregistrée</p>
                    <p className="text-xs text-gray-400 mt-1">Le système n'a jamais eu besoin de s'auto-réparer</p>
                  </div>
                ) : (
                  <div className="divide-y max-h-[500px] overflow-y-auto">
                    {sortedHistory.map((event, idx) => {
                      const cfg = LEVEL_CONFIG[event.level] || LEVEL_CONFIG[1];
                      return (
                        <div key={idx} className="px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors"
                             data-testid={`recovery-event-${idx}`}>
                          <div className="flex-shrink-0">
                            {event.success ? (
                              <CheckCircle2 size={18} className="text-green-500" />
                            ) : (
                              <XCircle size={18} className="text-red-500" />
                            )}
                          </div>
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                                style={{ backgroundColor: cfg.bg, color: cfg.color }}>
                            {cfg.name}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-700 truncate">{event.details}</p>
                          </div>
                          <span className="text-xs text-gray-400 flex-shrink-0 whitespace-nowrap">
                            {formatDate(event.timestamp)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        </div>
      </div>

      {/* ──── Santé des Notifications Section ──── */}
      <NotificationHealthSection
        notifHealth={notifHealth}
        notifHistory={notifHistory}
        notifExpanded={notifExpanded}
        setNotifExpanded={setNotifExpanded}
        notifChecking={notifChecking}
        forceNotifCheck={forceNotifCheck}
      />

      {/* ──── Stockage Hors Ligne Section ──── */}
      <OfflineStorageSection />

      {/* ──── Alertes Email Section ──── */}
      <Card data-testid="health-alerts-card">
        <CardHeader className="py-3 px-4 border-b cursor-pointer select-none" onClick={() => setAlertsExpanded(e => !e)}>
          <CardTitle className="text-sm flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Mail size={16} className="text-blue-600" />
              Alertes Email
              {alertsConfig?.enabled ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-50 text-green-700 font-medium">ACTIF</span>
              ) : (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">INACTIF</span>
              )}
            </span>
            {alertsExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </CardTitle>
        </CardHeader>
        {alertsExpanded && (
          <CardContent className="p-4 space-y-5">
            {/* On/Off toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Activer les alertes email</p>
                <p className="text-xs text-gray-500">Recevez des notifications en cas de problème (1 par jour max par type)</p>
              </div>
              <button
                onClick={toggleAlertsEnabled}
                disabled={alertsSaving}
                className={`relative w-11 h-6 rounded-full transition-colors ${alertsConfig?.enabled ? 'bg-blue-600' : 'bg-gray-300'}`}
                data-testid="alerts-toggle"
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${alertsConfig?.enabled ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
            </div>

            {/* Recipients */}
            <div>
              <p className="text-sm font-medium mb-2">Destinataires</p>
              <div className="space-y-1.5 mb-2">
                {(alertsConfig?.recipients || []).map((email) => (
                  <div key={email} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-1.5" data-testid={`alert-recipient-${email}`}>
                    <Mail size={13} className="text-gray-400 flex-shrink-0" />
                    <span className="text-sm text-gray-700 flex-1 truncate">{email}</span>
                    <button onClick={() => removeRecipient(email)} className="p-0.5 hover:bg-red-50 rounded" data-testid={`alert-remove-${email}`}>
                      <X size={13} className="text-red-400" />
                    </button>
                  </div>
                ))}
                {(alertsConfig?.recipients || []).length === 0 && (
                  <p className="text-xs text-gray-400 py-2">Aucun destinataire configuré</p>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
                  placeholder="Ajouter un email..." className="text-sm"
                  onKeyDown={e => e.key === 'Enter' && addRecipient()}
                  data-testid="alert-add-email-input"
                />
                <Button size="sm" variant="outline" onClick={addRecipient} disabled={!newEmail.trim()} data-testid="alert-add-email-btn">
                  <Plus size={14} />
                </Button>
              </div>
            </div>

            {/* Alert types */}
            <div>
              <p className="text-sm font-medium mb-2">Types d'alertes</p>
              <div className="space-y-1">
                {ALERT_TYPES_CONFIG.map(({ key, label, desc, icon: Icon, color, hasThreshold, thresholdLabel, thresholdUnit, min, max }) => {
                  const alertConf = alertsConfig?.alerts?.[key] || {};
                  const enabled = alertConf.enabled !== false;
                  return (
                    <div key={key} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors" data-testid={`alert-type-${key}`}>
                      <button
                        onClick={() => toggleAlertType(key)}
                        className={`flex-shrink-0 w-4 h-4 rounded border-2 transition-colors ${enabled ? 'border-blue-600 bg-blue-600' : 'border-gray-300'}`}
                        data-testid={`alert-toggle-${key}`}
                      >
                        {enabled && (
                          <svg viewBox="0 0 12 12" className="w-full h-full">
                            <path d="M2.5 6L5 8.5L9.5 3.5" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </button>
                      <Icon size={15} style={{ color }} className="flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className={`text-sm ${enabled ? 'text-gray-800' : 'text-gray-400'}`}>{label}</span>
                        <span className="text-[11px] text-gray-400 ml-2">{desc}</span>
                      </div>
                      {hasThreshold && enabled && (
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <span className="text-[11px] text-gray-400">{thresholdLabel}:</span>
                          <input
                            type="number" min={min} max={max}
                            value={alertConf.threshold || (key === 'app_down' ? 1 : key === 'disk_warning' ? 80 : 85)}
                            onChange={e => updateAlertThreshold(key, e.target.value)}
                            className="w-14 text-center text-xs border rounded px-1 py-0.5"
                            data-testid={`alert-threshold-${key}`}
                          />
                          <span className="text-[11px] text-gray-400">{thresholdUnit}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Test button */}
            <div className="flex items-center gap-2 pt-2 border-t">
              <Button
                size="sm" variant="outline" className="gap-1.5"
                onClick={testAlerts}
                disabled={alertsTesting || !(alertsConfig?.recipients?.length > 0)}
                data-testid="alerts-test-btn"
              >
                <Send size={13} />
                {alertsTesting ? 'Envoi en cours...' : 'Envoyer un email de test'}
              </Button>
              {alertsConfig?.last_test_sent && (
                <span className="text-[11px] text-gray-400">
                  Dernier test : <TimeAgo dateStr={alertsConfig.last_test_sent} />
                </span>
              )}
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

function NotificationHealthSection({ notifHealth, notifHistory, notifExpanded, setNotifExpanded, notifChecking, forceNotifCheck }) {
  const statusColor = (s) => s === 'ok' ? 'text-green-600' : s === 'warning' ? 'text-amber-600' : s === 'error' ? 'text-red-600' : 'text-gray-400';
  const statusBg = (s) => s === 'ok' ? 'bg-green-50' : s === 'warning' ? 'bg-amber-50' : s === 'error' ? 'bg-red-50' : 'bg-gray-50';
  const statusIcon = (s) => s === 'ok' ? <CheckCircle2 size={14} className="text-green-500" /> : s === 'warning' ? <AlertTriangle size={14} className="text-amber-500" /> : s === 'error' ? <XCircle size={14} className="text-red-500" /> : <Clock size={14} className="text-gray-400" />;
  const statusLabel = (s) => s === 'ok' ? 'SAIN' : s === 'warning' ? 'ATTENTION' : s === 'error' ? 'ERREUR' : 'INCONNU';

  const nh = notifHealth;

  return (
    <Card data-testid="notification-health-card">
      <CardHeader className="py-3 px-4 border-b cursor-pointer select-none" onClick={() => setNotifExpanded(e => !e)}>
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Bell size={16} className="text-indigo-600" />
            Sante des Notifications
            {nh && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                nh.overall === 'ok' ? 'bg-green-50 text-green-700' :
                nh.overall === 'warning' ? 'bg-amber-50 text-amber-700' :
                'bg-red-50 text-red-700'
              }`}>
                {statusLabel(nh.overall)}
              </span>
            )}
            <span className="text-[10px] text-gray-400 font-normal">Verification auto toutes les 30 min</span>
          </span>
          {notifExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </CardTitle>
      </CardHeader>
      {notifExpanded && (
        <CardContent className="p-4 space-y-5">
          {!nh ? (
            <div className="flex items-center justify-center py-6 text-gray-400">
              <RefreshCw size={16} className="animate-spin mr-2" /> Chargement...
            </div>
          ) : (
            <>
              {/* Status Grid */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <StatusBlock
                  icon={<Shield size={16} />}
                  label="Cles VAPID"
                  status={nh.vapid_keys?.status}
                  message={nh.vapid_keys?.message}
                />
                <StatusBlock
                  icon={<Bell size={16} />}
                  label="Abonnements Web"
                  status={nh.web_push_subscriptions?.status}
                  value={nh.web_push_subscriptions?.active || 0}
                  message={nh.web_push_subscriptions?.message}
                />
                <StatusBlock
                  icon={<Smartphone size={16} />}
                  label="Tokens Mobile"
                  status={nh.expo_tokens?.status}
                  value={nh.expo_tokens?.active || 0}
                  message={nh.expo_tokens?.message}
                />
                <StatusBlock
                  icon={<Send size={16} />}
                  label="Envois (24h)"
                  status={nh.last_notifications?.status}
                  value={nh.last_notifications?.recent_sent || 0}
                  message={nh.last_notifications?.message}
                />
                <StatusBlock
                  icon={<Clock size={16} />}
                  label="Cron Recus"
                  status={nh.cron_push_receipts?.status}
                  message={nh.cron_push_receipts?.message}
                />
              </div>

              {/* Error details if any */}
              {nh.overall === 'error' && (
                <Alert className="border-red-200 bg-red-50" data-testid="notif-health-error-alert">
                  <XCircle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-800 text-sm">
                    <strong>Le systeme de notification est en erreur.</strong> Les administrateurs sont alertes automatiquement toutes les 30 minutes tant que le probleme persiste.
                  </AlertDescription>
                </Alert>
              )}

              {nh.overall === 'warning' && (
                <Alert className="border-amber-200 bg-amber-50" data-testid="notif-health-warning-alert">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-amber-800 text-sm">
                    <strong>Attention :</strong> Certains elements du systeme de notification necessitent une verification.
                  </AlertDescription>
                </Alert>
              )}

              {/* History timeline */}
              {notifHistory.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Clock size={14} className="text-gray-500" />
                    Historique des verifications
                    <span className="text-xs bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">{notifHistory.length}</span>
                  </p>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {notifHistory.map((check, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs py-1 px-2 rounded hover:bg-gray-50" data-testid={`notif-history-${idx}`}>
                        {statusIcon(check.overall)}
                        <span className={`font-medium ${statusColor(check.overall)}`}>{statusLabel(check.overall)}</span>
                        <span className="text-gray-400 flex-1">
                          {check.details?.web_push_subscriptions?.active || 0} abo. actifs,{' '}
                          {check.details?.last_notifications?.recent_sent || 0} envoyees
                        </span>
                        <span className="text-gray-400 whitespace-nowrap">
                          {check.timestamp ? <TimeAgo dateStr={check.timestamp} /> : '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action button */}
              <div className="flex items-center gap-2 pt-2 border-t">
                <Button
                  size="sm" variant="outline" className="gap-1.5"
                  onClick={forceNotifCheck}
                  disabled={notifChecking}
                  data-testid="force-notif-check-btn"
                >
                  <RefreshCw size={13} className={notifChecking ? 'animate-spin' : ''} />
                  {notifChecking ? 'Verification...' : 'Verifier maintenant'}
                </Button>
                {nh.timestamp && (
                  <span className="text-[11px] text-gray-400">
                    Derniere verification : <TimeAgo dateStr={nh.timestamp} />
                  </span>
                )}
              </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function StatusBlock({ icon, label, status, value, message }) {
  const bgColors = {
    ok: 'bg-green-50 border-green-100',
    warning: 'bg-amber-50 border-amber-100',
    error: 'bg-red-50 border-red-100',
    unknown: 'bg-gray-50 border-gray-100'
  };
  const textColors = {
    ok: 'text-green-700',
    warning: 'text-amber-700',
    error: 'text-red-700',
    unknown: 'text-gray-500'
  };
  const iconColors = {
    ok: 'text-green-500',
    warning: 'text-amber-500',
    error: 'text-red-500',
    unknown: 'text-gray-400'
  };
  return (
    <div className={`rounded-lg border p-3 ${bgColors[status] || bgColors.unknown}`} data-testid={`notif-status-${label.toLowerCase().replace(/\s/g, '-')}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className={iconColors[status] || iconColors.unknown}>{icon}</span>
        <span className="text-xs font-medium text-gray-700">{label}</span>
      </div>
      {value !== undefined && (
        <div className={`text-xl font-bold ${textColors[status] || textColors.unknown}`}>{value}</div>
      )}
      <div className="text-[11px] text-gray-500 mt-0.5 truncate" title={message}>{message}</div>
    </div>
  );
}

function OfflineStorageSection() {
  const { toast } = useToast();
  const {
    isOnline,
    lastSyncAt,
    pendingSyncCount,
    failedSyncCount,
    syncInProgress,
    storageInfo,
    forceSyncNow
  } = useOnlineStatus();
  const [expanded, setExpanded] = useState(true);
  const [clearing, setClearing] = useState(false);

  const handleForceSync = async () => {
    const result = await forceSyncNow();
    if (result?.error) {
      toast({ title: 'Erreur', description: result.error, variant: 'destructive' });
    } else if (result?.synced > 0) {
      toast({ title: 'Synchronisation terminee', description: `${result.synced} element(s) synchronise(s)` });
    } else {
      toast({ title: 'Rien a synchroniser' });
    }
  };

  const handleClearCache = async () => {
    if (!window.confirm('Supprimer toutes les donnees en cache hors ligne ?\n\nLes modifications non synchronisees seront perdues.')) return;
    setClearing(true);
    try {
      const { getOfflineDb } = await import('../services/offlineDb');
      const db = await getOfflineDb();
      await db.clear('apiCache');
      await db.clear('fileStore');
      // Ne pas vider syncQueue si des items sont pending
      if (pendingSyncCount === 0 && failedSyncCount === 0) {
        await db.clear('syncQueue');
      }
      window.dispatchEvent(new Event('sync-queue-updated'));
      toast({ title: 'Cache vide', description: 'Les donnees en cache ont ete supprimees' });
    } catch (e) {
      toast({ title: 'Erreur', description: 'Impossible de vider le cache', variant: 'destructive' });
    } finally {
      setClearing(false);
    }
  };

  const handleRetryFailed = async () => {
    try {
      const { getFailedSyncItems, retrySyncItem } = await import('../services/offlineDb');
      const failed = await getFailedSyncItems();
      for (const item of failed) {
        await retrySyncItem(item.id);
      }
      toast({ title: `${failed.length} element(s) remis en attente` });
    } catch (e) {
      toast({ title: 'Erreur', variant: 'destructive' });
    }
  };

  const formatTime = (isoStr) => {
    if (!isoStr) return 'Jamais';
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) + ' ' +
             d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    } catch { return isoStr; }
  };

  const totalPending = pendingSyncCount + failedSyncCount;

  return (
    <Card data-testid="offline-storage-card">
      <CardHeader className="py-3 px-4 border-b cursor-pointer select-none" onClick={() => setExpanded(e => !e)}>
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-2">
            {isOnline ? <Wifi size={16} className="text-emerald-600" /> : <WifiOff size={16} className="text-red-500" />}
            Stockage Hors Ligne
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
              isOnline ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
            }`}>
              {isOnline ? 'EN LIGNE' : 'HORS LIGNE'}
            </span>
          </span>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </CardTitle>
      </CardHeader>
      {expanded && (
        <CardContent className="p-4 space-y-5">
          {/* Status Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-gray-50 rounded-lg p-3 text-center" data-testid="offline-pending-count">
              <div className="text-2xl font-bold text-amber-600">{pendingSyncCount}</div>
              <div className="text-xs text-gray-500 mt-0.5">En attente</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center" data-testid="offline-failed-count">
              <div className={`text-2xl font-bold ${failedSyncCount > 0 ? 'text-red-600' : 'text-gray-400'}`}>{failedSyncCount}</div>
              <div className="text-xs text-gray-500 mt-0.5">En echec</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center" data-testid="offline-files-count">
              <div className="text-2xl font-bold text-blue-600">{storageInfo?.fileCount || 0}</div>
              <div className="text-xs text-gray-500 mt-0.5">Fichiers stockes</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center" data-testid="offline-storage-size">
              <div className="text-2xl font-bold text-violet-600">{storageInfo?.formattedSize || '0 o'}</div>
              <div className="text-xs text-gray-500 mt-0.5">Espace utilise</div>
            </div>
          </div>

          {/* Info */}
          <div className="space-y-2">
            <InfoRow label="Derniere synchronisation" value={formatTime(lastSyncAt)} />
            <InfoRow label="Statut connexion" value={
              <span className={`flex items-center gap-1.5 ${isOnline ? 'text-emerald-600' : 'text-red-600'}`}>
                {isOnline ? <Wifi size={12} /> : <WifiOff size={12} />}
                {isOnline ? 'Connecte' : 'Deconnecte'}
              </span>
            } />
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-2 border-t">
            <Button
              size="sm" variant="outline" className="gap-1.5"
              onClick={handleForceSync}
              disabled={syncInProgress || !isOnline || totalPending === 0}
              data-testid="force-sync-btn"
            >
              <FolderSync size={13} className={syncInProgress ? 'animate-spin' : ''} />
              {syncInProgress ? 'Synchronisation...' : 'Forcer la synchronisation'}
            </Button>
            {failedSyncCount > 0 && (
              <Button
                size="sm" variant="outline" className="gap-1.5 text-amber-700 border-amber-300 hover:bg-amber-50"
                onClick={handleRetryFailed}
                data-testid="retry-failed-sync-btn"
              >
                <RotateCcw size={13} />
                Reessayer les echecs ({failedSyncCount})
              </Button>
            )}
            <Button
              size="sm" variant="outline" className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50"
              onClick={handleClearCache}
              disabled={clearing}
              data-testid="clear-offline-cache-btn"
            >
              <Trash2 size={13} />
              {clearing ? 'Nettoyage...' : 'Vider le cache'}
            </Button>
          </div>

          {/* Explanatory note */}
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
            <p className="text-xs text-blue-700 leading-relaxed">
              <strong>Mode hors ligne :</strong> L'application stocke automatiquement les pages visitees et les donnees consultees.
              Les modifications (creation, edition, suppression) et les fichiers (photos, pieces jointes) sont enregistres
              localement puis synchronises automatiquement au retour de la connexion internet.
            </p>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-800">{value}</span>
    </div>
  );
}

function formatDate(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }) + ' ' +
           d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  } catch { return isoStr; }
}
