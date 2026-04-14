/**
 * MainLayout - Composant principal de mise en page
 * Refactorisé pour utiliser des hooks modulaires
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard } from 'lucide-react';
import { TooltipProvider } from '../ui/tooltip';
import FirstLoginPasswordDialog from '../Common/FirstLoginPasswordDialog';
import RecentUpdatePopup from '../Common/RecentUpdatePopup';
import InactivityHandler from '../Common/InactivityHandler';
import UpdateWarningOverlay from '../Common/UpdateWarningOverlay';
import ChangelogPopup from '../Common/ChangelogPopup';
import TokenValidator from '../Common/TokenValidator';
import ContextualHelpButton from '../Common/ContextualHelpButton';
import ConsignePopup from '../Common/ConsignePopup';
import Header from './Header';
import Sidebar from './Sidebar';
import GlobalContextMenu from '../Dashboard/GlobalContextMenu';
import { iconMap } from './menuConfig';
import { usePermissions } from '../../hooks/usePermissions';
import { useOverdueItems } from '../../hooks/useOverdueItems';
import { useBellCounts } from '../../hooks/useBellCounts';
import { useSurveillanceBadge } from '../../hooks/useSurveillanceBadge';
import { useInventoryStats } from '../../hooks/useInventoryStats';
import { useChatUnreadCount } from '../../hooks/useChatUnreadCount';
import { useHeaderWebSocket } from '../../hooks/useHeaderWebSocket';
import { usePreferences } from '../../contexts/PreferencesContext';

const MainLayout = () => {
  const { preferences, updatePreferences } = usePreferences();
  const isMobile = () => window.innerWidth < 768;
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile());
  const [mobileView, setMobileView] = useState(isMobile());
  const [firstLoginDialogOpen, setFirstLoginDialogOpen] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState({});
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState({ nom: 'Utilisateur', role: 'VIEWER', firstLogin: false, id: '' });
  const [overdueMenuOpen, setOverdueMenuOpen] = useState(false);
  const { canView, isAdmin } = usePermissions();

  // Hooks modulaires pour les données du header
  const bellCounts = useBellCounts();
  const {
    overdueCount,
    overdueDetails,
    overdueExecutionCount,
    overdueRequestsCount,
    overdueMaintenanceCount
  } = useOverdueItems();
  const { surveillanceBadge } = useSurveillanceBadge();
  const { inventoryStats } = useInventoryStats();
  const { chatUnreadCount } = useChatUnreadCount(canView('chatLive'));

  // WebSocket centralisé pour les badges du header (temps réel)
  useHeaderWebSocket();

  // Gérer le comportement auto-collapse de la sidebar
  useEffect(() => {
    if (preferences?.sidebar_behavior === 'auto_collapse') {
      setSidebarOpen(false);
    } else if (preferences?.sidebar_behavior === 'always_open') {
      setSidebarOpen(!mobileView);
    }
  }, [location.pathname, preferences?.sidebar_behavior, mobileView]);

  // Gérer le redimensionnement (mobile <-> desktop)
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setMobileView(mobile);
      if (mobile) setSidebarOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Gérer le clic en dehors de la sidebar en mode auto-collapse
  useEffect(() => {
    if (preferences?.sidebar_behavior !== 'auto_collapse' || !sidebarOpen) {
      return;
    }

    const handleClickOutside = (event) => {
      const sidebar = document.getElementById('main-sidebar');
      const toggleButton = document.getElementById('sidebar-toggle');
      
      if (sidebar && !sidebar.contains(event.target) && toggleButton && !toggleButton.contains(event.target)) {
        setSidebarOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [preferences?.sidebar_behavior, sidebarOpen]);

  useEffect(() => {
    const userInfo = localStorage.getItem('user');
    if (userInfo) {
      try {
        const parsedUser = JSON.parse(userInfo);
        setUser({
          nom: `${parsedUser.prenom || ''} ${parsedUser.nom || ''}`.trim() || 'Utilisateur',
          role: parsedUser.role || 'VIEWER',
          firstLogin: parsedUser.firstLogin || false,
          id: parsedUser.id,
          permissions: parsedUser.permissions || {}
        });
        
        if (parsedUser.firstLogin === true) {
          setFirstLoginDialogOpen(true);
        }
      } catch (error) {
        console.error('Erreur lors du parsing des infos utilisateur:', error);
      }
    }
  }, []);

  // Fermer le menu des échéances quand on clique en dehors
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (overdueMenuOpen && !event.target.closest('.relative')) {
        setOverdueMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [overdueMenuOpen]);

  // Toggle expansion d'une catégorie
  const toggleCategoryExpansion = (categoryId) => {
    setExpandedCategories(prev => ({
      ...prev,
      [categoryId]: !prev[categoryId]
    }));
  };

  // Récupérer les catégories depuis les préférences
  const menuCategories = preferences?.menu_categories || [];

  // Liste par défaut des menus
  const defaultMenuItems = [
    { id: 'dashboard', icon: 'LayoutDashboard', label: 'Tableau de bord', path: '/dashboard', module: 'dashboard', visible: true, order: 0 },
    { id: 'service-dashboard', icon: 'Presentation', label: 'Dashboard Service', path: '/service-dashboard', module: 'serviceDashboard', visible: true, order: 0.3 },
    { id: 'chat-live', icon: 'Mail', label: 'Chat Live', path: '/chat-live', module: 'chatLive', visible: true, order: 0.5 },
    { id: 'intervention-requests', icon: 'MessageSquare', label: 'Demandes d\'inter.', path: '/intervention-requests', module: 'interventionRequests', visible: true, order: 1 },
    { id: 'work-orders', icon: 'ClipboardList', label: 'Ordres de travail', path: '/work-orders', module: 'workOrders', visible: true, order: 2 },
    { id: 'improvement-requests', icon: 'Lightbulb', label: 'Demandes d\'amél.', path: '/improvement-requests', module: 'improvementRequests', visible: true, order: 3 },
    { id: 'improvements', icon: 'Sparkles', label: 'Améliorations', path: '/improvements', module: 'improvements', visible: true, order: 4 },
    { id: 'preventive-maintenance', icon: 'Calendar', label: 'Maintenance prev.', path: '/preventive-maintenance', module: 'preventiveMaintenance', visible: true, order: 5 },
    { id: 'planning-mprev', icon: 'Calendar', label: 'Planning M.Prev.', path: '/planning-mprev', module: 'planningMprev', visible: true, order: 6 },
    { id: 'consignations-loto', icon: 'Shield', label: 'Consignations LOTO', path: '/consignations-loto', module: 'consignationsLoto', visible: true, order: 6.5 },
    { id: 'assets', icon: 'Wrench', label: 'Équipements', path: '/assets', module: 'assets', visible: true, order: 7 },
    { id: 'inventory', icon: 'Package', label: 'Inventaire', path: '/inventory', module: 'inventory', visible: true, order: 8 },
    { id: 'purchase-requests', icon: 'ShoppingCart', label: 'Demandes d\'Achat', path: '/purchase-requests', module: 'purchaseRequests', visible: true, order: 8.5 },
    { id: 'locations', icon: 'MapPin', label: 'Zones', path: '/locations', module: 'locations', visible: true, order: 9 },
    { id: 'meters', icon: 'Gauge', label: 'Compteurs', path: '/meters', module: 'meters', visible: true, order: 10 },
    { id: 'sensors', icon: 'Activity', label: 'Capteurs MQTT', path: '/sensors', module: 'sensors', visible: isAdmin(), order: 11 },
    { id: 'iot-dashboard', icon: 'BarChart3', label: 'Dashboard IoT', path: '/iot-dashboard', module: 'sensors', visible: isAdmin(), order: 12 },
    { id: 'mqtt-logs', icon: 'Terminal', label: 'Logs MQTT', path: '/mqtt-logs', module: 'sensors', visible: isAdmin(), order: 13 },
    { id: 'surveillance-plan', icon: 'Eye', label: 'Plan de Surveillance', path: '/surveillance-plan', module: 'surveillance', visible: true, order: 11 },
    { id: 'surveillance-rapport', icon: 'FileText', label: 'Rapport Surveillance', path: '/surveillance-rapport', module: 'surveillanceRapport', visible: true, order: 12 },
    { id: 'surveillance-ai-history', icon: 'History', label: 'Historique IA', path: '/surveillance-ai-history', module: 'surveillance', visible: true, order: 12.1 },
    { id: 'surveillance-ai-dashboard', icon: 'TrendingUp', label: 'Tendances IA', path: '/surveillance-ai-dashboard', module: 'surveillance', visible: true, order: 12.2 },
    { id: 'weekly-reports', icon: 'FileText', label: 'Rapports Hebdo.', path: '/weekly-reports', module: 'reports', visible: true, order: 12.5 },
    { id: 'presqu-accident', icon: 'AlertTriangle', label: 'Presqu\'accident', path: '/presqu-accident', module: 'presquaccident', visible: true, order: 13 },
    { id: 'presqu-accident-rapport', icon: 'FileText', label: 'Rapport P.accident', path: '/presqu-accident-rapport', module: 'presquaccidentRapport', visible: true, order: 14 },
    { id: 'documentations', icon: 'FolderOpen', label: 'Documentations', path: '/documentations', module: 'documentations', visible: true, order: 15 },
    { id: 'reports', icon: 'BarChart3', label: 'Rapports', path: '/reports', module: 'reports', visible: true, order: 16 },
    { id: 'team-management', icon: 'UserCog', label: 'Gestion d\'équipe', path: '/team-management', module: 'timeTracking', visible: true, order: 16.5 },
    { id: 'cameras', icon: 'Camera', label: 'Caméras', path: '/cameras', module: 'cameras', visible: true, order: 16.6 },
    { id: 'mes', icon: 'Zap', label: 'M.E.S', path: '/mes', module: 'mes', visible: true, order: 16.65 },
    { id: 'mes-reports', icon: 'FileBarChart', label: 'Rapports M.E.S.', path: '/mes-reports', module: 'mes', visible: true, order: 16.66 },
    { id: 'analytics-checklists', icon: 'BarChart3', label: 'Analytics Checklists', path: '/analytics/checklists', module: 'preventiveMaintenance', visible: true, order: 16.7 },
    { id: 'people', icon: 'Users', label: 'Utilisateurs', path: '/people', module: 'people', visible: true, order: 17 },
    { id: 'planning', icon: 'Calendar', label: 'Planning', path: '/planning', module: 'planning', visible: true, order: 18 },
    { id: 'vendors', icon: 'ShoppingCart', label: 'Fournisseurs', path: '/vendors', module: 'vendors', visible: true, order: 19 },
    { id: 'contrats', icon: 'FileSignature', label: 'Contrats', path: '/contrats', module: 'contrats', visible: true, order: 19.5 },
    { id: 'purchase-history', icon: 'ShoppingBag', label: 'Historique Achat', path: '/purchase-history', module: 'purchaseHistory', visible: true, order: 20 },
    { id: 'import-export', icon: 'Database', label: 'Import / Export', path: '/import-export', module: 'importExport', visible: true, order: 21 },
    { id: 'whiteboard', icon: 'PresentationIcon', label: 'Tableau d\'affichage', path: '/whiteboard', module: 'whiteboard', visible: true, order: 22 },
    { id: 'training', icon: 'GraduationCap', label: 'Formation', path: '/training', module: 'training', visible: true, order: 23 }
  ];

  // Fusionner les préférences utilisateur avec les items par défaut (pour ajouter les nouveaux)
  const mergeMenuItems = (savedItems, defaultItems) => {
    if (!savedItems || savedItems.length === 0) return defaultItems;
    
    const savedIds = new Set(savedItems.map(item => item.id));
    const newItems = defaultItems.filter(item => !savedIds.has(item.id));
    
    // Ajouter les nouveaux items à la fin
    return [...savedItems, ...newItems];
  };

  // Utiliser les préférences fusionnées avec les nouveaux items
  const userMenuItems = mergeMenuItems(preferences?.menu_items, defaultMenuItems);

  // Trier par ordre et filtrer par visibilité et permissions
  const menuItems = userMenuItems
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .filter(item => {
      if (item.visible === false) return false;
      if (item.module && !canView(item.module)) return false;
      return true;
    })
    .map(item => ({
      ...item,
      icon: iconMap[item.icon] || LayoutDashboard,
      label: item.label ? item.label.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim() : item.label
    }));

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    // Forcer un rechargement complet pour vider tout l'état React
    // (évite le mélange d'interface entre deux utilisateurs successifs)
    window.location.href = '/login';
  };

  // Helper pour obtenir les styles de boutons sidebar
  const getSidebarButtonStyle = (isActive = false) => ({
    backgroundColor: isActive ? (preferences?.primary_color || '#2563eb') : 'transparent',
    color: preferences?.sidebar_icon_color || '#ffffff'
  });

  const handleSidebarButtonHover = (e, isActive) => {
    if (!isActive) {
      e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)';
    }
  };

  const handleSidebarButtonLeave = (e, isActive) => {
    if (!isActive) {
      e.currentTarget.style.backgroundColor = 'transparent';
    }
  };

  const handleCreateShortcut = useCallback(async (shortcut) => {
    try {
      const currentLayout = preferences?.dashboard_layout?.items || [];
      const newItems = [...currentLayout, { ...shortcut, order: currentLayout.length }];
      await updatePreferences({
        dashboard_layout: { items: newItems }
      });
    } catch (error) {
      console.error('Erreur creation raccourci:', error);
    }
  }, [preferences, updatePreferences]);

  return (
    <TooltipProvider delayDuration={300}>
    <div className="min-h-screen bg-gray-50">
      {/* Safe area top bar for mobile PWA */}
      <div className="fixed top-0 left-0 right-0 bg-white z-[31]" style={{ height: 'env(safe-area-inset-top, 0px)' }} />
      {/* Header */}
      <Header
        sidebarOpen={sidebarOpen}
        onSidebarToggle={() => setSidebarOpen(!sidebarOpen)}
        user={user}
        isAdmin={isAdmin()}
        bellCounts={bellCounts}
        chatUnreadCount={chatUnreadCount}
        canViewChatLive={canView('chatLive')}
        overdueCount={overdueCount}
        overdueDetails={overdueDetails}
        overdueExecutionCount={overdueExecutionCount}
        overdueRequestsCount={overdueRequestsCount}
        overdueMaintenanceCount={overdueMaintenanceCount}
        overdueMenuOpen={overdueMenuOpen}
        setOverdueMenuOpen={setOverdueMenuOpen}
        surveillanceBadge={surveillanceBadge}
        inventoryStats={inventoryStats}
      />

      {/* Sidebar */}
      <Sidebar
        sidebarOpen={sidebarOpen}
        menuItems={menuItems}
        menuCategories={menuCategories}
        expandedCategories={expandedCategories}
        toggleCategoryExpansion={toggleCategoryExpansion}
        user={user}
        onLogout={handleLogout}
        preferences={preferences}
        getSidebarButtonStyle={getSidebarButtonStyle}
        handleSidebarButtonHover={handleSidebarButtonHover}
        handleSidebarButtonLeave={handleSidebarButtonLeave}
        onMobileClose={() => setSidebarOpen(false)}
      />

      {/* Main Content */}
      <div
        className="transition-all duration-300 overflow-x-hidden"
        style={{
          marginLeft: mobileView ? 0 : (preferences?.sidebar_position === 'right' ? 0 : (sidebarOpen ? `${preferences?.sidebar_width || 256}px` : '80px')),
          marginRight: mobileView ? 0 : (preferences?.sidebar_position === 'right' ? (sidebarOpen ? `${preferences?.sidebar_width || 256}px` : '80px') : 0),
          maxWidth: mobileView ? '100vw' : 'none',
          width: mobileView ? '100vw' : 'auto'
        }}
      >
        <div className="p-4 overflow-x-hidden" style={{ paddingTop: 'calc(5rem + env(safe-area-inset-top, 0px))' }}>
          <div className="w-full max-w-full overflow-x-hidden">
            <Outlet />
          </div>
        </div>
      </div>

      {/* Overlay mobile : ferme la sidebar en cliquant en dehors */}
      {mobileView && sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-10"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      
      {/* Popups et modaux */}
      <FirstLoginPasswordDialog 
        open={firstLoginDialogOpen}
        onOpenChange={setFirstLoginDialogOpen}
        userId={user.id}
        onSuccess={() => {
          setUser(prev => ({ ...prev, firstLogin: false }));
          setFirstLoginDialogOpen(false);
        }}
      />
      
      <RecentUpdatePopup />
      <ChangelogPopup />
      <TokenValidator />
      <InactivityHandler />
      <UpdateWarningOverlay />
      <ContextualHelpButton />
      <ConsignePopup />
      <GlobalContextMenu onCreateShortcut={handleCreateShortcut} />
    </div>
    </TooltipProvider>
  );
};

export default MainLayout;
