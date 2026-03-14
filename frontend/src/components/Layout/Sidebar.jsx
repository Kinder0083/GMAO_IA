/**
 * Composant Sidebar pour la navigation principale
 * Extrait de MainLayout.jsx pour une meilleure modularité
 */
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ChevronDown,
  LogOut,
  Settings,
  Shield,
  Radio,
  RefreshCw,
  FileText,
  Terminal,
  Palette,
  Folder,
  Database,
  Activity,
  Trash2
} from 'lucide-react';
import { iconMap } from './menuConfig';
import api from '../../services/api';

const Sidebar = ({
  sidebarOpen,
  menuItems,
  menuCategories,
  expandedCategories,
  toggleCategoryExpansion,
  user,
  onLogout,
  preferences,
  getSidebarButtonStyle,
  handleSidebarButtonHover,
  handleSidebarButtonLeave,
  onMobileClose
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [newMenuIds, setNewMenuIds] = useState([]);
  const isMobile = window.innerWidth < 768;

  // Charger les badges "Nouveau"
  useEffect(() => {
    const loadBadges = async () => {
      try {
        const response = await api.get('/menu-badges');
        const ids = response.data.new_menu_ids || [];
        setNewMenuIds(ids);
        try { localStorage.setItem('cached_menu_badges', JSON.stringify(ids)); } catch {}
      } catch (e) {
        // Fallback : cache local (mode hors ligne)
        try {
          const cached = localStorage.getItem('cached_menu_badges');
          if (cached) setNewMenuIds(JSON.parse(cached));
        } catch {}
      }
    };
    loadBadges();
  }, []);

  // Dismiss badge quand on clique sur un menu "Nouveau"
  const handleMenuClick = (item) => {
    if (newMenuIds.includes(item.id)) {
      setNewMenuIds(prev => prev.filter(id => id !== item.id));
      if (newMenuIds.length <= 1) {
        api.post('/menu-badges/dismiss').catch(() => {});
      }
    }
    navigate(item.path);
    // Fermer la sidebar sur mobile après navigation
    if (window.innerWidth < 768 && onMobileClose) {
      onMobileClose();
    }
  };

  // Grouper les menus par catégorie (exclure les items déplacés dans la section admin)
  const getMenusByCategory = (categoryId) => {
    return menuItems.filter(item => item.category_id === categoryId && item.id !== 'mqtt-logs' && item.id !== 'import-export');
  };

  // Menus sans catégorie (exclure les items déplacés dans la section admin)
  const uncategorizedMenus = menuItems.filter(item => !item.category_id && item.id !== 'mqtt-logs' && item.id !== 'import-export');

  // Vérifier si une catégorie contient le menu actif
  const categoryHasActiveMenu = (categoryId) => {
    return menuItems.some(item => item.category_id === categoryId && location.pathname === item.path);
  };

  return (
    <div
      id="main-sidebar"
      data-testid="sidebar-nav"
      className="fixed top-16 bottom-0 text-white transition-all duration-300 z-20"
      style={{
        backgroundColor: preferences?.sidebar_bg_color || '#1f2937',
        width: sidebarOpen ? `${preferences?.sidebar_width || 256}px` : (isMobile ? '0px' : '80px'),
        left: preferences?.sidebar_position === 'right' ? 'auto' : 0,
        right: preferences?.sidebar_position === 'right' ? 0 : 'auto',
        overflow: (!sidebarOpen && isMobile) ? 'hidden' : 'visible',
        transform: (!sidebarOpen && isMobile) ? 'translateX(-100%)' : 'translateX(0)'
      }}
    >
      <div className="p-4 space-y-1 h-full overflow-y-auto">
        {/* Rendu des catégories avec sous-menus */}
        {menuCategories
          .sort((a, b) => (a.order || 0) - (b.order || 0))
          .map(category => {
            const categoryMenus = getMenusByCategory(category.id);
            if (categoryMenus.length === 0) return null;
            
            const CategoryIcon = iconMap[category.icon] || Folder;
            const isExpanded = expandedCategories[category.id] === true;
            const hasActiveMenu = categoryHasActiveMenu(category.id);

            return (
              <div key={category.id} className="mb-1">
                {/* Header de catégorie */}
                <button
                  onClick={() => toggleCategoryExpansion(category.id)}
                  className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-all ${
                    !sidebarOpen ? 'justify-center px-2' : ''
                  }`}
                  style={{
                    backgroundColor: hasActiveMenu ? 'rgba(255,255,255,0.05)' : 'transparent',
                    color: preferences?.sidebar_icon_color || '#ffffff'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = hasActiveMenu ? 'rgba(255,255,255,0.05)' : 'transparent';
                  }}
                  title={!sidebarOpen ? category.name : ''}
                >
                  <CategoryIcon size={18} className="flex-shrink-0" />
                  {sidebarOpen && (
                    <>
                      <span className="text-sm font-semibold flex-1 text-left">{category.name}</span>
                      <ChevronDown 
                        size={16} 
                        className={`flex-shrink-0 transition-transform ${isExpanded ? '' : '-rotate-90'}`} 
                      />
                    </>
                  )}
                </button>
                
                {/* Sous-menus de la catégorie */}
                {(isExpanded || !sidebarOpen) && (
                  <div className={sidebarOpen ? 'ml-3 border-l border-white/10 pl-2 space-y-1 mt-1' : 'space-y-1 mt-1'}>
                    {categoryMenus
                      .filter(item => !item.adminOnly || user.role === 'ADMIN')
                      .map((item, index) => {
                        const Icon = item.icon;
                        const isActive = location.pathname === item.path;
                        return (
                          <button
                            key={index}
                            onClick={() => handleMenuClick(item)}
                            data-testid={`sidebar-${item.id}`}
                            className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-all ${
                              !sidebarOpen ? 'justify-center px-2' : ''
                            }`}
                            style={{
                              backgroundColor: isActive ? (preferences?.primary_color || '#2563eb') : 'transparent',
                              color: preferences?.sidebar_icon_color || '#ffffff'
                            }}
                            onMouseEnter={(e) => {
                              if (!isActive) {
                                e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!isActive) {
                                e.currentTarget.style.backgroundColor = 'transparent';
                              }
                            }}
                            title={!sidebarOpen ? item.label : ''}
                          >
                            <Icon size={18} className="flex-shrink-0" />
                            {sidebarOpen && (
                              <span className="text-sm flex items-center gap-2">
                                {item.label}
                                {newMenuIds.includes(item.id) && (
                                  <span className="bg-green-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none animate-pulse">
                                    NEW
                                  </span>
                                )}
                              </span>
                            )}
                          </button>
                        );
                      })}
                  </div>
                )}
              </div>
            );
          })}
        
        {/* Menus sans catégorie */}
        {uncategorizedMenus
          .filter(item => !item.adminOnly || user.role === 'ADMIN')
          .map((item, index) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <button
                key={`uncategorized-${index}`}
                onClick={() => handleMenuClick(item)}
                data-testid={`sidebar-${item.id}`}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                  !sidebarOpen ? 'justify-center px-2' : ''
                }`}
                style={{
                  backgroundColor: isActive ? (preferences?.primary_color || '#2563eb') : 'transparent',
                  color: preferences?.sidebar_icon_color || '#ffffff'
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
                title={!sidebarOpen ? item.label : ''}
              >
                <Icon size={20} className="flex-shrink-0" />
                {sidebarOpen && (
                  <span className="text-sm font-medium flex items-center gap-2">
                    {item.label}
                    {newMenuIds.includes(item.id) && (
                      <span className="bg-green-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none animate-pulse">
                        NEW
                      </span>
                    )}
                  </span>
                )}
              </button>
            );
          })}
        
        {/* Section paramètres et admin */}
        <div className="pt-4 mt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <button
            onClick={() => navigate('/settings')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${!sidebarOpen ? 'justify-center px-2' : ''}`}
            style={getSidebarButtonStyle(location.pathname === '/settings')}
            onMouseEnter={(e) => handleSidebarButtonHover(e, location.pathname === '/settings')}
            onMouseLeave={(e) => handleSidebarButtonLeave(e, location.pathname === '/settings')}
            title={!sidebarOpen ? 'Paramètres' : ''}
          >
            <Settings size={20} className="flex-shrink-0" />
            {sidebarOpen && <span className="text-sm font-medium">Paramètres</span>}
          </button>
          {user.role === 'ADMIN' && (
            <>
              <button
                onClick={() => navigate('/special-settings')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${!sidebarOpen ? 'justify-center px-2' : ''}`}
                style={getSidebarButtonStyle(location.pathname === '/special-settings')}
                onMouseEnter={(e) => handleSidebarButtonHover(e, location.pathname === '/special-settings')}
                onMouseLeave={(e) => handleSidebarButtonLeave(e, location.pathname === '/special-settings')}
                title={!sidebarOpen ? 'Paramètres Spéciaux' : ''}
              >
                <Shield size={20} className="flex-shrink-0" />
                {sidebarOpen && <span className="text-sm font-medium">Paramètres Spéciaux</span>}
              </button>
              <button
                onClick={() => navigate('/system-health')}
                data-testid="sidebar-system-health"
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${!sidebarOpen ? 'justify-center px-2' : ''}`}
                style={getSidebarButtonStyle(location.pathname === '/system-health')}
                onMouseEnter={(e) => handleSidebarButtonHover(e, location.pathname === '/system-health')}
                onMouseLeave={(e) => handleSidebarButtonLeave(e, location.pathname === '/system-health')}
                title={!sidebarOpen ? 'Santé Système' : ''}
              >
                <Activity size={20} className="flex-shrink-0" />
                {sidebarOpen && <span className="text-sm font-medium">Santé Système</span>}
              </button>
              <button
                onClick={() => navigate('/import-export')}
                data-testid="sidebar-import-export"
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${!sidebarOpen ? 'justify-center px-2' : ''}`}
                style={getSidebarButtonStyle(location.pathname === '/import-export')}
                onMouseEnter={(e) => handleSidebarButtonHover(e, location.pathname === '/import-export')}
                onMouseLeave={(e) => handleSidebarButtonLeave(e, location.pathname === '/import-export')}
                title={!sidebarOpen ? 'Import / Export' : ''}
              >
                <Database size={20} className="flex-shrink-0" />
                {sidebarOpen && <span className="text-sm font-medium">Import / Export</span>}
              </button>
              <button
                onClick={() => navigate('/mqtt-pubsub')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${!sidebarOpen ? 'justify-center px-2' : ''}`}
                style={getSidebarButtonStyle(location.pathname === '/mqtt-pubsub')}
                onMouseEnter={(e) => handleSidebarButtonHover(e, location.pathname === '/mqtt-pubsub')}
                onMouseLeave={(e) => handleSidebarButtonLeave(e, location.pathname === '/mqtt-pubsub')}
                title={!sidebarOpen ? 'P/L MQTT' : ''}
              >
                <Radio size={20} className="flex-shrink-0" />
                {sidebarOpen && <span className="text-sm font-medium">P/L MQTT</span>}
              </button>
              <button
                onClick={() => navigate('/mqtt-logs')}
                data-testid="sidebar-mqtt-logs"
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${!sidebarOpen ? 'justify-center px-2' : ''}`}
                style={getSidebarButtonStyle(location.pathname === '/mqtt-logs')}
                onMouseEnter={(e) => handleSidebarButtonHover(e, location.pathname === '/mqtt-logs')}
                onMouseLeave={(e) => handleSidebarButtonLeave(e, location.pathname === '/mqtt-logs')}
                title={!sidebarOpen ? 'Logs MQTT' : ''}
              >
                <Terminal size={20} className="flex-shrink-0" />
                {sidebarOpen && <span className="text-sm font-medium">Logs MQTT</span>}
              </button>
              <button
                onClick={() => navigate('/updates')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${!sidebarOpen ? 'justify-center px-2' : ''}`}
                style={getSidebarButtonStyle(location.pathname === '/updates')}
                onMouseEnter={(e) => handleSidebarButtonHover(e, location.pathname === '/updates')}
                onMouseLeave={(e) => handleSidebarButtonLeave(e, location.pathname === '/updates')}
                title={!sidebarOpen ? 'Mise à jour' : ''}
              >
                <RefreshCw size={20} className="flex-shrink-0" />
                {sidebarOpen && <span className="text-sm font-medium">Mise à jour</span>}
              </button>
              <button
                onClick={() => navigate('/journal')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${!sidebarOpen ? 'justify-center px-2' : ''}`}
                style={getSidebarButtonStyle(location.pathname === '/journal')}
                onMouseEnter={(e) => handleSidebarButtonHover(e, location.pathname === '/journal')}
                onMouseLeave={(e) => handleSidebarButtonLeave(e, location.pathname === '/journal')}
                title={!sidebarOpen ? 'Journal' : ''}
              >
                <FileText size={20} className="flex-shrink-0" />
                {sidebarOpen && <span className="text-sm font-medium">Journal</span>}
              </button>
              <button
                onClick={() => navigate('/trash')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${!sidebarOpen ? 'justify-center px-2' : ''}`}
                style={getSidebarButtonStyle(location.pathname === '/trash')}
                onMouseEnter={(e) => handleSidebarButtonHover(e, location.pathname === '/trash')}
                onMouseLeave={(e) => handleSidebarButtonLeave(e, location.pathname === '/trash')}
                title={!sidebarOpen ? 'Corbeille' : ''}
                data-testid="sidebar-trash"
              >
                <Trash2 size={20} className="flex-shrink-0" />
                {sidebarOpen && <span className="text-sm font-medium">Corbeille</span>}
              </button>
              <button
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${!sidebarOpen ? 'justify-center px-2' : ''}`}
                style={getSidebarButtonStyle(location.pathname === '/ssh')}
                onMouseEnter={(e) => handleSidebarButtonHover(e, location.pathname === '/ssh')}
                onMouseLeave={(e) => handleSidebarButtonLeave(e, location.pathname === '/ssh')}
                title={!sidebarOpen ? 'SSH' : ''}
              >
                <Terminal size={20} className="flex-shrink-0" />
                {sidebarOpen && <span className="text-sm font-medium">SSH</span>}
              </button>
            </>
          )}
          
          {/* Personnalisation */}
          <button
            onClick={() => navigate('/personnalisation')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${!sidebarOpen ? 'justify-center px-2' : ''}`}
            style={getSidebarButtonStyle(location.pathname === '/personnalisation')}
            onMouseEnter={(e) => handleSidebarButtonHover(e, location.pathname === '/personnalisation')}
            onMouseLeave={(e) => handleSidebarButtonLeave(e, location.pathname === '/personnalisation')}
            title={!sidebarOpen ? 'Personnalisation' : ''}
          >
            <Palette size={20} className="flex-shrink-0" />
            {sidebarOpen && <span className="text-sm font-medium">Personnalisation</span>}
          </button>
          
          <button
            onClick={onLogout}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${!sidebarOpen ? 'justify-center px-2' : ''}`}
            style={{ backgroundColor: 'transparent', color: preferences?.sidebar_icon_color || '#ffffff' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#dc2626'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
            title={!sidebarOpen ? 'Déconnexion' : ''}
          >
            <LogOut size={20} className="flex-shrink-0" />
            {sidebarOpen && <span className="text-sm font-medium">Déconnexion</span>}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
