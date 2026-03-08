import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ClipboardList, History, BarChart3, PlusCircle, AlertTriangle, Calendar,
  MapPin, Wrench, Activity, ChevronRight, ArrowLeft, QrCode, Lock,
  CheckCircle2, XCircle, Clock, AlertCircle, Sparkles, RefreshCw
} from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const iconMap = {
  ClipboardList, History, BarChart3, PlusCircle, AlertTriangle, Calendar,
  MapPin, Wrench, Activity, QrCode, Lock, CheckCircle2, XCircle, Clock, AlertCircle, Sparkles
};

const statusColors = {
  EN_SERVICE: 'bg-emerald-100 text-emerald-700',
  HORS_SERVICE: 'bg-red-100 text-red-700',
  EN_MAINTENANCE: 'bg-amber-100 text-amber-700',
  EN_ATTENTE_PIECE: 'bg-blue-100 text-blue-700',
};

const statusLabels = {
  EN_SERVICE: 'En service',
  HORS_SERVICE: 'Hors service',
  EN_MAINTENANCE: 'En maintenance',
  EN_ATTENTE_PIECE: 'En attente piece',
};

const priorityColors = {
  HAUTE: 'text-red-600',
  MOYENNE: 'text-amber-600',
  BASSE: 'text-blue-600',
  CRITIQUE: 'text-red-800 font-bold',
};

const woStatusColors = {
  OUVERT: 'bg-blue-100 text-blue-700',
  EN_COURS: 'bg-amber-100 text-amber-700',
  TERMINE: 'bg-emerald-100 text-emerald-700',
  ANNULE: 'bg-gray-100 text-gray-500',
};

const fetchPublic = async (url) => {
  const res = await fetch(`${API_URL}/api/qr/public${url}`);
  if (!res.ok) throw new Error('Not found');
  return res.json();
};

