import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Download, CheckCircle, XCircle, Save, Clock, Trash2, Play, Plus, HardDrive, Cloud, RefreshCw, Settings, Link2Off, Database, Upload } from 'lucide-react';
import { useToast } from '../hooks/use-toast';
import axios from 'axios';
import { getBackendURL } from '../utils/config';
import { formatErrorMessage } from '../utils/errorFormatter';

const freqLabels = { daily: 'Quotidienne', weekly: 'Hebdomadaire', monthly: 'Mensuelle' };
const destLabels = { local: 'Local', gdrive: 'Google Drive', local_gdrive: 'Local + Google Drive' };
const dowLabels = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

const DEFAULT_SCHEDULE = {
  frequency: 'daily', day_of_week: 0, day_of_month: 1,
  hour: 2, minute: 0, destination: 'local',
  retention_count: 3, email_recipient: '', enabled: true
};

const BackupTab = () => {
  const { toast } = useToast();
  const [schedules, setSchedules] = useState([]);
  const [backupHistory, setBackupHistory] = useState([]);
  const [driveStatus, setDriveStatus] = useState({ connected: false });
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [runningBackup, setRunningBackup] = useState(false);
  const [uploadingToDrive, setUploadingToDrive] = useState(null);
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({ ...DEFAULT_SCHEDULE });

  const backend_url = getBackendURL();
  const token = localStorage.getItem('token');
  const authHeaders = { Authorization: `Bearer ${token}` };

  const loadBackupData = useCallback(async () => {
    if (!token) return;
    setLoadingSchedules(true);
    try {
      const [schedRes, histRes, driveRes] = await Promise.all([
        axios.get(`${backend_url}/api/backup/schedules`, { headers: authHeaders }),
        axios.get(`${backend_url}/api/backup/history?limit=10`, { headers: authHeaders }),
        axios.get(`${backend_url}/api/backup/drive/status`, { headers: authHeaders })
      ]);
      setSchedules(schedRes.data);
      setBackupHistory(histRes.data);
      setDriveStatus(driveRes.data);
    } catch {
      // Silently fail
    } finally {
      setLoadingSchedules(false);
    }
  }, [backend_url, token]);

  useEffect(() => {
    loadBackupData();
  }, [loadBackupData]);

  const handleSaveSchedule = async () => {
    try {
      const payload = { ...scheduleForm, email_recipient: scheduleForm.email_recipient || null };
      if (editingSchedule) {
        await axios.put(`${backend_url}/api/backup/schedules/${editingSchedule.id}`, payload, { headers: authHeaders });
        toast({ title: 'Planification mise à jour' });
      } else {
        await axios.post(`${backend_url}/api/backup/schedules`, payload, { headers: authHeaders });
        toast({ title: 'Planification créée' });
      }
      setShowScheduleForm(false);
      setEditingSchedule(null);
      setScheduleForm({ ...DEFAULT_SCHEDULE });
      loadBackupData();
    } catch (error) {
      toast({ title: 'Erreur', description: formatErrorMessage(error, 'Impossible de sauvegarder'), variant: 'destructive' });
    }
  };

  const handleDeleteSchedule = async (id) => {
    if (!window.confirm('Supprimer cette planification ?')) return;
    try {
      await axios.delete(`${backend_url}/api/backup/schedules/${id}`, { headers: authHeaders });
      toast({ title: 'Planification supprimée' });
      loadBackupData();
    } catch (error) {
      toast({ title: 'Erreur', description: formatErrorMessage(error, 'Impossible de supprimer'), variant: 'destructive' });
    }
  };

  const handleToggleSchedule = async (schedule) => {
    try {
      await axios.put(`${backend_url}/api/backup/schedules/${schedule.id}`, { enabled: !schedule.enabled }, { headers: authHeaders });
      loadBackupData();
    } catch (error) {
      toast({ title: 'Erreur', description: formatErrorMessage(error), variant: 'destructive' });
    }
  };

  const handleRunBackupNow = async () => {
    try {
      setRunningBackup(true);
      await axios.post(`${backend_url}/api/backup/run`, {}, { headers: authHeaders });
      toast({ title: 'Sauvegarde terminée' });
      loadBackupData();
    } catch (error) {
      toast({ title: 'Erreur', description: formatErrorMessage(error, 'Erreur de sauvegarde'), variant: 'destructive' });
    } finally {
      setRunningBackup(false);
    }
  };

  const handleConnectDrive = async () => {
    try {
      const res = await axios.get(`${backend_url}/api/backup/drive/connect`, { headers: authHeaders });
      window.location.href = res.data.authorization_url;
    } catch (error) {
      toast({ title: 'Erreur', description: formatErrorMessage(error, 'Impossible de connecter Google Drive'), variant: 'destructive' });
    }
  };

  const handleDisconnectDrive = async () => {
    if (!window.confirm('Déconnecter Google Drive ?')) return;
    try {
      await axios.delete(`${backend_url}/api/backup/drive/disconnect`, { headers: authHeaders });
      setDriveStatus({ connected: false });
      toast({ title: 'Google Drive déconnecté' });
    } catch (error) {
      toast({ title: 'Erreur', description: formatErrorMessage(error), variant: 'destructive' });
    }
  };

  const handleDownloadBackup = (historyId) => {
    // Téléchargement natif via le navigateur (pas d'axios blob)
    // Plus fiable pour les gros fichiers et évite les problèmes CORS
    const url = `${backend_url}/api/backup/download/${historyId}?token=${encodeURIComponent(token)}`;
    window.open(url, '_blank');
  };

  const handleUploadToDrive = async (historyId) => {
    try {
      setUploadingToDrive(historyId);
      await axios.post(`${backend_url}/api/backup/drive/upload/${historyId}`, {}, { headers: authHeaders });
      toast({ title: 'Upload réussi', description: 'Backup uploadé dans le dossier "Backup FSAO" sur Google Drive' });
      loadBackupData();
    } catch (error) {
      toast({ title: 'Erreur', description: formatErrorMessage(error, 'Impossible d\'uploader vers Google Drive'), variant: 'destructive' });
    } finally {
      setUploadingToDrive(null);
    }
  };

  const startEditSchedule = (schedule) => {
    setEditingSchedule(schedule);
    setScheduleForm({
      frequency: schedule.frequency || 'daily',
      day_of_week: schedule.day_of_week ?? 0,
      day_of_month: schedule.day_of_month ?? 1,
      hour: schedule.hour ?? 2,
      minute: schedule.minute ?? 0,
      destination: schedule.destination || 'local',
      retention_count: schedule.retention_count ?? 3,
      email_recipient: schedule.email_recipient || '',
      enabled: schedule.enabled ?? true
    });
    setShowScheduleForm(true);
  };

  return (
    <>
      {/* Actions rapides */}
      <div className="flex flex-wrap gap-3">
        <Button onClick={handleRunBackupNow} disabled={runningBackup} className="bg-emerald-600 hover:bg-emerald-700" data-testid="run-backup-now-btn">
          {runningBackup ? <RefreshCw size={16} className="mr-2 animate-spin" /> : <Play size={16} className="mr-2" />}
          {runningBackup ? 'Sauvegarde en cours...' : 'Sauvegarder maintenant'}
        </Button>
        <Button onClick={() => { setScheduleForm({ ...DEFAULT_SCHEDULE }); setEditingSchedule(null); setShowScheduleForm(true); }} variant="outline" data-testid="add-schedule-btn">
          <Plus size={16} className="mr-2" />Nouvelle planification
        </Button>
        <Button onClick={loadBackupData} variant="ghost" size="icon" data-testid="refresh-backup-btn">
          <RefreshCw size={16} />
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Google Drive Connection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Cloud size={20} className="text-blue-500" />Google Drive
            </CardTitle>
          </CardHeader>
          <CardContent>
            {driveStatus.connected ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-emerald-600"><CheckCircle size={18} /><span className="text-sm font-medium">Connecté</span></div>
                <Button onClick={handleDisconnectDrive} variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50" data-testid="disconnect-drive-btn">
                  <Link2Off size={14} className="mr-2" />Déconnecter
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-500">Connectez votre compte Google Drive pour sauvegarder vos données dans le cloud.</p>
                <Button onClick={handleConnectDrive} variant="outline" data-testid="connect-drive-btn">
                  <Cloud size={16} className="mr-2" />Connecter Google Drive
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Planifications existantes */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock size={20} className="text-indigo-500" />Planifications ({schedules.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingSchedules ? (
              <p className="text-sm text-gray-400">Chargement...</p>
            ) : schedules.length === 0 ? (
              <p className="text-sm text-gray-400">Aucune planification configurée</p>
            ) : (
              <div className="space-y-3">
                {schedules.map(s => (
                  <div key={s.id} className={`flex items-center justify-between p-3 rounded-lg border ${s.enabled ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-100 opacity-60'}`} data-testid={`schedule-${s.id}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${s.enabled ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                        <span className="text-sm font-medium truncate">{freqLabels[s.frequency] || s.frequency}</span>
                        <span className="text-xs text-gray-400">{String(s.hour).padStart(2,'0')}:{String(s.minute).padStart(2,'0')}</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                        {s.destination === 'local' && <><HardDrive size={12} /> Local</>}
                        {s.destination === 'gdrive' && <><Cloud size={12} /> Google Drive</>}
                        {s.destination === 'local_gdrive' && <><HardDrive size={12} /><Cloud size={12} /> Local + Drive</>}
                        <span className="text-gray-300">|</span>
                        <span>Garder {s.retention_count} backup(s)</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" onClick={() => handleToggleSchedule(s)} className="h-8 w-8" data-testid={`toggle-schedule-${s.id}`}>
                        {s.enabled ? <CheckCircle size={14} className="text-emerald-500" /> : <XCircle size={14} className="text-gray-400" />}
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => startEditSchedule(s)} className="h-8 w-8" data-testid={`edit-schedule-${s.id}`}>
                        <Settings size={14} />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => handleDeleteSchedule(s.id)} className="h-8 w-8 text-red-500 hover:text-red-700" data-testid={`delete-schedule-${s.id}`}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Formulaire de planification */}
      {showScheduleForm && (
        <Card className="border-indigo-200">
          <CardHeader>
            <CardTitle className="text-base">{editingSchedule ? 'Modifier la planification' : 'Nouvelle planification'}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Fréquence</Label>
                <Select value={scheduleForm.frequency} onValueChange={v => setScheduleForm(f => ({ ...f, frequency: v }))}>
                  <SelectTrigger data-testid="schedule-frequency-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Quotidienne</SelectItem>
                    <SelectItem value="weekly">Hebdomadaire</SelectItem>
                    <SelectItem value="monthly">Mensuelle</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {scheduleForm.frequency === 'weekly' && (
                <div className="space-y-2">
                  <Label>Jour de la semaine</Label>
                  <Select value={String(scheduleForm.day_of_week)} onValueChange={v => setScheduleForm(f => ({ ...f, day_of_week: parseInt(v) }))}>
                    <SelectTrigger data-testid="schedule-dow-select"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {dowLabels.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {scheduleForm.frequency === 'monthly' && (
                <div className="space-y-2">
                  <Label>Jour du mois</Label>
                  <Select value={String(scheduleForm.day_of_month)} onValueChange={v => setScheduleForm(f => ({ ...f, day_of_month: parseInt(v) }))}>
                    <SelectTrigger data-testid="schedule-dom-select"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 28 }, (_, i) => <SelectItem key={i + 1} value={String(i + 1)}>{i + 1}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label>Heure</Label>
                <div className="flex gap-2">
                  <Select value={String(scheduleForm.hour)} onValueChange={v => setScheduleForm(f => ({ ...f, hour: parseInt(v) }))}>
                    <SelectTrigger data-testid="schedule-hour-select"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 24 }, (_, i) => <SelectItem key={i} value={String(i)}>{String(i).padStart(2, '0')}h</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={String(scheduleForm.minute)} onValueChange={v => setScheduleForm(f => ({ ...f, minute: parseInt(v) }))}>
                    <SelectTrigger data-testid="schedule-minute-select"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[0, 15, 30, 45].map(m => <SelectItem key={m} value={String(m)}>{String(m).padStart(2, '0')}min</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Destination</Label>
                <Select value={scheduleForm.destination} onValueChange={v => setScheduleForm(f => ({ ...f, destination: v }))}>
                  <SelectTrigger data-testid="schedule-destination-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="local"><HardDrive size={14} className="inline mr-2" />Local</SelectItem>
                    <SelectItem value="gdrive"><Cloud size={14} className="inline mr-2" />Google Drive</SelectItem>
                    <SelectItem value="local_gdrive"><HardDrive size={14} className="inline mr-1" /><Cloud size={14} className="inline mr-2" />Local + Google Drive</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Sauvegardes à garder (max 5)</Label>
                <Select value={String(scheduleForm.retention_count)} onValueChange={v => setScheduleForm(f => ({ ...f, retention_count: parseInt(v) }))}>
                  <SelectTrigger data-testid="schedule-retention-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5].map(n => <SelectItem key={n} value={String(n)}>{n} sauvegarde{n > 1 ? 's' : ''}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Email de notification (optionnel)</Label>
                <input
                  type="email"
                  value={scheduleForm.email_recipient}
                  onChange={e => setScheduleForm(f => ({ ...f, email_recipient: e.target.value }))}
                  placeholder="admin@example.com"
                  className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
                  data-testid="schedule-email-input"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button onClick={handleSaveSchedule} className="bg-indigo-600 hover:bg-indigo-700" data-testid="save-schedule-btn">
                <Save size={16} className="mr-2" />{editingSchedule ? 'Mettre à jour' : 'Créer'}
              </Button>
              <Button onClick={() => { setShowScheduleForm(false); setEditingSchedule(null); }} variant="outline" data-testid="cancel-schedule-btn">
                Annuler
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Historique des sauvegardes */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database size={20} className="text-gray-500" />Historique des sauvegardes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {backupHistory.length === 0 ? (
            <p className="text-sm text-gray-400">Aucune sauvegarde effectuée</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="backup-history-table">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="pb-2 font-medium">Date</th>
                    <th className="pb-2 font-medium">Statut</th>
                    <th className="pb-2 font-medium">Destination</th>
                    <th className="pb-2 font-medium">Taille</th>
                    <th className="pb-2 font-medium">Modules</th>
                    <th className="pb-2 font-medium">Fichiers</th>
                    <th className="pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {backupHistory.map(h => (
                    <tr key={h.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2.5">{h.started_at ? new Date(h.started_at).toLocaleString('fr-FR') : '-'}</td>
                      <td className="py-2.5">
                        {h.status === 'success' && <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle size={14} />Réussi</span>}
                        {h.status === 'error' && <span className="inline-flex items-center gap-1 text-red-600" title={h.error_message}><XCircle size={14} />Échec</span>}
                        {h.status === 'running' && <span className="inline-flex items-center gap-1 text-blue-600"><RefreshCw size={14} className="animate-spin" />En cours</span>}
                      </td>
                      <td className="py-2.5 text-gray-500">{destLabels[h.destination] || h.destination}</td>
                      <td className="py-2.5 text-gray-500">{h.file_size ? `${(h.file_size / 1024 / 1024).toFixed(2)} Mo` : '-'}</td>
                      <td className="py-2.5 text-gray-500">{h.module_count || '-'}</td>
                      <td className="py-2.5 text-gray-500">{h.file_count || '-'}</td>
                      <td className="py-2.5">
                        <div className="flex items-center gap-1">
                          {h.status === 'success' && h.file_path && (
                            <Button size="sm" variant="ghost" onClick={() => handleDownloadBackup(h.id)} title="Télécharger" data-testid={`download-backup-${h.id}`}>
                              <Download size={14} />
                            </Button>
                          )}
                          {h.status === 'success' && h.file_path && driveStatus.connected && !h.google_drive_file_id && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleUploadToDrive(h.id)}
                              disabled={uploadingToDrive === h.id}
                              title="Uploader vers Google Drive"
                              className="text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                              data-testid={`upload-drive-${h.id}`}
                            >
                              {uploadingToDrive === h.id ? <RefreshCw size={14} className="animate-spin" /> : <Upload size={14} />}
                            </Button>
                          )}
                          {h.google_drive_file_id && (
                            <span className="text-emerald-500 ml-1" title="Uploadé sur Google Drive" data-testid={`drive-uploaded-${h.id}`}>
                              <Cloud size={14} />
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
};

export default BackupTab;
