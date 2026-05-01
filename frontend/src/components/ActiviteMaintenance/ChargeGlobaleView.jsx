import React, { useEffect, useState, useMemo } from 'react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';
import { TrendingUp, AlertTriangle, Calendar } from 'lucide-react';
import { useToast } from '../../hooks/use-toast';
import { maintenanceAssignmentsAPI, usersAPI } from '../../services/api';

const fmtDate = (d) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const TYPE_COLORS = {
  WORK_ORDER: '#0ea5e9',
  IMPROVEMENT: '#10b981',
  PREVENTIVE_MAINTENANCE: '#f59e0b',
  FREE_TASK: '#6b7280',
  CONGE: '#9ca3af',
};

const TYPE_LABELS = {
  WORK_ORDER: 'OT',
  IMPROVEMENT: 'Amélioration',
  PREVENTIVE_MAINTENANCE: 'M.Préventive',
  FREE_TASK: 'Tâches libres',
  CONGE: 'Congés',
};

/**
 * ChargeGlobale30Jours : graphique a barres empilees sur 30 jours
 * de la charge prevue pour l'equipe Maintenance vs sa capacite.
 */
const ChargeGlobaleView = ({ service = 'MAINTENANCE' }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [techCount, setTechCount] = useState(0);
  const [data, setData] = useState([]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const startStr = fmtDate(today);
  const endDate = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + 29);
    return d;
  }, [today]);
  const endStr = fmtDate(endDate);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [usersRes, assRes] = await Promise.all([
          usersAPI.getActive(),
          maintenanceAssignmentsAPI.getAll({ start_date: startStr, end_date: endStr, service }),
        ]);
        const techs = (usersRes.data || []).filter(u =>
          (u.service || '').toUpperCase() === service.toUpperCase() &&
          u.email !== 'buenogy@gmail.com'
        );
        setTechCount(techs.length);

        // Aggregate by date
        const byDate = {};
        const days = [];
        for (let i = 0; i < 30; i++) {
          const d = new Date(today);
          d.setDate(d.getDate() + i);
          const ds = fmtDate(d);
          days.push(ds);
          byDate[ds] = {
            date: ds,
            label: d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
            isWeekend: d.getDay() === 0 || d.getDay() === 6,
            WORK_ORDER: 0,
            IMPROVEMENT: 0,
            PREVENTIVE_MAINTENANCE: 0,
            FREE_TASK: 0,
            CONGE: 0,
            total: 0,
          };
        }
        (assRes.data || []).forEach(a => {
          const slot = byDate[a.date];
          if (!slot) return;
          slot[a.type] = (slot[a.type] || 0) + (a.duration_hours || 0);
          slot.total += (a.duration_hours || 0);
        });
        setData(days.map(d => byDate[d]));
      } catch (err) {
        toast({ title: 'Erreur', description: 'Impossible de charger la charge', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    })();
  }, [startStr, endStr, service]);

  // Capacite jour = nb techs * 8h, sauf weekend (capacite 0)
  const dailyCapacity = techCount * 8;

  const stats = useMemo(() => {
    const workdays = data.filter(d => !d.isWeekend);
    const totalCapacity = workdays.length * dailyCapacity;
    const totalPlanned = workdays.reduce((s, d) => s + d.total, 0);
    const overloadDays = workdays.filter(d => d.total > dailyCapacity).length;
    const occupancyPct = totalCapacity > 0 ? Math.round((totalPlanned / totalCapacity) * 100) : 0;
    return { totalCapacity, totalPlanned, overloadDays, occupancyPct, workdays: workdays.length };
  }, [data, dailyCapacity]);

  const renderTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;
    const slot = data.find(d => d.label === label);
    if (!slot) return null;
    const total = slot.total;
    const overload = total > dailyCapacity;
    return (
      <div className="bg-white border rounded shadow p-2 text-xs">
        <div className="font-bold mb-1">{label}{slot.isWeekend ? ' (Week-end)' : ''}</div>
        {Object.keys(TYPE_LABELS).map(t => slot[t] > 0 && (
          <div key={t} className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded" style={{ backgroundColor: TYPE_COLORS[t] }}></span>
            <span>{TYPE_LABELS[t]} : <strong>{slot[t].toFixed(1)}h</strong></span>
          </div>
        ))}
        <div className={`mt-1 pt-1 border-t font-bold ${overload ? 'text-red-600' : ''}`}>
          Total : {total.toFixed(1)}h / {slot.isWeekend ? 0 : dailyCapacity}h
          {overload && ' ⚠'}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3" data-testid="charge-globale-view">
      {/* Stats résumé */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Card className="bg-blue-50 border-blue-100">
          <CardContent className="p-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-gray-600 uppercase">Période</p>
              <p className="text-sm font-bold text-blue-700">30 jours</p>
              <p className="text-[10px] text-gray-500">{stats.workdays} jours ouvrés</p>
            </div>
            <Calendar size={20} className="text-blue-600" />
          </CardContent>
        </Card>
        <Card className="bg-emerald-50 border-emerald-100">
          <CardContent className="p-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-gray-600 uppercase">Capacité totale</p>
              <p className="text-xl font-bold text-emerald-700">{stats.totalCapacity}h</p>
            </div>
            <TrendingUp size={20} className="text-emerald-600" />
          </CardContent>
        </Card>
        <Card className="bg-amber-50 border-amber-100">
          <CardContent className="p-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-gray-600 uppercase">Planifié / Occupation</p>
              <p className="text-xl font-bold text-amber-700">{stats.totalPlanned.toFixed(0)}h</p>
              <p className="text-[10px] text-gray-500">{stats.occupancyPct}% occupé</p>
            </div>
          </CardContent>
        </Card>
        <Card className={stats.overloadDays > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-100'}>
          <CardContent className="p-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-gray-600 uppercase">Jours en surcharge</p>
              <p className={`text-xl font-bold ${stats.overloadDays > 0 ? 'text-red-700' : 'text-gray-500'}`}>
                {stats.overloadDays}
              </p>
            </div>
            <AlertTriangle size={20} className={stats.overloadDays > 0 ? 'text-red-600' : 'text-gray-400'} />
          </CardContent>
        </Card>
      </div>

      {/* Graphique */}
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-gray-800">Charge prévue sur 30 jours (équipe {service})</h3>
            <div className="flex items-center gap-3 text-[11px]">
              {Object.entries(TYPE_LABELS).map(([k, l]) => (
                <span key={k} className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded" style={{ backgroundColor: TYPE_COLORS[k] }}></span>
                  {l}
                </span>
              ))}
              <span className="flex items-center gap-1 text-red-600 font-semibold">
                <span className="w-3 h-0.5 bg-red-500"></span>
                Capacité {dailyCapacity}h
              </span>
            </div>
          </div>
          {loading ? (
            <p className="text-center py-12 text-gray-400 text-sm">Chargement...</p>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 30 }}>
                <XAxis dataKey="label" angle={-45} textAnchor="end" height={50} tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} label={{ value: 'Heures', angle: -90, position: 'insideLeft', style: { fontSize: 11 } }} />
                <Tooltip content={renderTooltip} cursor={{ fill: 'rgba(0,0,0,0.05)' }} />
                <ReferenceLine y={dailyCapacity} stroke="#dc2626" strokeDasharray="4 4" strokeWidth={2} />
                {Object.keys(TYPE_LABELS).map(t => (
                  <Bar key={t} dataKey={t} stackId="charge" fill={TYPE_COLORS[t]}>
                    {data.map((entry, i) => (
                      <Cell
                        key={`${t}-${i}`}
                        fill={entry.isWeekend ? '#e5e7eb' : TYPE_COLORS[t]}
                        fillOpacity={entry.isWeekend ? 0.4 : (entry.total > dailyCapacity ? 0.85 : 1)}
                      />
                    ))}
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ChargeGlobaleView;
