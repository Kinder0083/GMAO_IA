import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import {
  Calendar, ChevronLeft, ChevronRight, Plus, Wrench, Lightbulb, Sparkles,
  Coffee, Users, AlertTriangle, Clock, Activity as ActivityIcon, Trash2, Wand2,
  BarChart3
} from 'lucide-react';
import { useToast } from '../hooks/use-toast';
import { usersAPI, maintenanceAssignmentsAPI } from '../services/api';
import { usePermissions } from '../hooks/usePermissions';
import AssignmentDialog from '../components/ActiviteMaintenance/AssignmentDialog';
import PoolPanel from '../components/ActiviteMaintenance/PoolPanel';
import ChargeGlobaleView from '../components/ActiviteMaintenance/ChargeGlobaleView';
import AssignmentHoverCard from '../components/ActiviteMaintenance/AssignmentHoverCard';

const DAYS_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

const TYPE_META = {
  WORK_ORDER: { color: '#0ea5e9', icon: Wrench, label: 'OT' },
  IMPROVEMENT: { color: '#10b981', icon: Lightbulb, label: 'AMÉL.' },
  PREVENTIVE_MAINTENANCE: { color: '#f59e0b', icon: Sparkles, label: 'PM' },
  FREE_TASK: { color: '#6b7280', icon: ActivityIcon, label: 'Libre' },
  CONGE: { color: '#9ca3af', icon: Coffee, label: 'Congé' },
};

const CATEGORY_LABELS = {
  REUNION: 'Réunion',
  FORMATION: 'Formation',
  ASTREINTE: 'Astreinte',
  AUTRE: 'Autre',
};

const fmtDate = (d) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const startOfWeek = (d) => {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Lundi
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
};

