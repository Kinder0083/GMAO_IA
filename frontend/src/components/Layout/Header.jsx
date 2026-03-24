/**
 * Composant Header pour l'en-tête de l'application
 * Supporte l'ordonnancement dynamique des icônes via les préférences utilisateur
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  Bell,
  BellOff,
  Package,
  Eye,
  Mail,
  Settings,
  Camera,
  Sparkles
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import UpdateNotificationBadge from '../Common/UpdateNotificationBadge';
import HelpButton from '../Common/HelpButton';
import HeaderClock from '../Common/HeaderClock';
import AIButton from '../Common/AIButton';
import ManualButton from '../Common/ManualButton';
import AlertNotifications from '../Common/AlertNotifications';
import NotificationsDropdown from '../Common/NotificationsDropdown';
import LOTOHeaderIcon from '../Common/LOTOHeaderIcon';
import CameraAlertIcon from '../Common/CameraAlertIcon';
import BackupStatusIcon from '../Common/BackupStatusIcon';
import ChangelogPanel from '../Common/ChangelogPanel';
import OfflineIndicator from '../Common/OfflineIndicator';
import MESAlertIcon from './MESAlertIcon';
import { usePreferences } from '../../contexts/PreferencesContext';
import { DEFAULT_HEADER_ORDER, HEADER_ICONS_REGISTRY } from '../Personnalisation/HeaderOrganizationSection';
import { usePushNotifications } from '../../hooks/usePWA';
import api from '../../services/api';

const Header = ({
  sidebarOpen,
  onSidebarToggle,
  user,
  isAdmin,
  bellCounts,
  chatUnreadCount,
  canViewChatLive,
  overdueCount,
  overdueDetails,
  overdueExecutionCount,
  overdueRequestsCount,
  overdueMaintenanceCount,
  overdueMenuOpen,
  setOverdueMenuOpen,
  surveillanceBadge,
  inventoryStats
}) => {
  const navigate = useNavigate();
  const { preferences } = usePreferences();
  const [bellMenuOpen, setBellMenuOpen] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [hasNewRelease, setHasNewRelease] = useState(false);
  const [headerVisibility, setHeaderVisibility] = useState(null);

  // Gestion des notifications push
  const { isSupported: pushSupported, permission: pushPermission, isSubscribed: pushSubscribed, subscribe: pushSubscribe, unsubscribe: pushUnsubscribe } = usePushNotifications();

  const handlePushToggle = async () => {
    if (pushSubscribed) {
      await pushUnsubscribe();
    } else {
      await pushSubscribe();
    }
  };

  // Charger la visibilité des icônes pour l'utilisateur connecté
  useEffect(() => {
    if (user?.id) {
      api.get(`/users/${user.id}/header-visibility`)
        .then(res => {
          const data = res.data || {};
          setHeaderVisibility(data);
          try { localStorage.setItem('cached_header_visibility', JSON.stringify(data)); } catch {}
        })
        .catch(() => {
          // Fallback : charger depuis le cache local (mode hors ligne)
          try {
            const cached = localStorage.getItem('cached_header_visibility');
            setHeaderVisibility(cached ? JSON.parse(cached) : {});
          } catch {
            setHeaderVisibility({});
          }
        });
    }
  }, [user?.id]);

  // Déterminer l'ordre des icônes depuis les préférences
  const savedOrder = preferences?.header_icon_order;
  const iconOrder = (savedOrder && Array.isArray(savedOrder) && savedOrder.length > 0)
    ? savedOrder
    : DEFAULT_HEADER_ORDER;
  
  // Filtrer par visibilité utilisateur (masquées par défaut si aucun paramètre)
  const isIconVisible = (iconId) => {
    if (headerVisibility === null) return false; // chargement en cours
    return !!headerVisibility[iconId];
  };

  // Séparer gauche et droite en respectant l'ordre utilisateur (exclure 'profile' qui est toujours en dernier)
  const leftIcons = iconOrder.filter(id => {
    const reg = HEADER_ICONS_REGISTRY.find(r => r.id === id);
    return reg?.zone === 'left' && isIconVisible(id);
  });
  const rightIcons = iconOrder.filter(id => {
    const reg = HEADER_ICONS_REGISTRY.find(r => r.id === id);
    return reg?.zone === 'right' && id !== 'profile' && isIconVisible(id);
  });

  const checkNewReleases = useCallback(async () => {
    try {
      const res = await api.get('/releases');
      const { latest_version, last_seen_version } = res.data;
      setHasNewRelease(latest_version && latest_version !== last_seen_version);
    } catch {
      // silently ignore
    }
  }, []);

  useEffect(() => {
    checkNewReleases();
  }, [checkNewReleases]);

  const handleChangelogOpen = () => {
    setChangelogOpen(true);
    setHasNewRelease(false);
  };

  // Fonction de rendu pour chaque icône du header par ID
  const renderIcon = (iconId) => {
    switch (iconId) {
      case 'manual':
        return <span key={iconId} className="hidden md:contents"><ManualButton /></span>;
      case 'ai_assistant':
        return <span key={iconId} className="hidden md:contents"><AIButton /></span>;
      case 'help':
        return <HelpButton key={iconId} />;
      case 'clock':
        return <span key={iconId} className="hidden md:flex"><HeaderClock /></span>;
      case 'offline_indicator':
        return <span key={iconId} className="hidden md:flex"><OfflineIndicator /></span>;
      case 'backup':
        return <span key={iconId} className="hidden md:contents"><BackupStatusIcon /></span>;
      case 'camera':
        return <span key={iconId} className="hidden md:contents"><CameraAlertIcon /></span>;
      case 'mes':
        return <span key={iconId} className="hidden md:contents"><MESAlertIcon /></span>;
      case 'chat_live':
        return canViewChatLive ? (
          <Tooltip key={iconId}>
            <TooltipTrigger asChild>
              <button onClick={() => navigate('/chat-live')} className="p-2 hover:bg-gray-100 rounded-lg transition-colors relative" data-testid="chat-live-btn">
                <Mail className="w-5 h-5 text-gray-600" />
                {chatUnreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-md">
                    {chatUnreadCount > 9 ? '9+' : chatUnreadCount}
                  </span>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="bg-gray-900 text-white px-3 py-2 rounded-lg shadow-lg">
              <p className="font-medium">Chat Live {chatUnreadCount > 0 ? `(${chatUnreadCount} non lu${chatUnreadCount > 1 ? 's' : ''})` : ''}</p>
            </TooltipContent>
          </Tooltip>
        ) : null;
      case 'overdue_calendar':
        return (
          <div key={iconId} className="relative">
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={() => setOverdueMenuOpen(!overdueMenuOpen)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors relative" data-testid="overdue-calendar-btn">
                  <img src="/rappel-calendrier.jpg" alt="Rappel" className="w-6 h-6 object-contain" />
                  {overdueExecutionCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-md">
                      {overdueExecutionCount > 9 ? '9+' : overdueExecutionCount}
                    </span>
                  )}
                  {overdueRequestsCount > 0 && (
                    <span className="absolute -top-1 -left-1 w-5 h-5 bg-yellow-500 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-md">
                      {overdueRequestsCount > 9 ? '9+' : overdueRequestsCount}
                    </span>
                  )}
                  {overdueMaintenanceCount > 0 && (
                    <span className="absolute -bottom-1 -left-1 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-md">
                      {overdueMaintenanceCount > 9 ? '9+' : overdueMaintenanceCount}
                    </span>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-gray-900 text-white px-3 py-2 rounded-lg shadow-lg">
                <p className="font-medium">Echeances depassees</p>
              </TooltipContent>
            </Tooltip>
            {overdueMenuOpen && overdueCount > 0 && (
              <div className="absolute right-0 mt-2 w-72 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                <div className="p-3 border-b border-gray-200">
                  <h3 className="font-semibold text-gray-800">Echeances depassees</h3>
                  <p className="text-xs text-gray-500 mt-1">{overdueCount} element{overdueCount > 1 ? 's' : ''} en retard</p>
                </div>
                <div className="py-2 max-h-80 overflow-y-auto">
                  {Object.entries(overdueDetails).map(([key, detail]) => {
                    const cc = { execution: { dot: 'bg-orange-500', text: 'text-orange-500', hover: 'group-hover:text-orange-600' }, requests: { dot: 'bg-yellow-500', text: 'text-yellow-600', hover: 'group-hover:text-yellow-700' }, maintenance: { dot: 'bg-blue-500', text: 'text-blue-500', hover: 'group-hover:text-blue-600' } };
                    const c = cc[detail.category] || cc.execution;
                    return (
                      <button key={key} onClick={() => { navigate(detail.route, { state: { filterOverdue: true } }); setOverdueMenuOpen(false); }} className="w-full px-4 py-3 hover:bg-gray-50 transition-colors flex items-center justify-between group">
                        <div className="flex items-center gap-3"><div className={`w-2 h-2 ${c.dot} rounded-full`}></div><span className={`text-sm text-gray-700 ${c.hover} font-medium`}>{detail.label}</span></div>
                        <span className={`text-sm font-semibold ${c.text}`}>{detail.count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {overdueMenuOpen && overdueCount === 0 && (
              <div className="absolute right-0 mt-2 w-72 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                <div className="p-4 text-center"><p className="text-sm text-gray-500">Aucune echeance depassee</p></div>
              </div>
            )}
          </div>
        );
      case 'update_badge':
        return isAdmin ? <span key={iconId} className="hidden md:contents"><UpdateNotificationBadge /></span> : null;
      case 'surveillance':
        return (
          <span key={iconId} className="hidden md:contents">
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors relative" onClick={() => navigate('/surveillance-plan', { state: { showOverdueOnly: true } })} data-testid="surveillance-plan-btn">
                  <Eye size={20} className="text-gray-600" />
                  {surveillanceBadge.echeances_proches > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center text-white text-xs font-bold">{surveillanceBadge.echeances_proches > 9 ? '9+' : surveillanceBadge.echeances_proches}</span>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-gray-900 text-white px-3 py-2 rounded-lg shadow-lg">
                <p className="font-medium">Plan de Surveillance ({surveillanceBadge.pourcentage_realisation}%)</p>
              </TooltipContent>
            </Tooltip>
          </span>
        );
      case 'inventory':
        return (
          <span key={iconId} className="hidden md:contents">
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors relative" onClick={() => navigate('/inventory', { state: { filterAlert: true } })} data-testid="inventory-alert-btn">
                  <Package size={20} className="text-gray-600" />
                  {(inventoryStats.rupture + inventoryStats.niveau_bas) > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center text-white text-xs font-bold">{(inventoryStats.rupture + inventoryStats.niveau_bas) > 9 ? '9+' : (inventoryStats.rupture + inventoryStats.niveau_bas)}</span>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-gray-900 text-white px-3 py-2 rounded-lg shadow-lg">
                <p className="font-medium">Alertes Inventaire</p>
              </TooltipContent>
            </Tooltip>
          </span>
        );
      case 'mqtt_alerts':
        return <span key={iconId} className="hidden md:contents"><AlertNotifications /></span>;
      case 'loto':
        return <LOTOHeaderIcon key={iconId} />;
      case 'notifications':
        return <NotificationsDropdown key={iconId} />;
      case 'whatsnew':
        return (
          <Tooltip key={iconId}>
            <TooltipTrigger asChild>
              <button onClick={handleChangelogOpen} className="p-2 hover:bg-gray-100 rounded-lg transition-colors relative" data-testid="whatsnew-btn">
                <Sparkles size={20} className="text-gray-600" />
                {hasNewRelease && (
                  <span className="absolute -top-1 -right-1 px-1.5 py-0.5 bg-emerald-500 rounded-full text-white text-[9px] font-bold leading-none shadow-md">NEW</span>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="bg-gray-900 text-white px-3 py-2 rounded-lg shadow-lg">
              <p className="font-medium">Quoi de neuf ?</p>
            </TooltipContent>
          </Tooltip>
        );
      case 'bell':
        return (
          <div key={iconId} className="relative">
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={() => setBellMenuOpen(!bellMenuOpen)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors relative" data-testid="bell-btn">
                  <Bell size={20} className="text-gray-600" />
                  {bellCounts.work_orders > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold shadow-md">{bellCounts.work_orders > 9 ? '9+' : bellCounts.work_orders}</span>
                  )}
                  {bellCounts.improvements > 0 && (
                    <span className="absolute -top-1 -left-1 w-5 h-5 bg-purple-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold shadow-md">{bellCounts.improvements > 9 ? '9+' : bellCounts.improvements}</span>
                  )}
                  {bellCounts.preventive > 0 && (
                    <span className="absolute -bottom-1 -left-1 w-5 h-5 bg-green-600 rounded-full flex items-center justify-center text-white text-[10px] font-bold shadow-md">{bellCounts.preventive > 9 ? '9+' : bellCounts.preventive}</span>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-gray-900 text-white px-3 py-2 rounded-lg shadow-lg">
                <p className="font-medium">Notifications activite</p>
              </TooltipContent>
            </Tooltip>
            {bellMenuOpen && (
              <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                <div className="p-3 border-b border-gray-200">
                  <h3 className="font-semibold text-gray-800">Notifications activite</h3>
                </div>
                <div className="py-2">
                  {bellCounts.att_materiel > 0 && (
                    <button onClick={() => { navigate('/work-orders', { state: { filterStatus: 'ATT_MATERIEL' } }); setBellMenuOpen(false); }} className="w-full px-4 py-3 hover:bg-gray-50 transition-colors flex items-center justify-between group">
                      <div className="flex items-center gap-3"><div className="w-2.5 h-2.5 bg-yellow-500 rounded-full"></div><span className="text-sm text-gray-700 group-hover:text-yellow-600 font-medium">OT Att Materiel</span></div>
                      <span className="text-sm font-semibold text-yellow-600">{bellCounts.att_materiel}</span>
                    </button>
                  )}
                  {bellCounts.att_decision > 0 && (
                    <button onClick={() => { navigate('/work-orders', { state: { filterStatus: 'ATT_DECISION' } }); setBellMenuOpen(false); }} className="w-full px-4 py-3 hover:bg-gray-50 transition-colors flex items-center justify-between group">
                      <div className="flex items-center gap-3"><div className="w-2.5 h-2.5 bg-orange-500 rounded-full"></div><span className="text-sm text-gray-700 group-hover:text-orange-600 font-medium">OT Att Decision</span></div>
                      <span className="text-sm font-semibold text-orange-600">{bellCounts.att_decision}</span>
                    </button>
                  )}
                  <button onClick={() => { navigate('/improvements', { state: { filterStatus: 'EN_ATTENTE' } }); setBellMenuOpen(false); }} className="w-full px-4 py-3 hover:bg-gray-50 transition-colors flex items-center justify-between group">
                    <div className="flex items-center gap-3"><div className="w-2.5 h-2.5 bg-purple-500 rounded-full"></div><span className="text-sm text-gray-700 group-hover:text-purple-600 font-medium">Ameliorations en attente</span></div>
                    <span className="text-sm font-semibold text-purple-500">{bellCounts.improvements}</span>
                  </button>
                  <button onClick={() => { navigate('/preventive-maintenance', { state: { filterOverdue: true } }); setBellMenuOpen(false); }} className="w-full px-4 py-3 hover:bg-gray-50 transition-colors flex items-center justify-between group">
                    <div className="flex items-center gap-3"><div className="w-2.5 h-2.5 bg-green-600 rounded-full"></div><span className="text-sm text-gray-700 group-hover:text-green-600 font-medium">Maintenance preventive echue</span></div>
                    <span className="text-sm font-semibold text-green-600">{bellCounts.preventive}</span>
                  </button>
                </div>
              </div>
            )}
            {bellMenuOpen && bellCounts.work_orders === 0 && bellCounts.improvements === 0 && bellCounts.preventive === 0 && (
              <div className="absolute right-0 mt-2 w-72 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                <div className="p-4 text-center"><p className="text-sm text-gray-500">Aucune notification en attente</p></div>
              </div>
            )}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="fixed left-0 right-0 h-16 bg-white border-b border-gray-200 z-30 flex items-center justify-between px-4" style={{ top: 'env(safe-area-inset-top)' }}>
      {/* Zone gauche : Toggle sidebar + Logo + Icônes gauche (ordre configurable) */}
      <div className="flex items-center gap-4">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              id="sidebar-toggle"
              onClick={onSidebarToggle}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              data-testid="sidebar-toggle-btn"
            >
              <span className="md:hidden">
                {sidebarOpen ? <X size={22} /> : <Menu size={22} />}
              </span>
              <span className="hidden md:inline">
                {sidebarOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="bg-gray-900 text-white px-3 py-2 rounded-lg shadow-lg">
            <p className="font-medium">{sidebarOpen ? "Fermer le menu" : "Ouvrir le menu"}</p>
          </TooltipContent>
        </Tooltip>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">G</span>
          </div>
          <span className="hidden md:inline font-semibold text-gray-800 text-lg">FSAO Iris</span>
        </div>
        
        {/* Icônes zone gauche — ordre configurable (offline_indicator exclu car affiché en permanent) */}
        <div className="flex items-center gap-2">
          {leftIcons.filter(id => id !== 'offline_indicator').map(id => renderIcon(id))}
        </div>
      </div>

      {/* Zone droite : Icônes droite (ordre configurable) + Profil (toujours en dernier) */}
      <div className="flex items-center gap-1 md:gap-4">
        {/* Indicateur En ligne / Hors ligne — toujours visible, non conditionné par la config utilisateur */}
        <span className="hidden md:flex"><OfflineIndicator /></span>
        
        {rightIcons.filter(id => id !== 'offline_indicator').map(id => renderIcon(id))}
        
        {/* Bouton notifications push */}
        {pushSupported && pushPermission !== 'denied' && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handlePushToggle}
                className={`relative p-2 rounded-lg transition-colors ${
                  pushSubscribed
                    ? 'text-green-600 hover:bg-green-50'
                    : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                }`}
                data-testid="push-notifications-toggle"
              >
                {pushSubscribed ? <Bell size={20} /> : <BellOff size={20} />}
                {pushSubscribed && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-green-500 rounded-full" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="bg-gray-900 text-white px-3 py-2 rounded-lg shadow-lg">
              <p className="font-medium text-xs">
                {pushSubscribed ? 'Notifications push actives — cliquer pour désactiver' : 'Activer les notifications push (consignes hors ligne)'}
              </p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Profil — toujours en dernier */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button 
              onClick={() => navigate('/settings')}
              className="flex items-center gap-3 hover:bg-gray-100 rounded-lg px-2 md:px-3 py-2 transition-colors cursor-pointer"
              data-testid="user-profile-btn"
            >
              <div className="text-right hidden md:block">
                <div className="text-sm font-medium text-gray-800">{user.nom}</div>
                <div className="text-xs text-gray-500">{user.role}</div>
              </div>
              <div className="w-8 h-8 md:w-10 md:h-10 bg-blue-600 rounded-full flex items-center justify-center">
                <span className="text-white font-medium text-xs md:text-sm">
                  {user.nom.split(' ').map(n => n[0]).join('')}
                </span>
              </div>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="bg-gray-900 text-white px-3 py-2 rounded-lg shadow-lg">
            <p className="font-medium">Mon Profil</p>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Panneau latéral "Quoi de neuf ?" */}
      <ChangelogPanel open={changelogOpen} onOpenChange={setChangelogOpen} />
    </div>
  );
};

export default Header;
