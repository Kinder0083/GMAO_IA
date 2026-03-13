import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { BACKEND_URL } from '../utils/config';
import { useToast } from '../hooks/use-toast';
import {
  FileText, Download, Calendar, Filter, BarChart3, TrendingUp,
  Package, AlertTriangle, ShieldAlert, Loader2, RefreshCw,
  ChevronDown, CheckCircle2, XCircle, Clock, Target, Gauge,
  Mail, Plus, Trash2, Play, Settings, Bell
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell
} from 'recharts';
import OfflineDisabled from '../components/Common/OfflineDisabled';

const API = BACKEND_URL;
const getHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

const REPORT_TYPES = [
  { id: 'all', label: 'Rapport complet', icon: FileText, color: 'indigo' },
  { id: 'trs', label: 'TRS', icon: Gauge, color: 'purple' },
  { id: 'production', label: 'Production', icon: Package, color: 'emerald' },
  { id: 'stops', label: 'Arrets', icon: Clock, color: 'orange' },
  { id: 'rejects', label: 'Rebuts', icon: ShieldAlert, color: 'red' },
  { id: 'alerts', label: 'Alertes', icon: AlertTriangle, color: 'amber' },
];

const PERIODS = [
  { id: 'today', label: 'Aujourd\'hui' },
  { id: 'yesterday', label: 'Hier' },
  { id: 'week', label: 'Cette semaine' },
  { id: 'last_week', label: 'Semaine derniere' },
  { id: 'month', label: 'Ce mois' },
  { id: 'last_month', label: 'Mois dernier' },
  { id: 'custom', label: 'Personnalise' },
];

const FREQUENCIES = [
  { id: 'daily', label: 'Quotidien' },
  { id: 'weekly', label: 'Hebdomadaire' },
  { id: 'monthly', label: 'Mensuel' },
];

const DAYS_OF_WEEK = [
  { id: 0, label: 'Lundi' },
  { id: 1, label: 'Mardi' },
  { id: 2, label: 'Mercredi' },
  { id: 3, label: 'Jeudi' },
  { id: 4, label: 'Vendredi' },
  { id: 5, label: 'Samedi' },
  { id: 6, label: 'Dimanche' },
];

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];

