import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Link2, ExternalLink, MoveRight, ChevronRight, Loader2, MapPin, ArrowUpToLine } from 'lucide-react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { useToast } from '../../hooks/use-toast';
import { locationsAPI } from '../../services/api';

const MENU_ITEMS = [
  { id: 'dashboard', icon: 'LayoutDashboard', label: 'Tableau de bord', path: '/dashboard' },
  { id: 'service-dashboard', icon: 'Presentation', label: 'Dashboard Service', path: '/service-dashboard' },
  { id: 'chat-live', icon: 'Mail', label: 'Chat Live', path: '/chat-live' },
  { id: 'intervention-requests', icon: 'MessageSquare', label: 'Demandes d\'inter.', path: '/intervention-requests' },
  { id: 'work-orders', icon: 'ClipboardList', label: 'Ordres de travail', path: '/work-orders' },
  { id: 'improvement-requests', icon: 'Lightbulb', label: 'Demandes d\'amel.', path: '/improvement-requests' },
  { id: 'improvements', icon: 'Sparkles', label: 'Ameliorations', path: '/improvements' },
  { id: 'preventive-maintenance', icon: 'Calendar', label: 'Maintenance prev.', path: '/preventive-maintenance' },
  { id: 'planning-mprev', icon: 'Calendar', label: 'Planning M.Prev.', path: '/planning-mprev' },
  { id: 'consignations-loto', icon: 'Shield', label: 'Consignations LOTO', path: '/consignations-loto' },
  { id: 'assets', icon: 'Wrench', label: 'Equipements', path: '/assets' },
  { id: 'inventory', icon: 'Package', label: 'Inventaire', path: '/inventory' },
  { id: 'purchase-requests', icon: 'ShoppingCart', label: 'Demandes d\'Achat', path: '/purchase-requests' },
  { id: 'locations', icon: 'MapPin', label: 'Zones', path: '/locations' },
  { id: 'meters', icon: 'Gauge', label: 'Compteurs', path: '/meters' },
  { id: 'sensors', icon: 'Activity', label: 'Capteurs MQTT', path: '/sensors' },
  { id: 'surveillance-plan', icon: 'Eye', label: 'Plan de Surveillance', path: '/surveillance-plan' },
  { id: 'surveillance-rapport', icon: 'FileText', label: 'Rapport Surveillance', path: '/surveillance-rapport' },
  { id: 'surveillance-ai-history', icon: 'History', label: 'Historique IA', path: '/surveillance-ai-history' },
  { id: 'surveillance-ai-dashboard', icon: 'TrendingUp', label: 'Tendances IA', path: '/surveillance-ai-dashboard' },
  { id: 'weekly-reports', icon: 'FileText', label: 'Rapports Hebdo.', path: '/weekly-reports' },
  { id: 'presqu-accident', icon: 'AlertTriangle', label: 'Presqu\'accident', path: '/presqu-accident' },
  { id: 'documentations', icon: 'FolderOpen', label: 'Documentations', path: '/documentations' },
  { id: 'reports', icon: 'BarChart3', label: 'Rapports', path: '/reports' },
  { id: 'team-management', icon: 'UserCog', label: 'Gestion d\'equipe', path: '/team-management' },
  { id: 'cameras', icon: 'Camera', label: 'Cameras', path: '/cameras' },
  { id: 'mes', icon: 'Zap', label: 'M.E.S', path: '/mes' },
  { id: 'people', icon: 'Users', label: 'Utilisateurs', path: '/people' },
  { id: 'planning', icon: 'Calendar', label: 'Planning', path: '/planning' },
  { id: 'vendors', icon: 'ShoppingCart', label: 'Fournisseurs', path: '/vendors' },
  { id: 'contrats', icon: 'FileSignature', label: 'Contrats', path: '/contrats' },
  { id: 'purchase-history', icon: 'ShoppingBag', label: 'Historique Achat', path: '/purchase-history' },
  { id: 'import-export', icon: 'Database', label: 'Import / Export', path: '/import-export' },
  { id: 'whiteboard', icon: 'PresentationIcon', label: 'Tableau d\'affichage', path: '/whiteboard' },
  { id: 'training', icon: 'GraduationCap', label: 'Formation', path: '/training' },
  { id: 'settings', icon: 'Settings', label: 'Parametres', path: '/settings' },
  { id: 'system-health', icon: 'HeartPulse', label: 'Sante systeme', path: '/system-health' },
];