const QREquipmentPage = () => {
  const { equipmentId } = useParams();
  const navigate = useNavigate();
  const [equipment, setEquipment] = useState(null);
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activePanel, setActivePanel] = useState(null);
  const [panelData, setPanelData] = useState(null);
  const [panelLoading, setPanelLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);

  useEffect(() => {
    loadData();
  }, [equipmentId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [eq, acts] = await Promise.all([
        fetchPublic(`/equipment/${equipmentId}`),
        fetchPublic('/actions')
      ]);
      setEquipment(eq);
      setActions(acts);
    } catch {
      setError('Equipement non trouve');
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (action) => {
    if (action.requires_auth) {
      const token = localStorage.getItem('token');
      if (!token) {
        navigate(`/login?redirect=/qr/${equipmentId}&action=${action.id}`);
        return;
      }
    }

    const actionHandlers = {
      'last-wo': () => loadPanel('last-wo', `/equipment/${equipmentId}/last-wo`),
      'wo-history': () => loadPanel('wo-history', `/equipment/${equipmentId}/wo-history`),
      'kpi': () => loadPanel('kpi', `/equipment/${equipmentId}/kpi`),
      'preventive-plan': () => loadPanel('preventive-plan', `/equipment/${equipmentId}/preventive`),
      'create-intervention': () => navigate(`/intervention-requests?equipment=${equipmentId}`),
      'report-breakdown': () => navigate(`/work-orders?createForEquipment=${equipmentId}`),
      'create-presquaccident': () => navigate(`/presqu-accident?createForEquipment=${equipmentId}`),
    };

    const handler = actionHandlers[action.id];
    if (handler) handler();
  };

  const loadPanel = async (panelId, url) => {
    if (activePanel === panelId) {
      setActivePanel(null);
      return;
    }
    setPanelLoading(true);
    setActivePanel(panelId);
    try {
      const data = await fetchPublic(url);
      setPanelData(data);
    } catch {
      setPanelData(null);
    } finally {
      setPanelLoading(false);
    }
  };

  const generateAiSummary = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const data = await fetchPublic(`/equipment/${equipmentId}/ai-summary`);
      setAiSummary(data);
    } catch (err) {
      setAiError("Impossible de generer le resume IA. Reessayez plus tard.");
    } finally {
      setAiLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <QrCode size={48} className="text-gray-300 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-800 mb-2">Equipement introuvable</h1>
          <p className="text-gray-500">Ce QR code ne correspond a aucun equipement.</p>
        </div>
      </div>
    );
  }

  const IconComponent = ({ name, size = 20, className = '' }) => {
    const Icon = iconMap[name];
    return Icon ? <Icon size={size} className={className} /> : null;
  };

  return (
    <div className="min-h-screen bg-gray-50" data-testid="qr-equipment-page">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-lg mx-auto px-4 py-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <QrCode size={16} />
            <span>FSAO Iris — Fiche rapide</span>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* Equipment Card */}
        <div className="bg-white rounded-xl shadow-sm border p-5" data-testid="qr-equipment-info">
          <div className="flex items-start gap-4">
            {equipment.photo ? (
              <img src={`${API_URL}/api${equipment.photo}`} alt={equipment.nom} className="w-16 h-16 rounded-lg object-cover border" />
            ) : (
              <div className="w-16 h-16 rounded-lg bg-blue-50 flex items-center justify-center">
                <Wrench size={28} className="text-blue-400" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold text-gray-900 truncate">{equipment.nom}</h1>
              {equipment.type && <p className="text-sm text-gray-500">{equipment.type}</p>}
              {(equipment.marque || equipment.modele) && (
                <p className="text-xs text-gray-400 mt-0.5">
                  {[equipment.marque, equipment.modele].filter(Boolean).join(' — ')}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 mt-4 pt-3 border-t">
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[equipment.statut] || 'bg-gray-100 text-gray-600'}`}>
              {statusLabels[equipment.statut] || equipment.statut}
            </span>
            {equipment.emplacement && (
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <MapPin size={13} />
                {equipment.emplacement}
              </span>
            )}
            {equipment.numero_serie && (
              <span className="text-xs text-gray-400">S/N: {equipment.numero_serie}</span>
            )}
          </div>
        </div>

        {/* AI Summary Section */}
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden" data-testid="qr-ai-section">
          <button
            onClick={aiSummary ? () => setAiSummary(null) : generateAiSummary}
            disabled={aiLoading}
            className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-indigo-50"
            data-testid="qr-ai-trigger"
          >
            <div className={`p-2 rounded-lg ${aiSummary ? 'bg-indigo-100' : 'bg-gradient-to-br from-indigo-100 to-purple-100'}`}>
              {aiLoading ? (
                <RefreshCw size={18} className="text-indigo-600 animate-spin" />
              ) : (
                <Sparkles size={18} className="text-indigo-600" />
              )}
            </div>
            <div className="flex-1">
              <span className="text-sm font-semibold text-indigo-700">Analyse IA</span>
              <p className="text-xs text-gray-400">
                {aiLoading ? 'Analyse en cours...' : aiSummary ? 'Cliquer pour fermer' : 'Etat, historique et recommandations'}
              </p>
            </div>
            <ChevronRight size={16} className={`text-gray-400 transition-transform ${aiSummary ? 'rotate-90' : ''}`} />
          </button>

          {aiLoading && (
            <div className="px-4 pb-4" data-testid="qr-ai-loading">
              <div className="bg-indigo-50 rounded-lg p-4 space-y-2">
                <div className="h-3 bg-indigo-200/60 rounded animate-pulse w-3/4" />
                <div className="h-3 bg-indigo-200/60 rounded animate-pulse w-full" />
                <div className="h-3 bg-indigo-200/60 rounded animate-pulse w-5/6" />
                <div className="h-3 bg-indigo-200/60 rounded animate-pulse w-2/3" />
                <p className="text-xs text-indigo-400 pt-1">L'IA analyse les donnees de l'equipement...</p>
              </div>
            </div>
          )}

          {aiError && (
            <div className="px-4 pb-4" data-testid="qr-ai-error">
              <div className="bg-red-50 border border-red-100 rounded-lg p-3 flex items-start gap-2">
                <AlertCircle size={16} className="text-red-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm text-red-600">{aiError}</p>
                  <button onClick={generateAiSummary} className="text-xs text-red-500 underline mt-1" data-testid="qr-ai-retry">Reessayer</button>
                </div>
              </div>
            </div>
          )}

          {aiSummary && !aiLoading && (
            <div className="px-4 pb-4" data-testid="qr-ai-summary">
              <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg p-4 border border-indigo-100">
                {/* Mini KPI bar */}
                {aiSummary.data && (
                  <div className="flex gap-2 mb-3 pb-3 border-b border-indigo-100">
                    <KpiChip label="OT total" value={aiSummary.data.total_work_orders} />
                    <KpiChip label="OT ouverts" value={aiSummary.data.open_work_orders} color="amber" />
                    <KpiChip label="Preventifs" value={aiSummary.data.preventive_plans} color="blue" />
                    {aiSummary.data.active_loto > 0 && (
                      <KpiChip label="LOTO" value={aiSummary.data.active_loto} color="red" />
                    )}
                  </div>
                )}
                {/* AI Text */}
                <div className="prose prose-sm max-w-none text-gray-700 ai-summary-content" data-testid="qr-ai-text">
                  <AiFormattedText text={aiSummary.summary} />
                </div>
                {/* Footer */}
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-indigo-100">
                  <span className="text-xs text-indigo-400">
                    {aiSummary.provider && `${aiSummary.provider}/`}{aiSummary.model} — {new Date(aiSummary.generated_at).toLocaleString('fr-FR')}
                  </span>
                  <button
                    onClick={generateAiSummary}
                    className="text-xs text-indigo-500 hover:text-indigo-700 flex items-center gap-1"
                    data-testid="qr-ai-refresh"
                  >
                    <RefreshCw size={12} /> Actualiser
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-2" data-testid="qr-actions-list">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide px-1">Actions rapides</h2>
          {actions.map((action) => {
            const isActive = activePanel === action.id;
            return (
              <div key={action.id}>
                <button
                  onClick={() => handleAction(action)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left ${
                    isActive
                      ? 'bg-blue-50 border-blue-200 shadow-sm'
                      : 'bg-white hover:bg-gray-50 border-gray-200 hover:border-gray-300'
                  }`}
                  data-testid={`qr-action-${action.id}`}
                >
                  <div className={`p-2 rounded-lg ${isActive ? 'bg-blue-100' : 'bg-gray-100'}`}>
                    <IconComponent name={action.icon} size={18} className={isActive ? 'text-blue-600' : 'text-gray-600'} />
                  </div>
                  <span className={`flex-1 text-sm font-medium ${isActive ? 'text-blue-700' : 'text-gray-700'}`}>
                    {action.label}
                  </span>
                  {action.requires_auth && <Lock size={14} className="text-gray-300" />}
                  <ChevronRight size={16} className={`text-gray-400 transition-transform ${isActive ? 'rotate-90' : ''}`} />
                </button>

                {/* Inline panel */}
                {isActive && (
                  <div className="mt-2 bg-white rounded-xl border border-blue-100 overflow-hidden" data-testid={`qr-panel-${action.id}`}>
                    {panelLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
                      </div>
                    ) : (
                      <div className="p-4">
                        {activePanel === 'last-wo' && <LastWOPanel data={panelData} />}
                        {activePanel === 'wo-history' && <WOHistoryPanel data={panelData} />}
                        {activePanel === 'kpi' && <KPIPanel data={panelData} />}
                        {activePanel === 'preventive-plan' && <PreventivePlanPanel data={panelData} />}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 pt-4">
          Propulse par FSAO Iris
        </p>
      </div>
    </div>
  );
};

// ========= KPI Chip =========
const KpiChip = ({ label, value, color = 'indigo' }) => {
  const colors = {
    indigo: 'bg-indigo-100 text-indigo-700',
    amber: 'bg-amber-100 text-amber-700',
    blue: 'bg-blue-100 text-blue-700',
    red: 'bg-red-100 text-red-700',
  };
  return (
    <div className={`flex-1 text-center px-1.5 py-1 rounded-md ${colors[color]}`}>
      <p className="text-sm font-bold">{value}</p>
      <p className="text-[10px] leading-tight">{label}</p>
    </div>
  );
};

// ========= AI Formatted Text =========
const AiFormattedText = ({ text }) => {
  if (!text) return null;
  // Convert markdown-like formatting to HTML
  const lines = text.split('\n');
  return (
    <div className="space-y-1.5">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1" />;
        // Bold headers with **
        let formatted = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        // Handle bullet points
        if (formatted.trim().startsWith('- ') || formatted.trim().startsWith('* ')) {
          formatted = formatted.replace(/^(\s*)[*-]\s/, '$1');
          return <p key={i} className="text-xs pl-3 relative before:content-['•'] before:absolute before:left-0 before:text-indigo-400" dangerouslySetInnerHTML={{ __html: formatted }} />;
        }
        // Headers (lines with only bold text)
        if (formatted.startsWith('<strong>') && formatted.endsWith('</strong>')) {
          return <p key={i} className="text-xs font-semibold text-indigo-800 mt-2" dangerouslySetInnerHTML={{ __html: formatted }} />;
        }
        return <p key={i} className="text-xs" dangerouslySetInnerHTML={{ __html: formatted }} />;
      })}
    </div>
  );
};