const ActiviteMaintenance = ({ service = 'MAINTENANCE' }) => {
  const { toast } = useToast();
  const { canEdit, isAdminForModule, isAdmin } = usePermissions();

  const [subTab, setSubTab] = useState(() => localStorage.getItem(`activite_subtab_${service}`) || 'planning');
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('activite_view_mode') || 'week');
  const [refDate, setRefDate] = useState(new Date());
  const [techs, setTechs] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [pool, setPool] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogContext, setDialogContext] = useState(null);
  const [editingAssignment, setEditingAssignment] = useState(null);
  const [dragItem, setDragItem] = useState(null);
  const [autoFitting, setAutoFitting] = useState(false);

  const canAssign = isAdmin() || isAdminForModule('planning') || canEdit('planning');

  // Calcul des jours de la vue
  const days = useMemo(() => {
    const result = [];
    if (viewMode === 'week') {
      const monday = startOfWeek(refDate);
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        result.push(d);
      }
    } else {
      result.push(new Date(refDate));
    }
    return result;
  }, [refDate, viewMode]);

  const startStr = fmtDate(days[0]);
  const endStr = fmtDate(days[days.length - 1]);

  // Chargement initial techniciens (du service en cours, statut actif)
  useEffect(() => {
    (async () => {
      try {
        const res = await usersAPI.getActive();
        const data = (res.data || []).filter(u =>
          (u.service || '').toUpperCase() === service.toUpperCase() &&
          u.email !== 'buenogy@gmail.com'
        );
        setTechs(data);
      } catch (err) {
        toast({ title: 'Erreur', description: 'Impossible de charger les techniciens', variant: 'destructive' });
      }
    })();
  }, [service]);

  // Chargement des affectations + pool
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [assRes, poolRes] = await Promise.all([
        maintenanceAssignmentsAPI.getAll({ start_date: startStr, end_date: endStr, service }),
        maintenanceAssignmentsAPI.getPool(service),
      ]);
      setAssignments(assRes.data || []);
      setPool(poolRes.data || []);
    } catch (err) {
      toast({ title: 'Erreur', description: 'Impossible de charger le planning', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [startStr, endStr, toast, service]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Indexer les assignations par (user_id, date)
  const cellMap = useMemo(() => {
    const m = {};
    assignments.forEach(a => {
      const k = `${a.user_id}|${a.date}`;
      if (!m[k]) m[k] = [];
      m[k].push(a);
    });
    return m;
  }, [assignments]);

  const computeDailyLoad = (userId, dateStr) => {
    const list = cellMap[`${userId}|${dateStr}`] || [];
    return list.reduce((sum, a) => sum + (a.duration_hours || 0), 0);
  };

  // Stats équipe
  const teamStats = useMemo(() => {
    const todayStr = fmtDate(new Date());
    const todayAssigns = assignments.filter(a => a.date === todayStr);
    const todayHours = todayAssigns.reduce((s, a) => s + (a.duration_hours || 0), 0);
    const overloaded = techs.filter(t => computeDailyLoad(t.id, todayStr) > 8).length;
    return {
      techCount: techs.length,
      capacity: techs.length * 8,
      planned: todayHours,
      overloaded,
    };
  }, [techs, assignments, cellMap]);

  // Navigation
  const goPrev = () => {
    const d = new Date(refDate);
    if (viewMode === 'week') d.setDate(d.getDate() - 7);
    else d.setDate(d.getDate() - 1);
    setRefDate(d);
  };
  const goNext = () => {
    const d = new Date(refDate);
    if (viewMode === 'week') d.setDate(d.getDate() + 7);
    else d.setDate(d.getDate() + 1);
    setRefDate(d);
  };
  const goToday = () => setRefDate(new Date());
  const handleViewChange = (mode) => {
    setViewMode(mode);
    localStorage.setItem('activite_view_mode', mode);
  };

  // Ouvrir le formulaire pour creer
  const openAssignmentDialog = (userId, date, source = null) => {
    setDialogContext({ user_id: userId, date, source });
    setEditingAssignment(null);
    setDialogOpen(true);
  };

  const openEdit = (assignment) => {
    setEditingAssignment(assignment);
    setDialogContext({ user_id: assignment.user_id, date: assignment.date });
    setDialogOpen(true);
  };

  const handleSaved = () => {
    setDialogOpen(false);
    setDialogContext(null);
    setEditingAssignment(null);
    loadData();
  };

  const handleDelete = async (assignment) => {
    if (!window.confirm(`Supprimer "${assignment.title}" ?`)) return;
    try {
      await maintenanceAssignmentsAPI.delete(assignment.id);
      toast({ title: 'Supprimé', description: 'Affectation supprimée' });
      loadData();
    } catch (err) {
      toast({ title: 'Erreur', description: 'Impossible de supprimer', variant: 'destructive' });
    }
  };

  // === Drag & drop ===
  const onPoolDragStart = (item) => {
    setDragItem({ source: 'pool', item });
  };
  const onCellDragStart = (assignment) => {
    setDragItem({ source: 'cell', item: assignment });
  };
  const onCellDragOver = (e) => {
    if (canAssign && dragItem) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    }
  };
  const onCellDrop = async (e, userId, dateStr) => {
    e.preventDefault();
    if (!dragItem || !canAssign) return;
    const { source, item } = dragItem;
    setDragItem(null);
    if (source === 'pool') {
      try {
        // Anti-doublon : empecher d'affecter 2x le meme OT/IMP/PM au meme technicien le meme jour
        const existingDup = (cellMap[`${userId}|${dateStr}`] || []).find(
          a => a.reference_id && a.reference_id === item.id && a.type === item.type
        );
        if (existingDup) {
          const typeLabel = item.type === 'WORK_ORDER' ? 'Cet OT'
            : item.type === 'IMPROVEMENT' ? 'Cette amélioration'
            : 'Cette maintenance préventive';
          toast({
            title: 'Doublon empêché',
            description: `${typeLabel} est déjà affecté(e) à ce technicien pour cette journée.`,
            variant: 'destructive'
          });
          return;
        }
        // Securisation : titre jamais null (sinon Pydantic 422)
        const safeTitle = (item.title && String(item.title).trim())
          || (item.numero ? `#${item.numero}` : '')
          || 'Tâche';
        const safeNumero = item.numero ? String(item.numero) : null;
        const safeDuration = Number(item.duration_hours) > 0 ? Number(item.duration_hours) : 1.0;
        await maintenanceAssignmentsAPI.create({
          user_id: userId,
          date: dateStr,
          type: item.type,
          title: safeTitle,
          description: '',
          duration_hours: safeDuration,
          reference_id: item.id,
          reference_numero: safeNumero,
        });
        toast({ title: 'Affecté', description: `${safeTitle} ajouté au planning` });
        loadData();
      } catch (err) {
        const msg = typeof err.response?.data?.detail === 'string'
          ? err.response.data.detail
          : 'Echec de l\'affectation';
        toast({ title: 'Erreur', description: msg, variant: 'destructive' });
      }
    } else if (source === 'cell') {
      // Deplacement
      if (item.user_id === userId && item.date === dateStr) return;
      // Anti-doublon : si OT/IMP/PM avec reference_id, verifier qu'il n'existe pas deja
      // la meme reference pour ce technicien ce jour-la.
      if (item.reference_id && ['WORK_ORDER', 'IMPROVEMENT', 'PREVENTIVE_MAINTENANCE'].includes(item.type)) {
        const existingDup = (cellMap[`${userId}|${dateStr}`] || []).find(
          a => a.id !== item.id && a.reference_id === item.reference_id && a.type === item.type
        );
        if (existingDup) {
          const typeLabel = item.type === 'WORK_ORDER' ? 'Cet OT'
            : item.type === 'IMPROVEMENT' ? 'Cette amélioration'
            : 'Cette maintenance préventive';
          toast({
            title: 'Doublon empêché',
            description: `${typeLabel} est déjà affecté(e) à ce technicien pour cette journée.`,
            variant: 'destructive'
          });
          return;
        }
      }
      try {
        await maintenanceAssignmentsAPI.update(item.id, { user_id: userId, date: dateStr });
        loadData();
      } catch (err) {
        const msg = typeof err.response?.data?.detail === 'string'
          ? err.response.data.detail
          : 'Impossible de déplacer';
        toast({ title: 'Erreur', description: msg, variant: 'destructive' });
      }
    }
  };

  // Auto-fit
  const handleAutoFit = async () => {
    if (!window.confirm("Suggérer une affectation automatique des OT/Améliorations/MP non affectés sur la période ?")) return;
    setAutoFitting(true);
    try {
      const res = await maintenanceAssignmentsAPI.autoSuggest(startStr, endStr, true);
      toast({
        title: 'Auto-fit terminé',
        description: `${res.data?.count || 0} affectation(s) créée(s)`,
      });
      loadData();
    } catch (err) {
      const msg = typeof err.response?.data?.detail === 'string'
        ? err.response.data.detail
        : 'Auto-fit échoué';
      toast({ title: 'Erreur', description: msg, variant: 'destructive' });
    } finally {
      setAutoFitting(false);
    }
  };

  return (
    <div className="space-y-3" data-testid="activite-maintenance-page">
      <Tabs value={subTab} onValueChange={(v) => { setSubTab(v); localStorage.setItem(`activite_subtab_${service}`, v); }}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="planning" data-testid="subtab-planning" className="flex items-center gap-1 text-xs">
            <Calendar size={14} />
            Planning détaillé
          </TabsTrigger>
          <TabsTrigger value="charge" data-testid="subtab-charge" className="flex items-center gap-1 text-xs">
            <BarChart3 size={14} />
            Charge globale (30j)
          </TabsTrigger>
        </TabsList>

        <TabsContent value="charge" className="mt-2">
          <ChargeGlobaleView service={service} />
        </TabsContent>

        <TabsContent value="planning" className="mt-2 space-y-3">
      {/* En-tete + nav */}
      <div className="flex flex-wrap justify-between items-center gap-2">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Activité {service.charAt(0) + service.slice(1).toLowerCase()}</h2>
          <p className="text-gray-600 text-xs">
            Planification des interventions, améliorations, MP et tâches libres pour le service {service}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="bg-gray-100 rounded-lg p-1 flex" data-testid="view-toggle">
            <button
              onClick={() => handleViewChange('week')}
              data-testid="view-week-btn"
              className={`px-3 py-1 text-xs rounded transition-colors ${viewMode === 'week' ? 'bg-white shadow text-blue-700 font-semibold' : 'text-gray-600'}`}
            >
              Semaine
            </button>
            <button
              onClick={() => handleViewChange('day')}
              data-testid="view-day-btn"
              className={`px-3 py-1 text-xs rounded transition-colors ${viewMode === 'day' ? 'bg-white shadow text-blue-700 font-semibold' : 'text-gray-600'}`}
            >
              Jour
            </button>
          </div>
          <Button variant="outline" size="sm" onClick={goPrev} data-testid="prev-btn">
            <ChevronLeft size={16} />
          </Button>
          <Button variant="outline" size="sm" onClick={goToday} data-testid="today-btn">
            <Calendar size={14} className="mr-1" />
            Aujourd'hui
          </Button>
          <Button variant="outline" size="sm" onClick={goNext} data-testid="next-btn">
            <ChevronRight size={16} />
          </Button>
          {canAssign && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleAutoFit}
              disabled={autoFitting}
              data-testid="auto-fit-btn"
              className="border-purple-300 text-purple-700 hover:bg-purple-50"
              title="Suggérer une répartition automatique"
            >
              <Wand2 size={14} className="mr-1" />
              {autoFitting ? 'Calcul...' : 'Auto-fit'}
            </Button>
          )}
        </div>
      </div>

      {/* Bandeau récap équipe (Proposition B) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2" data-testid="team-stats">
        <Card className="bg-blue-50 border-blue-100">
          <CardContent className="p-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-gray-600 uppercase">Techniciens</p>
              <p className="text-xl font-bold text-blue-700">{teamStats.techCount}</p>
            </div>
            <Users size={20} className="text-blue-600" />
          </CardContent>
        </Card>
        <Card className="bg-emerald-50 border-emerald-100">
          <CardContent className="p-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-gray-600 uppercase">Capacité jour</p>
              <p className="text-xl font-bold text-emerald-700">{teamStats.capacity}h</p>
            </div>
            <Clock size={20} className="text-emerald-600" />
          </CardContent>
        </Card>
        <Card className="bg-amber-50 border-amber-100">
          <CardContent className="p-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-gray-600 uppercase">Planifié aujourd'hui</p>
              <p className="text-xl font-bold text-amber-700">{teamStats.planned.toFixed(1)}h</p>
            </div>
            <ActivityIcon size={20} className="text-amber-600" />
          </CardContent>
        </Card>
        <Card className={teamStats.overloaded > 0 ? 'bg-red-50 border-red-200 animate-pulse' : 'bg-gray-50 border-gray-100'}>
          <CardContent className="p-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-gray-600 uppercase">Surcharges (aujourd'hui)</p>
              <p className={`text-xl font-bold ${teamStats.overloaded > 0 ? 'text-red-700' : 'text-gray-500'}`}>
                {teamStats.overloaded}
              </p>
            </div>
            <AlertTriangle size={20} className={teamStats.overloaded > 0 ? 'text-red-600' : 'text-gray-400'} />
          </CardContent>
        </Card>
      </div>

      {/* Layout principal : Grid + Pool latéral */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-3 min-w-0">
        {/* Grid */}
        <Card className="min-w-0">
          <CardContent className="p-2 overflow-x-auto min-w-0">
            {techs.length === 0 ? (
              <p className="text-gray-500 text-sm py-8 text-center">
                Aucun technicien actif dans le service "{service}". Créez ou activez un utilisateur ayant ce service.
              </p>
            ) : (
              <table className="border-collapse" style={{ tableLayout: 'fixed', width: `${140 + days.length * 140}px` }} data-testid="planning-grid">
                <colgroup>
                  <col style={{ width: '140px' }} />
                  {days.map((_, i) => (<col key={i} style={{ width: '140px' }} />))}
                </colgroup>
                <thead>
                  <tr>
                    <th className="text-left p-2 text-xs uppercase text-gray-600 sticky left-0 bg-white z-10">
                      Technicien
                    </th>
                    {days.map((d, i) => {
                      const isToday = fmtDate(d) === fmtDate(new Date());
                      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                      return (
                        <th key={i} className={`text-center p-2 text-xs ${isToday ? 'bg-blue-100 text-blue-800' : isWeekend ? 'bg-gray-50 text-gray-500' : 'text-gray-700'} font-semibold`}>
                          <div>{DAYS_LABELS[(d.getDay() + 6) % 7]}</div>
                          <div className="text-[10px] font-normal">{d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {techs.map(t => (
                    <tr key={t.id} className="border-t">
                      <td className="p-2 sticky left-0 bg-white z-10 border-r overflow-hidden">
                        <div className="font-medium text-sm truncate" title={`${t.prenom} ${t.nom}`}>{t.prenom} {t.nom}</div>
                        <div className="text-[10px] text-gray-500 truncate" title={t.email}>{t.email}</div>
                      </td>
                      {days.map((d) => {
                        const dStr = fmtDate(d);
                        const cellAssigns = cellMap[`${t.id}|${dStr}`] || [];
                        const load = cellAssigns.reduce((s, a) => s + (a.duration_hours || 0), 0);
                        const isOverload = load > 8;
                        const isAtLimit = load >= 7 && load <= 8;
                        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                        const isToday = dStr === fmtDate(new Date());

                        return (
                          <td
                            key={dStr}
                            data-testid={`cell-${t.id}-${dStr}`}
                            onDragOver={onCellDragOver}
                            onDrop={(e) => onCellDrop(e, t.id, dStr)}
                            className={`p-1 align-top border-l overflow-hidden ${isWeekend ? 'bg-gray-50' : 'bg-white'} ${isToday ? 'bg-blue-50/50' : ''}`}
                          >
                            <div className="space-y-1 min-h-[60px] min-w-0 overflow-hidden">
                              {cellAssigns.map(a => {
                                const meta = TYPE_META[a.type] || TYPE_META.FREE_TASK;
                                const Icon = meta?.icon || ActivityIcon;
                                return (
                                  <AssignmentHoverCard key={a.id || `${a.user_id}-${a.date}-${a.title}`} assignment={a}>
                                    <div
                                      draggable={canAssign && a.type !== 'CONGE'}
                                      onDragStart={() => onCellDragStart(a)}
                                      data-testid={`assign-${a.id}`}
                                      className="group rounded px-1.5 py-1 text-[11px] text-white cursor-pointer hover:opacity-90 transition relative overflow-hidden min-w-0 max-w-full"
                                      style={{ backgroundColor: a.color || meta?.color || '#6b7280' }}
                                      onClick={() => openEdit(a)}
                                    >
                                      <div className="flex items-center gap-1 font-semibold leading-tight min-w-0">
                                        <Icon size={10} className="shrink-0" />
                                        <span className="truncate flex-1 min-w-0 block">
                                          {a.reference_numero ? `#${a.reference_numero} ` : ''}{a.title || '(Sans titre)'}
                                        </span>
                                        <span className="text-[10px] bg-black/20 rounded px-1 shrink-0">{a.duration_hours || 0}h</span>
                                      </div>
                                      {a.description && (
                                        <p className="text-[9px] opacity-90 truncate">{a.description}</p>
                                      )}
                                      {canAssign && (
                                        <button
                                          type="button"
                                          onClick={(e) => { e.stopPropagation(); handleDelete(a); }}
                                          className="absolute top-0 right-0 hidden group-hover:block bg-red-600 rounded-bl px-1"
                                          title="Supprimer"
                                        >
                                          <Trash2 size={8} className="text-white" />
                                        </button>
                                      )}
                                    </div>
                                  </AssignmentHoverCard>
                                );
                              })}
                              {/* Bouton + */}
                              {canAssign && (
                                <button
                                  type="button"
                                  onClick={() => openAssignmentDialog(t.id, dStr)}
                                  data-testid={`add-assign-${t.id}-${dStr}`}
                                  className="w-full text-[10px] text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded py-0.5 border border-dashed border-gray-200 hover:border-blue-300"
                                >
                                  <Plus size={10} className="inline" /> Ajouter
                                </button>
                              )}
                              {/* Barre de charge journalière (Proposition A) */}
                              {(load > 0 || isOverload) && (
                                <div className="mt-1">
                                  <div className="h-1.5 bg-gray-200 rounded overflow-hidden flex" title={`${load.toFixed(1)}h / 8h`}>
                                    <div
                                      className={`h-full ${isOverload ? 'bg-red-500 animate-pulse' : isAtLimit ? 'bg-yellow-500' : 'bg-emerald-500'}`}
                                      style={{ width: `${Math.min(100, (load / 8) * 100)}%` }}
                                    />
                                  </div>
                                  <div className={`text-[9px] mt-0.5 text-right font-semibold ${isOverload ? 'text-red-600' : isAtLimit ? 'text-yellow-700' : 'text-emerald-700'}`}>
                                    {load.toFixed(1)}h / 8h
                                    {isOverload && ' ⚠'}
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        {/* Pool latéral */}
        <PoolPanel
          pool={pool}
          onDragStart={onPoolDragStart}
          canAssign={canAssign}
          onItemClick={(item) => {
            if (techs.length > 0) {
              openAssignmentDialog(techs[0].id, fmtDate(new Date()), item);
            }
          }}
        />
      </div>

      {dialogOpen && (
        <AssignmentDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          context={dialogContext}
          editing={editingAssignment}
          techs={techs}
          pool={pool}
          onSaved={handleSaved}
        />
      )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ActiviteMaintenance;
