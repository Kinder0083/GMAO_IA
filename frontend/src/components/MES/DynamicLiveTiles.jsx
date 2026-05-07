import React, { useMemo } from 'react';
import {
  Thermometer, Gauge, AlertTriangle, CheckCircle2, TrendingUp,
  Clock, Zap, BarChart3, Activity, Sliders, RefreshCw, Hash
} from 'lucide-react';

/**
 * Affiche dynamiquement une tuile par champ mappe present dans live_values.
 * Le composant lit machine.field_mappings + machine.live_values et
 * deduit l'icone, la couleur et le format selon target/data_type.
 *
 * Aucune ligne de code a modifier quand l'utilisateur ajoute un nouveau
 * champ via la modale de detection IA.
 */

const TARGET_META = {
  temperature: { icon: Thermometer, color: 'orange',  label: 'Température' },
  speed:       { icon: TrendingUp,  color: 'indigo',  label: 'Vitesse' },
  alert:       { icon: AlertTriangle, color: 'red',   label: 'Alerte' },
  quality:     { icon: CheckCircle2,  color: 'teal',  label: 'Qualité' },
  oee:         { icon: BarChart3,    color: 'fuchsia', label: 'OEE / TRS' },
  timestamp:   { icon: Clock,        color: 'gray',   label: 'Horodatage' },
  reset_24h:   { icon: RefreshCw,    color: 'rose',   label: 'Reset 24h' },
  reset_shift: { icon: RefreshCw,    color: 'rose',   label: 'Reset poste' },
  shift_end:   { icon: Activity,     color: 'purple', label: 'Fin de poste' },
  extra:       { icon: Sliders,      color: 'slate',  label: 'Custom' },
};

// Targets DEJA affichees dans les KPIs historiques (cadence, total, etat)
// On ne les duplique pas dans les tuiles dynamiques.
const HIDDEN_TARGETS = new Set(['cadence', 'total', 'state']);

const COLOR_CLASSES = {
  orange:  { bg: 'bg-orange-50',  border: 'border-orange-200',  icon: 'text-orange-600',  value: 'text-orange-800',  badge: 'bg-orange-100 text-orange-700' },
  indigo:  { bg: 'bg-indigo-50',  border: 'border-indigo-200',  icon: 'text-indigo-600',  value: 'text-indigo-800',  badge: 'bg-indigo-100 text-indigo-700' },
  red:     { bg: 'bg-red-50',     border: 'border-red-200',     icon: 'text-red-600',     value: 'text-red-800',     badge: 'bg-red-100 text-red-700' },
  teal:    { bg: 'bg-teal-50',    border: 'border-teal-200',    icon: 'text-teal-600',    value: 'text-teal-800',    badge: 'bg-teal-100 text-teal-700' },
  fuchsia: { bg: 'bg-fuchsia-50', border: 'border-fuchsia-200', icon: 'text-fuchsia-600', value: 'text-fuchsia-800', badge: 'bg-fuchsia-100 text-fuchsia-700' },
  gray:    { bg: 'bg-gray-50',    border: 'border-gray-200',    icon: 'text-gray-600',    value: 'text-gray-800',    badge: 'bg-gray-100 text-gray-700' },
  rose:    { bg: 'bg-rose-50',    border: 'border-rose-200',    icon: 'text-rose-600',    value: 'text-rose-800',    badge: 'bg-rose-100 text-rose-700' },
  purple:  { bg: 'bg-purple-50',  border: 'border-purple-200',  icon: 'text-purple-600',  value: 'text-purple-800',  badge: 'bg-purple-100 text-purple-700' },
  slate:   { bg: 'bg-slate-50',   border: 'border-slate-200',   icon: 'text-slate-600',   value: 'text-slate-800',   badge: 'bg-slate-100 text-slate-700' },
};

