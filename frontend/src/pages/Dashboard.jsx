import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import {
  ClipboardList,
  Wrench,
  AlertCircle,
  CheckCircle2,
  Bell,
  CalendarClock,
  AlertTriangle,
  Pencil,
  GripVertical,
  Trash2,
  Clock,
  Timer,
  Info
} from 'lucide-react';
import { useDashboard } from '../hooks/useDashboard';
import { usePermissions } from '../hooks/usePermissions';
import { useToast } from '../hooks/use-toast';
import { usePreferences } from '../contexts/PreferencesContext';
import api, { demandesArretAPI, dashboardAPI } from '../services/api';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import DashboardEditToolbar from '../components/Dashboard/DashboardEditToolbar';
import MaintenanceStatusPendingAlert from '../components/Dashboard/MaintenanceStatusPendingAlert';
import SortableShortcut from '../components/Dashboard/SortableShortcut';
import ShortcutEditDialog from '../components/Dashboard/ShortcutEditDialog';

// Composant Widget Sortable
const SortableWidget = ({ item, isEditMode, stat, colorClasses, onDelete }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: !isEditMode });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 1,
  };

  if (!stat) return null;

  return (
    <div ref={setNodeRef} style={style} className="relative group">
      <Card className={`h-full ${isEditMode ? 'border-2 border-dashed border-gray-300 hover:border-blue-400' : ''}`}>
        {isEditMode && (
          <>
            <div
              {...attributes}
              {...listeners}
              className="absolute -left-2 top-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing bg-white rounded shadow-md p-1.5 border opacity-0 group-hover:opacity-100 transition-opacity z-20"
            >
              <GripVertical className="h-4 w-4 text-gray-500" />
            </div>
            <Button
              variant="outline"
              size="icon"
              className="absolute -top-2 -right-2 h-7 w-7 bg-white shadow-sm text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity z-20"
              onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </>
        )}
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium text-gray-500">{stat.title}</p>
                {stat.tooltip && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-gray-400 cursor-help flex-shrink-0" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs">
                        <p>{stat.tooltip}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
              <p className="text-3xl font-bold mt-1">{stat.value}</p>
              <p className="text-xs text-gray-400 mt-1">{stat.trend}</p>
            </div>
            <div className={`p-3 rounded-full ${colorClasses[stat.color]}`}>
              <stat.icon className="h-6 w-6" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// Composant Titre Sortable
const SortableTitle = ({ item, isEditMode, onDelete }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: !isEditMode });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 1,
  };

  const getAlignmentClass = () => {
    switch (item.alignment) {
      case 'center': return 'text-center';
      case 'right': return 'text-right';
      default: return 'text-left';
    }
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className={`col-span-full relative group ${isEditMode ? 'border-2 border-dashed border-gray-300 rounded-lg p-2 hover:border-blue-400' : ''}`}
    >
      {isEditMode && (
        <>
          <div
            {...attributes}
            {...listeners}
            className="absolute -left-2 top-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing bg-white rounded shadow-md p-1.5 border opacity-0 group-hover:opacity-100 transition-opacity z-20"
          >
            <GripVertical className="h-4 w-4 text-gray-500" />
          </div>
          <Button
            variant="outline"
            size="icon"
            className="absolute -top-2 -right-2 h-7 w-7 bg-white shadow-sm text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity z-20"
            onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </>
      )}
      <h2 
        className={`${item.fontSize || 'text-xl'} font-semibold ${getAlignmentClass()} py-2`}
        style={{ color: item.color || '#1f2937' }}
      >
        {item.text}
      </h2>
    </div>
  );
};

