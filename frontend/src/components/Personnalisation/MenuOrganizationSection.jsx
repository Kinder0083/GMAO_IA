import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '../ui/card';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { usePreferences } from '../../contexts/PreferencesContext';
import { useToast } from '../../hooks/use-toast';
import { usePermissions } from '../../hooks/usePermissions';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../ui/dialog';
import {
  GripVertical,
  Eye,
  EyeOff,
  Star,
  Plus,
  Trash2,
  Edit,
  FolderPlus,
  Folder,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  X,
  LayoutDashboard,
  ClipboardList,
  Package,
  MapPin,
  Wrench,
  BarChart3,
  Users,
  ShoppingCart,
  ShoppingBag,
  Calendar,
  MessageSquare,
  Lightbulb,
  Sparkles,
  Gauge,
  Shield,
  FileText,
  AlertTriangle,
  FolderOpen as FolderOpenIcon,
  Database,
  Activity,
  Terminal,
  Mail,
  ArrowUp,
  ArrowDown,
  UserCog,
  Clock,
  Camera,
  Zap,
  FileBarChart,
  Presentation,
  History,
  TrendingUp,
  GitBranch
} from 'lucide-react';

// Liste des icônes disponibles pour les catégories
const AVAILABLE_ICONS = [
  { id: 'Folder', icon: Folder, label: 'Dossier' },
  { id: 'FolderOpen', icon: FolderOpen, label: 'Dossier Ouvert' },
  { id: 'LayoutDashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { id: 'ClipboardList', icon: ClipboardList, label: 'Liste' },
  { id: 'Wrench', icon: Wrench, label: 'Maintenance' },
  { id: 'Package', icon: Package, label: 'Stock' },
  { id: 'BarChart3', icon: BarChart3, label: 'Rapports' },
  { id: 'Users', icon: Users, label: 'Utilisateurs' },
  { id: 'Calendar', icon: Calendar, label: 'Planning' },
  { id: 'ShoppingCart', icon: ShoppingCart, label: 'Achats' },
  { id: 'Shield', icon: Shield, label: 'Sécurité' },
  { id: 'Activity', icon: Activity, label: 'IoT' },
  { id: 'Database', icon: Database, label: 'Données' },
  { id: 'MessageSquare', icon: MessageSquare, label: 'Messages' },
  { id: 'UserCog', icon: UserCog, label: 'Gestion Équipe' },
  { id: 'Clock', icon: Clock, label: 'Pointage' },
  { id: 'Camera', icon: Camera, label: 'Caméras' },
  { id: 'Zap', icon: Zap, label: 'M.E.S.' },
  { id: 'Presentation', icon: Presentation, label: 'Dashboard Service' },
  { id: 'FileBarChart', icon: FileBarChart, label: 'Rapports M.E.S.' },
  { id: 'History', icon: History, label: 'Historique' },
  { id: 'TrendingUp', icon: TrendingUp, label: 'Tendances' },
  { id: 'GitBranch', icon: GitBranch, label: 'Arbre des Causes' },
];

const DEFAULT_MENU_ITEMS = [
  { id: 'dashboard', label: 'Tableau de bord', path: '/dashboard', icon: 'LayoutDashboard', module: 'dashboard', visible: true, favorite: false, order: 0, category_id: null },
  { id: 'service-dashboard', label: 'Dashboard Service', path: '/service-dashboard', icon: 'Presentation', module: 'serviceDashboard', visible: true, favorite: false, order: 0.5, category_id: null },
  { id: 'chat-live', label: 'Chat Live', path: '/chat-live', icon: 'Mail', module: 'chatLive', visible: true, favorite: false, order: 1, category_id: null },
  { id: 'intervention-requests', label: 'Demandes d\'inter.', path: '/intervention-requests', icon: 'MessageSquare', module: 'interventionRequests', visible: true, favorite: false, order: 2, category_id: null },
  { id: 'work-orders', label: 'Ordres de travail', path: '/work-orders', icon: 'ClipboardList', module: 'workOrders', visible: true, favorite: false, order: 3, category_id: null },
  { id: 'improvement-requests', label: 'Demandes d\'amél.', path: '/improvement-requests', icon: 'Lightbulb', module: 'improvementRequests', visible: true, favorite: false, order: 4, category_id: null },
  { id: 'improvements', label: 'Améliorations', path: '/improvements', icon: 'Sparkles', module: 'improvements', visible: true, favorite: false, order: 5, category_id: null },
  { id: 'preventive-maintenance', label: 'Maintenance prev.', path: '/preventive-maintenance', icon: 'Calendar', module: 'preventiveMaintenance', visible: true, favorite: false, order: 6, category_id: null },
  { id: 'planning-mprev', label: 'Planning M.Prev.', path: '/planning-mprev', icon: 'Calendar', module: 'planningMprev', visible: true, favorite: false, order: 7, category_id: null },
  { id: 'assets', label: 'Équipements', path: '/assets', icon: 'Wrench', module: 'assets', visible: true, favorite: false, order: 8, category_id: null },
  { id: 'inventory', label: 'Inventaire', path: '/inventory', icon: 'Package', module: 'inventory', visible: true, favorite: false, order: 9, category_id: null },
  { id: 'purchase-requests', label: 'Demandes d\'Achat', path: '/purchase-requests', icon: 'ShoppingCart', module: 'purchaseRequests', visible: true, favorite: false, order: 10, category_id: null },
  { id: 'locations', label: 'Zones', path: '/locations', icon: 'MapPin', module: 'locations', visible: true, favorite: false, order: 11, category_id: null },
  { id: 'meters', label: 'Compteurs', path: '/meters', icon: 'Gauge', module: 'meters', visible: true, favorite: false, order: 12, category_id: null },
  { id: 'surveillance-plan', label: 'Plan de Surveillance', path: '/surveillance-plan', icon: 'Shield', module: 'surveillance', visible: true, favorite: false, order: 13, category_id: null },
  { id: 'surveillance-rapport', label: 'Rapport Surveillance', path: '/surveillance-rapport', icon: 'FileText', module: 'surveillanceRapport', visible: true, favorite: false, order: 14, category_id: null },
  { id: 'weekly-reports', label: 'Rapports Hebdo.', path: '/weekly-reports', icon: 'FileText', module: 'weeklyReports', visible: true, favorite: false, order: 14.5, category_id: null },
  { id: 'presqu-accident', label: 'Presqu\'accident', path: '/presqu-accident', icon: 'AlertTriangle', module: 'presquaccident', visible: true, favorite: false, order: 15, category_id: null },
  { id: 'presqu-accident-rapport', label: 'Rapport P.accident', path: '/presqu-accident-rapport', icon: 'FileText', module: 'presquaccidentRapport', visible: true, favorite: false, order: 16, category_id: null },
  { id: 'team-management', label: 'Gestion d\'équipe', path: '/team-management', icon: 'UserCog', module: 'timeTracking', visible: true, favorite: false, order: 16.5, category_id: null },
  { id: 'cameras', label: 'Caméras', path: '/cameras', icon: 'Camera', module: 'cameras', visible: true, favorite: false, order: 16.6, category_id: null },
  { id: 'mes', label: 'M.E.S.', path: '/mes', icon: 'Zap', module: 'mes', visible: true, favorite: false, order: 16.7, category_id: null },
  { id: 'mes-reports', label: 'Rapports M.E.S.', path: '/mes-reports', icon: 'FileBarChart', module: 'mesReports', visible: true, favorite: false, order: 16.8, category_id: null },
  { id: 'analytics-checklists', label: 'Analytics Checklists', path: '/analytics/checklists', icon: 'BarChart3', module: 'analyticsChecklists', visible: true, favorite: false, order: 16.9, category_id: null },
  { id: 'documentations', label: 'Documentations', path: '/documentations', icon: 'FolderOpen', module: 'documentations', visible: true, favorite: false, order: 17, category_id: null },
  { id: 'reports', label: 'Rapports', path: '/reports', icon: 'BarChart3', module: 'reports', visible: true, favorite: false, order: 18, category_id: null },
  { id: 'people', label: 'Utilisateurs', path: '/people', icon: 'Users', module: 'people', visible: true, favorite: false, order: 19, category_id: null },
  { id: 'planning', label: 'Planning', path: '/planning', icon: 'Calendar', module: 'planning', visible: true, favorite: false, order: 20, category_id: null },
  { id: 'vendors', label: 'Fournisseurs', path: '/vendors', icon: 'ShoppingCart', module: 'vendors', visible: true, favorite: false, order: 21, category_id: null },
  { id: 'contrats', label: 'Contrats', path: '/contrats', icon: 'FileSignature', module: 'contrats', visible: true, favorite: false, order: 21.5, category_id: null },
  { id: 'purchase-history', label: 'Historique Achat', path: '/purchase-history', icon: 'ShoppingBag', module: 'purchaseHistory', visible: true, favorite: false, order: 22, category_id: null },
  { id: 'import-export', label: 'Import / Export', path: '/import-export', icon: 'Database', module: 'importExport', visible: true, favorite: false, order: 23, category_id: null },
  { id: 'sensors', label: 'Capteurs MQTT', path: '/sensors', icon: 'Activity', module: 'sensors', visible: true, favorite: false, order: 24, category_id: null },
  { id: 'iot-dashboard', label: 'Dashboard IoT', path: '/iot-dashboard', icon: 'BarChart3', module: 'iotDashboard', visible: true, favorite: false, order: 25, category_id: null },
  { id: 'mqtt-logs', label: 'Logs MQTT', path: '/mqtt-logs', icon: 'Terminal', module: 'mqttLogs', visible: true, favorite: false, order: 26, category_id: null },
  { id: 'whiteboard', label: 'Tableau d\'affichage', path: '/whiteboard', icon: 'Presentation', module: 'whiteboard', visible: true, favorite: false, order: 27, category_id: null },
  { id: 'consignations-loto', label: 'Consignations LOTO', path: '/consignations-loto', icon: 'Shield', module: 'consignationsLoto', visible: true, favorite: false, order: 28, category_id: null },
  { id: 'surveillance-ai-history', label: 'Historique IA', path: '/surveillance-ai-history', icon: 'History', module: 'surveillance', visible: true, favorite: false, order: 29, category_id: null },
  { id: 'surveillance-ai-dashboard', label: 'Tendances IA', path: '/surveillance-ai-dashboard', icon: 'TrendingUp', module: 'surveillance', visible: true, favorite: false, order: 30, category_id: null },
  { id: 'accident-analysis', label: 'Arbre des Causes', path: '/accident-analysis', icon: 'GitBranch', module: 'accidentAnalysis', visible: true, favorite: false, order: 31, category_id: null }
];

const MenuOrganizationSection = () => {
  const { preferences, updatePreferences } = usePreferences();
  const { toast } = useToast();
  const { canView, isAdmin } = usePermissions();
  const [menuItems, setMenuItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [draggedItem, setDraggedItem] = useState(null);
  const [expandedCategories, setExpandedCategories] = useState({});
  
  // Dialog states
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryIcon, setNewCategoryIcon] = useState('Folder');

  // Un menu est accessible si l'utilisateur est admin OU si canView(module) est vrai
  const isMenuAccessible = (item) => {
    if (isAdmin()) return true;
    if (!item.module) return true;
    return canView(item.module);
  };

  useEffect(() => {
    // Charger les menus depuis les préférences ou utiliser les valeurs par défaut
    const loadedMenuItems = preferences?.menu_items?.length > 0 
      ? preferences.menu_items.map(item => ({
          ...item,
          category_id: item.category_id || null
        }))
      : DEFAULT_MENU_ITEMS;
    
    setMenuItems(loadedMenuItems);
    
    // Charger les catégories
    const loadedCategories = preferences?.menu_categories || [];
    setCategories(loadedCategories);
    
    // Initialiser les catégories comme repliées par défaut
    const initialExpanded = {};
    loadedCategories.forEach(cat => {
      initialExpanded[cat.id] = false;
    });
    setExpandedCategories(initialExpanded);
  }, [preferences]);

  // Générer un ID unique
  const generateId = () => {
    return 'cat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  };

  // Créer une nouvelle catégorie
  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) {
      toast({ title: 'Erreur', description: 'Le nom de la catégorie est requis', variant: 'destructive' });
      return;
    }

    const newCategory = {
      id: editingCategory?.id || generateId(),
      name: newCategoryName.trim(),
      icon: newCategoryIcon,
      order: editingCategory?.order ?? categories.length,
      items: editingCategory?.items || []
    };

    let updatedCategories;
    if (editingCategory) {
      updatedCategories = categories.map(cat => 
        cat.id === editingCategory.id ? newCategory : cat
      );
    } else {
      updatedCategories = [...categories, newCategory];
    }

    setCategories(updatedCategories);
    setExpandedCategories(prev => ({ ...prev, [newCategory.id]: true }));

    try {
      await updatePreferences({ menu_categories: updatedCategories });
      toast({ 
        title: 'Succès', 
        description: editingCategory ? 'Catégorie modifiée' : 'Catégorie créée' 
      });
    } catch (error) {
      toast({ title: 'Erreur', description: 'Erreur de sauvegarde', variant: 'destructive' });
    }

    setCategoryDialogOpen(false);
    setEditingCategory(null);
    setNewCategoryName('');
    setNewCategoryIcon('Folder');
  };

  // Supprimer une catégorie
  const handleDeleteCategory = async (categoryId) => {
    if (!window.confirm('Supprimer cette catégorie ? Les menus seront déplacés vers "Sans catégorie".')) {
      return;
    }

    // Retirer les menus de cette catégorie
    const updatedMenuItems = menuItems.map(item => 
      item.category_id === categoryId ? { ...item, category_id: null } : item
    );
    
    const updatedCategories = categories.filter(cat => cat.id !== categoryId);

    setMenuItems(updatedMenuItems);
    setCategories(updatedCategories);

    try {
      await updatePreferences({ 
        menu_categories: updatedCategories,
        menu_items: updatedMenuItems 
      });
      toast({ title: 'Succès', description: 'Catégorie supprimée' });
    } catch (error) {
      toast({ title: 'Erreur', description: 'Erreur de suppression', variant: 'destructive' });
    }
  };

  // Ouvrir le dialog pour modifier une catégorie
  const handleEditCategory = (category) => {
    setEditingCategory(category);
    setNewCategoryName(category.name);
    setNewCategoryIcon(category.icon || 'Folder');
    setCategoryDialogOpen(true);
  };

  // Toggle visibilité d'un menu
  const toggleVisibility = async (itemId) => {
    const updatedItems = menuItems.map(item =>
      item.id === itemId ? { ...item, visible: !item.visible } : item
    );
    setMenuItems(updatedItems);

    try {
      await updatePreferences({ menu_items: updatedItems });
      toast({ title: 'Succès', description: 'Visibilité mise à jour' });
    } catch (error) {
      toast({ title: 'Erreur', description: 'Erreur de mise à jour', variant: 'destructive' });
    }
  };

  // Toggle favori d'un menu
  const toggleFavorite = async (itemId) => {
    const updatedItems = menuItems.map(item =>
      item.id === itemId ? { ...item, favorite: !item.favorite } : item
    );
    setMenuItems(updatedItems);

    try {
      await updatePreferences({ menu_items: updatedItems });
      toast({ title: 'Succès', description: 'Favori mis à jour' });
    } catch (error) {
      toast({ title: 'Erreur', description: 'Erreur de mise à jour', variant: 'destructive' });
    }
  };

  // Drag & Drop pour les menus
  const handleDragStart = (item, type) => {
    setDraggedItem({ item, type });
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDropOnCategory = async (categoryId) => {
    if (!draggedItem || draggedItem.type !== 'menu') return;

    const updatedItems = menuItems.map(item =>
      item.id === draggedItem.item.id ? { ...item, category_id: categoryId } : item
    );
    setMenuItems(updatedItems);
    setDraggedItem(null);

    try {
      await updatePreferences({ menu_items: updatedItems });
      toast({ title: 'Succès', description: 'Menu déplacé dans la catégorie' });
    } catch (error) {
      toast({ title: 'Erreur', description: 'Erreur de déplacement', variant: 'destructive' });
    }
  };

  const handleDropOnUncategorized = async () => {
    if (!draggedItem || draggedItem.type !== 'menu') return;

    const updatedItems = menuItems.map(item =>
      item.id === draggedItem.item.id ? { ...item, category_id: null } : item
    );
    setMenuItems(updatedItems);
    setDraggedItem(null);

    try {
      await updatePreferences({ menu_items: updatedItems });
      toast({ title: 'Succès', description: 'Menu retiré de la catégorie' });
    } catch (error) {
      toast({ title: 'Erreur', description: 'Erreur de déplacement', variant: 'destructive' });
    }
  };

  // Toggle expansion d'une catégorie
  const toggleCategoryExpansion = (categoryId) => {
    setExpandedCategories(prev => ({
      ...prev,
      [categoryId]: !prev[categoryId]
    }));
  };

  // Réordonner les menus à l'intérieur d'une catégorie
  const handleDropOnMenuItem = async (targetItemId, targetCategoryId) => {
    if (!draggedItem || draggedItem.type !== 'menu') return;
    if (draggedItem.item.id === targetItemId) {
      setDraggedItem(null);
      return;
    }

    const updatedItems = [...menuItems];
    const draggedIndex = updatedItems.findIndex(item => item.id === draggedItem.item.id);
    const targetIndex = updatedItems.findIndex(item => item.id === targetItemId);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedItem(null);
      return;
    }

    // Retirer l'élément dragué
    const [removed] = updatedItems.splice(draggedIndex, 1);
    
    // Mettre à jour la catégorie si nécessaire
    removed.category_id = targetCategoryId;
    
    // Insérer à la nouvelle position
    const newTargetIndex = updatedItems.findIndex(item => item.id === targetItemId);
    updatedItems.splice(newTargetIndex, 0, removed);

    // Mettre à jour les ordres
    const finalItems = updatedItems.map((item, index) => ({ ...item, order: index }));

    setMenuItems(finalItems);
    setDraggedItem(null);

    try {
      await updatePreferences({ menu_items: finalItems });
      toast({ title: 'Succès', description: 'Ordre mis à jour' });
    } catch (error) {
      toast({ title: 'Erreur', description: 'Erreur de réorganisation', variant: 'destructive' });
    }
  };

  // Migration des menus
  const migrateMenus = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${process.env.REACT_APP_BACKEND_URL || ''}/api/user-preferences/migrate-menus`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.detail || 'Erreur lors de la migration');
      }
      
      toast({ 
        title: 'Succès', 
        description: data.message || 'Menus mis à jour' 
      });
      
      window.location.reload();
    } catch (error) {
      toast({ 
        title: 'Erreur', 
        description: error.message || 'Erreur de migration', 
        variant: 'destructive' 
      });
    }
  };

  // Réinitialiser l'ordre
  const resetOrder = async () => {
    if (!window.confirm('Réinitialiser tous les menus et catégories ?')) return;
    
    setMenuItems(DEFAULT_MENU_ITEMS);
    setCategories([]);
    
    try {
      await updatePreferences({ 
        menu_items: DEFAULT_MENU_ITEMS,
        menu_categories: []
      });
      toast({ title: 'Succès', description: 'Menus réinitialisés' });
    } catch (error) {
      toast({ title: 'Erreur', description: 'Erreur de réinitialisation', variant: 'destructive' });
    }
  };

  // Obtenir l'icône d'une catégorie
  const getCategoryIcon = (iconId) => {
    const iconDef = AVAILABLE_ICONS.find(i => i.id === iconId);
    return iconDef ? iconDef.icon : Folder;
  };

  // Filtrer les menus par catégorie (seulement ceux accessibles à l'utilisateur)
  const getMenusByCategory = (categoryId) => {
    return menuItems
      .filter(item => item.category_id === categoryId && isMenuAccessible(item))
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  };

  // Menus sans catégorie (seulement ceux accessibles)
  const uncategorizedMenus = menuItems
    .filter(item => !item.category_id && isMenuAccessible(item))
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  // Déplacer un menu vers le haut
  const moveMenuUp = async (itemId, categoryId) => {
    const itemsInCategory = categoryId 
      ? getMenusByCategory(categoryId) 
      : uncategorizedMenus;
    
    const currentIndex = itemsInCategory.findIndex(item => item.id === itemId);
    if (currentIndex <= 0) return; // Déjà en haut
    
    const itemAbove = itemsInCategory[currentIndex - 1];
    const currentItem = itemsInCategory[currentIndex];
    
    // Échanger les ordres
    const updatedItems = menuItems.map(item => {
      if (item.id === currentItem.id) {
        return { ...item, order: itemAbove.order };
      }
      if (item.id === itemAbove.id) {
        return { ...item, order: currentItem.order };
      }
      return item;
    });
    
    setMenuItems(updatedItems);
    
    try {
      await updatePreferences({ menu_items: updatedItems });
    } catch (error) {
      toast({ title: 'Erreur', description: 'Erreur de déplacement', variant: 'destructive' });
    }
  };

  // Déplacer un menu vers le bas
  const moveMenuDown = async (itemId, categoryId) => {
    const itemsInCategory = categoryId 
      ? getMenusByCategory(categoryId) 
      : uncategorizedMenus;
    
    const currentIndex = itemsInCategory.findIndex(item => item.id === itemId);
    if (currentIndex >= itemsInCategory.length - 1) return; // Déjà en bas
    
    const itemBelow = itemsInCategory[currentIndex + 1];
    const currentItem = itemsInCategory[currentIndex];
    
    // Échanger les ordres
    const updatedItems = menuItems.map(item => {
      if (item.id === currentItem.id) {
        return { ...item, order: itemBelow.order };
      }
      if (item.id === itemBelow.id) {
        return { ...item, order: currentItem.order };
      }
      return item;
    });
    
    setMenuItems(updatedItems);
    
    try {
      await updatePreferences({ menu_items: updatedItems });
    } catch (error) {
      toast({ title: 'Erreur', description: 'Erreur de déplacement', variant: 'destructive' });
    }
  };

  // Déplacer une catégorie vers le haut
  const moveCategoryUp = async (categoryId) => {
    const sortedCategories = [...categories].sort((a, b) => (a.order || 0) - (b.order || 0));
    const currentIndex = sortedCategories.findIndex(cat => cat.id === categoryId);
    if (currentIndex <= 0) return;
    
    const categoryAbove = sortedCategories[currentIndex - 1];
    const currentCategory = sortedCategories[currentIndex];
    
    const updatedCategories = categories.map(cat => {
      if (cat.id === currentCategory.id) {
        return { ...cat, order: categoryAbove.order };
      }
      if (cat.id === categoryAbove.id) {
        return { ...cat, order: currentCategory.order };
      }
      return cat;
    });
    
    setCategories(updatedCategories);
    
    try {
      await updatePreferences({ menu_categories: updatedCategories });
    } catch (error) {
      toast({ title: 'Erreur', description: 'Erreur de déplacement', variant: 'destructive' });
    }
  };

  // Déplacer une catégorie vers le bas
  const moveCategoryDown = async (categoryId) => {
    const sortedCategories = [...categories].sort((a, b) => (a.order || 0) - (b.order || 0));
    const currentIndex = sortedCategories.findIndex(cat => cat.id === categoryId);
    if (currentIndex >= sortedCategories.length - 1) return;
    
    const categoryBelow = sortedCategories[currentIndex + 1];
    const currentCategory = sortedCategories[currentIndex];
    
    const updatedCategories = categories.map(cat => {
      if (cat.id === currentCategory.id) {
        return { ...cat, order: categoryBelow.order };
      }
      if (cat.id === categoryBelow.id) {
        return { ...cat, order: currentCategory.order };
      }
      return cat;
    });
    
    setCategories(updatedCategories);
    
    try {
      await updatePreferences({ menu_categories: updatedCategories });
    } catch (error) {
      toast({ title: 'Erreur', description: 'Erreur de déplacement', variant: 'destructive' });
    }
  };

  // Fonction de rendu pour un menu item
  const renderMenuItemRow = (item, categoryId, itemIndex, totalItems) => (
    <div
      key={item.id}
      draggable
      onDragStart={() => handleDragStart(item, 'menu')}
      onDragOver={handleDragOver}
      onDrop={() => handleDropOnMenuItem(item.id, categoryId)}
      className={`flex items-center gap-2 p-3 rounded-lg border transition-all ${
        draggedItem?.item?.id === item.id ? 'bg-blue-50 border-blue-300 opacity-50' : 'bg-white border-gray-200'
      } ${!item.visible ? 'opacity-50' : ''} hover:border-blue-200`}
    >
      {/* Flèches haut/bas pour réorganiser */}
      <div className="flex flex-col gap-0.5">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={(e) => {
            e.stopPropagation();
            moveMenuUp(item.id, categoryId);
          }}
          disabled={itemIndex === 0}
          title="Monter"
        >
          <ArrowUp size={14} className={itemIndex === 0 ? 'text-gray-300' : 'text-gray-600'} />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={(e) => {
            e.stopPropagation();
            moveMenuDown(item.id, categoryId);
          }}
          disabled={itemIndex === totalItems - 1}
          title="Descendre"
        >
          <ArrowDown size={14} className={itemIndex === totalItems - 1 ? 'text-gray-300' : 'text-gray-600'} />
        </Button>
      </div>

      {/* Grip pour drag & drop */}
      <div className="cursor-grab active:cursor-grabbing">
        <GripVertical size={18} className="text-gray-400" />
      </div>

      <div className="flex-1 flex items-center gap-2">
        <span className="text-sm font-medium">{item.label}</span>
        {item.favorite && <Star size={14} className="text-yellow-500 fill-yellow-500" />}
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => toggleFavorite(item.id)}
          title={item.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
        >
          <Star size={16} className={item.favorite ? 'text-yellow-500 fill-yellow-500' : 'text-gray-400'} />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => toggleVisibility(item.id)}
          title={item.visible ? 'Masquer' : 'Afficher'}
        >
          {item.visible ? <Eye size={16} /> : <EyeOff size={16} />}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header avec actions */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <Label className="text-base font-semibold">Organiser les menus par catégories</Label>
              <p className="text-sm text-gray-500 mt-1">
                Créez des catégories et glissez-déposez les menus pour les organiser
              </p>
            </div>
            <div className="flex gap-2">
              <Button 
                variant="default" 
                size="sm" 
                onClick={() => {
                  setEditingCategory(null);
                  setNewCategoryName('');
                  setNewCategoryIcon('Folder');
                  setCategoryDialogOpen(true);
                }}
                className="gap-2"
              >
                <FolderPlus size={16} />
                Nouvelle catégorie
              </Button>
              <Button variant="outline" size="sm" onClick={migrateMenus}>
                Ajouter les menus manquants
              </Button>
              <Button variant="outline" size="sm" onClick={resetOrder}>
                Réinitialiser
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Catégories */}
      {categories.length > 0 && (
        <div className="space-y-4">
          <Label className="text-sm font-semibold text-gray-700">Catégories</Label>
          {categories
            .sort((a, b) => (a.order || 0) - (b.order || 0))
            .map((category, categoryIndex, sortedCategories) => {
              const CategoryIcon = getCategoryIcon(category.icon);
              const categoryMenus = getMenusByCategory(category.id);
              const isExpanded = expandedCategories[category.id];
              const isFirst = categoryIndex === 0;
              const isLast = categoryIndex === sortedCategories.length - 1;

              return (
                <Card 
                  key={category.id}
                  className="overflow-hidden"
                  onDragOver={handleDragOver}
                  onDrop={() => handleDropOnCategory(category.id)}
                >
                  <div 
                    className={`flex items-center gap-2 p-4 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors ${
                      draggedItem?.type === 'menu' ? 'ring-2 ring-blue-300 ring-inset' : ''
                    }`}
                    onClick={() => toggleCategoryExpansion(category.id)}
                  >
                    {/* Flèches haut/bas pour réorganiser les catégories */}
                    <div className="flex flex-col gap-0.5" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveCategoryUp(category.id);
                        }}
                        disabled={isFirst}
                        title="Monter la catégorie"
                      >
                        <ArrowUp size={14} className={isFirst ? 'text-gray-300' : 'text-gray-600'} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveCategoryDown(category.id);
                        }}
                        disabled={isLast}
                        title="Descendre la catégorie"
                      >
                        <ArrowDown size={14} className={isLast ? 'text-gray-300' : 'text-gray-600'} />
                      </Button>
                    </div>

                    <button className="p-1">
                      {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    </button>
                    <CategoryIcon size={20} className="text-blue-600" />
                    <span className="font-semibold flex-1">{category.name}</span>
                    <span className="text-sm text-gray-500">{categoryMenus.length} menu(s)</span>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditCategory(category);
                        }}
                      >
                        <Edit size={16} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteCategory(category.id);
                        }}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </div>
                  
                  {isExpanded && (
                    <CardContent className="pt-3 pb-3 space-y-2">
                      {categoryMenus.length > 0 ? (
                        categoryMenus.map((item, index) => renderMenuItemRow(item, category.id, index, categoryMenus.length))
                      ) : (
                        <div className="text-center py-6 text-gray-400 border-2 border-dashed rounded-lg">
                          <FolderOpenIcon size={32} className="mx-auto mb-2 opacity-50" />
                          <p>Glissez des menus ici</p>
                        </div>
                      )}
                    </CardContent>
                  )}
                </Card>
              );
            })}
        </div>
      )}

      {/* Menus sans catégorie */}
      <Card
        onDragOver={handleDragOver}
        onDrop={handleDropOnUncategorized}
      >
        <CardContent className="pt-6">
          <div className="flex items-center gap-3 mb-4">
            <Folder size={20} className="text-gray-400" />
            <Label className="text-base font-semibold">Sans catégorie</Label>
            <span className="text-sm text-gray-500">({uncategorizedMenus.length} menu(s))</span>
          </div>
          
          <div className={`space-y-2 ${draggedItem?.type === 'menu' ? 'ring-2 ring-gray-300 ring-inset rounded-lg p-2' : ''}`}>
            {uncategorizedMenus.map((item, index) => renderMenuItemRow(item, null, index, uncategorizedMenus.length))}
          </div>
        </CardContent>
      </Card>

      {/* Dialog de création/modification de catégorie */}
      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingCategory ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <Label>Nom de la catégorie</Label>
              <Input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Ex: Maintenance, Stock, Administration..."
                className="mt-2"
              />
            </div>
            
            <div>
              <Label>Icône</Label>
              <div className="grid grid-cols-7 gap-2 mt-2">
                {AVAILABLE_ICONS.map(({ id, icon: IconComponent, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setNewCategoryIcon(id)}
                    className={`p-3 rounded-lg border-2 transition-all ${
                      newCategoryIcon === id 
                        ? 'border-blue-500 bg-blue-50' 
                        : 'border-gray-200 hover:border-blue-300'
                    }`}
                    title={label}
                  >
                    <IconComponent size={20} className={newCategoryIcon === id ? 'text-blue-600' : 'text-gray-600'} />
                  </button>
                ))}
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setCategoryDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleCreateCategory}>
              {editingCategory ? 'Enregistrer' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MenuOrganizationSection;