/** Coloration adaptative pour OEE (vert > 80%, ambre > 60%, rouge sinon) */
const adaptiveColorFor = (target, value) => {
  if (target === 'oee' && typeof value === 'number') {
    if (value >= 80) return 'teal';
    if (value >= 60) return 'orange';
    return 'red';
  }
  if (target === 'temperature' && typeof value === 'number') {
    if (value > 80) return 'red';
    if (value > 50) return 'orange';
    return 'indigo';
  }
  if (target === 'alert') {
    const num = typeof value === 'number' ? value : Number(value);
    if (!isNaN(num) && num > 0) return 'red';
    if (typeof value === 'string' && /(error|fault|alarm|defaut)/i.test(value)) return 'red';
  }
  return null;
};

const formatValue = (val, dataType) => {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'object') {
    if (val.value !== undefined) return formatValue(val.value, dataType);
    return JSON.stringify(val);
  }
  if (dataType === 'datetime') {
    try {
      const d = new Date(val);
      if (!isNaN(d.getTime())) return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
    } catch { /* ignore */ }
    return String(val);
  }
  if (dataType === 'boolean') return val ? '✓ Oui' : '✗ Non';
  if (typeof val === 'number') {
    return Math.abs(val) >= 100 ? val.toLocaleString('fr-FR') : val.toFixed(2).replace(/\.?0+$/, '');
  }
  return String(val);
};

const DynamicLiveTiles = ({ machine }) => {
  const tiles = useMemo(() => {
    if (!machine) return [];
    if (machine.payload_mode !== 'JSON_UNIFIED') return [];

    const mappings = Array.isArray(machine.field_mappings) ? machine.field_mappings : [];
    const live = machine.live_values || {};
    const out = [];

    for (const fm of mappings) {
      if (!fm.enabled) continue;
      const target = fm.target || 'extra';
      if (HIDDEN_TARGETS.has(target)) continue;

      const raw = live[fm.key];
      const value = raw && typeof raw === 'object' && 'value' in raw ? raw.value : raw;
      if (value === undefined || value === null) continue;

      const meta = TARGET_META[target] || TARGET_META.extra;
      const adaptiveColor = adaptiveColorFor(target, value);
      const color = COLOR_CLASSES[adaptiveColor || meta.color] || COLOR_CLASSES.slate;
      const Icon = meta.icon;

      out.push({
        key: fm.key,
        label: fm.label || meta.label,
        value: formatValue(value, fm.data_type),
        unit: fm.unit || (raw && typeof raw === 'object' ? raw.unit : null),
        target,
        Icon,
        color,
        rawTarget: meta.label,
      });
    }
    return out;
  }, [machine]);

  if (!machine || machine.payload_mode !== 'JSON_UNIFIED') return null;
  if (tiles.length === 0) return null;

  const lastUpdate = machine.live_values_at
    ? new Date(machine.live_values_at).toLocaleTimeString('fr-FR')
    : null;

  return (
    <div className="space-y-2 mt-4" data-testid="dynamic-live-tiles">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
          <Zap size={14} className="text-purple-600" />
          Métriques temps réel
          <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-normal">
            {tiles.length} champ(s)
          </span>
        </h3>
        {lastUpdate && (
          <span className="text-[10px] text-gray-500 flex items-center gap-1">
            <Clock size={10} /> Dernière mise à jour : {lastUpdate}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
        {tiles.map(t => (
          <div
            key={t.key}
            className={`${t.color.bg} ${t.color.border} border rounded-lg p-2.5 hover:shadow-md transition-shadow`}
            data-testid={`live-tile-${t.key}`}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <t.Icon size={13} className={t.color.icon} />
              <span className="text-[10px] font-semibold text-gray-600 truncate uppercase tracking-wide">
                {t.label}
              </span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className={`text-lg font-bold ${t.color.value} truncate`} title={String(t.value)}>
                {t.value}
              </span>
              {t.unit && (
                <span className="text-[10px] text-gray-500 font-medium">{t.unit}</span>
              )}
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <span className={`text-[9px] px-1 py-0.5 rounded ${t.color.badge}`}>
                {t.rawTarget}
              </span>
              <code className="text-[9px] text-gray-400 font-mono truncate">
                {t.key}
              </code>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DynamicLiveTiles;