// Composant Séparateur Sortable
const SortableSeparator = ({ item, isEditMode, onDelete }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: !isEditMode });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 1,
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className={`col-span-full relative group ${isEditMode ? 'py-4' : 'py-2'}`}
    >
      {isEditMode && (
        <>
          <div
            {...attributes}
            {...listeners}
            className="absolute -left-2 top-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing bg-white rounded shadow-md p-1.5 border opacity-0 group-hover:opacity-100 transition-opacity z-20"
          >
            <GripVertical className="h-4 w-4 text-gray-500" />
          </div>
          <Button
            variant="outline"
            size="icon"
            className="absolute -top-2 -right-2 h-7 w-7 bg-white shadow-sm text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity z-20"
            onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </>
      )}
      <hr className={`border-gray-300 ${isEditMode ? 'border-dashed hover:border-blue-400 transition-colors' : ''}`} />
    </div>
  );
};

const Dashboard = () => {
  const { canView } = usePermissions();
  const { preferences, updatePreferences } = usePreferences();
  const { toast } = useToast();
  
  // Mode édition
  const [isEditMode, setIsEditMode] = useState(false);
  const [layoutItems, setLayoutItems] = useState([]);
  const [originalLayout, setOriginalLayout] = useState([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [activeId, setActiveId] = useState(null);
  
  // États pour les données des demandes d'arrêt et reports
  const [demandesStats, setDemandesStats] = useState({ pending: 0, total: 0 });
  const [reportsStats, setReportsStats] = useState({ pending: 0, total: 0, avgDays: 0 });
  const [widgetData, setWidgetData] = useState(null);
  const [diKpi, setDiKpi] = useState(null);

  // État pour l'édition des raccourcis
  const [editingShortcut, setEditingShortcut] = useState(null);

  // Utiliser le hook temps réel WebSocket pour le dashboard
  const { 
    workOrders, 
    equipments, 
    loading,
  } = useDashboard();

  // Sensors pour dnd-kit
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Charger les données des demandes d'arrêt et reports + widget data
  useEffect(() => {
    const loadDemandesData = async () => {
      try {
        const demandes = await demandesArretAPI.getAll();
        const pendingDemandes = demandes.filter(d => d.statut === 'EN_ATTENTE').length;
        setDemandesStats({ pending: pendingDemandes, total: demandes.length });
        
        const reportsData = await demandesArretAPI.getReportsHistory();
        setReportsStats({
          pending: reportsData.statistiques?.reports_en_attente || 0,
          total: reportsData.statistiques?.total_reports || 0,
          avgDays: reportsData.statistiques?.duree_moyenne_report_jours || 0
        });
      } catch (error) {
        console.error('Erreur chargement données demandes:', error);
      }
    };

    const loadWidgetData = async () => {
      try {
        const data = await dashboardAPI.getWidgetData();
        setWidgetData(data);
      } catch (error) {
        console.error('Erreur chargement widget data:', error);
      }
    };
    
    loadDemandesData();
    loadWidgetData();

    const loadDiKpi = async () => {
      try {
        const res = await api.get('/intervention-requests/stats/kpi');
        setDiKpi(res.data);
      } catch (err) {
        console.error('Erreur chargement KPI DI:', err);
      }
    };
    loadDiKpi();
  }, []);

  // Déterminer quels widgets afficher
  const enabledWidgets = useMemo(() => {
    if (preferences && preferences.dashboard_widgets !== undefined && preferences.dashboard_widgets !== null) {
      const current = preferences.dashboard_widgets;
      // Auto-inject new DI widgets if not present
      const newWidgets = ['di_en_attente', 'di_temps_reponse', 'ecart_temps', 'charge_maintenance'];
      const missing = newWidgets.filter(w => !current.includes(w));
      if (missing.length > 0) {
        return [...current, ...missing];
      }
      return current;
    }
    return [
      'work_orders_active',
      'equipment_maintenance',
      'overdue_tasks',
      'maintenance_stats',
      'demandes_arret_pending',
      'di_en_attente',
      'di_temps_reponse',
      'ecart_temps',
      'charge_maintenance',
      'equipment_status_overview',
      'global_summary'
    ];
  }, [preferences]);

  // Initialiser le layout avec les éléments par défaut (widgets + éléments personnalisés)
  // IMPORTANT: Toujours reconcilier le layout sauvegarde avec les widgets actuellement actives
  useEffect(() => {
    const savedItems = preferences?.dashboard_layout?.items;
    
    if (savedItems && savedItems.length > 0) {
      // Respecter le layout sauvegardé tel quel
      setLayoutItems(savedItems);
      setOriginalLayout(savedItems);
    } else {
      // Layout par défaut : tous les widgets activés
      const defaultLayout = enabledWidgets.map((widgetId, index) => ({
        id: `widget-${widgetId}`,
        type: 'widget',
        widgetId: widgetId,
        order: index
      }));
      setLayoutItems(defaultLayout);
      setOriginalLayout(defaultLayout);
    }
  }, [preferences, enabledWidgets]);

  // Fonctions de gestion du mode édition
  const enterEditMode = useCallback(() => {
    setOriginalLayout([...layoutItems]);
    setIsEditMode(true);
    setHasChanges(false);
  }, [layoutItems]);

  const exitEditMode = useCallback(() => {
    setLayoutItems([...originalLayout]);
    setIsEditMode(false);
    setHasChanges(false);
  }, [originalLayout]);

  const handleAddTitle = useCallback((titleElement) => {
    const newItem = {
      ...titleElement,
      order: layoutItems.length
    };
    setLayoutItems(prev => [...prev, newItem]);
    setHasChanges(true);
  }, [layoutItems.length]);

  const handleAddSeparator = useCallback((separatorElement) => {
    const newItem = {
      ...separatorElement,
      order: layoutItems.length
    };
    setLayoutItems(prev => [...prev, newItem]);
    setHasChanges(true);
  }, [layoutItems.length]);

  const handleDeleteElement = useCallback((elementId) => {
    setLayoutItems(prev => prev.filter(item => item.id !== elementId));
    setHasChanges(true);
  }, []);

  const handleSaveLayout = useCallback(async () => {
    try {
      await updatePreferences({
        dashboard_layout: {
          items: layoutItems
        }
      });
      setOriginalLayout([...layoutItems]);
      setIsEditMode(false);
      setHasChanges(false);
      toast({ title: 'Succès', description: 'Disposition du dashboard sauvegardée' });
    } catch (error) {
      toast({ title: 'Erreur', description: 'Impossible de sauvegarder la disposition', variant: 'destructive' });
    }
  }, [layoutItems, updatePreferences, toast]);

  const handleResetLayout = useCallback(() => {
    // Garder les raccourcis existants, remettre tous les widgets
    const shortcuts = layoutItems.filter(i => i.type === 'shortcut');
    const defaultWidgets = enabledWidgets.map((widgetId, index) => ({
      id: `widget-${widgetId}`,
      type: 'widget',
      widgetId: widgetId,
      order: shortcuts.length + index
    }));
    setLayoutItems([...shortcuts, ...defaultWidgets]);
    setHasChanges(true);
  }, [enabledWidgets, layoutItems]);

  const handleSaveShortcutEdit = useCallback((updatedShortcut) => {
    setLayoutItems(prev => prev.map(item =>
      item.id === updatedShortcut.id ? { ...item, ...updatedShortcut } : item
    ));
    setHasChanges(true);
  }, []);

  // Labels des widgets pour le bouton "Ajouter un widget"
  const WIDGET_LABELS = {
    'work_orders_active': 'Ordres Actifs',
    'equipment_maintenance': 'Equipements en maintenance',
    'overdue_tasks': 'Taches en retard',
    'maintenance_stats': 'Taux de completion',
    'demandes_arret_pending': 'Demandes d\'arret',
    'di_en_attente': 'DI en attente',
    'di_temps_reponse': 'Temps reponse DI',
    'ecart_temps': 'Ecart Temps Est./Reel',
    'charge_maintenance': 'Charge OT restante',
    'equipment_status_overview': 'Apercu statut equipements',
    'global_summary': 'Resume global'
  };

  // Widgets présents dans le layout actuel
  const presentWidgetIds = useMemo(() =>
    layoutItems.filter(i => i.type === 'widget').map(i => i.widgetId),
    [layoutItems]
  );

  // Widgets disponibles mais absents du layout
  const missingWidgets = useMemo(() =>
    enabledWidgets
      .filter(wId => !presentWidgetIds.includes(wId))
      .map(wId => ({ id: wId, label: WIDGET_LABELS[wId] || wId })),
    [enabledWidgets, presentWidgetIds]
  );

  const handleAddWidget = useCallback((widgetId) => {
    setLayoutItems(prev => [...prev, {
      id: `widget-${widgetId}`,
      type: 'widget',
      widgetId,
      order: prev.length
    }]);
    setHasChanges(true);
  }, []);

  // Gestion du drag and drop avec dnd-kit
  const handleDragStart = (event) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    setActiveId(null);

    if (over && active.id !== over.id) {
      setLayoutItems((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        
        const newItems = arrayMove(items, oldIndex, newIndex);
        return newItems.map((item, index) => ({ ...item, order: index }));
      });
      setHasChanges(true);
    }
  };

  // Calculer les stats dynamiquement selon les widgets activés
  const getStatConfig = useCallback((widgetId) => {
    const safeWorkOrders = workOrders || [];
    const safeEquipments = equipments || [];

    const configs = {
      'work_orders_active': () => {
        if (!canView('workOrders')) return null;
        const activeOrders = safeWorkOrders.filter(wo => wo.statut !== 'TERMINE' && wo.statut !== 'ANNULE');
        return {
          title: 'Ordres Actifs',
          value: activeOrders.length,
          icon: ClipboardList,
          color: 'blue',
          trend: `${safeWorkOrders.filter(wo => wo.statut === 'EN_COURS').length} en cours`
        };
      },
      'equipment_maintenance': () => {
        if (!canView('assets')) return null;
        const inMaintenance = safeEquipments.filter(eq => eq.statut === 'EN_PANNE' || eq.statut === 'EN_MAINTENANCE');
        return {
          title: 'Équipements en maintenance',
          value: inMaintenance.length,
          icon: Wrench,
          color: 'orange',
          trend: `${safeEquipments.filter(eq => eq.statut === 'OPERATIONNEL').length} opérationnels`
        };
      },
      'overdue_tasks': () => {
        if (!canView('workOrders')) return null;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const overdue = safeWorkOrders.filter(wo => {
          if (wo.statut === 'TERMINE' || wo.statut === 'ANNULE') return false;
          if (!wo.dateLimite) return false;
          const dueDate = new Date(wo.dateLimite);
          return dueDate < today;
        });
        return {
          title: 'En retard',
          value: overdue.length,
          icon: AlertCircle,
          color: 'red',
          trend: overdue.length > 0 ? 'À traiter en priorité' : 'Tout est à jour'
        };
      },
      'maintenance_stats': () => {
        if (!canView('workOrders')) return null;
        const thisMonth = new Date();
        thisMonth.setDate(1);
        thisMonth.setHours(0, 0, 0, 0);
        const completedThisMonth = safeWorkOrders.filter(wo => {
          if (wo.statut !== 'TERMINE') return false;
          const completedDate = new Date(wo.dateModification || wo.dateCreation);
          return completedDate >= thisMonth;
        });
        return {
          title: 'Terminés ce mois',
          value: completedThisMonth.length,
          icon: CheckCircle2,
          color: 'green',
          trend: 'Ce mois-ci'
        };
      },
      'demandes_arret_pending': () => ({
        title: 'Demandes en attente',
        value: demandesStats.pending,
        icon: Bell,
        color: 'yellow',
        trend: `${demandesStats.total} demande(s) au total`
      }),
      'reports_pending': () => ({
        title: 'Reports en attente',
        value: reportsStats.pending,
        icon: CalendarClock,
        color: 'purple',
        trend: reportsStats.avgDays > 0 ? `Moy. ${reportsStats.avgDays} jours` : 'Aucun report'
      }),
      'equipment_alerts': () => {
        if (!canView('assets')) return null;
        const alertEquipments = safeEquipments.filter(eq => eq.statut === 'ALERTE_S_EQUIP');
        return {
          title: 'Alertes équipements',
          value: alertEquipments.length,
          icon: AlertTriangle,
          color: 'red',
          trend: alertEquipments.length > 0 ? 'Sous-équipement(s) HS' : 'Aucune alerte'
        };
      },
      'equipment_status_overview': () => {
        if (!canView('assets')) return null;
        const degradedEquipments = safeEquipments.filter(eq => eq.statut === 'DEGRADE');
        return {
          title: 'Equipements degrades',
          value: degradedEquipments.length,
          icon: Wrench,
          color: 'blue',
          trend: `${safeEquipments.filter(eq => eq.statut === 'HORS_SERVICE').length} hors service`
        };
      },
      'low_stock': () => {
        const ls = widgetData?.low_stock || 0;
        const oos = widgetData?.out_of_stock || 0;
        return {
          title: 'Stock bas',
          value: ls + oos,
          icon: AlertTriangle,
          color: (ls + oos) > 0 ? 'red' : 'green',
          trend: oos > 0 ? `${oos} en rupture, ${ls} niveau bas` : ls > 0 ? `${ls} article(s) sous seuil` : 'Stock OK'
        };
      },
      'recent_incidents': () => ({
        title: 'Incidents recents',
        value: widgetData?.recent_incidents_30d ?? '-',
        icon: AlertTriangle,
        color: (widgetData?.recent_incidents_30d || 0) > 5 ? 'red' : 'orange',
        trend: `${widgetData?.total_incidents || 0} au total`
      }),
      'upcoming_maintenance': () => ({
        title: 'Maintenances a venir',
        value: widgetData?.upcoming_maintenance_7d ?? '-',
        icon: CalendarClock,
        color: 'blue',
        trend: widgetData?.overdue_mprev > 0 ? `${widgetData.overdue_mprev} en retard` : 'Aucun retard'
      }),
      'performance_metrics': () => {
        const total = safeWorkOrders.length;
        const done = safeWorkOrders.filter(wo => wo.statut === 'TERMINE').length;
        const rate = total > 0 ? Math.round((done / total) * 100) : 0;
        return {
          title: 'Taux completion OT',
          value: `${rate}%`,
          icon: CheckCircle2,
          color: rate >= 75 ? 'green' : rate >= 50 ? 'orange' : 'red',
          trend: `${done}/${total} termines`
        };
      },
      'team_activity': () => {
        const inProgress = safeWorkOrders.filter(wo => wo.statut === 'EN_COURS').length;
        const pending = safeWorkOrders.filter(wo => wo.statut === 'EN_ATTENTE').length;
        return {
          title: 'Charge de travail',
          value: inProgress + pending,
          icon: ClipboardList,
          color: 'purple',
          trend: `${inProgress} en cours, ${pending} en attente`
        };
      },
      'quick_actions': () => ({
        title: 'Actions rapides',
        value: '-',
        icon: AlertCircle,
        color: 'blue',
        trend: 'Raccourcis'
      }),
      'demandes_arret_stats': () => ({
        title: 'Stats demandes arret',
        value: demandesStats.total,
        icon: Bell,
        color: 'yellow',
        trend: `${demandesStats.pending} en attente`
      }),
      'reports_stats': () => ({
        title: 'Stats reports',
        value: reportsStats.total,
        icon: CalendarClock,
        color: 'purple',
        trend: reportsStats.avgDays > 0 ? `Moy. ${reportsStats.avgDays} jours` : 'Aucun report'
      }),
      'planning_mprev_summary': () => ({
        title: 'Planning M.Prev',
        value: widgetData?.upcoming_maintenance_7d ?? '-',
        icon: CalendarClock,
        color: widgetData?.overdue_mprev > 0 ? 'red' : 'blue',
        trend: widgetData?.overdue_mprev > 0 ? `${widgetData.overdue_mprev} en retard` : '7 prochains jours'
      }),
      'recent_status_changes': () => ({
        title: 'Changements statut',
        value: widgetData?.recent_status_changes_7d ?? '-',
        icon: AlertCircle,
        color: 'orange',
        trend: '7 derniers jours'
      }),
      'di_en_attente': () => ({
        title: 'DI en attente',
        value: diKpi?.en_attente ?? '-',
        icon: Bell,
        color: (diKpi?.en_attente || 0) > 0 ? 'red' : 'green',
        trend: `${diKpi?.total ?? 0} DI au total (${diKpi?.publiques ?? 0} QR)`
      }),
      'di_temps_reponse': () => ({
        title: 'Temps reponse DI',
        value: diKpi?.temps_moyen_reponse_label ?? '-',
        icon: CalendarClock,
        color: diKpi?.temps_moyen_reponse_heures != null && diKpi.temps_moyen_reponse_heures > 48 ? 'red' : diKpi?.temps_moyen_reponse_heures != null && diKpi.temps_moyen_reponse_heures > 24 ? 'orange' : 'green',
        trend: `${diKpi?.taux_conversion ?? 0}% converties, ${diKpi?.taux_refus ?? 0}% refusees`
      }),
      'global_summary': () => {
        const totalOT = safeWorkOrders.length;
        const totalEquip = safeEquipments.length;
        return {
          title: 'Resume global',
          value: `${totalOT} OT`,
          icon: CheckCircle2,
          color: 'green',
          trend: `${totalEquip} equipement(s)`
        };
      },
      'ecart_temps': () => {
        if (!canView('workOrders')) return null;
        const devMonth = widgetData?.time_deviation_month;
        const devYear = widgetData?.time_deviation_year;
        const countMonth = widgetData?.time_deviation_month_count || 0;
        const countYear = widgetData?.time_deviation_year_count || 0;
        const val = devMonth != null ? `${devMonth > 0 ? '+' : ''}${devMonth}%` : '-';
        const yearText = devYear != null ? `Annee glissante : ${devYear > 0 ? '+' : ''}${devYear}% (${countYear} OT)` : 'Aucun OT sur l\'annee';
        const monthColor = devMonth == null ? 'blue' : devMonth > 15 ? 'red' : devMonth > 0 ? 'orange' : 'green';
        return {
          title: 'Ecart Temps Est./Reel',
          value: val,
          icon: Timer,
          color: monthColor,
          trend: yearText,
          tooltip: 'Pourcentage d\'ecart entre le temps estime et le temps reel sur les OT termines. Positif = depassement. Valeur principale : mois glissant (30j). En bas : annee glissante (365j).'
        };
      },
      'charge_maintenance': () => {
        if (!canView('workOrders')) return null;
        const totalH = widgetData?.estimated_hours_open || 0;
        const nbOT = widgetData?.estimated_hours_open_count || 0;
        const nbTechs = widgetData?.maintenance_techs_count || 0;
        const perTech = nbTechs > 0 ? (totalH / nbTechs).toFixed(1) : '-';
        return {
          title: 'Charge OT restante',
          value: `${totalH}h`,
          icon: Clock,
          color: totalH > 50 ? 'red' : totalH > 20 ? 'orange' : 'green',
          trend: nbTechs > 0 ? `${perTech}h / tech. (${nbTechs} tech., ${nbOT} OT)` : `${nbOT} OT en cours`,
          tooltip: 'Total des heures estimees sur les OT non termines. En bas : repartition theorique par technicien du service maintenance (hors responsable de service).'
        };
      }
    };

    return configs[widgetId] ? configs[widgetId]() : null;
  }, [workOrders, equipments, canView, demandesStats, reportsStats, widgetData]);

  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    orange: 'bg-orange-50 text-orange-600',
    red: 'bg-red-50 text-red-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    yellow: 'bg-yellow-50 text-yellow-600'
  };

  // Filtrer les items pour ne garder que les widgets activés et les éléments personnalisés
  const visibleItems = useMemo(() => {
    return layoutItems.filter(item => {
      if (item.type === 'widget') {
        if (!enabledWidgets.includes(item.widgetId)) return false;
        const stat = getStatConfig(item.widgetId);
        return stat !== null;
      }
      return true;
    });
  }, [layoutItems, enabledWidgets, getStatConfig]);

  // Séparer raccourcis et autres éléments
  const shortcutItems = visibleItems.filter(item => item.type === 'shortcut');
  const otherItems = visibleItems.filter(item => item.type !== 'shortcut');
  const hasActiveWidgets = otherItems.some(item => item.type === 'widget');
  const hasShortcuts = shortcutItems.length > 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${isEditMode ? 'pb-24' : ''}`}>
      {/* Header avec bouton édition */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Tableau de bord</h1>
          <p className="text-gray-600 mt-1">Vue d&apos;ensemble de vos opérations</p>
        </div>
        {!isEditMode && (
          <Button
            variant="outline"
            size="sm"
            onClick={enterEditMode}
            className="flex items-center gap-2"
            data-testid="edit-dashboard-btn"
          >
            <Pencil className="h-4 w-4" />
            Modifier
          </Button>
        )}
      </div>

      {/* Alerte pour les maintenances en attente de nouveau statut */}
      {!isEditMode && <MaintenanceStatusPendingAlert />}

      {/* Message si aucun widget */}
      {!hasActiveWidgets && !isEditMode && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-500 mb-2">Aucun widget activé sur le tableau de bord.</p>
            <p className="text-sm text-gray-400">
              Allez dans Personnalisations → Dashboard Personnalisé pour activer des widgets.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Grille de widgets avec drag-and-drop */}
      {(hasActiveWidgets || hasShortcuts || isEditMode) && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={visibleItems.map(item => item.id)}
            strategy={rectSortingStrategy}
          >
            {/* Zone raccourcis */}
            {(hasShortcuts || isEditMode) && (
              <div data-testid="dashboard-shortcuts" className="flex flex-wrap gap-3 items-end mb-6">
                {shortcutItems.map((item) => (
                  <SortableShortcut
                    key={item.id}
                    item={item}
                    isEditMode={isEditMode}
                    onDelete={handleDeleteElement}
                    onEdit={(s) => setEditingShortcut(s)}
                  />
                ))}
              </div>
            )}

            {/* Zone widgets */}
            <div data-testid="dashboard-stats" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {otherItems.map((item) => {
                if (item.type === 'widget') {
                  const stat = getStatConfig(item.widgetId);
                  return (
                    <SortableWidget
                      key={item.id}
                      item={item}
                      isEditMode={isEditMode}
                      stat={stat}
                      colorClasses={colorClasses}
                      onDelete={handleDeleteElement}
                    />
                  );
                }
                if (item.type === 'title') {
                  return (
                    <SortableTitle
                      key={item.id}
                      item={item}
                      isEditMode={isEditMode}
                      onDelete={handleDeleteElement}
                    />
                  );
                }
                if (item.type === 'separator') {
                  return (
                    <SortableSeparator
                      key={item.id}
                      item={item}
                      isEditMode={isEditMode}
                      onDelete={handleDeleteElement}
                    />
                  );
                }
                return null;
              })}
            </div>
          </SortableContext>
          
          <DragOverlay>
            {activeId ? (
              <div className="opacity-80 shadow-2xl">
                {(() => {
                  const item = visibleItems.find(i => i.id === activeId);
                  if (!item) return null;
                  if (item.type === 'widget') {
                    const stat = getStatConfig(item.widgetId);
                    if (!stat) return null;
                    return (
                      <Card className="h-full border-2 border-blue-400">
                        <CardContent className="pt-6">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-gray-500">{stat.title}</p>
                              <p className="text-3xl font-bold mt-1">{stat.value}</p>
                            </div>
                            <div className={`p-3 rounded-full ${colorClasses[stat.color]}`}>
                              <stat.icon className="h-6 w-6" />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  }
                  if (item.type === 'title') {
                    return (
                      <div className="border-2 border-blue-400 rounded-lg p-2 bg-white">
                        <h2 className={`${item.fontSize || 'text-xl'} font-semibold py-2`} style={{ color: item.color || '#1f2937' }}>
                          {item.text}
                        </h2>
                      </div>
                    );
                  }
                  if (item.type === 'separator') {
                    return (
                      <div className="py-4 bg-white border-2 border-blue-400 rounded">
                        <hr className="border-gray-300 border-dashed" />
                      </div>
                    );
                  }
                  if (item.type === 'shortcut') {
                    return (
                      <div className="border-2 border-blue-400 rounded-lg p-3 bg-white flex flex-col items-center gap-1">
                        <span className="text-sm font-medium">{item.name}</span>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Section Ordres de travail récents */}
      {canView('workOrders') && enabledWidgets.includes('work_orders_active') && (
        <Card className={isEditMode ? 'border-2 border-dashed border-gray-200' : ''}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              Ordres de travail récents
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!workOrders || workOrders.length === 0 ? (
              <p className="text-gray-500 text-center py-4">Aucun ordre de travail</p>
            ) : (
              <div className="space-y-3">
                {workOrders.slice(0, 5).map((wo) => (
                  <div key={wo.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium">{wo.titre}</p>
                      <p className="text-sm text-gray-500">#{wo.numero}</p>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      wo.statut === 'TERMINE' ? 'bg-green-100 text-green-800' :
                      wo.statut === 'EN_COURS' ? 'bg-blue-100 text-blue-800' :
                      wo.statut === 'EN_ATTENTE' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {wo.statut?.replace('_', ' ') || 'N/A'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Section État des équipements */}
      {canView('assets') && enabledWidgets.includes('equipment_maintenance') && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5" />
              État des équipements
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!equipments || equipments.length === 0 ? (
              <p className="text-gray-500 text-center py-4">Aucun équipement</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <p className="text-2xl font-bold text-green-600">
                    {equipments.filter(eq => eq.statut === 'OPERATIONNEL').length}
                  </p>
                  <p className="text-sm text-gray-600">Opérationnels</p>
                </div>
                <div className="text-center p-4 bg-yellow-50 rounded-lg">
                  <p className="text-2xl font-bold text-yellow-600">
                    {equipments.filter(eq => eq.statut === 'EN_MAINTENANCE').length}
                  </p>
                  <p className="text-sm text-gray-600">En maintenance</p>
                </div>
                <div className="text-center p-4 bg-red-50 rounded-lg">
                  <p className="text-2xl font-bold text-red-600">
                    {equipments.filter(eq => eq.statut === 'EN_PANNE').length}
                  </p>
                  <p className="text-sm text-gray-600">En panne</p>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <p className="text-2xl font-bold text-gray-600">
                    {equipments.filter(eq => eq.statut === 'HORS_SERVICE').length}
                  </p>
                  <p className="text-sm text-gray-600">Hors service</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Barre d'outils d'édition */}
      {isEditMode && (
        <DashboardEditToolbar
          onAddTitle={handleAddTitle}
          onAddSeparator={handleAddSeparator}
          onAddWidget={handleAddWidget}
          onSave={handleSaveLayout}
          onCancel={exitEditMode}
          onReset={handleResetLayout}
          hasChanges={hasChanges}
          missingWidgets={missingWidgets}
        />
      )}

      {/* Dialog édition raccourci */}
      {editingShortcut && (
        <ShortcutEditDialog
          shortcut={editingShortcut}
          open={!!editingShortcut}
          onClose={() => setEditingShortcut(null)}
          onSave={handleSaveShortcutEdit}
        />
      )}
    </div>
  );
};

export default Dashboard;