const MESReportsPage = () => {
  const [machines, setMachines] = useState([]);
  const [selectedMachines, setSelectedMachines] = useState(['all']);
  const [reportType, setReportType] = useState('all');
  const [period, setPeriod] = useState('week');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showMachineDropdown, setShowMachineDropdown] = useState(false);
  const { toast } = useToast();

  // Scheduled reports state
  const [activeTab, setActiveTab] = useState('manual'); // 'manual' or 'scheduled'
  const [scheduledReports, setScheduledReports] = useState([]);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [scheduleForm, setScheduleForm] = useState({
    name: '',
    machine_ids: ['all'],
    report_type: 'all',
    frequency: 'weekly',
    day_of_week: 0,
    day_of_month: 1,
    hour: 8,
    minute: 0,
    recipients: '',
    format: 'pdf',
  });

  // Load machines
  useEffect(() => {
    const loadMachines = async () => {
      try {
        const { data } = await axios.get(`${API}/api/mes/machines`, { headers: getHeaders() });
        const machinesWithNames = await Promise.all(data.map(async (m) => {
          try {
            const eqRes = await axios.get(`${API}/api/equipments/${m.equipment_id}`, { headers: getHeaders() });
            return { ...m, equipment_name: eqRes.data.nom || 'Inconnu' };
          } catch {
            return { ...m, equipment_name: 'Inconnu' };
          }
        }));
        setMachines(machinesWithNames);
      } catch (err) {
        console.error('Erreur chargement machines:', err);
      }
    };
    loadMachines();
  }, []);

  // Load scheduled reports
  const loadScheduledReports = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/api/mes/scheduled-reports`, { headers: getHeaders() });
      setScheduledReports(data);
    } catch (err) {
      console.error('Erreur chargement rapports planifies:', err);
    }
  }, []);

  useEffect(() => {
    loadScheduledReports();
  }, [loadScheduledReports]);

  // Calculate date range from period
  const getDateRange = useCallback(() => {
    const now = new Date();
    let from, to;

    switch (period) {
      case 'today':
        from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        to = now;
        break;
      case 'yesterday':
        from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        to = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59);
        break;
      case 'week':
        const dayOfWeek = now.getDay();
        const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        from = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset);
        to = now;
        break;
      case 'last_week':
        const lastWeekDay = now.getDay();
        const lastMondayOffset = lastWeekDay === 0 ? -13 : -6 - lastWeekDay;
        from = new Date(now.getFullYear(), now.getMonth(), now.getDate() + lastMondayOffset);
        to = new Date(from.getTime() + 6 * 24 * 60 * 60 * 1000 + 23 * 60 * 60 * 1000 + 59 * 60 * 1000 + 59 * 1000);
        break;
      case 'month':
        from = new Date(now.getFullYear(), now.getMonth(), 1);
        to = now;
        break;
      case 'last_month':
        from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
        break;
      case 'custom':
        if (customFrom && customTo) {
          from = new Date(customFrom);
          to = new Date(customTo);
          to.setHours(23, 59, 59);
        } else {
          return null;
        }
        break;
      default:
        from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
        to = now;
    }

    return {
      from: from.toISOString(),
      to: to.toISOString(),
    };
  }, [period, customFrom, customTo]);

  // Generate report
  const generateReport = async () => {
    const dateRange = getDateRange();
    if (!dateRange) {
      toast({ title: 'Veuillez selectionner une periode valide', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const { data } = await axios.post(`${API}/api/mes/reports/data`, {
        machine_ids: selectedMachines,
        report_type: reportType,
        date_from: dateRange.from,
        date_to: dateRange.to,
      }, { headers: getHeaders() });
      setReportData(data);
    } catch (err) {
      toast({ title: 'Erreur generation rapport', variant: 'destructive' });
    }
    setLoading(false);
  };

  // Export report
  const exportReport = async (format) => {
    const dateRange = getDateRange();
    if (!dateRange) {
      toast({ title: 'Veuillez selectionner une periode valide', variant: 'destructive' });
      return;
    }

    setExporting(true);
    try {
      const response = await axios.post(`${API}/api/mes/reports/export/${format}`, {
        machine_ids: selectedMachines,
        report_type: reportType,
        date_from: dateRange.from,
        date_to: dateRange.to,
      }, { 
        headers: getHeaders(),
        responseType: 'blob'
      });

      // Download file
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      const ext = format === 'excel' ? 'xlsx' : 'pdf';
      link.setAttribute('download', `rapport_mes_${dateRange.from.split('T')[0]}_${dateRange.to.split('T')[0]}.${ext}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast({ title: `Rapport ${format.toUpperCase()} telecharge` });
    } catch (err) {
      toast({ title: 'Erreur export', variant: 'destructive' });
    }
    setExporting(false);
  };

  // Toggle machine selection
  const toggleMachine = (machineId) => {
    if (machineId === 'all') {
      setSelectedMachines(['all']);
    } else {
      let newSelection = selectedMachines.filter(id => id !== 'all');
      if (newSelection.includes(machineId)) {
        newSelection = newSelection.filter(id => id !== machineId);
      } else {
        newSelection.push(machineId);
      }
      if (newSelection.length === 0) {
        newSelection = ['all'];
      }
      setSelectedMachines(newSelection);
    }
  };

  const selectedMachineLabel = selectedMachines.includes('all') 
    ? 'Toutes les machines' 
    : selectedMachines.length === 1 
      ? machines.find(m => m.id === selectedMachines[0])?.equipment_name || '1 machine'
      : `${selectedMachines.length} machines`;

  // Scheduled reports functions
  const openScheduleModal = (schedule = null) => {
    if (schedule) {
      setEditingSchedule(schedule);
      setScheduleForm({
        name: schedule.name || '',
        machine_ids: schedule.machine_ids || ['all'],
        report_type: schedule.report_type || 'all',
        frequency: schedule.frequency || 'weekly',
        day_of_week: schedule.day_of_week || 0,
        day_of_month: schedule.day_of_month || 1,
        hour: schedule.hour || 8,
        minute: schedule.minute || 0,
        recipients: (schedule.recipients || []).join(', '),
        format: schedule.format || 'pdf',
      });
    } else {
      setEditingSchedule(null);
      setScheduleForm({
        name: '',
        machine_ids: ['all'],
        report_type: 'all',
        frequency: 'weekly',
        day_of_week: 0,
        day_of_month: 1,
        hour: 8,
        minute: 0,
        recipients: '',
        format: 'pdf',
      });
    }
    setShowScheduleModal(true);
  };

  const saveSchedule = async () => {
    if (!scheduleForm.name.trim()) {
      toast({ title: 'Le nom est requis', variant: 'destructive' });
      return;
    }
    const emails = scheduleForm.recipients.split(',').map(e => e.trim()).filter(e => e);
    if (emails.length === 0) {
      toast({ title: 'Au moins un email est requis', variant: 'destructive' });
      return;
    }

    const payload = {
      ...scheduleForm,
      recipients: emails,
    };

    try {
      if (editingSchedule) {
        await axios.put(`${API}/api/mes/scheduled-reports/${editingSchedule.id}`, payload, { headers: getHeaders() });
        toast({ title: 'Rapport planifie mis a jour' });
      } else {
        await axios.post(`${API}/api/mes/scheduled-reports`, payload, { headers: getHeaders() });
        toast({ title: 'Rapport planifie cree' });
      }
      setShowScheduleModal(false);
      loadScheduledReports();
    } catch (err) {
      toast({ title: 'Erreur sauvegarde', variant: 'destructive' });
    }
  };

  const deleteSchedule = async (id) => {
    if (!window.confirm('Supprimer ce rapport planifie ?')) return;
    try {
      await axios.delete(`${API}/api/mes/scheduled-reports/${id}`, { headers: getHeaders() });
      toast({ title: 'Rapport planifie supprime' });
      loadScheduledReports();
    } catch (err) {
      toast({ title: 'Erreur suppression', variant: 'destructive' });
    }
  };

  const sendScheduleNow = async (id) => {
    try {
      await axios.post(`${API}/api/mes/scheduled-reports/${id}/send-now`, {}, { headers: getHeaders() });
      toast({ title: 'Rapport envoye' });
      loadScheduledReports();
    } catch (err) {
      toast({ title: 'Erreur envoi', variant: 'destructive' });
    }
  };

  const getFrequencyLabel = (schedule) => {
    const freq = FREQUENCIES.find(f => f.id === schedule.frequency);
    let label = freq?.label || schedule.frequency;
    if (schedule.frequency === 'weekly') {
      const day = DAYS_OF_WEEK.find(d => d.id === schedule.day_of_week);
      label += ` (${day?.label || ''})`;
    } else if (schedule.frequency === 'monthly') {
      label += ` (jour ${schedule.day_of_month})`;
    }
    return `${label} a ${String(schedule.hour).padStart(2, '0')}:${String(schedule.minute).padStart(2, '0')}`;
  };

  return (
    <div className="p-6 space-y-6" data-testid="mes-reports-page">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2" data-testid="mes-reports-title">
            <BarChart3 className="h-7 w-7 text-indigo-600" />
            Rapports M.E.S.
          </h1>
          <p className="text-sm text-gray-500 mt-1">Analyse et export des donnees de production</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setActiveTab('manual')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            activeTab === 'manual' 
              ? 'text-indigo-600 border-indigo-600' 
              : 'text-gray-500 border-transparent hover:text-gray-700'
          }`}
          data-testid="tab-manual"
        >
          <FileText className="h-4 w-4 inline mr-2" />
          Rapport manuel
        </button>
        <button
          onClick={() => setActiveTab('scheduled')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            activeTab === 'scheduled' 
              ? 'text-indigo-600 border-indigo-600' 
              : 'text-gray-500 border-transparent hover:text-gray-700'
          }`}
          data-testid="tab-scheduled"
        >
          <Bell className="h-4 w-4 inline mr-2" />
          Rapports planifies ({scheduledReports.length})
        </button>
      </div>

      {/* SCHEDULED REPORTS TAB */}
      {activeTab === 'scheduled' && (
        <div className="space-y-4">
          {/* Add new scheduled report */}
          <div className="flex justify-end">
            <button
              onClick={() => openScheduleModal()}
              className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2"
              data-testid="add-scheduled-report-btn"
            >
              <Plus className="h-4 w-4" /> Nouveau rapport planifie
            </button>
          </div>

          {/* List of scheduled reports */}
          {scheduledReports.length === 0 ? (
            <Card className="text-center py-12">
              <CardContent>
                <Mail className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                <h3 className="text-lg font-medium text-gray-600 mb-2">Aucun rapport planifie</h3>
                <p className="text-sm text-gray-400">Creez un rapport planifie pour recevoir automatiquement les donnees M.E.S. par email</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {scheduledReports.map(schedule => (
                <Card key={schedule.id} data-testid={`scheduled-report-${schedule.id}`}>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h3 className="font-medium text-gray-900">{schedule.name}</h3>
                        <div className="text-sm text-gray-500 mt-1 space-y-1">
                          <p className="flex items-center gap-2">
                            <Clock className="h-3.5 w-3.5" />
                            {getFrequencyLabel(schedule)}
                          </p>
                          <p className="flex items-center gap-2">
                            <Mail className="h-3.5 w-3.5" />
                            {(schedule.recipients || []).join(', ')}
                          </p>
                          <p className="flex items-center gap-2">
                            <FileText className="h-3.5 w-3.5" />
                            {REPORT_TYPES.find(r => r.id === schedule.report_type)?.label || schedule.report_type} - {schedule.format.toUpperCase()}
                          </p>
                          {schedule.last_sent_at && (
                            <p className="text-xs text-gray-400">
                              Dernier envoi: {new Date(schedule.last_sent_at).toLocaleString('fr-FR')}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => sendScheduleNow(schedule.id)}
                          className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg"
                          title="Envoyer maintenant"
                          data-testid={`send-now-${schedule.id}`}
                        >
                          <Play className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => openScheduleModal(schedule)}
                          className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                          title="Modifier"
                          data-testid={`edit-schedule-${schedule.id}`}
                        >
                          <Settings className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => deleteSchedule(schedule.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                          title="Supprimer"
                          data-testid={`delete-schedule-${schedule.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Schedule Modal */}
          {showScheduleModal && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <h2 className="text-lg font-semibold mb-4">
                  {editingSchedule ? 'Modifier le rapport planifie' : 'Nouveau rapport planifie'}
                </h2>
                
                <div className="space-y-4">
                  {/* Name */}
                  <div>
                    <label className="text-sm font-medium text-gray-700">Nom du rapport</label>
                    <input
                      type="text"
                      value={scheduleForm.name}
                      onChange={(e) => setScheduleForm({...scheduleForm, name: e.target.value})}
                      className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                      placeholder="Ex: Rapport hebdomadaire production"
                      data-testid="schedule-name-input"
                    />
                  </div>

                  {/* Report Type */}
                  <div>
                    <label className="text-sm font-medium text-gray-700">Type de rapport</label>
                    <select
                      value={scheduleForm.report_type}
                      onChange={(e) => setScheduleForm({...scheduleForm, report_type: e.target.value})}
                      className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                      data-testid="schedule-report-type"
                    >
                      {REPORT_TYPES.map(rt => (
                        <option key={rt.id} value={rt.id}>{rt.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Frequency */}
                  <div>
                    <label className="text-sm font-medium text-gray-700">Frequence</label>
                    <select
                      value={scheduleForm.frequency}
                      onChange={(e) => setScheduleForm({...scheduleForm, frequency: e.target.value})}
                      className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                      data-testid="schedule-frequency"
                    >
                      {FREQUENCIES.map(f => (
                        <option key={f.id} value={f.id}>{f.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Day of week (for weekly) */}
                  {scheduleForm.frequency === 'weekly' && (
                    <div>
                      <label className="text-sm font-medium text-gray-700">Jour de la semaine</label>
                      <select
                        value={scheduleForm.day_of_week}
                        onChange={(e) => setScheduleForm({...scheduleForm, day_of_week: parseInt(e.target.value)})}
                        className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                        data-testid="schedule-day-of-week"
                      >
                        {DAYS_OF_WEEK.map(d => (
                          <option key={d.id} value={d.id}>{d.label}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Day of month (for monthly) */}
                  {scheduleForm.frequency === 'monthly' && (
                    <div>
                      <label className="text-sm font-medium text-gray-700">Jour du mois</label>
                      <select
                        value={scheduleForm.day_of_month}
                        onChange={(e) => setScheduleForm({...scheduleForm, day_of_month: parseInt(e.target.value)})}
                        className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                        data-testid="schedule-day-of-month"
                      >
                        {Array.from({length: 28}, (_, i) => i + 1).map(d => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Time */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700">Heure</label>
                      <select
                        value={scheduleForm.hour}
                        onChange={(e) => setScheduleForm({...scheduleForm, hour: parseInt(e.target.value)})}
                        className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                        data-testid="schedule-hour"
                      >
                        {Array.from({length: 24}, (_, i) => i).map(h => (
                          <option key={h} value={h}>{String(h).padStart(2, '0')}h</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700">Minute</label>
                      <select
                        value={scheduleForm.minute}
                        onChange={(e) => setScheduleForm({...scheduleForm, minute: parseInt(e.target.value)})}
                        className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                        data-testid="schedule-minute"
                      >
                        {[0, 15, 30, 45].map(m => (
                          <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Format */}
                  <div>
                    <label className="text-sm font-medium text-gray-700">Format</label>
                    <select
                      value={scheduleForm.format}
                      onChange={(e) => setScheduleForm({...scheduleForm, format: e.target.value})}
                      className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                      data-testid="schedule-format"
                    >
                      <option value="pdf">PDF</option>
                      <option value="excel">Excel</option>
                    </select>
                  </div>

                  {/* Recipients */}
                  <div>
                    <label className="text-sm font-medium text-gray-700">Destinataires (emails separes par virgule)</label>
                    <textarea
                      value={scheduleForm.recipients}
                      onChange={(e) => setScheduleForm({...scheduleForm, recipients: e.target.value})}
                      className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                      rows={2}
                      placeholder="email1@example.com, email2@example.com"
                      data-testid="schedule-recipients"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                  <button
                    onClick={() => setShowScheduleModal(false)}
                    className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
                    data-testid="cancel-schedule-btn"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={saveSchedule}
                    className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                    data-testid="save-schedule-btn"
                  >
                    {editingSchedule ? 'Mettre a jour' : 'Creer'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MANUAL REPORTS TAB */}
      {activeTab === 'manual' && (
        <>
      {/* Filters */}
      <Card data-testid="mes-reports-filters">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-500" /> Filtres
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Machine Selection */}
            <div className="relative">
              <label className="text-xs font-medium text-gray-600 mb-1 block">Machine(s)</label>
              <button
                onClick={() => setShowMachineDropdown(!showMachineDropdown)}
                className="w-full px-3 py-2 text-sm border rounded-lg bg-white flex items-center justify-between hover:border-indigo-300"
                data-testid="machine-selector"
              >
                <span className="truncate">{selectedMachineLabel}</span>
                <ChevronDown className="h-4 w-4 text-gray-400" />
              </button>
              {showMachineDropdown && (
                <div className="absolute z-10 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  <button
                    onClick={() => toggleMachine('all')}
                    className={`w-full px-3 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-2 ${selectedMachines.includes('all') ? 'bg-indigo-50 text-indigo-700' : ''}`}
                    data-testid="machine-option-all"
                  >
                    {selectedMachines.includes('all') && <CheckCircle2 className="h-4 w-4" />}
                    Toutes les machines
                  </button>
                  {machines.map(m => (
                    <button
                      key={m.id}
                      onClick={() => toggleMachine(m.id)}
                      className={`w-full px-3 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-2 ${selectedMachines.includes(m.id) ? 'bg-indigo-50 text-indigo-700' : ''}`}
                      data-testid={`machine-option-${m.id}`}
                    >
                      {selectedMachines.includes(m.id) && <CheckCircle2 className="h-4 w-4" />}
                      {m.equipment_name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Report Type */}
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Type de rapport</label>
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
                className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-indigo-500"
                data-testid="report-type-selector"
              >
                {REPORT_TYPES.map(rt => (
                  <option key={rt.id} value={rt.id}>{rt.label}</option>
                ))}
              </select>
            </div>

            {/* Period */}
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Periode</label>
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-indigo-500"
                data-testid="period-selector"
              >
                {PERIODS.map(p => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>

            {/* Actions */}
            <div className="flex items-end gap-2">
              <button
                onClick={generateReport}
                disabled={loading}
                className="flex-1 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
                data-testid="generate-report-btn"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Generer
              </button>
            </div>
          </div>

          {/* Custom date range */}
          {period === 'custom' && (
            <div className="mt-4 flex items-center gap-4">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Du</label>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="px-3 py-2 text-sm border rounded-lg"
                  data-testid="custom-from"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Au</label>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="px-3 py-2 text-sm border rounded-lg"
                  data-testid="custom-to"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Report Content */}
      {reportData && (
        <>
          {/* Export Buttons */}
          <div className="flex items-center gap-3 justify-end">
            <OfflineDisabled message="Export necessite une connexion">
            <button
              onClick={() => exportReport('excel')}
              disabled={exporting}
              className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2"
              data-testid="export-excel-btn"
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Export Excel
            </button>
            </OfflineDisabled>
            <OfflineDisabled message="Export necessite une connexion">
            <button
              onClick={() => exportReport('pdf')}
              disabled={exporting}
              className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
              data-testid="export-pdf-btn"
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Export PDF
            </button>
            </OfflineDisabled>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4" data-testid="report-summary">
            <Card className="bg-indigo-50 border-indigo-100">
              <CardContent className="pt-4">
                <div className="text-xs text-indigo-600 font-medium">Machines</div>
                <div className="text-2xl font-bold text-indigo-700">{reportData.summary?.total_machines || 0}</div>
              </CardContent>
            </Card>
            <Card className="bg-emerald-50 border-emerald-100">
              <CardContent className="pt-4">
                <div className="text-xs text-emerald-600 font-medium">Production totale</div>
                <div className="text-2xl font-bold text-emerald-700">{reportData.summary?.total_production?.toLocaleString() || 0}</div>
              </CardContent>
            </Card>
            <Card className="bg-red-50 border-red-100">
              <CardContent className="pt-4">
                <div className="text-xs text-red-600 font-medium">Rebuts</div>
                <div className="text-2xl font-bold text-red-700">{reportData.summary?.total_rejects?.toLocaleString() || 0}</div>
              </CardContent>
            </Card>
            <Card className="bg-orange-50 border-orange-100">
              <CardContent className="pt-4">
                <div className="text-xs text-orange-600 font-medium">Arrets (h)</div>
                <div className="text-2xl font-bold text-orange-700">{reportData.summary?.total_downtime_hours || 0}</div>
              </CardContent>
            </Card>
            <Card className="bg-purple-50 border-purple-100">
              <CardContent className="pt-4">
                <div className="text-xs text-purple-600 font-medium">TRS moyen</div>
                <div className="text-2xl font-bold text-purple-700">{reportData.summary?.average_trs || 0}%</div>
              </CardContent>
            </Card>
          </div>

          {/* TRS Chart */}
          {(reportType === 'trs' || reportType === 'all') && reportData.machines?.some(m => m.trs) && (
            <Card data-testid="trs-report-section">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Gauge className="h-4 w-4 text-purple-500" /> TRS par machine
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* TRS Comparison Bar Chart */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-3">Comparaison TRS moyen</h4>
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={reportData.machines.filter(m => m.trs).map(m => ({
                        name: m.name?.substring(0, 15) || '',
                        trs: m.trs?.average_trs || 0,
                        dispo: m.trs?.average_availability || 0,
                        perf: m.trs?.average_performance || 0,
                        qual: m.trs?.average_quality || 0,
                      }))}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
                        <Tooltip formatter={(v) => `${v}%`} />
                        <Legend />
                        <Bar dataKey="trs" fill="#7c3aed" name="TRS" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="dispo" fill="#0ea5e9" name="Dispo." radius={[4, 4, 0, 0]} />
                        <Bar dataKey="perf" fill="#8b5cf6" name="Perf." radius={[4, 4, 0, 0]} />
                        <Bar dataKey="qual" fill="#10b981" name="Qual." radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* TRS Evolution Line Chart */}
                  {reportData.machines.length === 1 && reportData.machines[0].trs?.trs_values?.length > 1 && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-3">Evolution TRS</h4>
                      <ResponsiveContainer width="100%" height={250}>
                        <LineChart data={reportData.machines[0].trs.trs_values.filter(v => v.is_production_day)}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                          <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
                          <Tooltip formatter={(v) => `${v}%`} />
                          <Legend />
                          <Line type="monotone" dataKey="trs" stroke="#7c3aed" strokeWidth={2} name="TRS" />
                          <Line type="monotone" dataKey="availability" stroke="#0ea5e9" strokeWidth={1.5} strokeDasharray="4 2" name="Dispo." />
                          <Line type="monotone" dataKey="performance" stroke="#8b5cf6" strokeWidth={1.5} strokeDasharray="4 2" name="Perf." />
                          <Line type="monotone" dataKey="quality" stroke="#10b981" strokeWidth={1.5} strokeDasharray="4 2" name="Qual." />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                {/* TRS Table */}
                <div className="mt-6 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-4 py-2 text-left font-medium text-gray-600">Machine</th>
                        <th className="px-4 py-2 text-center font-medium text-gray-600">TRS Moy.</th>
                        <th className="px-4 py-2 text-center font-medium text-gray-600">Dispo.</th>
                        <th className="px-4 py-2 text-center font-medium text-gray-600">Perf.</th>
                        <th className="px-4 py-2 text-center font-medium text-gray-600">Qualite</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.machines.filter(m => m.trs).map((m, idx) => (
                        <tr key={m.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="px-4 py-2 font-medium">{m.name}</td>
                          <td className="px-4 py-2 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                              m.trs?.average_trs >= 85 ? 'bg-emerald-100 text-emerald-700' :
                              m.trs?.average_trs >= 60 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                            }`}>
                              {m.trs?.average_trs || 0}%
                            </span>
                          </td>
                          <td className="px-4 py-2 text-center text-sky-600">{m.trs?.average_availability || 0}%</td>
                          <td className="px-4 py-2 text-center text-violet-600">{m.trs?.average_performance || 0}%</td>
                          <td className="px-4 py-2 text-center text-emerald-600">{m.trs?.average_quality || 0}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Production Chart */}
          {(reportType === 'production' || reportType === 'all') && reportData.machines?.some(m => m.production) && (
            <Card data-testid="production-report-section">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Package className="h-4 w-4 text-emerald-500" /> Production
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Production Bar Chart */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-3">Production totale par machine</h4>
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={reportData.machines.filter(m => m.production).map(m => ({
                        name: m.name?.substring(0, 15) || '',
                        production: m.production?.total || 0,
                      }))}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Bar dataKey="production" fill="#10b981" name="Production" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Daily Evolution */}
                  {reportData.machines.length === 1 && reportData.machines[0].production?.daily_values?.length > 1 && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-3">Evolution journaliere</h4>
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={reportData.machines[0].production.daily_values}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip />
                          <Bar dataKey="production" fill="#10b981" name="Production" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                {/* Production Table */}
                <div className="mt-6 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-4 py-2 text-left font-medium text-gray-600">Machine</th>
                        <th className="px-4 py-2 text-center font-medium text-gray-600">Production totale</th>
                        <th className="px-4 py-2 text-center font-medium text-gray-600">Moyenne journaliere</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.machines.filter(m => m.production).map((m, idx) => (
                        <tr key={m.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="px-4 py-2 font-medium">{m.name}</td>
                          <td className="px-4 py-2 text-center font-bold text-emerald-600">{m.production?.total?.toLocaleString() || 0}</td>
                          <td className="px-4 py-2 text-center text-gray-600">{m.production?.average_daily || 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Rejects Section */}
          {(reportType === 'rejects' || reportType === 'all') && reportData.machines?.some(m => m.rejects) && (
            <Card data-testid="rejects-report-section">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-red-500" /> Rebuts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Rejects by Machine */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-3">Rebuts par machine</h4>
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={reportData.machines.filter(m => m.rejects).map(m => ({
                        name: m.name?.substring(0, 15) || '',
                        rejects: m.rejects?.total || 0,
                      }))}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Bar dataKey="rejects" fill="#ef4444" name="Rebuts" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Rejects by Reason (Pie) */}
                  {reportData.machines.length === 1 && reportData.machines[0].rejects?.by_reason?.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-3">Repartition par motif</h4>
                      <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                          <Pie
                            data={reportData.machines[0].rejects.by_reason}
                            dataKey="quantity"
                            nameKey="reason"
                            cx="50%"
                            cy="50%"
                            outerRadius={80}
                            label={({ reason, percent }) => `${reason.substring(0, 10)}... (${(percent * 100).toFixed(0)}%)`}
                          >
                            {reportData.machines[0].rejects.by_reason.map((entry, idx) => (
                              <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                {/* Rejects Table */}
                <div className="mt-6 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-4 py-2 text-left font-medium text-gray-600">Machine</th>
                        <th className="px-4 py-2 text-center font-medium text-gray-600">Total rebuts</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-600">Principal motif</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.machines.filter(m => m.rejects).map((m, idx) => (
                        <tr key={m.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="px-4 py-2 font-medium">{m.name}</td>
                          <td className="px-4 py-2 text-center font-bold text-red-600">{m.rejects?.total || 0}</td>
                          <td className="px-4 py-2 text-gray-600">{m.rejects?.by_reason?.[0]?.reason || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Stops Section */}
          {(reportType === 'stops' || reportType === 'all') && reportData.machines?.some(m => m.stops) && (
            <Card data-testid="stops-report-section">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4 text-orange-500" /> Arrets
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Downtime Bar Chart */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-3">Temps d'arret par machine (heures)</h4>
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={reportData.machines.filter(m => m.stops).map(m => ({
                        name: m.name?.substring(0, 15) || '',
                        downtime: m.stops?.total_downtime_hours || 0,
                        events: m.stops?.stop_count || 0,
                      }))}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="downtime" fill="#f59e0b" name="Arret (h)" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="events" fill="#fb923c" name="Nb evenements" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Stops Table */}
                <div className="mt-6 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-4 py-2 text-left font-medium text-gray-600">Machine</th>
                        <th className="px-4 py-2 text-center font-medium text-gray-600">Temps arret (h)</th>
                        <th className="px-4 py-2 text-center font-medium text-gray-600">Nb evenements</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.machines.filter(m => m.stops).map((m, idx) => (
                        <tr key={m.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="px-4 py-2 font-medium">{m.name}</td>
                          <td className="px-4 py-2 text-center font-bold text-orange-600">{m.stops?.total_downtime_hours || 0}</td>
                          <td className="px-4 py-2 text-center text-gray-600">{m.stops?.stop_count || 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Alerts Section */}
          {(reportType === 'alerts' || reportType === 'all') && reportData.machines?.some(m => m.alerts) && (
            <Card data-testid="alerts-report-section">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" /> Alertes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Alerts Bar Chart */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-3">Alertes par machine</h4>
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={reportData.machines.filter(m => m.alerts).map(m => ({
                        name: m.name?.substring(0, 15) || '',
                        alerts: m.alerts?.total || 0,
                      }))}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Bar dataKey="alerts" fill="#f59e0b" name="Alertes" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Alert Types Pie */}
                  {reportData.machines.length === 1 && reportData.machines[0].alerts?.by_type?.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-3">Repartition par type</h4>
                      <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                          <Pie
                            data={reportData.machines[0].alerts.by_type}
                            dataKey="count"
                            nameKey="type"
                            cx="50%"
                            cy="50%"
                            outerRadius={80}
                            label={({ type, percent }) => `${type} (${(percent * 100).toFixed(0)}%)`}
                          >
                            {reportData.machines[0].alerts.by_type.map((entry, idx) => (
                              <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                {/* Alerts Table */}
                <div className="mt-6 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-4 py-2 text-left font-medium text-gray-600">Machine</th>
                        <th className="px-4 py-2 text-center font-medium text-gray-600">Total alertes</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-600">Principal type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.machines.filter(m => m.alerts).map((m, idx) => (
                        <tr key={m.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="px-4 py-2 font-medium">{m.name}</td>
                          <td className="px-4 py-2 text-center font-bold text-amber-600">{m.alerts?.total || 0}</td>
                          <td className="px-4 py-2 text-gray-600">{m.alerts?.by_type?.[0]?.type || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Empty State (in manual tab) */}
      {!reportData && !loading && (
        <Card className="text-center py-16">
          <CardContent>
            <BarChart3 className="h-16 w-16 mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-600 mb-2">Aucun rapport genere</h3>
            <p className="text-sm text-gray-400">Selectionnez vos criteres et cliquez sur "Generer" pour visualiser les donnees</p>
          </CardContent>
        </Card>
      )}
      </>
      )}
    </div>
  );
};

export default MESReportsPage;
