import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocationStateFilter } from '../hooks/useLocationStateFilter';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Plus, Minus, Search, Package, AlertTriangle, AlertCircle, TrendingDown, Pencil, Trash2, X, EyeOff, Eye, Settings, Link2, Unlink, FolderPlus, FolderMinus, QrCode, Download, Camera, ClipboardList } from 'lucide-react';
import InventoryFormDialog from '../components/Inventory/InventoryFormDialog';
import DeleteConfirmDialog from '../components/Common/DeleteConfirmDialog';
import QRScannerDialog from '../components/QRScannerDialog';
import QuickInventoryMode from '../components/QuickInventoryMode';
import { inventoryAPI, equipmentsAPI } from '../services/api';
import { useToast } from '../hooks/use-toast';

const Inventory = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAlert, setFilterAlert] = useState(false);
  const [filterEquipment, setFilterEquipment] = useState('');
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [equipments, setEquipments] = useState([]);
  const [loadingEquipments, setLoadingEquipments] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [quickInventoryOpen, setQuickInventoryOpen] = useState(false);

  // Services d'inventaire (onglets)
  const [services, setServices] = useState([]);
  const [activeServiceId, setActiveServiceId] = useState(null);
  const [serviceItems, setServiceItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [loadingServices, setLoadingServices] = useState(true);

  // Dialogue création service
  const [newServiceDialogOpen, setNewServiceDialogOpen] = useState(false);
  const [newServiceName, setNewServiceName] = useState('');
  const [creatingService, setCreatingService] = useState(false);

  // Dialogue suppression service
  const [deleteServiceDialogOpen, setDeleteServiceDialogOpen] = useState(false);
  const [serviceToDelete, setServiceToDelete] = useState(null);

  // Dialogue partage
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [itemToShare, setItemToShare] = useState(null);
  const [shareTargetServiceId, setShareTargetServiceId] = useState('');

  // Utilisateur courant
  const user = useMemo(() => JSON.parse(localStorage.getItem('user') || '{}'), []);
  const isAdmin = user.role === 'ADMIN' || user.role === 'admin' || user.role === 'Administrateur';
  const isManagerOrAdmin = isAdmin || user.is_service_manager;

  // Appliquer les filtres depuis la navigation
  useLocationStateFilter({
    filterAlert: () => setFilterAlert(true),
    filterEquipment: (value) => setFilterEquipment(value)
  });

  // Charger les services d'inventaire
  const loadServices = useCallback(async () => {
    try {
      setLoadingServices(true);
      const response = await inventoryAPI.getServices();
      const svcList = response.data || [];
      setServices(svcList);

      // Déterminer l'onglet par défaut: service de l'utilisateur ou "Non classé"
      if (!activeServiceId && svcList.length > 0) {
        const userService = user.service || '';
        const matchingSvc = svcList.find(s => s.name.toLowerCase() === userService.toLowerCase());
        if (matchingSvc) {
          setActiveServiceId(matchingSvc.id);
        } else {
          const nonClasse = svcList.find(s => s.name === 'Non classé');
          setActiveServiceId(nonClasse ? nonClasse.id : svcList[0].id);
        }
      }
    } catch (error) {
      console.error('Erreur chargement services:', error);
    } finally {
      setLoadingServices(false);
    }
  }, [user.service, activeServiceId]);

  // Charger les articles du service actif
  const loadServiceItems = useCallback(async () => {
    if (!activeServiceId) return;
    try {
      setLoadingItems(true);
      const response = await inventoryAPI.getByService(activeServiceId);
      setServiceItems(response.data || []);
    } catch (error) {
      console.error('Erreur chargement articles:', error);
      setServiceItems([]);
    } finally {
      setLoadingItems(false);
    }
  }, [activeServiceId]);

  useEffect(() => { loadServices(); }, []);
  useEffect(() => { if (activeServiceId) loadServiceItems(); }, [activeServiceId, loadServiceItems]);

  // WebSocket: écouter les mises à jour d'inventaire en temps réel
  useEffect(() => {
    const token = localStorage.getItem('token');
    const userId = user.id || user._id;
    if (!token || !userId) return;

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = window.location.host;
    const wsUrl = `${wsProtocol}//${wsHost}/api/ws/chat?token=${token}&user_id=${userId}`;

    let ws;
    let reconnectTimeout;

    const connect = () => {
      ws = new WebSocket(wsUrl);
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'inventory_update') {
            // Mise a jour DIRECTE de l'article dans le state (pas de refetch API)
            setServiceItems(prev => prev.map(item => {
              if (item.id === data.item_id || item._id === data.item_id) {
                return { ...item, quantite: data.quantity_after };
              }
              return item;
            }));
            toast({
              title: `Stock ${data.action === 'ajout' ? 'augmente' : 'diminue'}`,
              description: `${data.item_name}: ${data.quantity_before} → ${data.quantity_after} (par ${data.user_name})`,
            });
          } else if (data.type === 'inventory_restock_request') {
            toast({
              title: 'Demande de reapprovisionnement',
              description: `${data.requested_by_name} demande du reapprovisionnement pour "${data.item_name}" (stock: ${data.current_quantity})`,
              variant: 'destructive',
            });
          }
        } catch {}
      };
      ws.onclose = () => {
        reconnectTimeout = setTimeout(connect, 5000);
      };
    };

    connect();

    return () => {
      if (ws) ws.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [user.id, user._id]);

  // Charger les équipements
  useEffect(() => {
    const loadEquipments = async () => {
      setLoadingEquipments(true);
      try {
        const response = await equipmentsAPI.getAll();
        setEquipments(response.data || []);
      } catch (error) {
        console.error('Erreur chargement équipements:', error);
      } finally {
        setLoadingEquipments(false);
      }
    };
    loadEquipments();
  }, []);

  // Hiérarchie des équipements pour le filtre
  const equipmentOptions = useMemo(() => {
    const mainEquipments = equipments.filter(e => !e.parent_id);
    const options = [];
    mainEquipments.forEach(main => {
      options.push({ id: main.id, name: main.nom, isMain: true });
      const subs = equipments.filter(e => e.parent_id === main.id);
      subs.forEach(sub => {
        options.push({ id: sub.id, name: `  └─ ${sub.nom}`, isMain: false, parentName: main.nom });
      });
    });
    return options;
  }, [equipments]);

  const getEquipmentName = (id) => {
    const equipment = equipments.find(e => e.id === id);
    if (!equipment) return null;
    if (equipment.parent_id) {
      const parent = equipments.find(e => e.id === equipment.parent_id);
      return parent ? `${parent.nom} > ${equipment.nom}` : equipment.nom;
    }
    return equipment.nom;
  };

  // Le service actif
  const activeService = services.find(s => s.id === activeServiceId);
  // L'utilisateur peut-il modifier dans cet onglet?
  const userServiceName = user.service || '';
  const canEditInTab = isAdmin || (activeService && activeService.name.toLowerCase() === userServiceName.toLowerCase());

  // Vérifier si un article est partagé (pas propriétaire de ce service)
  const isSharedItem = (item) => {
    return item.service_id !== activeServiceId;
  };

  // Obtenir le nom du service propriétaire d'un article partagé
  const getOwnerServiceName = (item) => {
    if (!isSharedItem(item)) return null;
    const ownerSvc = services.find(s => s.id === item.service_id);
    return ownerSvc ? ownerSvc.name : 'Inconnu';
  };

  // Ajuster la quantité
  const adjustQuantity = async (item, delta) => {
    try {
      const newQuantity = item.quantite + delta;
      await inventoryAPI.update(item.id, { ...item, quantite: newQuantity });
      setServiceItems(prev => prev.map(i => i.id === item.id ? { ...i, quantite: newQuantity } : i));
      window.dispatchEvent(new Event('inventoryItemUpdated'));
      toast({ title: 'Quantité mise à jour', description: `${item.nom}: ${item.quantite} → ${newQuantity}` });
    } catch (error) {
      toast({ title: 'Erreur', description: 'Impossible de mettre à jour la quantité', variant: 'destructive' });
    }
  };

  const handleDelete = (id) => {
    setItemToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    try {
      await inventoryAPI.delete(itemToDelete);
      window.dispatchEvent(new Event('inventoryItemDeleted'));
      toast({ title: 'Succès', description: 'Article supprimé' });
      loadServiceItems();
    } catch (error) {
      toast({ title: 'Erreur', description: "Impossible de supprimer l'article", variant: 'destructive' });
    } finally {
      setDeleteDialogOpen(false);
      setItemToDelete(null);
    }
  };

  const handleToggleMonitoring = async (item) => {
    try {
      const response = await inventoryAPI.toggleMonitoring(item.id);
      const newStatus = response.data.stock_monitoring_enabled;
      toast({ title: 'Succès', description: `Surveillance ${newStatus ? 'activée' : 'désactivée'} pour ${item.nom}` });
      loadServiceItems();
    } catch (error) {
      toast({ title: 'Erreur', description: 'Impossible de modifier la surveillance', variant: 'destructive' });
    }
  };

  // Créer un service
  const handleCreateService = async () => {
    if (!newServiceName.trim()) return;
    setCreatingService(true);
    try {
      const response = await inventoryAPI.createService({ name: newServiceName.trim() });
      toast({ title: 'Succès', description: `Service "${response.data.name}" créé` });
      setNewServiceDialogOpen(false);
      setNewServiceName('');
      await loadServices();
      setActiveServiceId(response.data.id);
    } catch (error) {
      const msg = error.response?.data?.detail || 'Erreur lors de la création';
      toast({ title: 'Erreur', description: msg, variant: 'destructive' });
    } finally {
      setCreatingService(false);
    }
  };

  // Supprimer un service
  const confirmDeleteService = async () => {
    if (!serviceToDelete) return;
    try {
      await inventoryAPI.deleteService(serviceToDelete.id);
      toast({ title: 'Succès', description: `Service "${serviceToDelete.name}" supprimé` });
      setDeleteServiceDialogOpen(false);
      setServiceToDelete(null);
      const nonClasse = services.find(s => s.name === 'Non classé');
      if (nonClasse) setActiveServiceId(nonClasse.id);
      await loadServices();
      loadServiceItems();
    } catch (error) {
      const msg = error.response?.data?.detail || 'Erreur lors de la suppression';
      toast({ title: 'Erreur', description: msg, variant: 'destructive' });
    }
  };

  // Partager un article
  const handleShare = async () => {
    if (!itemToShare || !shareTargetServiceId) return;
    try {
      await inventoryAPI.shareItem(itemToShare.id, shareTargetServiceId);
      const targetName = services.find(s => s.id === shareTargetServiceId)?.name || '';
      toast({ title: 'Succès', description: `Article partagé avec "${targetName}"` });
      setShareDialogOpen(false);
      setItemToShare(null);
      setShareTargetServiceId('');
      loadServiceItems();
    } catch (error) {
      const msg = error.response?.data?.detail || 'Erreur lors du partage';
      toast({ title: 'Erreur', description: msg, variant: 'destructive' });
    }
  };

  // Retirer le partage
  const handleUnshare = async (item) => {
    try {
      await inventoryAPI.unshareItem(item.id, activeServiceId);
      toast({ title: 'Succès', description: `Partage retiré pour "${item.nom}"` });
      loadServiceItems();
    } catch (error) {
      toast({ title: 'Erreur', description: 'Impossible de retirer le partage', variant: 'destructive' });
    }
  };

  // Scanner QR: extraire l'ID de l'URL scannée et naviguer
  const handleQRScan = (decodedText) => {
    try {
      // Supporter URLs complètes et chemins relatifs
      let path = decodedText;
      try {
        const url = new URL(decodedText);
        path = url.pathname;
      } catch {
        // decodedText est déjà un chemin ou un ID
      }

      // /qr-inventory/{itemId}
      const inventoryMatch = path.match(/\/qr-inventory\/([a-f0-9]+)/i);
      if (inventoryMatch) {
        navigate(`/qr-inventory/${inventoryMatch[1]}`);
        toast({ title: 'QR Code scanné', description: 'Redirection vers la fiche article...' });
        return;
      }

      // /qr/{equipmentId}
      const equipmentMatch = path.match(/\/qr\/([a-f0-9]+)/i);
      if (equipmentMatch) {
        navigate(`/qr/${equipmentMatch[1]}`);
        toast({ title: 'QR Code scanné', description: 'Redirection vers la fiche équipement...' });
        return;
      }

      // Si c'est juste un ID hex (24 chars = ObjectId)
      if (/^[a-f0-9]{24}$/i.test(decodedText.trim())) {
        navigate(`/qr-inventory/${decodedText.trim()}`);
        toast({ title: 'QR Code scanné', description: 'Redirection vers la fiche article...' });
        return;
      }

      toast({ title: 'QR Code non reconnu', description: 'Ce QR code ne correspond pas à un article ou équipement IRIS.', variant: 'destructive' });
    } catch (e) {
      toast({ title: 'Erreur', description: 'Impossible de traiter le QR code', variant: 'destructive' });
    }
  };

  // Télécharger l'étiquette QR
  const handleDownloadQR = async (item) => {
    try {
      const { default: api } = await import('../services/api').then(m => ({ default: m.default }));
      const response = await api.get(`/qr-inventory/item/${item.id}/label`, { responseType: 'blob' });
      if (response.data.type && response.data.type.includes('application/json')) {
        toast({ title: 'Erreur', description: 'Erreur serveur', variant: 'destructive' });
        return;
      }
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `qr_${item.nom || item.id}.png`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast({ title: 'QR Code téléchargé', description: `Étiquette QR pour "${item.nom}" prête à imprimer` });
    } catch (err) {
      toast({ title: 'Erreur', description: 'Impossible de générer le QR code', variant: 'destructive' });
    }
  };

  // Filtrer les articles
  const filteredItems = serviceItems.filter(item => {
    const matchesSearch = item.nom?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.reference?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.categorie?.toLowerCase().includes(searchTerm.toLowerCase());
    if (filterAlert) {
      if ((item.quantite || 0) > (item.quantiteMin || item.seuil_alerte || 0)) return false;
    }
    if (filterEquipment) {
      const eqIds = item.equipment_ids || [];
      if (!eqIds.includes(filterEquipment)) {
        const filterEq = equipments.find(e => e.id === filterEquipment);
        if (filterEq && !filterEq.parent_id) {
          const subIds = equipments.filter(e => e.parent_id === filterEquipment).map(e => e.id);
          if (!eqIds.some(id => subIds.includes(id)) && !eqIds.includes(filterEquipment)) return false;
        } else {
          return false;
        }
      }
    }
    return matchesSearch;
  });

  // Stats sur le service actif
  const monitoredItems = serviceItems.filter(item => item.stock_monitoring_enabled !== false);
  const lowStockItems = monitoredItems.filter(item =>
    (item.quantite || 0) <= (item.quantiteMin || item.seuil_alerte || 0)
  );
  const totalValue = monitoredItems.reduce((sum, item) =>
    sum + ((item.quantite || 0) * (item.prixUnitaire || item.prix_unitaire || 0)), 0
  );

  const getStockStatus = (item) => {
    const quantite = item.quantite || 0;
    const seuilMin = item.quantiteMin || item.seuil_alerte || 0;
    if (quantite <= 0) return { color: 'text-red-600', bg: 'bg-red-100', label: 'Rupture', icon: AlertCircle };
    if (quantite <= seuilMin) return { color: 'text-orange-600', bg: 'bg-orange-100', label: 'Stock bas', icon: AlertTriangle };
    return { color: 'text-green-600', bg: 'bg-green-100', label: 'En stock', icon: Package };
  };

  return (
    <div className="space-y-6" data-testid="inventory-page">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Inventaire</h1>
          <p className="text-gray-600 mt-1">
            Gérez vos pièces et fournitures par service
            {activeService && <span className="ml-1 font-medium text-blue-600">— {activeService.name}</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setScannerOpen(true)}
            data-testid="scan-qr-btn"
            className="border-blue-200 text-blue-600 hover:bg-blue-50"
          >
            <Camera size={18} className="mr-2" />
            Scanner QR
          </Button>
          <Button
            onClick={() => setQuickInventoryOpen(true)}
            data-testid="quick-inventory-btn"
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <ClipboardList size={18} className="mr-2" />
            Inventaire Rapide
          </Button>
          {isManagerOrAdmin && (
            <Button
              variant="outline"
              onClick={() => setNewServiceDialogOpen(true)}
              data-testid="add-service-btn"
            >
              <FolderPlus size={18} className="mr-2" />
              Nouveau service
            </Button>
          )}
          {canEditInTab && (
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => { setSelectedItem(null); setFormDialogOpen(true); }}
              data-testid="add-article-btn"
            >
              <Plus size={20} className="mr-2" />
              Nouvel article
            </Button>
          )}
        </div>
      </div>

      {/* Service Tabs - Style classeur (identique au Dashboard Service) */}
      {loadingServices ? (
        <div className="text-center py-4 text-gray-500">Chargement des services...</div>
      ) : services.length > 0 && (
        <div className="relative mb-6" data-testid="service-tabs">
          <div className="flex flex-wrap gap-0.5 items-end px-2" role="tablist">
            {services.map(svc => {
              const isActive = svc.id === activeServiceId;
              const svcItems = isActive ? serviceItems : [];
              const svcCount = isActive ? filteredItems.length : null;
              return (
                <button
                  key={svc.id}
                  role="tab"
                  data-state={isActive ? 'active' : 'inactive'}
                  data-testid={`service-tab-${svc.name.replace(/\s+/g, '-').toLowerCase()}`}
                  onClick={() => setActiveServiceId(svc.id)}
                  className={`
                    relative px-4 py-2 text-xs font-medium transition-all duration-200 
                    rounded-t-xl border border-b-0 
                    ${isActive 
                      ? 'bg-white text-blue-700 border-gray-200 shadow-sm z-10 -mb-px pb-3' 
                      : 'bg-gray-50 text-gray-500 border-transparent hover:bg-gray-100 hover:text-gray-700'
                    }
                  `}
                  style={isActive ? { boxShadow: '0 -2px 8px rgba(59,130,246,0.1)' } : {}}
                >
                  <span className="relative z-10">{svc.name}</span>
                  {isActive && svcCount !== null && svcCount > 0 && (
                    <span className="ml-1.5 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold">
                      {svcCount}
                    </span>
                  )}
                  {isActive && isManagerOrAdmin && svc.name !== 'Non classé' && (
                    <span
                      className="ml-1.5 text-gray-400 hover:text-red-500 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        setServiceToDelete(svc);
                        setDeleteServiceDialogOpen(true);
                      }}
                      title="Supprimer ce service"
                    >
                      <X size={12} className="inline" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="border-t border-gray-200" />
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="hover:shadow-lg transition-shadow">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Articles dans ce service</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{serviceItems.length}</p>
              </div>
              <div className="bg-blue-100 p-3 rounded-xl">
                <Package size={24} className="text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-lg transition-shadow">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Valeur totale</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{totalValue.toLocaleString('fr-FR')} €</p>
              </div>
              <div className="bg-green-100 p-3 rounded-xl">
                <TrendingDown size={24} className="text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-lg transition-shadow">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Alertes stock bas</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{lowStockItems.length}</p>
              </div>
              <div className="bg-orange-100 p-3 rounded-xl">
                <AlertTriangle size={24} className="text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Low Stock Alert */}
      {lowStockItems.length > 0 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="text-orange-600 mt-1" size={20} />
              <div>
                <h3 className="font-semibold text-orange-900">Alerte de stock bas</h3>
                <p className="text-sm text-orange-700 mt-1">
                  {lowStockItems.length} article(s) nécessite(nt) un réapprovisionnement :
                  <span className="font-medium"> {lowStockItems.map(item => item.nom).join(', ')}</span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search and Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-3">
            <div className="flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                <Input
                  placeholder="Rechercher par nom, référence ou catégorie..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="search-input"
                />
              </div>
              <div className="w-72">
                <select
                  value={filterEquipment}
                  onChange={(e) => setFilterEquipment(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  data-testid="equipment-filter"
                >
                  <option value="">Tous les équipements</option>
                  {equipmentOptions.map(eq => (
                    <option key={eq.id} value={eq.id}>{eq.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {filterAlert && (
                <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
                  <AlertTriangle size={16} className="text-orange-600" />
                  <span className="text-sm text-orange-800 font-medium">Articles en alerte</span>
                  <button onClick={() => setFilterAlert(false)} className="text-orange-600 hover:text-orange-800"><X size={14} /></button>
                </div>
              )}
              {filterEquipment && (
                <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                  <Settings size={16} className="text-blue-600" />
                  <span className="text-sm text-blue-800 font-medium">{getEquipmentName(filterEquipment) || 'Équipement'}</span>
                  <button onClick={() => setFilterEquipment('')} className="text-blue-600 hover:text-blue-800"><X size={14} /></button>
                </div>
              )}
              {!canEditInTab && activeService && (
                <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
                  <EyeOff size={16} className="text-yellow-600" />
                  <span className="text-sm text-yellow-800 font-medium">Lecture seule — ce service ne vous appartient pas</span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Inventory Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Liste des articles ({filteredItems.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingItems ? (
            <div className="text-center py-8"><p className="text-gray-500">Chargement...</p></div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-12">
              <Package size={48} className="mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500 text-lg">Aucun article dans ce service</p>
              {canEditInTab && (
                <Button
                  className="mt-4 bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={() => { setSelectedItem(null); setFormDialogOpen(true); }}
                >
                  <Plus size={18} className="mr-2" />
                  Créer le premier article
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full" data-testid="inventory-table">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Référence</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Nom</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Catégorie</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Appartenance</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Quantité</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Min.</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Prix unit.</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Statut</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => {
                    const status = getStockStatus(item);
                    const StatusIcon = status.icon;
                    const shared = isSharedItem(item);
                    const ownerName = getOwnerServiceName(item);
                    const equipmentNames = (item.equipment_ids || []).map(id => getEquipmentName(id)).filter(Boolean);

                    return (
                      <tr
                        key={item.id}
                        className={`border-b hover:bg-gray-50 transition-colors ${item.stock_monitoring_enabled === false ? 'opacity-60' : ''}`}
                        data-testid={`inventory-row-${item.id}`}
                      >
                        <td className="py-3 px-4 text-sm text-gray-900 font-medium">{item.reference}</td>
                        <td className="py-3 px-4 text-sm text-gray-900 font-medium">
                          <div className="flex items-center gap-2">
                            {item.nom}
                            {shared && (
                              <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded" title={`Partagé depuis: ${ownerName}`}>
                                <Link2 size={10} className="inline mr-1" />
                                {ownerName}
                              </span>
                            )}
                            {item.stock_monitoring_enabled === false && (
                              <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">
                                <EyeOff size={12} className="inline" /> Non surveillé
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-700">{item.categorie}</td>
                        <td className="py-3 px-4">
                          {equipmentNames.length > 0 ? (
                            <div className="flex flex-wrap gap-1 max-w-[200px]">
                              {equipmentNames.slice(0, 2).map((name, idx) => (
                                <span key={idx} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs" title={name}>
                                  <Settings size={10} />
                                  <span className="truncate max-w-[100px]">{name}</span>
                                </span>
                              ))}
                              {equipmentNames.length > 2 && <span className="text-xs text-gray-500">+{equipmentNames.length - 2}</span>}
                            </div>
                          ) : <span className="text-xs text-gray-400">-</span>}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={() => adjustQuantity(item, -1)} className="h-7 w-7 p-0 hover:bg-red-50 hover:border-red-300" disabled={!canEditInTab}>
                              <Minus size={14} />
                            </Button>
                            <span className="text-sm text-gray-900 font-bold min-w-[40px] text-center">{item.quantite}</span>
                            <Button variant="outline" size="sm" onClick={() => adjustQuantity(item, 1)} className="h-7 w-7 p-0 hover:bg-green-50 hover:border-green-300" disabled={!canEditInTab}>
                              <Plus size={14} />
                            </Button>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-sm text-gray-600">{item.quantiteMin || item.seuil_alerte || 0}</td>
                        <td className="py-3 px-4 text-sm text-gray-700">{(item.prixUnitaire || item.prix_unitaire || 0).toFixed(2)} €</td>
                        <td className="py-3 px-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${status.bg} ${status.color} flex items-center gap-1 w-fit`}>
                            <StatusIcon size={14} />
                            {status.label}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <TooltipProvider delayDuration={300}>
                            <div className="flex gap-1">
                              {/* QR Code */}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="sm" onClick={() => handleDownloadQR(item)} className="hover:bg-blue-50 hover:text-blue-600" data-testid={`qr-btn-${item.id}`}>
                                    <QrCode size={16} />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent><p className="font-medium">Télécharger le QR code</p></TooltipContent>
                              </Tooltip>
                              {/* Partager */}
                              {canEditInTab && !shared && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="sm" onClick={() => { setItemToShare(item); setShareDialogOpen(true); }} className="hover:bg-purple-50 hover:text-purple-600">
                                      <Link2 size={16} />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent><p className="font-medium">Partager avec un autre service</p></TooltipContent>
                                </Tooltip>
                              )}
                              {/* Retirer partage */}
                              {shared && canEditInTab && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="sm" onClick={() => handleUnshare(item)} className="hover:bg-red-50 hover:text-red-600">
                                      <Unlink size={16} />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent><p className="font-medium">Retirer de ce service</p></TooltipContent>
                                </Tooltip>
                              )}
                              {/* Toggle monitoring */}
                              {canEditInTab && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="sm" onClick={() => handleToggleMonitoring(item)} className={item.stock_monitoring_enabled === false ? "hover:bg-blue-50 hover:text-blue-600" : "hover:bg-gray-50 hover:text-gray-600"}>
                                      {item.stock_monitoring_enabled === false ? <Eye size={16} /> : <EyeOff size={16} />}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent><p className="font-medium">{item.stock_monitoring_enabled === false ? "Activer la surveillance" : "Désactiver la surveillance"}</p></TooltipContent>
                                </Tooltip>
                              )}
                              {/* Edit */}
                              {canEditInTab && !shared && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="sm" onClick={() => { setSelectedItem(item); setFormDialogOpen(true); }} className="hover:bg-green-50 hover:text-green-600">
                                      <Pencil size={16} />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent><p className="font-medium">Modifier l'article</p></TooltipContent>
                                </Tooltip>
                              )}
                              {/* Delete */}
                              {canEditInTab && !shared && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="sm" onClick={() => handleDelete(item.id)} className="hover:bg-red-50 hover:text-red-600">
                                      <Trash2 size={16} />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent><p className="font-medium">Supprimer l'article</p></TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </TooltipProvider>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Form Dialog */}
      <InventoryFormDialog
        open={formDialogOpen}
        onOpenChange={setFormDialogOpen}
        item={selectedItem}
        onSuccess={loadServiceItems}
        serviceId={activeServiceId}
      />

      {/* Delete Article Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={confirmDelete}
        title="Supprimer l'article"
        message="Êtes-vous sûr de vouloir supprimer cet article ? Cette action est irréversible."
      />

      {/* New Service Dialog */}
      <Dialog open={newServiceDialogOpen} onOpenChange={setNewServiceDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nouveau service d'inventaire</DialogTitle>
            <DialogDescription>
              Créez un nouvel onglet pour organiser l'inventaire par service.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="serviceName">Nom du service</Label>
              <Input
                id="serviceName"
                placeholder="Ex: Maintenance, Production, QHSE..."
                value={newServiceName}
                onChange={(e) => setNewServiceName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateService()}
                data-testid="new-service-name-input"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewServiceDialogOpen(false)}>Annuler</Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={handleCreateService}
              disabled={!newServiceName.trim() || creatingService}
              data-testid="confirm-create-service-btn"
            >
              {creatingService ? 'Création...' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Service Dialog */}
      <DeleteConfirmDialog
        open={deleteServiceDialogOpen}
        onOpenChange={setDeleteServiceDialogOpen}
        onConfirm={confirmDeleteService}
        title={`Supprimer le service "${serviceToDelete?.name}"`}
        message="Tous les articles de ce service seront déplacés vers 'Non classé'. Cette action est irréversible."
      />

      {/* Share Dialog */}
      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Partager l'article</DialogTitle>
            <DialogDescription>
              Importez "{itemToShare?.nom}" dans un autre service. L'article partagé utilisera le même stock.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Service destinataire</Label>
              <select
                value={shareTargetServiceId}
                onChange={(e) => setShareTargetServiceId(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                data-testid="share-target-select"
              >
                <option value="">-- Sélectionner un service --</option>
                {services
                  .filter(s => s.id !== activeServiceId && s.id !== itemToShare?.service_id)
                  .filter(s => !(itemToShare?.shared_service_ids || []).includes(s.id))
                  .map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))
                }
              </select>
            </div>
            {shareTargetServiceId && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800">
                  <Link2 size={14} className="inline mr-1" />
                  L'article sera visible dans les deux services et partagera le même stock.
                  Toute modification de quantité sera reflétée partout.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShareDialogOpen(false)}>Annuler</Button>
            <Button
              className="bg-purple-600 hover:bg-purple-700 text-white"
              onClick={handleShare}
              disabled={!shareTargetServiceId}
              data-testid="confirm-share-btn"
            >
              <Link2 size={16} className="mr-2" />
              Partager
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR Scanner */}
      <QRScannerDialog
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleQRScan}
      />

      {/* Inventaire Rapide */}
      <QuickInventoryMode
        open={quickInventoryOpen}
        onClose={() => { setQuickInventoryOpen(false); loadServiceItems(); }}
      />
    </div>
  );
};

export default Inventory;
