import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Calendar, ChevronLeft, ChevronRight, ChevronDown, ChevronRight as ChevronRightIcon, Wrench, Plus, CheckCircle2, AlertCircle, History, Clock, Wifi, WifiOff } from 'lucide-react';
import { equipmentsAPI, demandesArretAPI } from '../services/api';
import { useToast } from '../hooks/use-toast';
import { useEquipments } from '../hooks/useEquipments';
import { useDemandesArret } from '../hooks/useDemandesArret';
import DemandeArretDialog from '../components/PlanningMPrev/DemandeArretDialog';
import HistoriqueDemandesDialog from '../components/PlanningMPrev/HistoriqueDemandesDialog';

// Couleurs EXACTES de la page Équipements (Tailwind CSS hex equivalents)
const STATUS_COLORS = {
  OPERATIONNEL: '#22c55e',      // green-500
  EN_FONCTIONNEMENT: '#10b981', // emerald-500
  A_LARRET: '#6b7280',          // gray-500
  EN_MAINTENANCE: '#fde047',    // yellow-300 (jaune clair)
  HORS_SERVICE: '#ef4444',      // red-500
  EN_CT: '#a855f7',             // purple-500
  DEGRADE: '#60a5fa',            // blue-400 (Dégradé - bleu clair)
  ALERTE_S_EQUIP: '#f472b6',     // pink-400 (Alerte S.Équip - rose)
};

const STATUS_LABELS = {
  OPERATIONNEL: 'Opérationnel',
  EN_FONCTIONNEMENT: 'En Fonctionnement',
  A_LARRET: 'À l\'arrêt',
  EN_MAINTENANCE: 'En maintenance',
  HORS_SERVICE: 'Hors service',
  EN_CT: 'En C.T',
  DEGRADE: 'Dégradé',
  ALERTE_S_EQUIP: 'Alerte S.Équip',
};

// Couleur pour les cellules sans historique
const NO_HISTORY_COLOR = '#e5e7eb'; // gray-200

