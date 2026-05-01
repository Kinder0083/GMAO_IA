import React, { useState } from 'react';
import { Card, CardContent } from '../ui/card';
import { Input } from '../ui/input';
import { Search, Wrench, Lightbulb, Sparkles, GripVertical, CheckCircle2, EyeOff } from 'lucide-react';

const TYPE_META = {
  WORK_ORDER: { color: '#0ea5e9', icon: Wrench, label: 'OT', bg: 'bg-sky-50', border: 'border-sky-200', text: 'text-sky-700' },
  IMPROVEMENT: { color: '#10b981', icon: Lightbulb, label: 'Amél.', bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700' },
  PREVENTIVE_MAINTENANCE: { color: '#f59e0b', icon: Sparkles, label: 'PM', bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700' },
};

const PRIO_BADGE = {
  HAUTE: 'bg-red-100 text-red-700',
  MOYENNE: 'bg-orange-100 text-orange-700',
  BASSE: 'bg-blue-100 text-blue-700',
};

const PoolPanel = ({ pool = [], plannedRefs = {}, onDragStart, canAssign = false, onItemClick }) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [hidePlanned, setHidePlanned] = useState(false);

  const filtered = pool.filter(p => {
    if (filter !== 'ALL' && p.type !== filter) return false;
    if (hidePlanned && plannedRefs[p.id]) return false;
    if (search) {
      const q = search.toLowerCase();
      return (p.title || '').toLowerCase().includes(q) ||
             (p.numero || '').toLowerCase().includes(q);
    }
    return true;
  });

  const totalPlanned = pool.filter(p => plannedRefs[p.id]).length;

  return (
    <Card className="lg:sticky lg:top-2 max-h-[calc(100vh-200px)] flex flex-col">
      <CardContent className="p-3 flex flex-col gap-2 flex-1 overflow-hidden">
        <div>
          <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
            <GripVertical size={14} className="text-gray-400" />
            Tâches non affectées
          </h3>
          <p className="text-[10px] text-gray-500">Glissez sur le planning ou cliquez</p>
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            data-testid="pool-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher..."
            className="pl-7 h-8 text-xs"
          />
        </div>

        {/* Filter */}
        <div className="flex gap-1">
          {[
            { v: 'ALL', l: 'Tout' },
            { v: 'WORK_ORDER', l: 'OT' },
            { v: 'IMPROVEMENT', l: 'Amél.' },
            { v: 'PREVENTIVE_MAINTENANCE', l: 'PM' },
          ].map(f => (
            <button
              key={f.v}
              type="button"
              onClick={() => setFilter(f.v)}
              data-testid={`pool-filter-${f.v}`}
              className={`flex-1 text-[10px] py-1 rounded transition ${
                filter === f.v ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f.l}
            </button>
          ))}
        </div>

        {/* Toggle "Masquer déjà planifiés" */}
        {totalPlanned > 0 && (
          <button
            type="button"
            onClick={() => setHidePlanned(v => !v)}
            data-testid="pool-hide-planned-toggle"
            className={`flex items-center justify-center gap-1 text-[10px] py-1 rounded border transition ${
              hidePlanned
                ? 'bg-blue-50 border-blue-300 text-blue-700'
                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
            title={hidePlanned ? 'Afficher toutes les tâches' : 'Masquer les tâches déjà planifiées'}
          >
            <EyeOff size={10} />
            {hidePlanned ? 'Afficher tout' : `Masquer déjà planifiés (${totalPlanned})`}
          </button>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1" data-testid="pool-list">
          {filtered.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-6">
              {search ? 'Aucun résultat' : 'Tout est affecté !'}
            </p>
          )}
          {filtered.map(item => {
            const meta = TYPE_META[item.type] || TYPE_META.WORK_ORDER;
            const Icon = meta.icon;
            const planned = plannedRefs[item.id];
            const isPlanned = Boolean(planned);
            const draggable = canAssign && !isPlanned;
            const users = planned?.users ? Array.from(planned.users) : [];
            const dates = planned?.dates ? Array.from(planned.dates).sort() : [];
            const titleHint = isPlanned
              ? `Déjà planifié(e) ${planned.count}× sur la période\n${users.length ? '→ ' + users.join(', ') : ''}${dates.length ? '\nDates : ' + dates.join(', ') : ''}`
              : '';
            return (
              <div
                key={`${item.type}-${item.id}`}
                draggable={draggable}
                onDragStart={() => draggable && onDragStart(item)}
                onClick={() => !isPlanned && onItemClick && canAssign && onItemClick(item)}
                data-testid={`pool-item-${item.id}`}
                data-planned={isPlanned ? 'true' : 'false'}
                title={titleHint}
                className={`relative p-2 rounded border transition ${
                  isPlanned
                    ? 'bg-gray-50 border-gray-200 opacity-60 cursor-not-allowed'
                    : `${meta.bg} ${meta.border} ${canAssign ? 'cursor-grab active:cursor-grabbing hover:shadow-sm' : 'cursor-default'}`
                }`}
              >
                {isPlanned && (
                  <span
                    className="absolute top-1 right-1 inline-flex items-center gap-0.5 text-[9px] font-semibold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full border border-emerald-300"
                    data-testid={`pool-item-planned-badge-${item.id}`}
                  >
                    <CheckCircle2 size={9} />
                    Planifié{planned.count > 1 ? ` ×${planned.count}` : ''}
                  </span>
                )}
                <div className="flex items-start gap-1.5">
                  <Icon size={12} className={(isPlanned ? 'text-gray-400' : meta.text) + ' mt-0.5 shrink-0'} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 flex-wrap">
                      {item.numero && (
                        <span className={`text-[9px] font-mono font-bold ${isPlanned ? 'text-gray-500' : meta.text}`}>
                          #{item.numero}
                        </span>
                      )}
                      {item.priorite && PRIO_BADGE[item.priorite] && !isPlanned && (
                        <span className={`text-[9px] px-1 rounded ${PRIO_BADGE[item.priorite]}`}>
                          {item.priorite}
                        </span>
                      )}
                      <span className={`text-[9px] ml-auto ${isPlanned ? 'text-gray-400' : 'text-gray-500'}`}>
                        {item.duration_hours}h
                      </span>
                    </div>
                    <p className={`text-xs mt-0.5 line-clamp-2 leading-tight ${isPlanned ? 'text-gray-500 line-through decoration-gray-400/60' : 'text-gray-800'}`}>
                      {item.title}
                    </p>
                    {item.dateLimite && !isPlanned && (
                      <p className="text-[9px] text-gray-500 mt-0.5">
                        Échéance : {new Date(item.dateLimite).toLocaleDateString('fr-FR')}
                      </p>
                    )}
                    {isPlanned && users.length > 0 && (
                      <p className="text-[9px] text-emerald-700 mt-0.5 truncate">
                        → {users.slice(0, 2).join(', ')}{users.length > 2 ? ` +${users.length - 2}` : ''}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default PoolPanel;
