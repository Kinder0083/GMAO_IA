import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Link2, ExternalLink } from 'lucide-react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { useToast } from '../../hooks/use-toast';

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
  const location = useLocation();
  const { toast } = useToast();

  const currentMenuItem = findMenuItemByPath(location.pathname);

  const handleContextMenu = useCallback((e) => {
    if (e.ctrlKey) {
      e.preventDefault();
      setMenuPos({ x: e.clientX, y: e.clientY });
      setShowUrlForm(false);
    }
  }, []);

  const handleClose = useCallback(() => {
    setMenuPos(null);
    setShowUrlForm(false);
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

  if (!menuPos) return null;

  const menuStyle = {
    position: 'fixed',
    left: Math.min(menuPos.x, window.innerWidth - 280),
    top: Math.min(menuPos.y, window.innerHeight - 200),
    zIndex: 99999,
  };

  return (
    <div data-global-context-menu style={menuStyle} className="w-64 bg-white rounded-lg shadow-2xl border border-gray-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150" data-testid="global-context-menu">
      <div className="p-1.5">
        {!showUrlForm ? (
          <>
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