const PlanningMPrev = () => {
  const { toast } = useToast();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [statusHistory, setStatusHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [historiqueDialogOpen, setHistoriqueDialogOpen] = useState(false);
  const [expandedEquipments, setExpandedEquipments] = useState(new Set());
  const [pendingDemandesCount, setPendingDemandesCount] = useState(0);

  // Calculer les dates de l'année pour le hook
  const year = currentDate.getFullYear();
  
  // Limite future dynamique: aujourd'hui + 12 mois
  const maxFutureDate = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 12);
    return d;
  }, []);
  
  const dateDebut = useMemo(() => new Date(year, 0, 1).toISOString().split('T')[0], [year]);
  const dateFin = useMemo(() => {
    const endOfYear = new Date(year, 11, 31);
    const effectiveEnd = endOfYear > maxFutureDate ? maxFutureDate : endOfYear;
    return effectiveEnd.toISOString().split('T')[0];
  }, [year, maxFutureDate]);

  // Utiliser le hook temps réel pour les équipements (WebSocket)
  const { equipments, refresh: refreshEquipments, wsConnected: equipmentsWsConnected } = useEquipments();

  // Utiliser le hook temps réel pour les demandes d'arrêt et le planning (WebSocket)
  const { 
    planningEntries, 
    loading: planningLoading, 
    wsConnected: planningWsConnected,
    refresh: refreshPlanning 
  } = useDemandesArret({
    dateDebut,
    dateFin,
    onDemandeCreated: (data) => {
      console.log('[PlanningMPrev] Nouvelle demande créée:', data);
      toast({
        title: "Nouvelle demande",
        description: "Une nouvelle demande d'arrêt a été créée",
      });
    },
    onDemandeUpdated: (data) => {
      console.log('[PlanningMPrev] Demande mise à jour:', data);
      loadStatusHistory();
      loadPendingDemandesCount();
    },
    onReportAccepted: (data) => {
      console.log('[PlanningMPrev] Report accepté:', data);
      toast({
        title: "Report accepté",
        description: "Les dates de maintenance ont été mises à jour",
      });
    }
  });

  // Indicateur WebSocket global (connecté si au moins un des deux est connecté)
  const wsConnected = equipmentsWsConnected || planningWsConnected;

  const loadStatusHistory = useCallback(async () => {
    try {
      const response = await equipmentsAPI.getStatusHistory({});
      setStatusHistory(response.data || []);
    } catch (error) {
      console.error('Erreur chargement historique statuts:', error);
    }
  }, []);

  const loadPendingDemandesCount = useCallback(async () => {
    try {
      const response = await demandesArretAPI.getAll();
      const demandes = response.data || response || [];
      const pendingCount = demandes.filter(d => d.statut === 'EN_ATTENTE').length;
      setPendingDemandesCount(pendingCount);
    } catch (error) {
      console.error('Erreur chargement demandes:', error);
    }
  }, []);

  const loadAllData = useCallback(async () => {
    setLoading(true);
    await Promise.all([
      loadStatusHistory(),
      loadPendingDemandesCount()
    ]);
    setLoading(false);
  }, [loadStatusHistory, loadPendingDemandesCount]);

  useEffect(() => {
    loadAllData();
  }, [year]);

  // Rafraîchir les données quand la page redevient visible (fallback si WebSocket non connecté)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !wsConnected) {
        console.log('[PlanningMPrev] Page visible (no WS), rafraîchissement...');
        loadAllData();
        refreshEquipments();
        refreshPlanning();
      }
    };

    const handleFocus = () => {
      if (!wsConnected) {
        console.log('[PlanningMPrev] Fenêtre focus (no WS), rafraîchissement...');
        loadAllData();
        refreshEquipments();
        refreshPlanning();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [loadAllData, refreshEquipments, refreshPlanning, wsConnected]);

  // Rafraîchir l'historique quand les équipements changent via WebSocket
  useEffect(() => {
    if (equipments && equipments.length > 0) {
      loadStatusHistory();
    }
  }, [equipments, loadStatusHistory]);

  // Organiser les équipements en hiérarchie (parents et enfants)
  const { parentEquipments, childrenByParent } = useMemo(() => {
    const parents = equipments.filter(eq => !eq.parent_id);
    const childrenMap = {};
    
    equipments.forEach(eq => {
      if (eq.parent_id) {
        if (!childrenMap[eq.parent_id]) {
          childrenMap[eq.parent_id] = [];
        }
        childrenMap[eq.parent_id].push(eq);
      }
    });
    
    return { parentEquipments: parents, childrenByParent: childrenMap };
  }, [equipments]);

  // Toggle expand/collapse d'un équipement
  const toggleExpand = (equipmentId) => {
    setExpandedEquipments(prev => {
      const newSet = new Set(prev);
      if (newSet.has(equipmentId)) {
        newSet.delete(equipmentId);
      } else {
        newSet.add(equipmentId);
      }
      return newSet;
    });
  };

  // Obtenir tous les jours d'un mois spécifique
  const getDaysInMonth = (year, month) => {
    const days = [];
    const lastDay = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= lastDay; d++) {
      days.push(new Date(year, month, d));
    }
    return days;
  };

  // Construire un index de l'historique par équipement (trié par date)
  const historyByEquipment = useMemo(() => {
    const index = {};
    statusHistory.forEach(entry => {
      if (!index[entry.equipment_id]) {
        index[entry.equipment_id] = [];
      }
      index[entry.equipment_id].push({
        ...entry,
        changed_at: new Date(entry.changed_at)
      });
    });
    // Trier chaque liste par date croissante
    Object.keys(index).forEach(eqId => {
      index[eqId].sort((a, b) => a.changed_at - b.changed_at);
    });
    return index;
  }, [statusHistory]);

  // Obtenir le statut d'un équipement pour une date/heure donnée
  const getStatusForDateTime = (equipmentId, dateTime, ignorePlannedMaintenance = false, ignoreMaintenanceStatus = false) => {
    const history = historyByEquipment[equipmentId];
    if (!history || history.length === 0) {
      return null;
    }
    
    let lastStatus = null;
    for (const entry of history) {
      if (entry.changed_at <= dateTime) {
        // Si on ignore les maintenances planifiées, ne pas prendre en compte ces entrées
        if (ignorePlannedMaintenance && entry.is_planned_maintenance) {
          continue;
        }
        // Si on ignore le statut EN_MAINTENANCE (pour les jours après fin de maintenance)
        if (ignoreMaintenanceStatus && entry.statut === 'EN_MAINTENANCE') {
          continue;
        }
        lastStatus = entry.statut;
      } else {
        break;
      }
    }
    
    return lastStatus;
  };

  // Trouver la date de fin de la dernière maintenance planifiée pour un équipement
  const getLastMaintenanceEndDate = (equipmentId) => {
    const equipmentMaintenances = planningEntries.filter(e => e.equipement_id === equipmentId);
    if (equipmentMaintenances.length === 0) return null;
    
    // Trouver la date de fin la plus tardive
    let lastEndDate = null;
    equipmentMaintenances.forEach(m => {
      if (!lastEndDate || m.date_fin > lastEndDate) {
        lastEndDate = m.date_fin;
      }
    });
    return lastEndDate;
  };

  // Calculer les blocs de statut pour un jour donné, en tenant compte des maintenances planifiées
  const getStatusBlocksForDay = (equipmentId, day) => {
    const blocks = [];
    const history = historyByEquipment[equipmentId];
    
    const dayStart = new Date(day);
    dayStart.setHours(0, 0, 0, 0);
    
    const dayEnd = new Date(day);
    dayEnd.setHours(23, 59, 59, 999);
    
    // Obtenir la date d'aujourd'hui (sans l'heure)
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    
    // Vérifier si une maintenance planifiée ACTIVE couvre ce jour
    const dateStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    
    const maintenanceForDay = planningEntries.find(e => {
      if (e.equipement_id !== equipmentId) return false;
      // La maintenance doit couvrir ce jour (entre date_debut et date_fin inclus)
      const isInRange = dateStr >= e.date_debut && dateStr <= e.date_fin;
      if (!isInRange) return false;
      
      // Pour les jours PASSÉS au-delà de date_fin, ne PAS afficher la maintenance
      // (la maintenance est terminée)
      // Note: On affiche la maintenance jusqu'à date_fin inclus
      return true;
    });
    
    // Si maintenance planifiée ACTIVE, elle écrase tout l'historique pour ce jour
    if (maintenanceForDay) {
      // Calculer les heures de début/fin pour ce jour
      let startHour = 0;
      let endHour = 24;
      
      if (dateStr === maintenanceForDay.date_debut) {
        if (maintenanceForDay.heure_debut) {
          const [h] = maintenanceForDay.heure_debut.split(':').map(Number);
          startHour = h;
        } else if (maintenanceForDay.periode_debut === 'APRES_MIDI') {
          startHour = 12;
        }
      }
      
      if (dateStr === maintenanceForDay.date_fin) {
        if (maintenanceForDay.heure_fin) {
          const [h] = maintenanceForDay.heure_fin.split(':').map(Number);
          endHour = h;
        } else if (maintenanceForDay.periode_fin === 'MATIN') {
          endHour = 12;
        }
      }
      
      // Obtenir le statut avant la maintenance (ignorer les entrées de maintenance planifiée)
      const statusBeforeMaintenance = history && history.length > 0 
        ? getStatusForDateTime(equipmentId, new Date(day.getFullYear(), day.getMonth(), day.getDate(), startHour - 1), true)
        : null;
      
      // Bloc avant la maintenance (si applicable)
      if (startHour > 0) {
        blocks.push({
          startHour: 0,
          endHour: startHour,
          status: statusBeforeMaintenance
        });
      }
      
      // Bloc de maintenance (EN_MAINTENANCE - couleur jaune)
      blocks.push({
        startHour: startHour,
        endHour: endHour,
        status: 'EN_MAINTENANCE',
        isPlannedMaintenance: true,
        motif: maintenanceForDay.motif
      });
      
      // Bloc après la maintenance (si applicable et si c'est le dernier jour)
      if (endHour < 24 && dateStr === maintenanceForDay.date_fin) {
        // Obtenir le statut après la maintenance (ignorer les entrées de maintenance planifiée)
        const statusAfterMaintenance = history && history.length > 0 
          ? getStatusForDateTime(equipmentId, new Date(day.getFullYear(), day.getMonth(), day.getDate(), endHour + 1), true)
          : null;
        
        blocks.push({
          startHour: endHour,
          endHour: 24,
          status: statusAfterMaintenance
        });
      }
      
      return blocks;
    }
    
    // Pas de maintenance planifiée active pour ce jour
    // Vérifier si le jour est APRÈS la date de fin de la dernière maintenance planifiée
    const lastMaintenanceEnd = getLastMaintenanceEndDate(equipmentId);
    const isAfterAllMaintenances = lastMaintenanceEnd && dateStr > lastMaintenanceEnd;
    
    // Si on est après toutes les maintenances planifiées, le statut devrait être "inconnu"
    // (en attente de la sélection de l'utilisateur via l'email de fin de maintenance)
    if (isAfterAllMaintenances) {
      // Ne pas afficher de statut pour les jours futurs après la fin de maintenance
      // L'utilisateur doit d'abord définir le nouveau statut
      return [{ startHour: 0, endHour: 24, status: null, isAwaitingStatusUpdate: true }];
    }
    
    // Pas de maintenance planifiée active - utiliser l'historique SANS les entrées de maintenance planifiée
    // Filtrer l'historique pour exclure les entrées de maintenance planifiée
    const filteredHistory = history ? history.filter(entry => !entry.is_planned_maintenance) : [];
    
    if (filteredHistory.length === 0) {
      // Chercher le statut actuel de l'équipement (sans maintenance planifiée)
      const lastNonMaintenanceStatus = getStatusForDateTime(equipmentId, dayStart, true);
      return [{ startHour: 0, endHour: 24, status: lastNonMaintenanceStatus }];
    }
    
    const changesThisDay = filteredHistory.filter(entry => {
      const changeDate = entry.changed_at;
      return changeDate >= dayStart && changeDate <= dayEnd;
    });
    
    const statusAtDayStart = getStatusForDateTime(equipmentId, dayStart, true);
    
    if (changesThisDay.length === 0) {
      return [{ startHour: 0, endHour: 24, status: statusAtDayStart }];
    }
    
    let currentHour = 0;
    let currentStatus = statusAtDayStart;
    
    for (const change of changesThisDay) {
      const changeHour = change.changed_at.getHours();
      
      if (changeHour > currentHour) {
        blocks.push({
          startHour: currentHour,
          endHour: changeHour,
          status: currentStatus
        });
      }
      
      currentHour = changeHour;
      currentStatus = change.statut;
    }
    
    if (currentHour < 24) {
      blocks.push({
        startHour: currentHour,
        endHour: 24,
        status: currentStatus
      });
    }
    
    return blocks;
  };

  // Obtenir les entrées de maintenance pour un équipement et un jour donné
  const getMaintenanceEntriesForDay = (equipmentId, date) => {
    const dateStr = date.toISOString().split('T')[0];
    
    return planningEntries.filter(e => {
      if (e.equipement_id !== equipmentId) return false;
      
      const entryStart = new Date(e.date_debut);
      const entryEnd = new Date(e.date_fin);
      const currentDate = new Date(dateStr);
      
      entryStart.setHours(0, 0, 0, 0);
      entryEnd.setHours(0, 0, 0, 0);
      currentDate.setHours(0, 0, 0, 0);
      
      return currentDate >= entryStart && currentDate <= entryEnd;
    });
  };

  // Calculer la position verticale et hauteur d'un bloc de maintenance
  const getMaintenanceBlockStyle = (entry, day) => {
    const dayStr = day.toISOString().split('T')[0];
    const entryStartDate = entry.date_debut;
    const entryEndDate = entry.date_fin;
    
    let startHour = 0;
    let endHour = 24;
    
    if (dayStr === entryStartDate) {
      if (entry.heure_debut) {
        const [h] = entry.heure_debut.split(':').map(Number);
        startHour = h;
      } else if (entry.periode_debut === 'APRES_MIDI') {
        startHour = 12;
      }
    }
    
    if (dayStr === entryEndDate) {
      if (entry.heure_fin) {
        const [h] = entry.heure_fin.split(':').map(Number);
        endHour = h;
      } else if (entry.periode_fin === 'MATIN') {
        endHour = 12;
      }
    }
    
    const top = (startHour / 24) * 100;
    const height = ((endHour - startHour) / 24) * 100;
    
    return { top: `${top}%`, height: `${height}%` };
  };

  // Navigation par mois
  const goToPreviousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    const nextMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
    if (nextMonth <= maxFutureDate) {
      setCurrentDate(nextMonth);
    }
  };

  // Vérifier si la navigation vers le mois suivant est possible
  const canGoToNextMonth = useMemo(() => {
    const nextMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
    return nextMonth <= maxFutureDate;
  }, [currentDate, maxFutureDate]);

  const goToCurrentMonth = () => {
    setCurrentDate(new Date());
  };

  const monthNames = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
  ];

  const dayNames = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

  // Utiliser la date locale (pas UTC) pour éviter le décalage de fuseau horaire
  const getTodayLocalString = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  const getDateLocalString = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  const today = getTodayLocalString();
  const month = currentDate.getMonth();

  // Calculer les statistiques annuelles (limité à la plage valide: passé → aujourd'hui + 12 mois)
  const annualStats = useMemo(() => {
    let totalOperational = 0;
    let totalMaintenance = 0;
    let totalOutOfService = 0;
    let totalHoursWithData = 0;
    
    const maxDateStr = `${maxFutureDate.getFullYear()}-${String(maxFutureDate.getMonth() + 1).padStart(2, '0')}-${String(maxFutureDate.getDate()).padStart(2, '0')}`;
    
    equipments.forEach(equipment => {
      for (let m = 0; m < 12; m++) {
        const daysInMonth = new Date(year, m + 1, 0).getDate();
        for (let day = 1; day <= daysInMonth; day++) {
          const dateStr = `${year}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          if (dateStr > maxDateStr) return;
          
          const date = new Date(year, m, day);
          const statusBlocks = getStatusBlocksForDay(equipment.id, date);
          
          statusBlocks.forEach(block => {
            const hours = block.endHour - block.startHour;
            
            if (block.status !== null) {
              totalHoursWithData += hours;
              
              if (block.status === 'HORS_SERVICE') {
                totalOutOfService += hours;
              } else if (block.status === 'EN_MAINTENANCE') {
                totalMaintenance += hours;
              } else {
                totalOperational += hours;
              }
            }
          });
        }
      }
    });
    
    const operationalPercent = totalHoursWithData > 0 ? Math.round((totalOperational / totalHoursWithData) * 100) : 0;
    const maintenancePercent = totalHoursWithData > 0 ? Math.round((totalMaintenance / totalHoursWithData) * 100) : 0;
    const outOfServicePercent = totalHoursWithData > 0 ? Math.round((totalOutOfService / totalHoursWithData) * 100) : 0;
    
    return {
      operational: Math.round(totalOperational),
      maintenance: Math.round(totalMaintenance),
      outOfService: Math.round(totalOutOfService),
      total: totalHoursWithData,
      operationalPercent,
      maintenancePercent,
      outOfServicePercent
    };
  }, [equipments, statusHistory, year, maxFutureDate]);

  // Fonction pour obtenir le statut effectif d'un équipement (prenant en compte les maintenances actives)
  const getEffectiveStatus = (equipmentId, equipmentStatus) => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    
    // Vérifier si une maintenance planifiée active couvre aujourd'hui
    const activeMaintenance = planningEntries.find(e => {
      if (e.equipement_id !== equipmentId) return false;
      // La maintenance doit être active AUJOURD'HUI (entre date_debut et date_fin inclus)
      return today >= e.date_debut && today <= e.date_fin;
    });
    
    if (activeMaintenance) {
      return 'EN_MAINTENANCE';
    }
    
    return equipmentStatus;
  };

  // Jours du mois actuel
  const days = getDaysInMonth(year, month);
  const isCurrentMonth = month === new Date().getMonth() && year === new Date().getFullYear();

  // Composant pour afficher une ligne d'équipement
  const EquipmentRow = ({ equipment, isChild = false }) => {
    const hasChildren = childrenByParent[equipment.id]?.length > 0;
    const isExpanded = expandedEquipments.has(equipment.id);
    
    // Obtenir le statut effectif (prenant en compte les maintenances)
    const effectiveStatus = getEffectiveStatus(equipment.id, equipment.statut);
    
    return (
      <div 
        className="grid border-b last:border-b-0"
        style={{ gridTemplateColumns: `180px repeat(${days.length}, 1fr)` }}
      >
        {/* Nom de l'équipement */}
        <div 
          className={`p-2 bg-white border-r font-medium flex items-center gap-1 ${isChild ? 'bg-gray-50' : ''}`}
          style={{ paddingLeft: isChild ? '24px' : '8px' }}
        >
          {/* Chevron pour les équipements avec enfants */}
          {hasChildren ? (
            <button
              onClick={() => toggleExpand(equipment.id)}
              className="p-0.5 hover:bg-gray-200 rounded flex-shrink-0"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-gray-500" />
              ) : (
                <ChevronRightIcon className="h-4 w-4 text-gray-500" />
              )}
            </button>
          ) : (
            <div className="w-5 flex-shrink-0" /> 
          )}
          
          <div 
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: STATUS_COLORS[effectiveStatus] || STATUS_COLORS.OPERATIONNEL }}
            title={`Statut: ${STATUS_LABELS[effectiveStatus] || effectiveStatus}`}
          />
          <span className={`truncate text-sm ${isChild ? 'text-gray-600' : ''}`} title={equipment.nom}>
            {equipment.nom}
          </span>
          {equipment.loto_active && (
            <span className="inline-flex items-center gap-0.5 px-1 py-0 rounded bg-red-100 text-red-600 text-[10px] font-bold flex-shrink-0" title={`LOTO ${equipment.loto_numero || ''} - Equipement consigne`}>
              LOTO
            </span>
          )}
        </div>
        
        {/* Cellules des jours */}
        {days.map((day, dayIndex) => {
          const isWeekend = day.getDay() === 0 || day.getDay() === 6;
          const statusBlocks = getStatusBlocksForDay(equipment.id, day);
          
          return (
            <div 
              key={dayIndex} 
              className={`border-r last:border-r-0 ${isWeekend ? 'bg-blue-50/30' : ''}`}
            >
              {/* Cellule 24h verticale (0h en haut, 24h en bas) */}
              <div className="relative h-10 w-full bg-gray-100">
                {/* Blocs de statut (incluant les maintenances planifiées) */}
                {statusBlocks.map((block, blockIdx) => {
                  const top = (block.startHour / 24) * 100;
                  const height = ((block.endHour - block.startHour) / 24) * 100;
                  const bgColor = block.status ? STATUS_COLORS[block.status] : NO_HISTORY_COLOR;
                  
                  let title;
                  if (block.isPlannedMaintenance) {
                    title = `🔧 Maintenance planifiée\n${block.motif || 'Maintenance préventive'}\n${block.startHour}h - ${block.endHour}h`;
                  } else if (block.status) {
                    title = `${STATUS_LABELS[block.status]} (${block.startHour}h - ${block.endHour}h)`;
                  } else {
                    title = `Sans données (${block.startHour}h - ${block.endHour}h)`;
                  }
                  
                  return (
                    <div
                      key={`status-${blockIdx}`}
                      className={`absolute left-0 right-0 ${block.isPlannedMaintenance ? 'cursor-pointer hover:opacity-80' : ''}`}
                      style={{
                        top: `${top}%`,
                        height: `${height}%`,
                        backgroundColor: bgColor,
                      }}
                      title={title}
                    />
                  );
                })}
                
                {/* Trait horizontal à 12h (50%) */}
                <div 
                  className="absolute left-0 right-0 h-px opacity-30 z-10"
                  style={{ top: '50%', backgroundColor: '#000' }}
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  if (loading && equipments.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg">Chargement du planning...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Planning Maintenance Préventive
              {pendingDemandesCount > 0 && (
                <Badge className="bg-yellow-100 text-yellow-700 ml-2">
                  <Clock className="h-3 w-3 mr-1" />
                  {pendingDemandesCount} en attente
                </Badge>
              )}
              {/* Indicateur de connexion temps réel */}
              <div 
                className={`flex items-center gap-1 ml-2 px-2 py-0.5 rounded-full text-xs ${
                  wsConnected 
                    ? 'bg-green-100 text-green-700' 
                    : 'bg-gray-100 text-gray-500'
                }`}
                title={wsConnected ? 'Synchronisation temps réel active' : 'Mode hors ligne - Rafraîchissement manuel'}
              >
                {wsConnected ? (
                  <><Wifi className="h-3 w-3" /> Temps réel</>
                ) : (
                  <><WifiOff className="h-3 w-3" /> Hors ligne</>
                )}
              </div>
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setHistoriqueDialogOpen(true)}>
                <History className="h-4 w-4 mr-2" />
                Historique des demandes
              </Button>
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Demande d'Arrêt
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Statistiques annuelles */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-4xl font-bold text-green-700">
                  {annualStats.operationalPercent}%
                </div>
                <div className="text-sm text-green-600 font-medium mt-1">Opérationnel</div>
                <div className="text-xs text-green-500 mt-1">
                  {annualStats.operational}h
                </div>
              </div>
              <div className="h-12 w-12 rounded-full bg-green-500 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-4xl font-bold text-orange-700">
                  {annualStats.maintenancePercent}%
                </div>
                <div className="text-sm text-orange-600 font-medium mt-1">En Maintenance</div>
                <div className="text-xs text-orange-500 mt-1">
                  {annualStats.maintenance}h
                </div>
              </div>
              <div className="h-12 w-12 rounded-full bg-orange-500 flex items-center justify-center">
                <Wrench className="h-6 w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-red-50 to-red-100 border-red-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-4xl font-bold text-red-700">
                  {annualStats.outOfServicePercent}%
                </div>
                <div className="text-sm text-red-600 font-medium mt-1">Hors Service</div>
                <div className="text-xs text-red-500 mt-1">
                  {annualStats.outOfService}h
                </div>
              </div>
              <div className="h-12 w-12 rounded-full bg-red-500 flex items-center justify-center">
                <AlertCircle className="h-6 w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Info statistiques */}
      <div className="p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700 flex items-center gap-2">
        <Calendar className="h-4 w-4" />
        <span>
          Statistiques annuelles {year} pour <strong>{equipments.length} équipement(s)</strong> 
          {annualStats.total > 0 ? ` - ${annualStats.total}h de données enregistrées` : ' - Aucune donnée enregistrée'}
        </span>
      </div>

      {/* Navigation mensuelle et Planning */}
      <Card>
        <CardContent className="pt-6">
          {/* Navigation par mois */}
          <div className="flex items-center justify-between mb-4">
            <Button variant="outline" size="sm" onClick={goToPreviousMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-4">
              <h2 className={`text-xl font-bold ${isCurrentMonth ? 'text-blue-600' : ''}`}>
                {monthNames[month]} {year}
              </h2>
              <Button variant="ghost" size="sm" onClick={goToCurrentMonth}>
                Mois actuel
              </Button>
              <span className="text-xs text-gray-400">
                Horizon : {monthNames[maxFutureDate.getMonth()]} {maxFutureDate.getFullYear()}
              </span>
            </div>
            <Button variant="outline" size="sm" onClick={goToNextMonth} disabled={!canGoToNextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Légende des statuts */}
          <div className="flex flex-wrap items-center gap-3 mb-4 p-3 bg-gray-50 rounded">
            <span className="text-sm font-semibold">Légende :</span>
            <div className="flex items-center gap-1">
              <div 
                className="w-3 h-3 rounded border border-gray-300"
                style={{ backgroundColor: NO_HISTORY_COLOR }}
              />
              <span className="text-xs">Sans données</span>
            </div>
            {Object.entries(STATUS_COLORS).map(([status, color]) => (
              <div key={status} className="flex items-center gap-1">
                <div 
                  className="w-3 h-3 rounded"
                  style={{ backgroundColor: color }}
                />
                <span className="text-xs">{STATUS_LABELS[status]}</span>
              </div>
            ))}
          </div>

          {/* Grille du planning */}
          <div className="border rounded-lg overflow-hidden select-none" data-testid="planning-mprev-grid">
            {/* En-tête des jours */}
            <div 
              className="grid bg-gray-100 border-b" 
              style={{ gridTemplateColumns: `180px repeat(${days.length}, 1fr)` }}
            >
              <div className="p-2 font-semibold text-sm text-gray-700 border-r flex items-center gap-2">
                <Wrench className="h-4 w-4" />
                Équipement
              </div>
              {days.map((day, index) => {
                const isToday = getDateLocalString(day) === today;
                const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                return (
                  <div
                    key={index}
                    className={`p-1 text-center border-r last:border-r-0 ${
                      isToday ? 'bg-blue-200 border-2 border-blue-500' : isWeekend ? 'bg-blue-50' : ''
                    }`}
                  >
                    <div className={`text-[10px] ${isWeekend ? 'text-blue-600' : 'text-gray-500'}`}>
                      {dayNames[day.getDay()]}
                    </div>
                    <div className={`text-xs font-semibold ${isToday ? 'text-blue-600' : ''}`}>
                      {day.getDate()}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Corps - Équipements hiérarchiques */}
            {parentEquipments.map((parentEquipment) => (
              <React.Fragment key={parentEquipment.id}>
                {/* Équipement principal */}
                <EquipmentRow equipment={parentEquipment} isChild={false} />
                
                {/* Sous-équipements (si développé) */}
                {expandedEquipments.has(parentEquipment.id) && 
                  childrenByParent[parentEquipment.id]?.map((childEquipment) => (
                    <EquipmentRow key={childEquipment.id} equipment={childEquipment} isChild={true} />
                  ))
                }
              </React.Fragment>
            ))}
          </div>

          {/* Message si pas d'équipements */}
          {equipments.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <Wrench className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Aucun équipement trouvé</p>
              <p className="text-sm">Ajoutez des équipements pour voir le planning</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog de demande d'arrêt */}
      <DemandeArretDialog 
        open={dialogOpen} 
        onOpenChange={setDialogOpen}
        equipments={equipments}
        onSuccess={() => {
          // Rafraîchir le planning via le hook
          refreshPlanning();
          loadPendingDemandesCount();
          setDialogOpen(false);
        }}
      />

      {/* Dialog historique des demandes */}
      <HistoriqueDemandesDialog
        open={historiqueDialogOpen}
        onOpenChange={setHistoriqueDialogOpen}
      />
    </div>
  );
};

export default PlanningMPrev;