export function findMenuItemByPath(pathname) {
  return MENU_ITEMS.find(item => pathname === item.path || pathname.startsWith(item.path + '/'));
}

const GlobalContextMenu = ({ onCreateShortcut }) => {
  const [menuPos, setMenuPos] = useState(null);
  const [showUrlForm, setShowUrlForm] = useState(false);
  const [urlConfig, setUrlConfig] = useState({ name: '', url: '' });
  // Contexte zone : si l'utilisateur a Ctrl+click-droit sur une card de zone
  const [zoneCtx, setZoneCtx] = useState(null); // { id, name, parentId, level }
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const [allZones, setAllZones] = useState(null); // null = pas chargé, [] = chargé vide
  const [movingZoneId, setMovingZoneId] = useState(null);
  const location = useLocation();
  const { toast } = useToast();

  const currentMenuItem = findMenuItemByPath(location.pathname);

  const handleContextMenu = useCallback((e) => {
    if (e.ctrlKey) {
      e.preventDefault();
      // Détecter si l'utilisateur a cliqué sur une zone (data-zone-id)
      const zoneEl = e.target?.closest?.('[data-zone-id]');
      if (zoneEl) {
        setZoneCtx({
          id: zoneEl.getAttribute('data-zone-id'),
          name: zoneEl.getAttribute('data-zone-name') || '?',
          parentId: zoneEl.getAttribute('data-zone-parent-id') || null,
          level: parseInt(zoneEl.getAttribute('data-zone-level') || '0', 10),
        });
      } else {
        setZoneCtx(null);
      }
      setMenuPos({ x: e.clientX, y: e.clientY });
      setShowUrlForm(false);
      setShowMoveMenu(false);
    }
  }, []);

  const handleClose = useCallback(() => {
    setMenuPos(null);
    setShowUrlForm(false);
    setShowMoveMenu(false);
    setZoneCtx(null);
    setUrlConfig({ name: '', url: '' });
  }, []);

  useEffect(() => {
    document.addEventListener('contextmenu', handleContextMenu);
    const closeOnClick = (e) => {
      if (menuPos && e.target && typeof e.target.closest === 'function' && !e.target.closest('[data-global-context-menu]')) {
        handleClose();
      }
    };
    document.addEventListener('mousedown', closeOnClick);
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('mousedown', closeOnClick);
    };
  }, [handleContextMenu, handleClose, menuPos]);

  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') handleClose(); };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [handleClose]);

  const handleCreatePageShortcut = () => {
    if (!currentMenuItem) {
      toast({ title: 'Erreur', description: 'Page non reconnue', variant: 'destructive' });
      handleClose();
      return;
    }
    const shortcut = {
      id: `shortcut-${Date.now()}`,
      type: 'shortcut',
      name: currentMenuItem.label,
      icon: currentMenuItem.icon,
      customIconUrl: null,
      target: currentMenuItem.path,
      targetType: 'page',
      iconSize: 'medium',
      labelPosition: 'below',
    };
    onCreateShortcut(shortcut);
    toast({ title: 'Raccourci cree', description: `"${currentMenuItem.label}" ajoute au tableau de bord` });
    handleClose();
  };

  const handleCreateUrlShortcut = () => {
    if (!urlConfig.name.trim() || !urlConfig.url.trim()) return;
    const shortcut = {
      id: `shortcut-${Date.now()}`,
      type: 'shortcut',
      name: urlConfig.name.trim(),
      icon: 'ExternalLink',
      customIconUrl: null,
      target: urlConfig.url.trim(),
      targetType: 'url',
      iconSize: 'medium',
      labelPosition: 'below',
    };
    onCreateShortcut(shortcut);
    toast({ title: 'Raccourci cree', description: `"${urlConfig.name}" ajoute au tableau de bord` });
    handleClose();
  };

  // ────────────────────────────────────────────────────────────────────
  //  Sous-menu "Déplacer vers" pour les zones
  // ────────────────────────────────────────────────────────────────────
  const openMoveMenu = useCallback(async () => {
    setShowMoveMenu(true);
    if (allZones === null) {
      try {
        const res = await locationsAPI.getAll();
        setAllZones(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        toast({
          title: 'Erreur',
          description: 'Impossible de charger les zones.',
          variant: 'destructive',
        });
        setAllZones([]);
      }
    }
  }, [allZones, toast]);

  // Liste des descendants de la zone en cours (pour les exclure des cibles)
  const descendantIds = useMemo(() => {
    if (!zoneCtx || !allZones) return new Set();
    const result = new Set([zoneCtx.id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const z of allZones) {
        if (z.parent_id && result.has(z.parent_id) && !result.has(z.id)) {
          result.add(z.id);
          changed = true;
        }
      }
    }
    return result;
  }, [zoneCtx, allZones]);

  // Construire l'arborescence affichable (toutes zones SAUF descendants + zone elle-même)
  const moveTargets = useMemo(() => {
    if (!allZones || !zoneCtx) return [];
    const valid = allZones.filter(z => !descendantIds.has(z.id));
    // Construire la hiérarchie pour affichage indenté
    const byParent = {};
    valid.forEach(z => {
      const p = z.parent_id || '__root__';
      if (!byParent[p]) byParent[p] = [];
      byParent[p].push(z);
    });
    const flatten = (parentKey, level) => {
      const list = (byParent[parentKey] || []).sort((a, b) =>
        (a.nom || '').localeCompare(b.nom || ''));
      const result = [];
      for (const z of list) {
        result.push({ ...z, level });
        if (level < 2) {
          // ne descend que jusqu'à 2 (cf. limite backend max 3 niveaux)
          result.push(...flatten(z.id, level + 1));
        }
      }
      return result;
    };
    return flatten('__root__', 0);
  }, [allZones, descendantIds, zoneCtx]);

  const handleMoveZone = async (newParentId) => {
    if (!zoneCtx) return;
    if ((zoneCtx.parentId || '') === (newParentId || '')) {
      toast({ title: 'Aucun changement', description: 'La zone est déjà à cet emplacement.' });
      handleClose();
      return;
    }
    setMovingZoneId(zoneCtx.id);
    try {
      // Envoi : "" pour racine = backend interprète comme None
      await locationsAPI.update(zoneCtx.id, { parent_id: newParentId || '' });
      toast({
        title: 'Zone déplacée',
        description: `« ${zoneCtx.name} » a été déplacée avec succès.`,
      });
      handleClose();
    } catch (err) {
      toast({
        title: 'Échec du déplacement',
        description: err?.response?.data?.detail || 'Impossible de déplacer la zone.',
        variant: 'destructive',
      });
    } finally {
      setMovingZoneId(null);
    }
  };

  if (!menuPos) return null;

  const menuStyle = {
    position: 'fixed',
    left: Math.min(menuPos.x, window.innerWidth - 280),
    top: Math.min(menuPos.y, window.innerHeight - 200),
    zIndex: 99999,
  };

  return (
    <div data-global-context-menu style={menuStyle} className="w-64 bg-white rounded-lg shadow-2xl border border-gray-200 overflow-visible animate-in fade-in zoom-in-95 duration-150" data-testid="global-context-menu">
      <div className="p-1.5">
        {!showUrlForm ? (
          <>
            {/* Section ZONE — visible uniquement si Ctrl+clic sur une zone */}
            {zoneCtx && (
              <>
                <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-500 border-b border-gray-100 mb-1 flex items-center gap-1.5">
                  <MapPin className="h-3 w-3" /> Zone : {zoneCtx.name}
                </div>
                <div
                  className="relative"
                  onMouseEnter={openMoveMenu}
                  onMouseLeave={() => setShowMoveMenu(false)}
                  data-testid="ctx-zone-move-trigger"
                >
                  <button
                    className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 rounded-md transition-colors"
                    onClick={openMoveMenu}
                  >
                    <span className="flex items-center gap-3">
                      <MoveRight className="h-4 w-4" />
                      Déplacer vers...
                    </span>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                  {showMoveMenu && (
                    <div
                      className="absolute left-full top-0 ml-1 w-72 max-h-[400px] overflow-y-auto bg-white rounded-lg shadow-2xl border border-gray-200 animate-in fade-in zoom-in-95 duration-100 z-50"
                      data-testid="ctx-zone-move-submenu"
                    >
                      {allZones === null ? (
                        <div className="p-4 flex items-center gap-2 text-sm text-gray-500">
                          <Loader2 className="h-4 w-4 animate-spin" /> Chargement...
                        </div>
                      ) : (
                        <div className="p-1">
                          {/* Option : déplacer vers RACINE */}
                          <button
                            onClick={() => handleMoveZone(null)}
                            disabled={!zoneCtx.parentId || movingZoneId === zoneCtx.id}
                            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            data-testid="ctx-zone-move-target-root"
                          >
                            <ArrowUpToLine className="h-4 w-4" />
                            <span className="font-medium">↑ Zone racine (aucun parent)</span>
                          </button>
                          <div className="my-1 border-t border-gray-100" />
                          {moveTargets.length === 0 && (
                            <div className="px-3 py-3 text-xs italic text-gray-400">
                              Aucune autre zone disponible.
                            </div>
                          )}
                          {moveTargets.map((z) => {
                            const isCurrentParent = (zoneCtx.parentId || '') === z.id;
                            const wouldExceedDepth = z.level >= 2;
                            const disabled = isCurrentParent || wouldExceedDepth || movingZoneId === zoneCtx.id;
                            return (
                              <button
                                key={z.id}
                                onClick={() => handleMoveZone(z.id)}
                                disabled={disabled}
                                title={
                                  isCurrentParent ? 'Parent actuel'
                                    : wouldExceedDepth ? 'Profondeur max atteinte'
                                      : ''
                                }
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-left"
                                style={{ paddingLeft: `${12 + z.level * 16}px` }}
                                data-testid={`ctx-zone-move-target-${z.id}`}
                              >
                                <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                                <span className="truncate flex-1">{z.nom}</span>
                                {isCurrentParent && (
                                  <span className="text-[10px] text-gray-400 italic">actuel</span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="my-1.5 border-t border-gray-100" />
              </>
            )}
            <button
              onClick={handleCreatePageShortcut}
              disabled={!currentMenuItem}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              data-testid="ctx-create-page-shortcut"
            >
              <Link2 className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">
                {currentMenuItem ? `Raccourci : ${currentMenuItem.label}` : 'Page non reconnue'}
              </span>
            </button>
            <button
              onClick={() => setShowUrlForm(true)}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 rounded-md transition-colors"
              data-testid="ctx-create-url-shortcut"
            >
              <ExternalLink className="h-4 w-4 flex-shrink-0" />
              <span>Raccourci d'adresse...</span>
            </button>
          </>
        ) : (
          <div className="p-2 space-y-3">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Nouveau raccourci d'adresse</p>
            <div className="space-y-1.5">
              <Label className="text-xs">Nom</Label>
              <Input
                placeholder="Ex: Intranet, Dossier reseau..."
                value={urlConfig.name}
                onChange={(e) => setUrlConfig(prev => ({ ...prev, name: e.target.value }))}
                className="h-8 text-sm"
                data-testid="ctx-url-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Adresse (URL, chemin reseau...)</Label>
              <Input
                placeholder="https://... ou \\\\serveur\\dossier"
                value={urlConfig.url}
                onChange={(e) => setUrlConfig(prev => ({ ...prev, url: e.target.value }))}
                className="h-8 text-sm"
                data-testid="ctx-url-address"
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" className="flex-1 h-8 text-xs" onClick={() => setShowUrlForm(false)}>Retour</Button>
              <Button
                size="sm"
                className="flex-1 h-8 text-xs"
                disabled={!urlConfig.name.trim() || !urlConfig.url.trim()}
                onClick={handleCreateUrlShortcut}
                data-testid="ctx-url-confirm"
              >
                Creer
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GlobalContextMenu;