// ========= Sub-panels =========

const LastWOPanel = ({ data }) => {
  if (!data) return <p className="text-sm text-gray-500 text-center">Aucun ordre de travail trouve</p>;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-900">{data.titre || 'OT sans titre'}</span>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${woStatusColors[data.statut] || 'bg-gray-100'}`}>
          {data.statut}
        </span>
      </div>
      <div className="flex items-center gap-3 text-xs text-gray-500">
        {data.numero && <span>#{data.numero}</span>}
        {data.priorite && <span className={priorityColors[data.priorite]}>{data.priorite}</span>}
        {data.assignee_name && <span>Assigne a: {data.assignee_name}</span>}
      </div>
      {data.date_creation && (
        <p className="text-xs text-gray-400">
          Cree le {new Date(data.date_creation).toLocaleDateString('fr-FR')}
        </p>
      )}
    </div>
  );
};

const WOHistoryPanel = ({ data }) => {
  if (!data || data.length === 0) return <p className="text-sm text-gray-500 text-center">Aucun historique</p>;
  return (
    <div className="space-y-2 max-h-64 overflow-y-auto">
      {data.map((wo, i) => (
        <div key={wo.id || i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-gray-800 truncate">{wo.titre || 'OT sans titre'}</p>
            <p className="text-xs text-gray-400">
              {wo.numero && `#${wo.numero} — `}
              {wo.date_creation && new Date(wo.date_creation).toLocaleDateString('fr-FR')}
            </p>
          </div>
          <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${woStatusColors[wo.statut] || 'bg-gray-100'}`}>
            {wo.statut}
          </span>
        </div>
      ))}
    </div>
  );
};

const KPIPanel = ({ data }) => {
  if (!data) return <p className="text-sm text-gray-500 text-center">KPI indisponibles</p>;
  const kpis = [
    { label: 'Total OT', value: data.total_work_orders, color: 'text-gray-900' },
    { label: 'OT ouverts', value: data.open_work_orders, color: 'text-amber-600' },
    { label: 'OT termines', value: data.closed_work_orders, color: 'text-emerald-600' },
    { label: 'Temps moy. (h)', value: data.avg_resolution_time_hours, color: 'text-blue-600' },
    { label: 'Plans preventifs', value: data.total_preventive_plans, color: 'text-purple-600' },
  ];
  return (
    <div className="grid grid-cols-2 gap-3">
      {kpis.map((kpi, i) => (
        <div key={i} className="text-center p-2 rounded-lg bg-gray-50">
          <p className={`text-lg font-bold ${kpi.color}`}>{kpi.value}</p>
          <p className="text-xs text-gray-500">{kpi.label}</p>
        </div>
      ))}
    </div>
  );
};

const PreventivePlanPanel = ({ data }) => {
  if (!data || data.length === 0) return <p className="text-sm text-gray-500 text-center">Aucun plan preventif</p>;
  return (
    <div className="space-y-2 max-h-64 overflow-y-auto">
      {data.map((plan, i) => (
        <div key={plan.id || i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-gray-800 truncate">{plan.titre || 'Plan sans titre'}</p>
            <p className="text-xs text-gray-400">
              {plan.frequence && `Freq: ${plan.frequence}`}
              {plan.prochaine_execution && ` — Prochaine: ${new Date(plan.prochaine_execution).toLocaleDateString('fr-FR')}`}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
};

export default QREquipmentPage;
