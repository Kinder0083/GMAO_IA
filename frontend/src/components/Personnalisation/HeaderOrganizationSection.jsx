import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '../ui/card';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { usePreferences } from '../../contexts/PreferencesContext';
import { useToast } from '../../hooks/use-toast';
import { usePermissions } from '../../hooks/usePermissions';
import {
  GripVertical, ArrowUp, ArrowDown, RotateCcw,
  BookOpen, Bot, HelpCircle, Clock, Wifi,
  HardDrive, Camera, Zap, Mail, CalendarClock,
  Download, Eye, Package, AlertTriangle, Lock,
  BellRing, Sparkles, Bell, User
} from 'lucide-react';

// Registre de toutes les icônes du header avec métadonnées
// module: null = visible pour tous | module: '__admin__' = admin uniquement | module: 'xxx' = selon permission
export const HEADER_ICONS_REGISTRY = [
  { id: 'manual',             label: 'Manuel',                 icon: BookOpen,      zone: 'left',  module: null },
  { id: 'ai_assistant',       label: 'Assistant IA (Adria)',   icon: Bot,           zone: 'left',  module: null },
  { id: 'help',               label: 'Aide',                   icon: HelpCircle,    zone: 'left',  module: null },
  { id: 'clock',              label: 'Horloge',                icon: Clock,         zone: 'left',  module: null },
  { id: 'offline_indicator',  label: 'Statut en ligne',        icon: Wifi,          zone: 'left',  module: null },
  { id: 'backup',             label: 'Sauvegarde',             icon: HardDrive,     zone: 'right', module: '__admin__' },
  { id: 'camera',             label: 'Cameras',                icon: Camera,        zone: 'right', module: 'cameras' },
  { id: 'mes',                label: 'Alertes M.E.S.',         icon: Zap,           zone: 'right', module: 'mes' },
  { id: 'chat_live',          label: 'Chat Live',              icon: Mail,          zone: 'right', module: 'chatLive' },
  { id: 'overdue_calendar',   label: 'Echeances',              icon: CalendarClock, zone: 'right', module: null },
  { id: 'update_badge',       label: 'Mise a jour (Admin)',    icon: Download,      zone: 'right', module: '__admin__' },
  { id: 'surveillance',       label: 'Plan de Surveillance',   icon: Eye,           zone: 'right', module: 'surveillance' },
  { id: 'inventory',          label: 'Alertes Inventaire',     icon: Package,       zone: 'right', module: 'inventory' },
  { id: 'mqtt_alerts',        label: 'Alertes MQTT',           icon: AlertTriangle, zone: 'right', module: 'sensors' },
  { id: 'loto',               label: 'Consignations LOTO',     icon: Lock,          zone: 'right', module: 'consignationsLoto' },
  { id: 'notifications',      label: 'Notifications',          icon: BellRing,      zone: 'right', module: null },
  { id: 'whatsnew',           label: 'Quoi de neuf',           icon: Sparkles,      zone: 'right', module: null },
  { id: 'bell',               label: 'Cloche activite',        icon: Bell,          zone: 'right', module: null },
  { id: 'profile',            label: 'Profil utilisateur',     icon: User,          zone: 'right', module: null },
];

export const DEFAULT_HEADER_ORDER = HEADER_ICONS_REGISTRY.map(item => item.id);

const zoneLabels = { left: 'Gauche', right: 'Droite' };
const zoneColors = { left: 'bg-blue-50 border-blue-200', right: 'bg-emerald-50 border-emerald-200' };
const zoneDot = { left: 'bg-blue-500', right: 'bg-emerald-500' };

