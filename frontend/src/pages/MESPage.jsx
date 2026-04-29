import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { BACKEND_URL } from '../utils/config';
import { useToast } from '../hooks/use-toast';
import useEscapeToClose from '../hooks/useEscapeToClose';
import { applyTimezoneOffset, formatChartTime } from '../utils/dateUtils';
import {
  Activity, Plus, Settings, Trash2, Play, Square, Clock, Target, Gauge,
  AlertTriangle, Wifi, WifiOff, Loader2, RefreshCw, Zap, Bell,
  BarChart3, TrendingUp, Timer, Package, ArrowLeft, CheckCircle2, XCircle,
  ShieldAlert, CircleSlash, ListPlus, Calendar, Mail, X
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts';

const API = BACKEND_URL;
const getHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

// Static color map for Tailwind (avoids dynamic class purging)
const COLORS = {
  indigo: { bg: 'bg-indigo-50', border: 'border-indigo-100', icon: 'text-indigo-500', value: 'text-indigo-700' },
  blue:   { bg: 'bg-blue-50',   border: 'border-blue-100',   icon: 'text-blue-500',   value: 'text-blue-700' },
  emerald:{ bg: 'bg-emerald-50',border: 'border-emerald-100',icon: 'text-emerald-500',value: 'text-emerald-700' },
  teal:   { bg: 'bg-teal-50',   border: 'border-teal-100',   icon: 'text-teal-500',   value: 'text-teal-700' },
  red:    { bg: 'bg-red-50',    border: 'border-red-100',    icon: 'text-red-500',    value: 'text-red-700' },
  orange: { bg: 'bg-orange-50', border: 'border-orange-100', icon: 'text-orange-500', value: 'text-orange-700' },
  purple: { bg: 'bg-purple-50', border: 'border-purple-100', icon: 'text-purple-500', value: 'text-purple-700' },
  gray:   { bg: 'bg-gray-50',   border: 'border-gray-200',   icon: 'text-gray-500',   value: 'text-gray-700' },
};

const MetricCard = ({ icon: Icon, label, value, color }) => {
  const c = COLORS[color] || COLORS.gray;
  return (
    <div className={`p-3 rounded-xl ${c.bg} border ${c.border}`} data-testid={`mes-metric-${color}`}>
      <div className="flex items-center gap-1 mb-1">
        <Icon className={`h-3.5 w-3.5 ${c.icon}`} />
        <span className="text-[10px] text-gray-500 truncate">{label}</span>
      </div>
      <div className={`text-lg font-bold ${c.value} truncate`}>{value}</div>
    </div>
  );
};

// ==================== TRS BREAKDOWN ====================
const TRSBar = ({ label, value, color }) => (
  <div className="flex-1" data-testid={`trs-bar-${label.toLowerCase()}`}>
    <div className="flex items-center justify-between mb-1">
      <span className="text-xs font-medium text-gray-600">{label}</span>
      <span className={`text-sm font-bold ${color}`}>{value}%</span>
    </div>
    <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-700 ${
        value >= 85 ? 'bg-emerald-500' : value >= 60 ? 'bg-amber-500' : 'bg-red-500'
      }`} style={{ width: `${Math.min(value, 100)}%` }} />
    </div>
  </div>
);

const TRSBreakdown = ({ metrics }) => {
  if (!metrics) return null;
  const trs = metrics.trs ?? 0;
  const trsTarget = metrics.trs_target ?? 85;
  const trsColor = trs >= trsTarget ? 'text-emerald-600' : trs >= trsTarget * 0.7 ? 'text-amber-600' : 'text-red-600';
  const trsBg = trs >= trsTarget ? 'bg-emerald-50 border-emerald-200' : trs >= trsTarget * 0.7 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200';

  return (
    <Card data-testid="trs-breakdown-card">
      <CardContent className="pt-4">
        <div className="flex flex-col md:flex-row gap-4 items-center">
          <div className={`flex flex-col items-center justify-center p-4 rounded-xl border ${trsBg} min-w-[120px]`}>
            <span className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">TRS Global</span>
            <span className={`text-3xl font-black ${trsColor}`}>{trs}%</span>
            <span className="text-[10px] text-gray-400 mt-1">
              {metrics.good_parts_today ?? 0} conformes / {metrics.rejects_today ?? 0} rebuts
            </span>
            {trsTarget > 0 && (
              <span className={`text-[10px] mt-1 font-medium ${trs >= trsTarget ? 'text-emerald-500' : 'text-red-500'}`}
                data-testid="trs-target-indicator">
                <Target className="h-3 w-3 inline mr-0.5" />Objectif: {trsTarget}%
              </span>
            )}
          </div>
          <div className="flex-1 w-full space-y-3">
            <TRSBar label="Disponibilite" value={metrics.trs_availability ?? 0} color="text-sky-600" />
            <TRSBar label="Performance" value={metrics.trs_performance ?? 0} color="text-violet-600" />
            <TRSBar label="Qualite" value={metrics.trs_quality ?? 0} color="text-emerald-600" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// ==================== REJECTS PANEL ====================
const RejectsPanel = ({ machineId, onRejectChange, timezoneOffset }) => {
  const [rejects, setRejects] = useState([]);
  const [reasons, setReasons] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ quantity: 1, reason: '', custom_reason: '' });
  const [saving, setSaving] = useState(false);
  const [showReasonsAdmin, setShowReasonsAdmin] = useState(false);
  const { toast } = useToast();

  const loadRejects = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/api/mes/machines/${machineId}/rejects`, { headers: getHeaders() });
      setRejects(data);
    } catch {}
  }, [machineId]);

  const loadReasons = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/api/mes/reject-reasons`, { headers: getHeaders() });
      setReasons(data);
    } catch {}
  }, []);

  useEffect(() => { loadRejects(); loadReasons(); }, [loadRejects, loadReasons]);

  const submitReject = async () => {
    if (form.quantity <= 0) {
      toast({ title: 'La quantite doit etre > 0', variant: 'destructive' });
      return;
    }
    if (!form.reason && !form.custom_reason) {
      toast({ title: 'Veuillez indiquer un motif', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await axios.post(`${API}/api/mes/machines/${machineId}/rejects`, form, { headers: getHeaders() });
      toast({ title: 'Rebut declare' });
      setForm({ quantity: 1, reason: '', custom_reason: '' });
      setShowForm(false);
      loadRejects();
      onRejectChange();
    } catch { toast({ title: 'Erreur', variant: 'destructive' }); }
    setSaving(false);
  };

  const deleteReject = async (id) => {
    try {
      await axios.delete(`${API}/api/mes/rejects/${id}`, { headers: getHeaders() });
      loadRejects();
      onRejectChange();
    } catch {}
  };

  const totalRejects = rejects.reduce((sum, r) => sum + (r.quantity || 0), 0);

  return (
    <Card data-testid="rejects-panel">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-red-500" /> Rebuts du jour
            {totalRejects > 0 && (
              <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">{totalRejects}</span>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowReasonsAdmin(!showReasonsAdmin)}
              className="text-xs text-gray-500 hover:text-indigo-600 px-2 py-1 rounded hover:bg-gray-50"
              data-testid="manage-reject-reasons-btn">
              <Settings className="h-3 w-3 inline mr-1" />Motifs
            </button>
            <button onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-red-50 text-red-600 rounded-lg hover:bg-red-100"
              data-testid="declare-reject-btn">
              <ListPlus className="h-3 w-3" /> Declarer
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {showReasonsAdmin && <RejectReasonsAdmin reasons={reasons} onUpdate={loadReasons} onClose={() => setShowReasonsAdmin(false)} />}

        {showForm && (
          <div className="mb-4 p-3 bg-red-50/50 border border-red-100 rounded-lg space-y-3" data-testid="reject-form">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Quantite *</label>
                <input type="number" min="1" value={form.quantity}
                  onChange={e => setForm(prev => ({ ...prev, quantity: parseInt(e.target.value) || 0 }))}
                  className="w-full mt-1 px-3 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-red-300"
                  data-testid="reject-quantity-input" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Motif predefini</label>
                <select value={form.reason}
                  onChange={e => setForm(prev => ({ ...prev, reason: e.target.value }))}
                  className="w-full mt-1 px-3 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-red-300"
                  data-testid="reject-reason-select">
                  <option value="">-- Selectionner --</option>
                  {reasons.map(r => <option key={r.id} value={r.label}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Motif libre</label>
                <input type="text" value={form.custom_reason} placeholder="Autre motif..."
                  onChange={e => setForm(prev => ({ ...prev, custom_reason: e.target.value }))}
                  className="w-full mt-1 px-3 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-red-300"
                  data-testid="reject-custom-reason-input" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded-lg">Annuler</button>
              <button onClick={submitReject} disabled={saving} data-testid="reject-submit-btn"
                className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-1">
                {saving && <Loader2 className="h-3 w-3 animate-spin" />} Valider
              </button>
            </div>
          </div>
        )}

        {rejects.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">Aucun rebut declare aujourd'hui</p>
        ) : (
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {rejects.map(r => (
              <div key={r.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg text-sm"
                data-testid={`reject-item-${r.id}`}>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-red-600 min-w-[32px] text-center">{r.quantity}</span>
                  <div>
                    <span className="text-gray-800">{r.reason || r.custom_reason || 'Sans motif'}</span>
                    {r.reason && r.custom_reason && <span className="text-gray-400 ml-1">({r.custom_reason})</span>}
                    <span className="text-[10px] text-gray-400 ml-2">
                      {r.operator && `par ${r.operator} - `}
                      {applyTimezoneOffset(r.timestamp, timezoneOffset).toLocaleString('fr-FR', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
                <button onClick={() => deleteReject(r.id)} className="p-1 text-gray-300 hover:text-red-500"
                  data-testid={`delete-reject-${r.id}`}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// ==================== REJECT REASONS ADMIN ====================
const RejectReasonsAdmin = ({ reasons, onUpdate, onClose }) => {
  const [newLabel, setNewLabel] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editLabel, setEditLabel] = useState('');
  const { toast } = useToast();

  const addReason = async () => {
    if (!newLabel.trim()) return;
    try {
      await axios.post(`${API}/api/mes/reject-reasons`, { label: newLabel.trim() }, { headers: getHeaders() });
      setNewLabel('');
      onUpdate();
    } catch { toast({ title: 'Erreur', variant: 'destructive' }); }
  };

  const updateReason = async (id) => {
    if (!editLabel.trim()) return;
    try {
      await axios.put(`${API}/api/mes/reject-reasons/${id}`, { label: editLabel.trim() }, { headers: getHeaders() });
      setEditingId(null);
      onUpdate();
    } catch { toast({ title: 'Erreur', variant: 'destructive' }); }
  };

  const deleteReason = async (id) => {
    try {
      await axios.delete(`${API}/api/mes/reject-reasons/${id}`, { headers: getHeaders() });
      onUpdate();
    } catch {}
  };

  return (
    <div className="mb-4 p-3 bg-indigo-50/50 border border-indigo-100 rounded-lg" data-testid="reject-reasons-admin">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-700">Gestion des motifs de rebut</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><XCircle className="h-4 w-4" /></button>
      </div>
      <div className="flex gap-2 mb-2">
        <input type="text" value={newLabel} placeholder="Nouveau motif..."
          onChange={e => setNewLabel(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addReason()}
          className="flex-1 px-2 py-1 text-xs border rounded-lg"
          data-testid="new-reject-reason-input" />
        <button onClick={addReason} className="px-2 py-1 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          data-testid="add-reject-reason-btn">
          <Plus className="h-3 w-3" />
        </button>
      </div>
      <div className="space-y-1 max-h-32 overflow-y-auto">
        {reasons.map(r => (
          <div key={r.id} className="flex items-center justify-between p-1.5 bg-white rounded text-xs">
            {editingId === r.id ? (
              <input type="text" value={editLabel} onChange={e => setEditLabel(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && updateReason(r.id)}
                onBlur={() => updateReason(r.id)}
                className="flex-1 px-2 py-0.5 border rounded text-xs mr-2" autoFocus />
            ) : (
              <span className="text-gray-700 cursor-pointer hover:text-indigo-600"
                onClick={() => { setEditingId(r.id); setEditLabel(r.label); }}>{r.label}</span>
            )}
            <button onClick={() => deleteReason(r.id)} className="p-0.5 text-gray-300 hover:text-red-500">
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
        {reasons.length === 0 && <p className="text-[10px] text-gray-400 text-center py-1">Aucun motif predefini</p>}
      </div>
    </div>
  );
};

// ==================== TRS WEEKLY CHART ====================
const TRSWeeklyChart = ({ data, trsTarget }) => {
  if (!data || data.length === 0) return null;

  const chartData = data.filter(d => d.is_production_day).map(d => ({
    date: new Date(d.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }),
    trs: d.trs ?? 0,
    disponibilite: d.availability ?? 0,
    performance: d.performance ?? 0,
    qualite: d.quality ?? 0,
    production: d.production,
  }));

  if (chartData.length === 0) return null;

  return (
    <Card data-testid="trs-weekly-chart">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Calendar className="h-4 w-4 text-indigo-500" /> TRS Hebdomadaire
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: '8px' }} formatter={(v) => `${v}%`} />
            <ReferenceLine y={trsTarget} stroke="#ef4444" strokeDasharray="6 3" label={{ value: `Obj: ${trsTarget}%`, position: 'right', fontSize: 10, fill: '#ef4444' }} />
            <Bar dataKey="trs" fill="#7c3aed" radius={[4, 4, 0, 0]} name="TRS" />
            <Bar dataKey="disponibilite" fill="#0ea5e9" radius={[4, 4, 0, 0]} name="Disponibilite" />
            <Bar dataKey="performance" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Performance" />
            <Bar dataKey="qualite" fill="#10b981" radius={[4, 4, 0, 0]} name="Qualite" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

// ==================== RETENTION MODAL ====================
const RetentionModal = ({ onClose }) => {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [days, setDays] = useState(365);
  const { toast } = useToast();
  useEscapeToClose(true, onClose);

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/api/mes/config/retention`, { headers: getHeaders() });
      setConfig(data);
      setDays(data.retention_days);
    } catch (e) {
      toast({ title: 'Erreur', description: 'Impossible de charger la configuration', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await axios.put(`${API}/api/mes/config/retention`, { retention_days: days }, { headers: getHeaders() });
      toast({ title: 'Sauvegardé', description: `Rétention : ${data.retention_days} jours` });
      load();
    } catch (e) {
      toast({ title: 'Erreur', description: e.response?.data?.detail || 'Sauvegarde impossible', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const cleanupNow = async () => {
    if (!window.confirm(`Lancer immédiatement le nettoyage des données M.E.S de plus de ${days} jours ?`)) return;
    setCleaning(true);
    try {
      const { data } = await axios.post(`${API}/api/mes/config/cleanup-now`, {}, { headers: getHeaders() });
      toast({ title: 'Nettoyage terminé', description: `${data.pulses_deleted || 0} pulses, ${data.cadence_deleted || 0} cadences supprimés` });
      load();
    } catch (e) {
      toast({ title: 'Erreur', description: e.response?.data?.detail || 'Nettoyage impossible', variant: 'destructive' });
    } finally {
      setCleaning(false);
    }
  };

  const presets = [
    { label: '30 j', value: 30 },
    { label: '90 j', value: 90 },
    { label: '6 mois', value: 180 },
    { label: '1 an', value: 365 },
    { label: '2 ans', value: 730 },
  ];

  // Calcul d'estimation : combien de docs seraient supprimés à la prochaine purge
  const estimatedFreed = (() => {
    if (!config?.oldest_pulse) return null;
    const oldest = new Date(config.oldest_pulse);
    const cutoff = new Date(Date.now() - days * 86400000);
    if (oldest >= cutoff) return 0;
    // Approximation linéaire : fraction du temps couvert avant la coupure
    const totalSpan = Date.now() - oldest.getTime();
    const oldSpan = cutoff.getTime() - oldest.getTime();
    if (totalSpan <= 0) return 0;
    return Math.round((config.pulses_count || 0) * (oldSpan / totalSpan));
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" data-testid="mes-retention-modal">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Clock className="h-5 w-5 text-indigo-600" />
            Rétention des données M.E.S
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>
        <div className="px-6 py-5 space-y-5">
          {loading ? (
            <div className="text-center py-6"><Loader2 className="h-6 w-6 animate-spin text-indigo-500 mx-auto" /></div>
          ) : (
            <>
              {/* Stats actuelles */}
              <div className="bg-indigo-50/50 border border-indigo-100 rounded-lg p-3 text-sm">
                <p className="font-semibold text-indigo-900 mb-2">État actuel</p>
                <div className="grid grid-cols-2 gap-2 text-gray-700">
                  <div>
                    <span className="text-gray-500 text-xs">Impulsions stockées</span>
                    <p className="font-mono font-semibold">{(config.pulses_count || 0).toLocaleString('fr-FR')}</p>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs">Cadences (1/min)</span>
                    <p className="font-mono font-semibold">{(config.cadence_count || 0).toLocaleString('fr-FR')}</p>
                  </div>
                  {config.oldest_pulse && (
                    <div className="col-span-2">
                      <span className="text-gray-500 text-xs">Plus ancienne donnée</span>
                      <p className="font-mono">{new Date(config.oldest_pulse).toLocaleString('fr-FR')}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Presets */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Durée de conservation</label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {presets.map(p => (
                    <button key={p.value}
                      type="button"
                      onClick={() => setDays(p.value)}
                      className={`px-3 py-1.5 text-xs rounded-lg border ${days === p.value ? 'bg-indigo-100 border-indigo-500 text-indigo-700 font-semibold' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
                      data-testid={`retention-preset-${p.value}`}>
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input type="number" min={config.min_days} max={config.max_days}
                    value={days}
                    onChange={e => setDays(Math.max(config.min_days, Math.min(config.max_days, parseInt(e.target.value) || 0)))}
                    className="w-32 px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-indigo-500"
                    data-testid="retention-input-days" />
                  <span className="text-sm text-gray-600">jours (entre {config.min_days} et {config.max_days})</span>
                </div>
              </div>

              {/* Estimation impact */}
              {estimatedFreed !== null && estimatedFreed > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                  <p className="text-amber-900">
                    ⚠️ Le prochain nettoyage supprimerait environ <span className="font-mono font-bold">{estimatedFreed.toLocaleString('fr-FR')}</span> impulsions plus anciennes que <span className="font-semibold">{days} jours</span>.
                  </p>
                </div>
              )}
              {estimatedFreed === 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
                  ✅ Toutes vos données sont dans la fenêtre de rétention actuelle.
                </div>
              )}

              <p className="text-xs text-gray-500">
                Les données plus anciennes que cette durée sont supprimées automatiquement chaque nuit à 04:00. Les rapports historiques agrégés (statistiques par jour/semaine) restent disponibles pour les analyses.
              </p>
            </>
          )}
        </div>
        <div className="px-6 py-3 border-t flex items-center justify-between gap-2">
          <button onClick={cleanupNow} disabled={cleaning || loading}
            className="px-4 py-2 text-sm bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50"
            data-testid="retention-cleanup-now-btn">
            {cleaning ? <Loader2 className="h-4 w-4 animate-spin inline mr-1" /> : <Trash2 className="h-4 w-4 inline mr-1" />}
            Nettoyer maintenant
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Fermer</button>
            <button onClick={save} disabled={saving || loading || (config && days === config.retention_days)}
              className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              data-testid="retention-save-btn">
              {saving ? <Loader2 className="h-4 w-4 animate-spin inline mr-1" /> : null}
              Sauvegarder
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==================== MACHINE LIST ====================
const MachineList = ({ machines, onSelect, onCreate, onDelete, loading, onOpenRetention }) => (
  <div className="space-y-4">
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2" data-testid="mes-title">
          <Activity className="h-7 w-7 text-indigo-600" />
          M.E.S - Suivi de Production
        </h1>
        <p className="text-sm text-gray-500 mt-1">Manufacturing Execution System</p>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={onOpenRetention}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"
          data-testid="mes-open-retention-btn"
          title="Configurer la rétention des données M.E.S">
          <Clock className="h-4 w-4" /> Rétention
        </button>
        <button data-testid="mes-add-machine" onClick={onCreate}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
          <Plus className="h-4 w-4" /> Ajouter une machine
        </button>
      </div>
    </div>

    {loading ? (
      <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-indigo-500" /></div>
    ) : machines.length === 0 ? (
      <div className="text-center py-20 text-gray-400">
        <Activity className="h-16 w-16 mx-auto mb-4 opacity-30" />
        <p className="text-lg">Aucune machine configuree</p>
        <p className="text-sm">Ajoutez une machine pour commencer le suivi de production</p>
      </div>
    ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {machines.map(m => <MachineCard key={m.id} machine={m} onSelect={onSelect} onDelete={onDelete} />)}
      </div>
    )}
  </div>
);

// ==================== MACHINE CARD ====================
const MachineCard = ({ machine, onSelect, onDelete }) => {
  const [metrics, setMetrics] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await axios.get(`${API}/api/mes/machines/${machine.id}/metrics`, { headers: getHeaders() });
        setMetrics(data);
      } catch {}
    };
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [machine.id]);

  return (
    <Card className="group relative cursor-pointer hover:shadow-lg transition-shadow border-l-4"
      style={{ borderLeftColor: metrics?.is_running ? '#10b981' : '#ef4444' }}
      data-testid={`mes-machine-card-${machine.id}`}
      onClick={() => onSelect(machine.id)}>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">
              {machine.equipment_name}
              {machine.sub_equipment_name && (
                <span className="text-gray-500 font-normal"> → {machine.sub_equipment_name}</span>
              )}
            </h3>
            <p className="text-xs text-gray-400 font-mono mt-0.5">{machine.mqtt_topic}</p>
          </div>
          <div className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
            metrics?.is_running ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {metrics?.is_running ? <Play className="h-3 w-3" /> : <Square className="h-3 w-3" />}
            {metrics?.is_running ? 'En marche' : 'Arret'}
          </div>
        </div>
        {metrics && (
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="text-center p-2 bg-indigo-50 rounded">
              <div className="text-lg font-bold text-indigo-600">{metrics.cadence_per_min}</div>
              <div className="text-[10px] text-gray-500">cp/min</div>
            </div>
            <div className="text-center p-2 bg-blue-50 rounded">
              <div className="text-lg font-bold text-blue-600">{metrics.cadence_per_hour}</div>
              <div className="text-[10px] text-gray-500">cp/h</div>
            </div>
            <div className="text-center p-2 bg-emerald-50 rounded">
              <div className="text-lg font-bold text-emerald-600">{metrics.production_today}</div>
              <div className="text-[10px] text-gray-500">Prod. jour</div>
            </div>
            <div className="text-center p-2 bg-amber-50 rounded">
              <div className="text-lg font-bold text-amber-600">{metrics.trs}%</div>
              <div className="text-[10px] text-gray-500">TRS</div>
              <div className="flex justify-center gap-1 mt-1">
                <span className="text-[8px] px-1 py-0.5 bg-sky-100 text-sky-700 rounded">D:{metrics.trs_availability ?? 0}%</span>
                <span className="text-[8px] px-1 py-0.5 bg-violet-100 text-violet-700 rounded">P:{metrics.trs_performance ?? 0}%</span>
                <span className="text-[8px] px-1 py-0.5 bg-emerald-100 text-emerald-700 rounded">Q:{metrics.trs_quality ?? 0}%</span>
              </div>
            </div>
          </div>
        )}
        <button onClick={(e) => { e.stopPropagation(); onDelete(machine.id); }}
          data-testid={`mes-delete-machine-${machine.id}`}
          className="absolute top-2 right-2 p-1.5 text-gray-300 hover:text-red-500 rounded-full hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all">
          <Trash2 className="h-4 w-4" />
        </button>
      </CardContent>
    </Card>
  );
};

// ==================== MACHINE DASHBOARD ====================
const MachineDashboard = ({ machineId, onBack }) => {
  const [machine, setMachine] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [history, setHistory] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [period, setPeriod] = useState('6h');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [editing, setEditing] = useState(false);
  const [pinging, setPinging] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  const [timezoneOffset, setTimezoneOffset] = useState(1); // Default GMT+1 (France)
  const [trsHistory, setTrsHistory] = useState([]);
  const { toast } = useToast();

  // Load configured timezone offset from Special Settings
  useEffect(() => {
    const loadTimezone = async () => {
      try {
        const { data } = await axios.get(`${API}/api/timezone/offset`, { headers: getHeaders() });
        if (data && typeof data.timezone_offset === 'number') {
          setTimezoneOffset(data.timezone_offset);
        }
      } catch (err) {
        console.warn('Erreur chargement timezone, utilisation defaut GMT+1:', err);
      }
    };
    loadTimezone();
  }, []);

  const loadMachine = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/api/mes/machines/${machineId}`, { headers: getHeaders() });
      setMachine(data);
    } catch {}
  }, [machineId]);

  const loadMetrics = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/api/mes/machines/${machineId}/metrics`, { headers: getHeaders() });
      setMetrics(data);
    } catch {}
  }, [machineId]);

  const loadHistory = useCallback(async () => {
    try {
      let url = `${API}/api/mes/machines/${machineId}/history?period=${period}`;
      if (period === 'custom' && customFrom && customTo) {
        url += `&date_from=${customFrom}&date_to=${customTo}`;
      }
      const { data } = await axios.get(url, { headers: getHeaders() });
      setHistory(data);
    } catch {}
  }, [machineId, period, customFrom, customTo]);

  const loadAlerts = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/api/mes/alerts?limit=20`, { headers: getHeaders() });
      setAlerts(data);
    } catch {}
  }, []);

  const loadTrsHistory = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/api/mes/machines/${machineId}/trs-history?days=7`, { headers: getHeaders() });
      setTrsHistory(data);
    } catch {}
  }, [machineId]);

  useEffect(() => { loadMachine(); loadAlerts(); loadTrsHistory(); }, [loadMachine, loadAlerts, loadTrsHistory]);
  useEffect(() => { loadMetrics(); const i = setInterval(loadMetrics, 5000); return () => clearInterval(i); }, [loadMetrics]);
  useEffect(() => { loadHistory(); const i = setInterval(loadHistory, 60000); return () => clearInterval(i); }, [loadHistory]);

  const simulatePulse = async () => {
    try {
      await axios.post(`${API}/api/mes/machines/${machineId}/simulate-pulse`, {}, { headers: getHeaders() });
      loadMetrics();
      toast({ title: 'Impulsion simulee' });
    } catch { toast({ title: 'Erreur', variant: 'destructive' }); }
  };

  const pingAction = async () => {
    setPinging(true);
    try {
      const { data } = await axios.post(`${API}/api/mes/machines/${machineId}/ping`, {}, { headers: getHeaders() });
      toast({ title: data.success ? 'Capteur joignable' : 'Capteur injoignable', description: data.message,
        variant: data.success ? 'default' : 'destructive' });
    } catch { toast({ title: 'Erreur ping', variant: 'destructive' }); }
    setPinging(false);
  };

  const markAlertRead = async (alertId) => {
    try {
      await axios.put(`${API}/api/mes/alerts/${alertId}/read`, {}, { headers: getHeaders() });
      setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, read: true } : a));
    } catch {}
  };

  const markAllAlertsRead = async () => {
    try {
      await axios.put(`${API}/api/mes/alerts/read-all`, {}, { headers: getHeaders() });
      setAlerts(prev => prev.map(a => ({ ...a, read: true })));
      toast({ title: 'Toutes les alertes marquees comme lues' });
    } catch {}
  };

  const formatTime = (seconds) => {
    if (!seconds || seconds < 0) return '0s';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const chartData = history.map(h => ({
    time: formatChartTime(h.timestamp, timezoneOffset),
    cadence: h.cadence,
    theoretical: h.theoretical,
  }));

  const unreadAlerts = alerts.filter(a => !a.read);

  const getAlertIcon = (type) => {
    const map = {
      STOPPED: <Square className="h-4 w-4 text-red-500" />,
      UNDER_CADENCE: <TrendingUp className="h-4 w-4 text-orange-500 rotate-180" />,
      OVER_CADENCE: <TrendingUp className="h-4 w-4 text-yellow-500" />,
      NO_SIGNAL: <WifiOff className="h-4 w-4 text-gray-500" />,
      TARGET_REACHED: <CheckCircle2 className="h-4 w-4 text-green-500" />,
      TRS_BELOW_TARGET: <Target className="h-4 w-4 text-red-500" />,
    };
    return map[type] || <AlertTriangle className="h-4 w-4 text-orange-500" />;
  };

  const getAlertColor = (type) => {
    const map = {
      STOPPED: 'border-l-red-500 bg-red-50',
      UNDER_CADENCE: 'border-l-orange-500 bg-orange-50',
      OVER_CADENCE: 'border-l-yellow-500 bg-yellow-50',
      NO_SIGNAL: 'border-l-gray-500 bg-gray-100',
      TARGET_REACHED: 'border-l-green-500 bg-green-50',
      TRS_BELOW_TARGET: 'border-l-red-500 bg-red-50',
    };
    return map[type] || 'border-l-orange-500 bg-orange-50';
  };

  if (!machine) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-indigo-500" /></div>;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-lg" data-testid="mes-back-btn">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900" data-testid="mes-machine-name">
              {machine.equipment_name}
              {machine.sub_equipment_name && (
                <span className="text-gray-500 font-normal text-base"> → {machine.sub_equipment_name}</span>
              )}
            </h1>
            <p className="text-xs text-gray-400 font-mono">{machine.mqtt_topic} {machine.sensor_ip && `| IP: ${machine.sensor_ip}`}</p>
          </div>
          <div className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
            metrics?.is_running ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
            data-testid="mes-machine-status">
            {metrics?.is_running ? <><Wifi className="h-3 w-3" /> En marche</> : <><WifiOff className="h-3 w-3" /> Arret</>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowAlerts(!showAlerts)}
            className="relative px-3 py-1.5 text-xs bg-amber-50 text-amber-600 rounded-lg hover:bg-amber-100"
            data-testid="mes-alerts-btn">
            <Bell className="h-3 w-3 inline mr-1" />Alertes
            {unreadAlerts.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full h-4 w-4 flex items-center justify-center">
                {unreadAlerts.length}
              </span>
            )}
          </button>
          <button onClick={simulatePulse} className="px-3 py-1.5 text-xs bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100"
            data-testid="mes-simulate-btn"><Zap className="h-3 w-3 inline mr-1" />Simuler</button>
          {machine.sensor_ip && (
            <button onClick={pingAction} disabled={pinging} data-testid="mes-ping-btn"
              className="px-3 py-1.5 text-xs bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 disabled:opacity-50">
              {pinging ? <Loader2 className="h-3 w-3 inline mr-1 animate-spin" /> : <Wifi className="h-3 w-3 inline mr-1" />}Ping
            </button>
          )}
          <button onClick={() => setEditing(true)} className="px-3 py-1.5 text-xs bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"
            data-testid="mes-settings-btn"><Settings className="h-3 w-3 inline mr-1" />Parametres</button>
        </div>
      </div>

      {/* Alerts Panel */}
      {showAlerts && (
        <Card data-testid="mes-alerts-panel">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Bell className="h-4 w-4 text-amber-500" /> Alertes recentes
              </CardTitle>
              <div className="flex items-center gap-2">
                {unreadAlerts.length > 0 && (
                  <button onClick={markAllAlertsRead}
                    className="text-xs text-indigo-600 hover:underline" data-testid="mes-mark-all-read">
                    Tout marquer comme lu
                  </button>
                )}
                <button onClick={() => setShowAlerts(false)} className="p-1 hover:bg-gray-100 rounded">
                  <XCircle className="h-4 w-4 text-gray-400" />
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {alerts.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Aucune alerte</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {alerts.map(alert => (
                  <div key={alert.id}
                    className={`flex items-center justify-between p-2.5 rounded-lg border-l-4 ${getAlertColor(alert.type)} ${alert.read ? 'opacity-50' : ''}`}
                    data-testid={`mes-alert-${alert.id}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      {getAlertIcon(alert.type)}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{alert.message}</p>
                        <p className="text-[10px] text-gray-500">
                          {alert.equipment_name} - {applyTimezoneOffset(alert.created_at, timezoneOffset).toLocaleString('fr-FR', { timeZone: 'UTC' })}
                        </p>
                      </div>
                    </div>
                    {!alert.read && (
                      <button onClick={() => markAlertRead(alert.id)}
                        className="p-1 text-gray-400 hover:text-green-500 shrink-0 ml-2" title="Marquer comme lu">
                        <CheckCircle2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3" data-testid="mes-metrics-grid">
        <MetricCard icon={Gauge} label="cp/min" value={metrics?.cadence_per_min ?? '-'} color="indigo" />
        <MetricCard icon={BarChart3} label="cp/h" value={metrics?.cadence_per_hour ?? '-'} color="blue" />
        <MetricCard icon={Package} label="Prod. jour" value={metrics?.production_today ?? '-'} color="emerald" />
        <MetricCard icon={Package} label="Prod. 24h" value={metrics?.production_24h ?? '-'} color="teal" />
        <MetricCard icon={Timer} label="Arret actuel" value={formatTime(metrics?.downtime_current_seconds)} color="red" />
        <MetricCard icon={Clock} label="Arret jour" value={formatTime(metrics?.downtime_today_seconds)} color="orange" />
        <MetricCard icon={TrendingUp} label="TRS" value={`${metrics?.trs ?? 0}%`} color="purple" />
        <MetricCard icon={Target} label="Cadence theo." value={`${metrics?.theoretical_cadence ?? 0}`} color="gray" />
      </div>

      {/* TRS Advanced Breakdown */}
      <TRSBreakdown metrics={metrics} />

      {/* Rejects Panel */}
      <RejectsPanel machineId={machineId} onRejectChange={loadMetrics} timezoneOffset={timezoneOffset} />

      {/* TRS Weekly Chart */}
      <TRSWeeklyChart data={trsHistory} trsTarget={metrics?.trs_target ?? 85} />

      {/* Chart */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base">Historique de cadence</CardTitle>
            <div className="flex items-center gap-1">
              {['6h', '12h', '24h', '7d'].map(p => (
                <button key={p} onClick={() => setPeriod(p)}
                  className={`px-3 py-1 text-xs rounded-lg transition-colors ${period === p ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  data-testid={`mes-period-${p}`}>{p}</button>
              ))}
              <button onClick={() => setPeriod('custom')}
                className={`px-3 py-1 text-xs rounded-lg transition-colors ${period === 'custom' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                data-testid="mes-period-custom">
                Perso.
              </button>
            </div>
          </div>
          {period === 'custom' && (
            <div className="flex items-center gap-2 mt-2">
              <input type="datetime-local" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                className="text-xs border rounded px-2 py-1" data-testid="mes-custom-from" />
              <span className="text-xs text-gray-400">-</span>
              <input type="datetime-local" value={customTo} onChange={e => setCustomTo(e.target.value)}
                className="text-xs border rounded px-2 py-1" data-testid="mes-custom-to" />
              <button onClick={loadHistory} className="px-2 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700"
                data-testid="mes-custom-apply">
                <RefreshCw className="h-3 w-3" />
              </button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <div className="text-center py-12 text-gray-400" data-testid="mes-chart-empty">Pas de donnees pour cette periode</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: '8px' }} />
                <ReferenceLine y={machine.theoretical_cadence} stroke="#a78bfa" strokeDasharray="5 5" label="Theorique" />
                <Line type="monotone" dataKey="cadence" stroke="#6366f1" strokeWidth={2} dot={false} name="Cadence reelle" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Settings Modal */}
      {editing && <MachineSettingsModal machine={machine} onClose={() => { setEditing(false); loadMachine(); loadMetrics(); }} />}
    </div>
  );
};

// ==================== SETTINGS FIELD (outside component to prevent re-render) ====================
const SettingsField = ({ label, field, type = 'number', unit = '', value, onChange, readOnly = false }) => (
  <div>
    <label className="text-xs font-medium text-gray-600">{label} {unit && <span className="text-gray-400">({unit})</span>}</label>
    <input type={type} value={value}
      onChange={onChange} readOnly={readOnly} disabled={readOnly}
      className={`w-full mt-1 px-3 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${readOnly ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : ''}`}
      data-testid={`mes-setting-${field}`} />
  </div>
);

// ==================== SETTINGS MODAL (with Product References) ====================
const MachineSettingsModal = ({ machine, onClose }) => {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isAdmin = user.role === 'ADMIN';
  const schedule = machine.production_schedule || {};
  const emailNotif = machine.email_notifications || {};
  // Fermeture avec Echap (composant toujours ouvert quand monté)
  useEscapeToClose(true, onClose);

  const buildFormFromSource = (src) => ({
    theoretical_cadence: src.theoretical_cadence || 6,
    downtime_margin_pct: src.downtime_margin_pct || 30,
    trs_target: src.trs_target ?? 85,
    sensor_ip: machine.sensor_ip || '',
    mqtt_topic: machine.mqtt_topic || '',
    mqtt_topic_state: machine.mqtt_topic_state || '',
    type: machine.type || 'Imp',
    equipment_id: machine.equipment_id || '',
    sub_equipment_id: machine.sub_equipment_id || '',
    alert_stopped_minutes: (src.alerts || src)?.alert_stopped_minutes ?? src.alerts?.stopped_minutes ?? 5,
    alert_under_cadence: (src.alerts || src)?.alert_under_cadence ?? src.alerts?.under_cadence ?? 0,
    alert_over_cadence: (src.alerts || src)?.alert_over_cadence ?? src.alerts?.over_cadence ?? 0,
    alert_daily_target: (src.alerts || src)?.alert_daily_target ?? src.alerts?.daily_target ?? 0,
    alert_no_signal_minutes: (src.alerts || src)?.alert_no_signal_minutes ?? src.alerts?.no_signal_minutes ?? 10,
    schedule_is_24h: (src.production_schedule || src)?.schedule_is_24h ?? (src.production_schedule || schedule)?.is_24h ?? true,
    schedule_start_hour: (src.production_schedule || src)?.schedule_start_hour ?? (src.production_schedule || schedule)?.start_hour ?? 6,
    schedule_end_hour: (src.production_schedule || src)?.schedule_end_hour ?? (src.production_schedule || schedule)?.end_hour ?? 22,
    schedule_production_days: (src.production_schedule || schedule)?.production_days ?? [0, 1, 2, 3, 4],
    email_enabled: (src.email_notifications || emailNotif)?.enabled ?? false,
    email_recipients: (src.email_notifications || emailNotif)?.recipients ?? [],
    email_alert_types: (src.email_notifications || emailNotif)?.alert_types ?? [],
    email_delay_minutes: (src.email_notifications || emailNotif)?.delay_minutes ?? 5,
  });

  const [form, setForm] = useState(buildFormFromSource(machine));
  const [newEmail, setNewEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [references, setReferences] = useState([]);
  const [selectedRefId, setSelectedRefId] = useState(machine.active_reference_id || '');
  const [confirmDialog, setConfirmDialog] = useState(null); // {type, title, message, onConfirm}
  const [refNameInput, setRefNameInput] = useState('');
  const [equipments, setEquipments] = useState([]);
  const [childEquipments, setChildEquipments] = useState([]);
  const [loadingChildren, setLoadingChildren] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    axios.get(`${API}/api/mes/product-references`, { headers: getHeaders() })
      .then(r => setReferences(r.data))
      .catch(() => {});
    axios.get(`${API}/api/equipments`, { headers: getHeaders() })
      .then(r => {
        const list = Array.isArray(r.data) ? r.data : r.data.data || [];
        setEquipments(list.filter(eq => !eq.parent_id));
      })
      .catch(() => {});
    // Charger les sous-équipements si un parent est déjà sélectionné
    if (form.equipment_id) {
      axios.get(`${API}/api/equipments/${form.equipment_id}/children`, { headers: getHeaders() })
        .then(r => setChildEquipments(Array.isArray(r.data) ? r.data : (r.data.children || [])))
        .catch(() => {});
    }
  }, []);

  const handleParentChange = async (eqId) => {
    setForm(f => ({ ...f, equipment_id: eqId, sub_equipment_id: '' }));
    setChildEquipments([]);
    if (!eqId) return;
    const eq = equipments.find(e => e.id === eqId);
    if (!eq?.hasChildren) return;
    setLoadingChildren(true);
    try {
      const { data } = await axios.get(`${API}/api/equipments/${eqId}/children`, { headers: getHeaders() });
      setChildEquipments(Array.isArray(data) ? data : (data.children || []));
    } catch {
      setChildEquipments([]);
    } finally {
      setLoadingChildren(false);
    }
  };

  const handleRefSelect = async (refId) => {
    if (!refId) return;
    setSelectedRefId(refId);
    try {
      const { data } = await axios.post(`${API}/api/mes/machines/${machine.id}/select-reference`,
        { reference_id: refId }, { headers: getHeaders() });
      const ref = references.find(r => r.id === refId);
      if (ref) {
        setForm(prev => ({
          ...prev,
          theoretical_cadence: ref.theoretical_cadence || prev.theoretical_cadence,
          downtime_margin_pct: ref.downtime_margin_pct || prev.downtime_margin_pct,
          trs_target: ref.trs_target ?? prev.trs_target,
          alert_stopped_minutes: ref.alerts?.stopped_minutes ?? prev.alert_stopped_minutes,
          alert_under_cadence: ref.alerts?.under_cadence ?? prev.alert_under_cadence,
          alert_over_cadence: ref.alerts?.over_cadence ?? prev.alert_over_cadence,
          alert_daily_target: ref.alerts?.daily_target ?? prev.alert_daily_target,
          alert_no_signal_minutes: ref.alerts?.no_signal_minutes ?? prev.alert_no_signal_minutes,
          schedule_is_24h: ref.production_schedule?.is_24h ?? prev.schedule_is_24h,
          schedule_start_hour: ref.production_schedule?.start_hour ?? prev.schedule_start_hour,
          schedule_end_hour: ref.production_schedule?.end_hour ?? prev.schedule_end_hour,
          schedule_production_days: ref.production_schedule?.production_days ?? prev.schedule_production_days,
          email_enabled: ref.email_notifications?.enabled ?? prev.email_enabled,
          email_recipients: ref.email_notifications?.recipients ?? prev.email_recipients,
          email_alert_types: ref.email_notifications?.alert_types ?? prev.email_alert_types,
          email_delay_minutes: ref.email_notifications?.delay_minutes ?? prev.email_delay_minutes,
        }));
      }
      toast({ title: 'Reference appliquee' });
    } catch { toast({ title: 'Erreur', variant: 'destructive' }); }
  };

  const saveAsNewRef = () => {
    setRefNameInput('');
    setConfirmDialog({
      type: 'create',
      title: 'Nouvelle reference produite',
      message: 'Entrez le nom de la nouvelle reference. Les parametres actuels seront sauvegardes.',
      onConfirm: async (name) => {
        try {
          const payload = { name, ...form };
          const { data } = await axios.post(`${API}/api/mes/product-references`, payload, { headers: getHeaders() });
          setReferences(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
          setSelectedRefId(data.id);
          await axios.post(`${API}/api/mes/machines/${machine.id}/select-reference`,
            { reference_id: data.id }, { headers: getHeaders() });
          toast({ title: 'Reference creee et appliquee' });
        } catch { toast({ title: 'Erreur', variant: 'destructive' }); }
        setConfirmDialog(null);
      }
    });
  };

  const updateCurrentRef = () => {
    if (!selectedRefId) return;
    const ref = references.find(r => r.id === selectedRefId);
    setConfirmDialog({
      type: 'confirm',
      title: 'Modifier la reference',
      message: `Voulez-vous mettre a jour la reference "${ref?.name}" avec les parametres actuels ? Cela affectera toutes les machines utilisant cette reference.`,
      onConfirm: async () => {
        try {
          const { data } = await axios.put(`${API}/api/mes/product-references/${selectedRefId}`, form, { headers: getHeaders() });
          setReferences(prev => prev.map(r => r.id === selectedRefId ? data : r));
          toast({ title: 'Reference mise a jour' });
        } catch { toast({ title: 'Erreur', variant: 'destructive' }); }
        setConfirmDialog(null);
      }
    });
  };

  const deleteCurrentRef = () => {
    if (!selectedRefId) return;
    const ref = references.find(r => r.id === selectedRefId);
    setConfirmDialog({
      type: 'confirm',
      title: 'Supprimer la reference',
      message: `Etes-vous sur de vouloir supprimer la reference "${ref?.name}" ? Les machines utilisant cette reference seront deliees.`,
      onConfirm: async () => {
        try {
          await axios.delete(`${API}/api/mes/product-references/${selectedRefId}`, { headers: getHeaders() });
          setReferences(prev => prev.filter(r => r.id !== selectedRefId));
          setSelectedRefId('');
          toast({ title: 'Reference supprimee' });
        } catch { toast({ title: 'Erreur', variant: 'destructive' }); }
        setConfirmDialog(null);
      }
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await axios.put(`${API}/api/mes/machines/${machine.id}`, form, { headers: getHeaders() });
      toast({ title: 'Parametres sauvegardes' });
      onClose();
    } catch (err) { toast({ title: err.response?.data?.detail || 'Erreur', variant: 'destructive' }); }
    setSaving(false);
  };

  const handleChange = (field, type) => (e) => {
    const val = type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value;
    setForm(prev => ({ ...prev, [field]: val }));
  };

  const readOnly = !isAdmin;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" data-testid="mes-settings-modal">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[85vh] overflow-y-auto">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h3 className="text-lg font-semibold">Parametres machine</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>
        <div className="px-6 py-4 space-y-4">
          {/* Reference Selector */}
          <div className="space-y-2 p-3 bg-indigo-50/50 border border-indigo-100 rounded-lg" data-testid="reference-selector-section">
            <label className="text-xs font-semibold text-gray-700">Reference Produite</label>
            <select value={selectedRefId}
              onChange={e => handleRefSelect(e.target.value)}
              className="w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-indigo-500"
              data-testid="reference-select">
              <option value="">-- Aucune reference --</option>
              {references.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            {isAdmin && (
              <div className="flex gap-2 mt-1">
                <button onClick={saveAsNewRef} data-testid="new-reference-btn"
                  className="px-2.5 py-1 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-1">
                  <Plus className="h-3 w-3" /> Nouvelle
                </button>
                {selectedRefId && (
                  <>
                    <button onClick={updateCurrentRef} data-testid="update-reference-btn"
                      className="px-2.5 py-1 text-xs bg-amber-500 text-white rounded-lg hover:bg-amber-600 flex items-center gap-1">
                      <Settings className="h-3 w-3" /> Modifier
                    </button>
                    <button onClick={deleteCurrentRef} data-testid="delete-reference-btn"
                      className="px-2.5 py-1 text-xs bg-red-500 text-white rounded-lg hover:bg-red-600 flex items-center gap-1">
                      <Trash2 className="h-3 w-3" /> Supprimer
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Production */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-gray-700 border-b pb-1">Production</h4>
            <div className="grid grid-cols-2 gap-3">
              <SettingsField label="Cadence theorique" field="theoretical_cadence" unit="cp/min"
                value={form.theoretical_cadence} onChange={handleChange('theoretical_cadence', 'number')} readOnly={readOnly} />
              <SettingsField label="Marge arret" field="downtime_margin_pct" unit="%"
                value={form.downtime_margin_pct} onChange={handleChange('downtime_margin_pct', 'number')} readOnly={readOnly} />
              <SettingsField label="Objectif TRS" field="trs_target" unit="%"
                value={form.trs_target} onChange={handleChange('trs_target', 'number')} readOnly={readOnly} />
            </div>
          </div>

          {/* Equipement */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-gray-700 border-b pb-1">Equipement</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Equipement parent *</label>
                <select value={form.equipment_id}
                  onChange={e => handleParentChange(e.target.value)}
                  disabled={readOnly}
                  className={`w-full mt-1 px-3 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-indigo-500 ${readOnly ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : ''}`}
                  data-testid="mes-setting-equipment-parent">
                  <option value="">Selectionner...</option>
                  {equipments.map(eq => <option key={eq.id} value={eq.id}>{eq.nom}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Sous-equipement <span className="text-gray-400 font-normal text-xs">(optionnel)</span></label>
                <select value={form.sub_equipment_id || ''}
                  onChange={e => setForm(prev => ({ ...prev, sub_equipment_id: e.target.value }))}
                  disabled={readOnly || !form.equipment_id || childEquipments.length === 0}
                  className={`w-full mt-1 px-3 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400`}
                  data-testid="mes-setting-sub-equipment">
                  <option value="">
                    {!form.equipment_id ? 'Sélectionnez d\'abord un équipement' :
                     loadingChildren ? 'Chargement...' :
                     childEquipments.length === 0 ? 'Aucun sous-équipement' :
                     '-- Aucun sous-équipement --'}
                  </option>
                  {childEquipments.map(child => <option key={child.id} value={child.id}>{child.nom}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Capteur */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-gray-700 border-b pb-1">Capteur</h4>
            <div className="grid grid-cols-2 gap-3">
              <SettingsField label="Topic MQTT" field="mqtt_topic" type="text"
                value={form.mqtt_topic} onChange={handleChange('mqtt_topic', 'text')} readOnly={readOnly} />
              <div>
                <label className="text-xs font-medium text-gray-600">Type</label>
                <select value={form.type || 'Imp'}
                  onChange={e => setForm(prev => ({ ...prev, type: e.target.value, mqtt_topic_state: e.target.value === 'Imp' ? '' : prev.mqtt_topic_state }))}
                  disabled={readOnly}
                  className={`w-full mt-1 px-3 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-indigo-500 ${readOnly ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : ''}`}
                  data-testid="mes-setting-type">
                  <option value="Imp">Imp (impulsion 1/0)</option>
                  <option value="cp/min">cp/min (cadence directe)</option>
                </select>
              </div>
            </div>
            {form.type === 'cp/min' && (
              <SettingsField label="Topic etat (ACTIVE/IDLE)" field="mqtt_topic_state" type="text"
                value={form.mqtt_topic_state} onChange={handleChange('mqtt_topic_state', 'text')} readOnly={readOnly} />
            )}
            <SettingsField label="Adresse IP capteur" field="sensor_ip" type="text"
              value={form.sensor_ip} onChange={handleChange('sensor_ip', 'text')} readOnly={readOnly} />
          </div>

          {/* Planning */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-gray-700 border-b pb-1">Planning de production</h4>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.schedule_is_24h} disabled={readOnly}
                onChange={e => setForm(prev => ({ ...prev, schedule_is_24h: e.target.checked }))}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                data-testid="mes-setting-schedule-24h" />
              <span className="text-xs text-gray-700">Production 24h/24</span>
            </label>
            {!form.schedule_is_24h && (
              <div className="grid grid-cols-2 gap-3">
                <SettingsField label="Debut production" field="schedule_start_hour" unit="h (0-23)"
                  value={form.schedule_start_hour} onChange={handleChange('schedule_start_hour', 'number')} readOnly={readOnly} />
                <SettingsField label="Fin production" field="schedule_end_hour" unit="h (0-23)"
                  value={form.schedule_end_hour} onChange={handleChange('schedule_end_hour', 'number')} readOnly={readOnly} />
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Jours de production</label>
              <div className="flex flex-wrap gap-1.5">
                {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((day, idx) => (
                  <button key={idx} type="button" disabled={readOnly}
                    className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                      form.schedule_production_days.includes(idx)
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-indigo-300'
                    } ${readOnly ? 'opacity-70 cursor-not-allowed' : ''}`}
                    data-testid={`mes-setting-day-${idx}`}
                    onClick={() => {
                      if (readOnly) return;
                      setForm(prev => ({
                        ...prev,
                        schedule_production_days: prev.schedule_production_days.includes(idx)
                          ? prev.schedule_production_days.filter(d => d !== idx)
                          : [...prev.schedule_production_days, idx].sort()
                      }));
                    }}>
                    {day}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Alertes */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-gray-700 border-b pb-1">Alertes</h4>
            <div className="grid grid-cols-2 gap-3">
              <SettingsField label="Arret machine" field="alert_stopped_minutes" unit="min"
                value={form.alert_stopped_minutes} onChange={handleChange('alert_stopped_minutes', 'number')} readOnly={readOnly} />
              <SettingsField label="Perte signal" field="alert_no_signal_minutes" unit="min"
                value={form.alert_no_signal_minutes} onChange={handleChange('alert_no_signal_minutes', 'number')} readOnly={readOnly} />
              <SettingsField label="Sous-cadence" field="alert_under_cadence" unit="cp/min"
                value={form.alert_under_cadence} onChange={handleChange('alert_under_cadence', 'number')} readOnly={readOnly} />
              <SettingsField label="Sur-cadence" field="alert_over_cadence" unit="cp/min"
                value={form.alert_over_cadence} onChange={handleChange('alert_over_cadence', 'number')} readOnly={readOnly} />
              <SettingsField label="Objectif journalier" field="alert_daily_target" unit="coups"
                value={form.alert_daily_target} onChange={handleChange('alert_daily_target', 'number')} readOnly={readOnly} />
            </div>
          </div>

          {/* Email notifications */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-gray-700 border-b pb-1 flex items-center gap-2">
              <Mail className="h-4 w-4" /> Notifications email
            </h4>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.email_enabled} disabled={readOnly}
                onChange={e => setForm(prev => ({ ...prev, email_enabled: e.target.checked }))}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                data-testid="mes-setting-email-enabled" />
              <span className="text-xs text-gray-700">Activer les notifications email</span>
            </label>
            {form.email_enabled && (
              <>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Destinataires</label>
                  {isAdmin && (
                    <div className="flex gap-2 mb-1">
                      <input type="email" value={newEmail} placeholder="email@exemple.com"
                        onChange={e => setNewEmail(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && newEmail.trim()) {
                            e.preventDefault();
                            setForm(prev => ({ ...prev, email_recipients: [...prev.email_recipients, newEmail.trim()] }));
                            setNewEmail('');
                          }
                        }}
                        className="flex-1 px-2 py-1 text-xs border rounded-lg"
                        data-testid="mes-email-recipient-input" />
                      <button type="button" onClick={() => {
                        if (newEmail.trim()) {
                          setForm(prev => ({ ...prev, email_recipients: [...prev.email_recipients, newEmail.trim()] }));
                          setNewEmail('');
                        }
                      }} className="px-2 py-1 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                        data-testid="mes-add-email-btn">
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {form.email_recipients.map((email, idx) => (
                      <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs rounded-full"
                        data-testid={`mes-email-chip-${idx}`}>
                        {email}
                        {isAdmin && (
                          <button type="button" onClick={() => setForm(prev => ({
                            ...prev, email_recipients: prev.email_recipients.filter((_, i) => i !== idx)
                          }))} className="text-indigo-400 hover:text-red-500">
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Types d'alertes a notifier</label>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { key: 'STOPPED', label: 'Arret machine' },
                      { key: 'UNDER_CADENCE', label: 'Sous-cadence' },
                      { key: 'OVER_CADENCE', label: 'Sur-cadence' },
                      { key: 'NO_SIGNAL', label: 'Perte signal' },
                      { key: 'TARGET_REACHED', label: 'Objectif atteint' },
                      { key: 'TRS_BELOW_TARGET', label: 'TRS sous objectif' },
                    ].map(at => (
                      <button key={at.key} type="button" disabled={readOnly}
                        className={`px-2 py-1 text-xs rounded-lg border transition-colors ${
                          form.email_alert_types.includes(at.key)
                            ? 'bg-red-600 text-white border-red-600'
                            : 'bg-white text-gray-500 border-gray-200 hover:border-red-300'
                        } ${readOnly ? 'opacity-70 cursor-not-allowed' : ''}`}
                        data-testid={`mes-email-alert-${at.key}`}
                        onClick={() => {
                          if (readOnly) return;
                          setForm(prev => ({
                            ...prev,
                            email_alert_types: prev.email_alert_types.includes(at.key)
                              ? prev.email_alert_types.filter(t => t !== at.key)
                              : [...prev.email_alert_types, at.key]
                          }));
                        }}>
                        {at.label}
                      </button>
                    ))}
                  </div>
                </div>
                <SettingsField label="Delai entre alertes email" field="email_delay_minutes" unit="min"
                  value={form.email_delay_minutes} onChange={handleChange('email_delay_minutes', 'number')} readOnly={readOnly} />
              </>
            )}
          </div>
        </div>
        <div className="px-6 py-4 border-t flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">
            {readOnly ? 'Fermer' : 'Annuler'}
          </button>
          {isAdmin && (
            <button onClick={save} disabled={saving} data-testid="mes-save-settings"
              className="px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Sauvegarder
            </button>
          )}
        </div>
      </div>

      {/* Confirmation Dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full mx-4 p-6" data-testid="confirm-dialog">
            <h4 className="text-base font-semibold mb-2">{confirmDialog.title}</h4>
            <p className="text-sm text-gray-600 mb-4">{confirmDialog.message}</p>
            {confirmDialog.type === 'create' && (
              <input type="text" value={refNameInput} placeholder="Nom de la reference..."
                onChange={e => setRefNameInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && refNameInput.trim() && confirmDialog.onConfirm(refNameInput.trim())}
                className="w-full px-3 py-2 text-sm border rounded-lg mb-4 focus:ring-2 focus:ring-indigo-500"
                data-testid="ref-name-input" autoFocus />
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDialog(null)}
                className="px-3 py-1.5 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">Annuler</button>
              <button onClick={() => {
                  if (confirmDialog.type === 'create') {
                    if (refNameInput.trim()) confirmDialog.onConfirm(refNameInput.trim());
                  } else {
                    confirmDialog.onConfirm();
                  }
                }}
                className="px-3 py-1.5 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
                data-testid="confirm-dialog-ok">Confirmer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ==================== CREATE MODAL ====================
const CreateMachineModal = ({ onClose, onCreated }) => {
  // Fermeture avec Echap (composant toujours ouvert quand monté)
  useEscapeToClose(true, onClose);
  const [equipments, setEquipments] = useState([]);
  const [childEquipments, setChildEquipments] = useState([]);
  const [loadingChildren, setLoadingChildren] = useState(false);
  const [form, setForm] = useState({
    equipment_id: '', sub_equipment_id: '',
    mqtt_topic: '', mqtt_topic_state: '', type: 'Imp',
    sensor_ip: '', theoretical_cadence: 6,
    downtime_margin_pct: 30, alert_stopped_minutes: 5, alert_no_signal_minutes: 10,
    alert_under_cadence: 0, alert_over_cadence: 0, alert_daily_target: 0,
    schedule_is_24h: true, schedule_start_hour: 6, schedule_end_hour: 22,
    schedule_production_days: [0, 1, 2, 3, 4],
  });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    axios.get(`${API}/api/equipments`, { headers: getHeaders() })
      .then(r => {
        const list = Array.isArray(r.data) ? r.data : r.data.data || [];
        // On ne garde que les équipements parents (sans parent_id)
        setEquipments(list.filter(eq => !eq.parent_id));
      })
      .catch(() => {});
  }, []);

  const loadChildren = async (parentId) => {
    setLoadingChildren(true);
    try {
      const { data } = await axios.get(`${API}/api/equipments/${parentId}/children`, { headers: getHeaders() });
      setChildEquipments(Array.isArray(data) ? data : (data.children || []));
    } catch {
      setChildEquipments([]);
    } finally {
      setLoadingChildren(false);
    }
  };

  const handleParentChange = (eqId) => {
    setForm(f => ({ ...f, equipment_id: eqId, sub_equipment_id: '' }));
    setChildEquipments([]);
    if (eqId) {
      const eq = equipments.find(e => e.id === eqId);
      if (eq?.hasChildren) loadChildren(eqId);
    }
  };

  const save = async () => {
    if (!form.equipment_id || !form.mqtt_topic) {
      toast({ title: 'Veuillez remplir les champs obligatoires', variant: 'destructive' });
      return;
    }
    if (form.type === 'cp/min' && !form.mqtt_topic_state) {
      toast({ title: 'Le topic d\'état est obligatoire pour cp/min', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await axios.post(`${API}/api/mes/machines`, form, { headers: getHeaders() });
      toast({ title: 'Machine ajoutee' });
      onCreated();
    } catch (e) { toast({ title: 'Erreur', description: e.response?.data?.detail, variant: 'destructive' }); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" data-testid="mes-create-modal">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[85vh] overflow-y-auto">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h3 className="text-lg font-semibold">Ajouter une machine M.E.S</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>
        <div className="px-6 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600">Equipement parent *</label>
              <select value={form.equipment_id} onChange={e => handleParentChange(e.target.value)}
                className="w-full mt-1 px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-indigo-500" data-testid="mes-select-equipment">
                <option value="">Selectionner un equipement</option>
                {equipments.map(eq => <option key={eq.id} value={eq.id}>{eq.nom}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Sous-equipement <span className="text-gray-400 font-normal text-xs">(optionnel)</span></label>
              <select value={form.sub_equipment_id}
                onChange={e => setForm({ ...form, sub_equipment_id: e.target.value })}
                disabled={!form.equipment_id || childEquipments.length === 0}
                className="w-full mt-1 px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400"
                data-testid="mes-select-sub-equipment">
                <option value="">
                  {!form.equipment_id ? 'Sélectionnez d\'abord un équipement' :
                   loadingChildren ? 'Chargement...' :
                   childEquipments.length === 0 ? 'Aucun sous-équipement' :
                   '-- Aucun sous-équipement --'}
                </option>
                {childEquipments.map(child => <option key={child.id} value={child.id}>{child.nom}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600">Topic MQTT *</label>
              <input type="text" value={form.mqtt_topic} placeholder="factory/machine1/pulse"
                onChange={e => setForm({ ...form, mqtt_topic: e.target.value })}
                className="w-full mt-1 px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-indigo-500"
                data-testid="mes-input-mqtt-topic" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Type *</label>
              <select value={form.type}
                onChange={e => setForm({ ...form, type: e.target.value, mqtt_topic_state: e.target.value === 'Imp' ? '' : form.mqtt_topic_state })}
                className="w-full mt-1 px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-indigo-500"
                data-testid="mes-select-type">
                <option value="Imp">Imp (impulsion 1/0)</option>
                <option value="cp/min">cp/min (cadence directe)</option>
              </select>
            </div>
          </div>
          {form.type === 'cp/min' && (
            <div>
              <label className="text-xs font-medium text-gray-600">Topic etat (ACTIVE/IDLE) *</label>
              <input type="text" value={form.mqtt_topic_state} placeholder="factory/machine1/state"
                onChange={e => setForm({ ...form, mqtt_topic_state: e.target.value })}
                className="w-full mt-1 px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-indigo-500"
                data-testid="mes-input-mqtt-topic-state" />
              <p className="text-xs text-gray-500 mt-1">Topic MQTT séparé recevant "ACTIVE" ou "IDLE"</p>
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-gray-600">IP capteur</label>
            <input type="text" value={form.sensor_ip} placeholder="192.168.1.100"
              onChange={e => setForm({ ...form, sensor_ip: e.target.value })}
              className="w-full mt-1 px-3 py-2 text-sm border rounded-lg"
              data-testid="mes-input-sensor-ip" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600">Cadence theorique (cp/min)</label>
              <input type="number" value={form.theoretical_cadence}
                onChange={e => setForm({ ...form, theoretical_cadence: parseFloat(e.target.value) || 0 })}
                className="w-full mt-1 px-3 py-2 text-sm border rounded-lg"
                data-testid="mes-input-theoretical" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Marge arret (%)</label>
              <input type="number" value={form.downtime_margin_pct}
                onChange={e => setForm({ ...form, downtime_margin_pct: parseFloat(e.target.value) || 0 })}
                className="w-full mt-1 px-3 py-2 text-sm border rounded-lg"
                data-testid="mes-input-margin" />
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">Annuler</button>
          <button onClick={save} disabled={saving} data-testid="mes-create-submit"
            className="px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Creer
          </button>
        </div>
      </div>
    </div>
  );
};

// ==================== MAIN PAGE ====================
const MESPage = () => {
  const [machines, setMachines] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showRetention, setShowRetention] = useState(false);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const loadMachines = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/api/mes/machines`, { headers: getHeaders() });
      setMachines(data);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadMachines(); }, [loadMachines]);

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer cette machine et toutes ses donnees ?')) return;
    try {
      await axios.delete(`${API}/api/mes/machines/${id}`, { headers: getHeaders() });
      toast({ title: 'Machine supprimee' });
      loadMachines();
      if (selectedId === id) setSelectedId(null);
    } catch { toast({ title: 'Erreur', variant: 'destructive' }); }
  };

  if (selectedId) {
    return <MachineDashboard machineId={selectedId} onBack={() => { setSelectedId(null); loadMachines(); }} />;
  }

  return (
    <>
      <MachineList machines={machines} onSelect={setSelectedId} onCreate={() => setShowCreate(true)}
        onDelete={handleDelete} loading={loading}
        onOpenRetention={() => setShowRetention(true)} />
      {showCreate && <CreateMachineModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); loadMachines(); }} />}
      {showRetention && <RetentionModal onClose={() => setShowRetention(false)} />}
    </>
  );
};

export default MESPage;