const HeaderOrganizationSection = () => {
  const { preferences, updatePreferences } = usePreferences();
  const { toast } = useToast();
  const { canView, isAdmin } = usePermissions();
  const [items, setItems] = useState([]);
  const [draggedIdx, setDraggedIdx] = useState(null);

  // Détermine si une icône du header est accessible pour l'utilisateur courant
  const isIconAccessible = (item) => {
    if (item.module === null) return true;       // Visible par tous
    if (item.module === '__admin__') return isAdmin(); // Admin uniquement
    return isAdmin() || canView(item.module);    // Selon permission module
  };

  useEffect(() => {
    const savedOrder = preferences?.header_icon_order;
    if (savedOrder && Array.isArray(savedOrder) && savedOrder.length > 0) {
      // Reconstituer la liste en respectant l'ordre sauvegardé
      const ordered = [];
      savedOrder.forEach(id => {
        const reg = HEADER_ICONS_REGISTRY.find(r => r.id === id);
        if (reg) ordered.push(reg);
      });
      // Ajouter les icônes manquantes (nouvelles) à la fin
      HEADER_ICONS_REGISTRY.forEach(reg => {
        if (!ordered.find(o => o.id === reg.id)) ordered.push(reg);
      });
      setItems(ordered);
    } else {
      setItems([...HEADER_ICONS_REGISTRY]);
    }
  }, [preferences]);

  const save = async (newItems) => {
    const order = newItems.map(i => i.id);
    try {
      await updatePreferences({ header_icon_order: order });
      toast({ title: 'Succes', description: 'Ordre du header mis a jour' });
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de sauvegarder', variant: 'destructive' });
    }
  };

  const moveUp = (idx) => {
    if (idx <= 0) return;
    const arr = [...items];
    [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
    setItems(arr);
    save(arr);
  };

  const moveDown = (idx) => {
    if (idx >= items.length - 1) return;
    const arr = [...items];
    [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
    setItems(arr);
    save(arr);
  };

  const handleDragStart = (idx) => setDraggedIdx(idx);
  const handleDragOver = (e) => e.preventDefault();
  const handleDrop = (targetIdx) => {
    if (draggedIdx === null || draggedIdx === targetIdx) { setDraggedIdx(null); return; }
    const arr = [...items];
    const [removed] = arr.splice(draggedIdx, 1);
    arr.splice(targetIdx, 0, removed);
    setItems(arr);
    setDraggedIdx(null);
    save(arr);
  };

  const reset = async () => {
    if (!window.confirm('Reinitialiser l\'ordre des icones du header ?')) return;
    const defaultItems = [...HEADER_ICONS_REGISTRY];
    setItems(defaultItems);
    try {
      await updatePreferences({ header_icon_order: DEFAULT_HEADER_ORDER });
      toast({ title: 'Succes', description: 'Ordre reinitialise' });
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de reinitialiser', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6" data-testid="header-organization-section">
      <Card>
        <CardContent className="pt-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <Label className="text-base font-semibold">Organiser les icones du header</Label>
              <p className="text-sm text-gray-500 mt-1">
                Utilisez les fleches ou le glisser-deposer pour reorganiser les icones de la barre de navigation
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={reset} className="gap-2">
              <RotateCcw size={14} />
              Reinitialiser
            </Button>
          </div>

          <div className="flex gap-4 mb-4 text-xs">
            <div className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${zoneDot.left}`}></span>
              <span className="text-gray-500">Zone gauche</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${zoneDot.right}`}></span>
              <span className="text-gray-500">Zone droite</span>
            </div>
          </div>

          <div className="space-y-1.5">
            {items.filter(isIconAccessible).map((item, idx, filteredItems) => {
              const Icon = item.icon;
              const isFirst = idx === 0;
              const isLast = idx === filteredItems.length - 1;
              // Index réel dans items[] pour les opérations de déplacement
              const realIdx = items.indexOf(item);
              const isDragged = draggedIdx === realIdx;

              return (
                <div
                  key={item.id}
                  draggable
                  onDragStart={() => handleDragStart(realIdx)}
                  onDragOver={handleDragOver}
                  onDrop={() => handleDrop(realIdx)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all ${
                    isDragged ? 'bg-blue-50 border-blue-300 opacity-50 scale-[0.98]' : `bg-white border-gray-200 hover:border-gray-300`
                  }`}
                  data-testid={`header-icon-item-${item.id}`}
                >
                  {/* Fleches haut/bas */}
                  <div className="flex flex-col gap-0.5">
                    <Button
                      variant="ghost" size="sm" className="h-5 w-5 p-0"
                      onClick={() => moveUp(realIdx)} disabled={isFirst}
                    >
                      <ArrowUp size={13} className={isFirst ? 'text-gray-300' : 'text-gray-500'} />
                    </Button>
                    <Button
                      variant="ghost" size="sm" className="h-5 w-5 p-0"
                      onClick={() => moveDown(realIdx)} disabled={isLast}
                    >
                      <ArrowDown size={13} className={isLast ? 'text-gray-300' : 'text-gray-500'} />
                    </Button>
                  </div>

                  {/* Grip drag */}
                  <div className="cursor-grab active:cursor-grabbing">
                    <GripVertical size={16} className="text-gray-400" />
                  </div>

                  {/* Icone */}
                  <div className={`p-1.5 rounded-md border ${zoneColors[item.zone]}`}>
                    <Icon size={16} className={item.zone === 'left' ? 'text-blue-600' : 'text-emerald-600'} />
                  </div>

                  {/* Label */}
                  <span className="flex-1 text-sm font-medium text-gray-700">{item.label}</span>

                  {/* Zone badge */}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                    item.zone === 'left' ? 'bg-blue-100 text-blue-600' : 'bg-emerald-100 text-emerald-600'
                  }`}>
                    {zoneLabels[item.zone]}
                  </span>

                  {/* Position */}
                  <span className="text-xs text-gray-400 w-6 text-right">{idx + 1}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default HeaderOrganizationSection;
