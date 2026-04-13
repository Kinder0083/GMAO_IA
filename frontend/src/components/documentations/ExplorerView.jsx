import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Folder, FileText, FileSpreadsheet, FileImage, FileVideo, File,
  ChevronRight, FolderPlus, Edit, Trash2, Download, Upload,
  Eye, ArrowLeft, Home, Printer, Copy, Scissors, ClipboardPaste,
  Send, Mail, Lock, UserX, Plus, ArrowUpDown, Link2, EyeOff, X
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { documentationsAPI } from '../../services/api';
import { useToast } from '../../hooks/use-toast';
import { useConfirmDialog } from '../ui/confirm-dialog';
import { getBackendURL } from '../../utils/config';
import CustomFormFiller from '../CustomFormFiller';
import BonDeTravailPrintDialog from '../BonDeTravailPrintDialog';
import AutorisationParticulierePrintDialog from '../AutorisationParticulierePrintDialog';

const getFileIcon = (type) => {
  if (type?.includes('pdf')) return { icon: FileText, color: '#ef4444' };
  if (type?.includes('word') || type?.includes('document')) return { icon: FileText, color: '#2563eb' };
  if (type?.includes('sheet') || type?.includes('excel')) return { icon: FileSpreadsheet, color: '#22c55e' };
  if (type?.includes('image')) return { icon: FileImage, color: '#8b5cf6' };
  if (type?.includes('video')) return { icon: FileVideo, color: '#f97316' };
  return { icon: File, color: '#6b7280' };
};

export default function ExplorerView({ poles, onRefresh }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const [currentPoleId, setCurrentPoleId] = useState(null);
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [explorerData, setExplorerData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [breadcrumb, setBreadcrumb] = useState([]);
  const [selectedItems, setSelectedItems] = useState([]);
  const [contextMenu, setContextMenu] = useState(null);
  const [sortBy, setSortBy] = useState('name');

  // Clipboard state
  const [clipboard, setClipboard] = useState(null); // { node_id, node_type, mode: 'copy'|'cut', name }

  // Dialogs
  const [renameDialog, setRenameDialog] = useState(null);
  const [renameName, setRenameName] = useState('');
  const [newFolderDialog, setNewFolderDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [sendToDialog, setSendToDialog] = useState(null);
  const [shareEmailDialog, setShareEmailDialog] = useState(null);
  const [insertDialog, setInsertDialog] = useState(null);
  const [viewerDialog, setViewerDialog] = useState(null);
  const [newDocDialog, setNewDocDialog] = useState(false);

  // Custom form filler for templates
  const [customFormTemplate, setCustomFormTemplate] = useState(null);

  // Nouveau Bon de Travail V2 (dialog intégré)
  const [showBonTravailDialog, setShowBonTravailDialog] = useState(false);

  // Autorisation Particulière V4 (dialog intégré)
  const [showAutorisationDialog, setShowAutorisationDialog] = useState(false);

  // Share email form
  const [emailForm, setEmailForm] = useState({ recipient: '', subject: '', message: '' });

  // Insert into form
  const [insertTargetType, setInsertTargetType] = useState('');
  const [insertTargets, setInsertTargets] = useState([]);
  const [insertTargetId, setInsertTargetId] = useState('');
  const [insertLoading, setInsertLoading] = useState(false);

  // Form templates for "Nouveau..."
  const [formTemplates, setFormTemplates] = useState([]);

  // Upload
  const [uploading, setUploading] = useState(false);
  const [dragOverFiles, setDragOverFiles] = useState(false);
  const fileInputRef = useRef(null);

  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) setCurrentUser(JSON.parse(userData));
  }, []);

  const loadExplorerContents = useCallback(async (poleId, folderId, sort) => {
    if (!poleId) return;
    setLoading(true);
    try {
      const data = await documentationsAPI.getExplorerContents(poleId, folderId, sort || sortBy);
      setExplorerData(data);
      setBreadcrumb(data.breadcrumb || []);
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de charger le contenu', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast, sortBy]);

  useEffect(() => {
    if (currentPoleId) loadExplorerContents(currentPoleId, currentFolderId);
  }, [currentPoleId, currentFolderId, loadExplorerContents]);

  // WebSocket pour la synchronisation en temps réel
  useEffect(() => {
    if (!currentPoleId) return;
    const backendUrl = process.env.REACT_APP_BACKEND_URL || '';
    const wsUrl = backendUrl.replace(/^http/, 'ws') + '/api/ws/realtime/documentations';
    let ws;
    try {
      const token = localStorage.getItem('token');
      ws = new WebSocket(wsUrl + (token ? `?token=${token}` : ''));
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (['created', 'updated', 'deleted', 'status_changed'].includes(msg.type)) {
            loadExplorerContents(currentPoleId, currentFolderId);
          }
        } catch {}
      };
    } catch {}
    return () => { if (ws) ws.close(); };
  }, [currentPoleId, currentFolderId, loadExplorerContents]);

  useEffect(() => {
    const handler = () => setContextMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  // Load form templates once
  useEffect(() => {
    documentationsAPI.getFormTemplates?.().then(setFormTemplates).catch(() => {});
  }, []);

  const openPole = (poleId) => { setCurrentPoleId(poleId); setCurrentFolderId(null); setSelectedItems([]); };
  const openFolder = (folderId) => { setCurrentFolderId(folderId); setSelectedItems([]); };

  const goBack = () => {
    if (currentFolderId) {
      const idx = breadcrumb.findIndex(b => b.id === currentFolderId);
      setCurrentFolderId(idx > 1 ? breadcrumb[idx - 1].id : null);
    } else {
      setCurrentPoleId(null); setExplorerData(null); setBreadcrumb([]);
    }
    setSelectedItems([]);
  };

  const goToBreadcrumb = (item) => {
    setCurrentFolderId(item.type === 'pole' ? null : item.id);
    setSelectedItems([]);
  };

  const handleContextMenu = (e, item, itemType) => {
    e.preventDefault(); e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, item, itemType });
  };

  const handleBgContextMenu = (e) => {
    if (e.target === e.currentTarget || e.target.closest('[data-explorer-bg]')) {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY, item: null, itemType: 'background' });
    }
  };

  const handleItemClick = (e, itemId) => {
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey) {
      setSelectedItems(prev => prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]);
    } else {
      setSelectedItems([itemId]);
    }
  };

  // ── État pour éditer un bon existant ─────────────────────────────────────
  const [editBonData, setEditBonData] = useState(null);

  const handleDoubleClick = (item, itemType) => {
    if (itemType === 'pole') openPole(item.id);
    else if (itemType === 'folder') openFolder(item.id);
    else if (itemType === 'document') openViewer(item);
    else if (itemType === 'bon') {
      // Ouvrir le nouveau dialog pré-rempli avec les données du bon
      const prefill = item.form_data || {
        localisation: item.localisation_ligne || '',
        description: item.description_travaux || '',
        intervenants: item.nom_intervenants || '',
      };
      setEditBonData({ id: item.id, ...prefill });
      setShowBonTravailDialog(true);
    }
  };

  // ==================== ACTIONS ====================

  const handleCopy = (item, itemType) => {
    setClipboard({ node_id: item.id, node_type: itemType, mode: 'copy', name: item.name || item.titre || item.fichier_nom });
    toast({ title: 'Copié', description: `"${item.name || item.titre || item.fichier_nom}" copié dans le presse-papiers` });
  };

  const handleCut = (item, itemType) => {
    setClipboard({ node_id: item.id, node_type: itemType, mode: 'cut', name: item.name || item.titre || item.fichier_nom });
    toast({ title: 'Coupé', description: `"${item.name || item.titre || item.fichier_nom}" prêt à être déplacé` });
  };

  const handlePaste = async () => {
    if (!clipboard) return;
    try {
      if (clipboard.mode === 'copy') {
        await documentationsAPI.copyNode({
          node_id: clipboard.node_id, node_type: clipboard.node_type,
          target_pole_id: currentPoleId, target_folder_id: currentFolderId
        });
        toast({ title: 'Collé', description: 'Copie créée avec succès' });
      } else {
        await documentationsAPI.moveNode({
          node_id: clipboard.node_id, node_type: clipboard.node_type,
          target_pole_id: currentPoleId, target_folder_id: currentFolderId
        });
        toast({ title: 'Déplacé', description: 'Élément déplacé avec succès' });
        setClipboard(null);
      }
      loadExplorerContents(currentPoleId, currentFolderId);
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de coller', variant: 'destructive' });
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await documentationsAPI.createFolder(currentPoleId, { name: newFolderName.trim(), parent_id: currentFolderId });
      setNewFolderDialog(false); setNewFolderName('');
      loadExplorerContents(currentPoleId, currentFolderId);
      toast({ title: 'Dossier créé' });
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de créer le dossier', variant: 'destructive' });
    }
  };

  const handleRename = async () => {
    if (!renameName.trim() || !renameDialog) return;
    try {
      if (renameDialog.type === 'folder') await documentationsAPI.updateFolder(renameDialog.id, { name: renameName.trim() });
      else if (renameDialog.type === 'document') await documentationsAPI.updateDocument(renameDialog.id, { titre: renameName.trim() });
      else if (renameDialog.type === 'bon') await documentationsAPI.updateBonTravail(renameDialog.id, { titre: renameName.trim() });
      setRenameDialog(null); setRenameName('');
      loadExplorerContents(currentPoleId, currentFolderId);
      toast({ title: 'Renommé avec succès' });
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de renommer', variant: 'destructive' });
    }
  };

  const handleDelete = (item, itemType) => {
    const label = itemType === 'folder' ? 'le dossier' : itemType === 'bon' ? 'le bon de travail' : 'le document';
    confirm({
      title: `Supprimer ${label}`,
      description: `Êtes-vous sûr de vouloir supprimer "${item.name || item.titre || item.fichier_nom}" ?`,
      confirmText: 'Supprimer', cancelText: 'Annuler', variant: 'destructive',
      onConfirm: async () => {
        try {
          if (itemType === 'folder') await documentationsAPI.deleteFolder(item.id);
          else if (itemType === 'document') await documentationsAPI.deleteDocument(item.id);
          else if (itemType === 'bon') await documentationsAPI.deleteBonTravail(item.id);
          loadExplorerContents(currentPoleId, currentFolderId);
          toast({ title: 'Supprimé' });
        } catch {
          toast({ title: 'Erreur', description: 'Impossible de supprimer', variant: 'destructive' });
        }
      }
    });
  };

  const handlePrint = (item, itemType) => {
    const token = localStorage.getItem('token');
    if (itemType === 'bon') {
      const w = window.open(`${getBackendURL()}/api/documentations/bons-travail/${item.id}/pdf?token=${token}`, '_blank');
      if (w) w.onload = () => w.print();
    } else if (itemType === 'document') {
      const w = window.open(`${getBackendURL()}/api/documentations/documents/${item.id}/view?token=${token}`, '_blank');
      if (w) w.onload = () => w.print();
    }
  };

  const openViewer = (doc) => {
    setViewerDialog(doc);
  };

  const handleSendTo = async (item, targetPoleId) => {
    try {
      await documentationsAPI.sendToPole({
        node_id: item.id, node_type: sendToDialog?.type || 'document', target_pole_id: targetPoleId
      });
      setSendToDialog(null);
      toast({ title: 'Envoyé', description: 'Copie envoyée au pôle' });
    } catch {
      toast({ title: 'Erreur', description: "Impossible d'envoyer", variant: 'destructive' });
    }
  };

  const handleShareEmail = (item) => {
    setShareEmailDialog(item);
    setEmailForm({ recipient: '', subject: `Document : ${item.fichier_nom || item.titre || 'Document'}`, message: '' });
  };

  const handleShareEmailSubmit = async () => {
    if (!emailForm.recipient) return;
    try {
      await documentationsAPI.shareByEmail({
        document_id: shareEmailDialog.id,
        recipient: emailForm.recipient,
        subject: emailForm.subject,
        message: emailForm.message
      });
      setShareEmailDialog(null);
      toast({ title: 'Envoyé', description: `Email envoyé à ${emailForm.recipient}` });
    } catch {
      toast({ title: 'Erreur', description: "Échec de l'envoi", variant: 'destructive' });
    }
  };

  const handleTogglePermission = async (item, itemType, field) => {
    try {
      await documentationsAPI.togglePermission(item.id, { node_type: itemType, field });
      loadExplorerContents(currentPoleId, currentFolderId);
      toast({ title: 'Permission mise à jour' });
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de changer la permission', variant: 'destructive' });
    }
  };

  const handleOpenInsertDialog = (item) => {
    setInsertDialog(item);
    setInsertTargetType('');
    setInsertTargets([]);
    setInsertTargetId('');
  };

  const handleInsertTargetTypeChange = async (type) => {
    setInsertTargetType(type);
    setInsertTargetId('');
    setInsertLoading(true);
    try {
      const targets = await documentationsAPI.getInsertTargets(type);
      setInsertTargets(targets || []);
    } catch {
      setInsertTargets([]);
    } finally {
      setInsertLoading(false);
    }
  };

  const handleInsertSubmit = async () => {
    if (!insertTargetId || !insertTargetType || !insertDialog) return;
    try {
      await documentationsAPI.insertInto({
        document_id: insertDialog.id,
        target_type: insertTargetType,
        target_id: insertTargetId
      });
      setInsertDialog(null);
      toast({ title: 'Inséré', description: 'Document lié avec succès' });
    } catch {
      toast({ title: 'Erreur', description: "Impossible d'insérer", variant: 'destructive' });
    }
  };

  // ==================== UPLOAD DE FICHIERS ====================

  const handleFileUpload = async (fileList) => {
    if (!fileList || fileList.length === 0 || !currentPoleId) return;
    setUploading(true);
    try {
      const files = Array.from(fileList);
      await documentationsAPI.uploadFiles(currentPoleId, currentFolderId, files);
      loadExplorerContents(currentPoleId, currentFolderId);
      toast({ title: 'Fichier(s) ajouté(s)', description: `${files.length} fichier(s) importé(s)` });
    } catch {
      toast({ title: 'Erreur', description: "Impossible d'importer les fichiers", variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFileDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverFiles(false);
    // Vérifier que ce sont des fichiers du système (pas des éléments internes)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files);
    }
  };

  const handleFileDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Fichiers du système uniquement
    if (e.dataTransfer.types.includes('Files')) {
      setDragOverFiles(true);
    }
  };

  const handleFileDragLeave = (e) => {
    e.preventDefault();
    setDragOverFiles(false);
  };

  const handleSort = (newSort) => {
    setSortBy(newSort);
    if (currentPoleId) loadExplorerContents(currentPoleId, currentFolderId, newSort);
  };

  // Drag & drop
  const handleDragStart = (e, item, itemType) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ id: item.id, type: itemType }));
  };
  const handleDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
  const handleDrop = async (e, targetFolderId) => {
    e.preventDefault(); e.stopPropagation();
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      if (data.type === 'document') {
        await documentationsAPI.moveNode({ node_id: data.id, node_type: 'document', target_pole_id: currentPoleId, target_folder_id: targetFolderId });
      } else if (data.type === 'folder' && data.id !== targetFolderId) {
        await documentationsAPI.moveNode({ node_id: data.id, node_type: 'folder', target_pole_id: currentPoleId, target_folder_id: targetFolderId });
      }
      loadExplorerContents(currentPoleId, currentFolderId);
      toast({ title: 'Déplacé' });
    } catch {
      toast({ title: 'Erreur', variant: 'destructive' });
    }
  };

  // ==================== ROOT VIEW (Poles as folders) ====================
  if (!currentPoleId) {
    return (
      <div className="border rounded-lg bg-white" data-testid="explorer-view">
        <div className="flex items-center gap-2 px-4 py-2 border-b bg-gray-50">
          <Button variant="ghost" size="sm" disabled><ArrowLeft className="h-4 w-4" /></Button>
          <div className="flex items-center gap-1 text-sm text-gray-600">
            <Home className="h-4 w-4" /><span className="font-medium">Documentations</span>
          </div>
        </div>
        <div className="p-4 min-h-[400px]">
          {(!poles || poles.length === 0) ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <Folder className="h-16 w-16 mb-4" /><p>Aucun pôle de service</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
              {poles.map(pole => (
                <ExplorerItem key={pole.id} id={pole.id} name={pole.nom} type="pole"
                  color={pole.couleur} subtitle={`${pole.documents?.length || 0} doc`}
                  selected={selectedItems.includes(pole.id)}
                  onClick={(e) => handleItemClick(e, pole.id)}
                  onDoubleClick={() => handleDoubleClick(pole, 'pole')}
                  onContextMenu={(e) => handleContextMenu(e, pole, 'pole')}
                />
              ))}
            </div>
          )}
        </div>
        <ConfirmDialog />
      </div>
    );
  }

  // ==================== INSIDE A POLE ====================
  const folders = explorerData?.folders || [];
  const documents = explorerData?.documents || [];
  const bons = explorerData?.bons_travail || [];
  const isEmpty = folders.length === 0 && documents.length === 0 && bons.length === 0;

  return (
    <div className="border rounded-lg bg-white" data-testid="explorer-view">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b bg-gray-50">
        <Button variant="ghost" size="sm" onClick={goBack} data-testid="explorer-back-btn">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-1 text-sm flex-1 overflow-x-auto">
          <button className="text-blue-600 hover:underline flex items-center gap-1"
            onClick={() => { setCurrentPoleId(null); setCurrentFolderId(null); setExplorerData(null); }}>
            <Home className="h-3.5 w-3.5" />
          </button>
          {breadcrumb.map((item, idx) => (
            <React.Fragment key={item.id}>
              <ChevronRight className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
              <button className={`hover:underline flex-shrink-0 ${idx === breadcrumb.length - 1 ? 'font-semibold text-gray-800' : 'text-blue-600'}`}
                onClick={() => goToBreadcrumb(item)}>{item.name}</button>
            </React.Fragment>
          ))}
        </div>
        {clipboard && (
          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded flex items-center gap-1">
            {clipboard.mode === 'copy' ? <Copy className="h-3 w-3" /> : <Scissors className="h-3 w-3" />}
            {clipboard.name}
            <button onClick={() => setClipboard(null)}><X className="h-3 w-3" /></button>
          </span>
        )}
        <Button variant="outline" size="sm" onClick={() => { setNewFolderName('Nouveau dossier'); setNewFolderDialog(true); }}
          data-testid="explorer-new-folder-btn">
          <FolderPlus className="h-4 w-4 mr-1" /> Nouveau dossier
        </Button>
        <Button variant="default" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}
          data-testid="explorer-upload-btn">
          <Upload className="h-4 w-4 mr-1" /> {uploading ? 'Import...' : 'Ajouter un fichier'}
        </Button>
        <input ref={fileInputRef} type="file" multiple className="hidden"
          onChange={(e) => handleFileUpload(e.target.files)} data-testid="explorer-file-input" />
      </div>

      {/* Content */}
      <div className={`p-4 min-h-[400px] transition-colors ${dragOverFiles ? 'bg-blue-50 ring-2 ring-blue-400 ring-dashed' : ''}`}
        onContextMenu={handleBgContextMenu}
        onClick={() => setSelectedItems([])}
        onDrop={handleFileDrop}
        onDragOver={handleFileDragOver}
        onDragLeave={handleFileDragLeave}
        data-explorer-bg="true">
        {dragOverFiles && (
          <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
            <div className="bg-blue-500/90 text-white rounded-xl px-8 py-6 shadow-xl flex flex-col items-center gap-2">
              <Upload className="h-10 w-10" />
              <span className="font-semibold text-lg">Déposez vos fichiers ici</span>
            </div>
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400"><p>Chargement...</p></div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400" data-explorer-bg="true">
            <Upload className="h-16 w-16 mb-4" /><p>Ce dossier est vide</p>
            <p className="text-sm mt-1">Glissez-déposez des fichiers ici ou utilisez les boutons ci-dessus</p>
            <div className="flex gap-2 mt-4">
              <Button variant="outline" size="sm"
                onClick={() => { setNewFolderName('Nouveau dossier'); setNewFolderDialog(true); }}>
                <FolderPlus className="h-4 w-4 mr-1" /> Nouveau dossier
              </Button>
              <Button size="sm" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4 mr-1" /> Ajouter un fichier
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
            {folders.map(folder => (
              <ExplorerItem key={folder.id} id={folder.id} name={folder.name} type="folder" color="#f59e0b"
                hiddenExternal={folder.hidden_for_external} hiddenUsers={folder.hidden_for_users}
                selected={selectedItems.includes(folder.id)}
                onClick={(e) => handleItemClick(e, folder.id)}
                onDoubleClick={() => handleDoubleClick(folder, 'folder')}
                onContextMenu={(e) => handleContextMenu(e, folder, 'folder')}
                draggable onDragStart={(e) => handleDragStart(e, folder, 'folder')}
                onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, folder.id)}
              />
            ))}
            {documents.map(doc => {
              const fi = getFileIcon(doc.fichier_type);
              return (
                <ExplorerItem key={doc.id} id={doc.id}
                  name={doc.fichier_nom || doc.titre || 'Document'} type="document"
                  iconComp={fi.icon} color={fi.color}
                  subtitle={doc.fichier_taille ? `${(doc.fichier_taille / 1024).toFixed(0)} KB` : ''}
                  hiddenExternal={doc.hidden_for_external} hiddenUsers={doc.hidden_for_users}
                  selected={selectedItems.includes(doc.id)}
                  onClick={(e) => handleItemClick(e, doc.id)}
                  onDoubleClick={() => handleDoubleClick(doc, 'document')}
                  onContextMenu={(e) => handleContextMenu(e, doc, 'document')}
                  draggable onDragStart={(e) => handleDragStart(e, doc, 'document')}
                />
              );
            })}
            {bons.map(bon => (
              <ExplorerItem key={bon.id} id={bon.id}
                name={bon.titre || bon.localisation_ligne || 'Bon de travail'} type="bon"
                iconComp={FileText} color="#3b82f6"
                subtitle={bon.created_at ? new Date(bon.created_at).toLocaleDateString() : ''}
                selected={selectedItems.includes(bon.id)}
                onClick={(e) => handleItemClick(e, bon.id)}
                onDoubleClick={() => handleDoubleClick(bon, 'bon')}
                onContextMenu={(e) => handleContextMenu(e, bon, 'bon')}
              />
            ))}
          </div>
        )}
      </div>

      {/* ==================== CONTEXT MENU ==================== */}
      {contextMenu && (
        <FullContextMenu
          {...contextMenu}
          clipboard={clipboard}
          poles={poles}
          currentPoleId={currentPoleId}
          currentUser={currentUser}
          formTemplates={formTemplates}
          onClose={() => setContextMenu(null)}
          onCopy={(item, type) => { handleCopy(item, type); setContextMenu(null); }}
          onCut={(item, type) => { handleCut(item, type); setContextMenu(null); }}
          onPaste={() => { handlePaste(); setContextMenu(null); }}
          onRename={(item, type) => {
            setRenameName(type === 'folder' ? item.name : (item.titre || item.fichier_nom || ''));
            setRenameDialog({ id: item.id, type }); setContextMenu(null);
          }}
          onDelete={(item, type) => { handleDelete(item, type); setContextMenu(null); }}
          onNewFolder={() => { setNewFolderName('Nouveau dossier'); setNewFolderDialog(true); setContextMenu(null); }}
          onOpen={(item, type) => { handleDoubleClick(item, type); setContextMenu(null); }}
          onDownload={(item) => { window.open(`${getBackendURL()}/api/documentations/documents/${item.id}/download?token=${localStorage.getItem('token')}`, '_blank'); setContextMenu(null); }}
          onPrint={(item, type) => { handlePrint(item, type); setContextMenu(null); }}
          onSendTo={(item, type) => { setSendToDialog({ item, type }); setContextMenu(null); }}
          onShareEmail={(item) => { handleShareEmail(item); setContextMenu(null); }}
          onShareFSAO={(item) => { handleShareEmail(item); setContextMenu(null); }}
          onToggleHiddenExternal={(item, type) => { handleTogglePermission(item, type, 'hidden_for_external'); setContextMenu(null); }}
          onToggleHiddenUsers={(item, type) => { handleTogglePermission(item, type, 'hidden_for_users'); setContextMenu(null); }}
          onInsertInto={(item) => { handleOpenInsertDialog(item); setContextMenu(null); }}
          onSort={(s) => { handleSort(s); setContextMenu(null); }}
          onNewFromTemplate={(tpl) => {
            // Router vers la bonne page selon le type de template
            if (tpl.type === 'BON_TRAVAIL') {
              // Nouveau : ouvre le dialog MAINT/FE/004 V2 (remplace l'ancien formulaire)
              setShowBonTravailDialog(true);
            } else if (tpl.type === 'AUTORISATION') {
              // Nouveau : ouvre le dialog MAINT/FE/003 V4 (remplace l'ancienne navigation)
              setShowAutorisationDialog(true);
            } else {
              // Template custom : ouvrir le CustomFormFiller
              setCustomFormTemplate(tpl);
            }
            setContextMenu(null);
          }}
        />
      )}

      {/* ==================== DIALOGS ==================== */}

      {/* Dialog Bon de Travail MAINT/FE/004 V2 */}
      <BonDeTravailPrintDialog
        open={showBonTravailDialog}
        onClose={() => { setShowBonTravailDialog(false); setEditBonData(null); }}
        poleId={currentPoleId}
        prefillData={editBonData}
        onSaved={() => { setShowBonTravailDialog(false); setEditBonData(null); if (currentPoleId) loadExplorerContents(currentPoleId, currentFolderId); }}
      />

      {/* Dialog Autorisation Particulière MAINT/FE/003 V4 */}
      <AutorisationParticulierePrintDialog
        open={showAutorisationDialog}
        onClose={() => setShowAutorisationDialog(false)}
        poleId={currentPoleId}
        onSaved={() => { setShowAutorisationDialog(false); if (currentPoleId) loadExplorerContents(currentPoleId, currentFolderId); }}
      />

      {/* New Folder Dialog */}
      <Dialog open={newFolderDialog} onOpenChange={setNewFolderDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Nouveau dossier</DialogTitle></DialogHeader>
          <div className="py-2">
            <Label>Nom du dossier</Label>
            <Input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()} autoFocus data-testid="new-folder-name-input" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewFolderDialog(false)}>Annuler</Button>
            <Button onClick={handleCreateFolder} data-testid="new-folder-confirm-btn">Créer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog open={!!renameDialog} onOpenChange={() => setRenameDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Renommer</DialogTitle></DialogHeader>
          <div className="py-2">
            <Label>Nouveau nom</Label>
            <Input value={renameName} onChange={(e) => setRenameName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRename()} autoFocus data-testid="rename-input" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialog(null)}>Annuler</Button>
            <Button onClick={handleRename} data-testid="rename-confirm-btn">Renommer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send To Dialog */}
      <Dialog open={!!sendToDialog} onOpenChange={() => setSendToDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Envoyer vers...</DialogTitle></DialogHeader>
          <div className="py-2 space-y-2 max-h-[300px] overflow-y-auto">
            {poles?.filter(p => p.id !== currentPoleId).map(pole => (
              <button key={pole.id} onClick={() => handleSendTo(sendToDialog?.item, pole.id)}
                className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 text-left transition-colors"
                data-testid={`send-to-pole-${pole.id}`}>
                <Folder className="h-5 w-5" style={{ color: pole.couleur || '#6b7280' }} />
                <span className="font-medium text-sm">{pole.nom}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Share by FSAO (Email) Dialog */}
      <Dialog open={!!shareEmailDialog} onOpenChange={() => setShareEmailDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Partager par FSAO</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Destinataire *</Label>
              <Input type="email" value={emailForm.recipient} placeholder="email@exemple.com"
                onChange={(e) => setEmailForm(prev => ({ ...prev, recipient: e.target.value }))}
                data-testid="share-email-recipient" />
            </div>
            <div>
              <Label>Titre</Label>
              <Input value={emailForm.subject}
                onChange={(e) => setEmailForm(prev => ({ ...prev, subject: e.target.value }))}
                data-testid="share-email-subject" />
            </div>
            <div>
              <Label>Message</Label>
              <Textarea rows={4} value={emailForm.message} placeholder="Votre message..."
                onChange={(e) => setEmailForm(prev => ({ ...prev, message: e.target.value }))}
                data-testid="share-email-message" />
            </div>
            <div className="bg-gray-50 p-3 rounded text-xs text-gray-500">
              <p className="font-medium mb-1">Signature :</p>
              <p>Cordialement,<br />{currentUser?.prenom} {currentUser?.nom}<br />FSAO Atlas</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShareEmailDialog(null)}>Annuler</Button>
            <Button onClick={handleShareEmailSubmit} disabled={!emailForm.recipient} data-testid="share-email-send-btn">
              <Mail className="h-4 w-4 mr-1" /> Envoyer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Insert Into Dialog */}
      <Dialog open={!!insertDialog} onOpenChange={() => setInsertDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Insérer dans...</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Type</Label>
              <Select value={insertTargetType} onValueChange={handleInsertTargetTypeChange}>
                <SelectTrigger data-testid="insert-type-select"><SelectValue placeholder="Sélectionner le type..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="work_order">Ordre de Travail (OT)</SelectItem>
                  <SelectItem value="improvement">Amélioration</SelectItem>
                  <SelectItem value="preventive_maintenance">Maintenance Préventive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {insertTargetType && (
              <div>
                <Label>Sélectionner</Label>
                {insertLoading ? <p className="text-sm text-gray-500 py-2">Chargement...</p> : (
                  <Select value={insertTargetId} onValueChange={setInsertTargetId}>
                    <SelectTrigger data-testid="insert-target-select"><SelectValue placeholder="Choisir..." /></SelectTrigger>
                    <SelectContent>
                      {insertTargets.map(t => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.numero ? `#${t.numero} - ` : ''}{t.titre || 'Sans titre'}
                        </SelectItem>
                      ))}
                      {insertTargets.length === 0 && <SelectItem value="_none" disabled>Aucun élément trouvé</SelectItem>}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInsertDialog(null)}>Annuler</Button>
            <Button onClick={handleInsertSubmit} disabled={!insertTargetId || !insertTargetType}
              data-testid="insert-confirm-btn">
              <Link2 className="h-4 w-4 mr-1" /> Insérer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Viewer Dialog */}
      <Dialog open={!!viewerDialog} onOpenChange={() => setViewerDialog(null)}>
        <DialogContent className="max-w-5xl h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="truncate">{viewerDialog?.fichier_nom || viewerDialog?.titre || 'Document'}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden rounded-lg border bg-gray-50">
            {viewerDialog && (
              viewerDialog.fichier_type?.includes('pdf') ? (
                <iframe src={`${getBackendURL()}/api/documentations/documents/${viewerDialog.id}/view?token=${localStorage.getItem('token')}`}
                  className="w-full h-full border-0" title="PDF" />
              ) : viewerDialog.fichier_type?.includes('image') ? (
                <div className="w-full h-full flex items-center justify-center p-4">
                  <img src={`${getBackendURL()}/api/documentations/documents/${viewerDialog.id}/view?token=${localStorage.getItem('token')}`}
                    alt={viewerDialog.fichier_nom} className="max-w-full max-h-full object-contain" />
                </div>
              ) : viewerDialog.fichier_type?.includes('text') ? (
                <iframe src={`${getBackendURL()}/api/documentations/documents/${viewerDialog.id}/view?token=${localStorage.getItem('token')}`}
                  className="w-full h-full border-0" title="Text" />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                  <File className="h-16 w-16 mb-4" />
                  <p>Prévisualisation non disponible pour ce type de fichier</p>
                  <Button variant="outline" className="mt-4" onClick={() => window.open(`${getBackendURL()}/api/documentations/documents/${viewerDialog.id}/view?token=${localStorage.getItem('token')}`, '_blank')}>
                    <Eye className="h-4 w-4 mr-1" /> Ouvrir dans un nouvel onglet
                  </Button>
                </div>
              )
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => window.open(`${getBackendURL()}/api/documentations/documents/${viewerDialog?.id}/download?token=${localStorage.getItem('token')}`, '_blank')}>
              <Download className="h-4 w-4 mr-1" /> Télécharger
            </Button>
            <Button onClick={() => setViewerDialog(null)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Custom Form Filler */}
      {customFormTemplate && (
        <CustomFormFiller
          open={!!customFormTemplate}
          onOpenChange={(open) => { if (!open) setCustomFormTemplate(null); }}
          template={customFormTemplate}
          poleId={currentPoleId}
          folderId={currentFolderId}
          onSaved={() => { setCustomFormTemplate(null); loadExplorerContents(currentPoleId, currentFolderId); }}
        />
      )}

      <ConfirmDialog />
    </div>
  );
}

// ==================== EXPLORER ITEM ====================
function ExplorerItem({
  id, name, type, color, subtitle, iconComp,
  hiddenExternal, hiddenUsers,
  selected, onClick, onDoubleClick, onContextMenu,
  draggable, onDragStart, onDragOver, onDrop
}) {
  const [dragOver, setDragOver] = useState(false);
  const IconComp = type === 'pole' || type === 'folder' ? Folder : (iconComp || File);

  return (
    <div
      className={`relative flex flex-col items-center p-3 rounded-lg cursor-pointer select-none transition-all
        ${selected ? 'bg-blue-100 ring-1 ring-blue-400' : 'hover:bg-gray-100'}
        ${dragOver ? 'bg-yellow-50 ring-2 ring-yellow-400' : ''}`}
      onClick={onClick} onDoubleClick={onDoubleClick} onContextMenu={onContextMenu}
      draggable={draggable} onDragStart={onDragStart}
      onDragOver={(e) => { if (type === 'folder') { setDragOver(true); onDragOver?.(e); } }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { setDragOver(false); onDrop?.(e); }}
      data-testid={`explorer-item-${id}`}
    >
      {/* Permission badges */}
      <div className="absolute top-1 right-1 flex gap-0.5">
        {hiddenExternal && (
          <span className="bg-orange-100 rounded p-0.5" title="Masqué aux services externes">
            <Lock className="h-3 w-3 text-orange-600" />
          </span>
        )}
        {hiddenUsers && (
          <span className="bg-purple-100 rounded p-0.5" title="Masqué aux utilisateurs">
            <UserX className="h-3 w-3 text-purple-600" />
          </span>
        )}
      </div>
      <IconComp className="h-12 w-12 mb-1 drop-shadow-sm"
        style={{ color: color || '#6b7280' }}
        fill={type === 'pole' || type === 'folder' ? (color || '#f59e0b') + '30' : 'none'}
        strokeWidth={1.5} />
      <span className="text-xs text-center font-medium text-gray-700 line-clamp-2 w-full leading-tight mt-0.5">{name}</span>
      {subtitle && <span className="text-[10px] text-gray-400 mt-0.5 text-center">{subtitle}</span>}
    </div>
  );
}

// ==================== FULL CONTEXT MENU ====================
function FullContextMenu({
  x, y, item, itemType, clipboard, poles, currentPoleId, currentUser, formTemplates,
  onClose, onCopy, onCut, onPaste, onRename, onDelete, onNewFolder,
  onOpen, onDownload, onPrint, onSendTo, onShareEmail, onShareFSAO,
  onToggleHiddenExternal, onToggleHiddenUsers, onInsertInto,
  onSort, onNewFromTemplate
}) {
  const menuRef = useRef(null);
  const [subMenu, setSubMenu] = useState(null); // 'sendTo' | 'newDoc' | 'sortBy'

  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      if (rect.right > window.innerWidth) menuRef.current.style.left = `${x - rect.width}px`;
      if (rect.bottom > window.innerHeight) menuRef.current.style.top = `${y - rect.height}px`;
    }
  }, [x, y]);

  const isAdmin = currentUser?.role === 'ADMIN';
  const canDelete = isAdmin || (item && item.created_by && currentUser && item.created_by === currentUser.id);

  const MenuItem = ({ icon: Icon, label, onClick: action, destructive, disabled, children }) => (
    <div className="relative">
      <button disabled={disabled}
        className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-sm transition-colors
          ${destructive ? 'text-red-600 hover:bg-red-50' : disabled ? 'text-gray-300 cursor-not-allowed' : 'text-gray-700 hover:bg-gray-100'}`}
        onClick={(e) => { e.stopPropagation(); action?.(); }}
        onMouseEnter={() => { if (children) setSubMenu(label); }}
      >
        {Icon && <Icon className="h-4 w-4 flex-shrink-0" />}
        <span className="flex-1 text-left">{label}</span>
        {children && <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
      </button>
      {children && subMenu === label && (
        <div className="absolute left-full top-0 bg-white border shadow-xl rounded-lg py-1 min-w-[180px] z-[60]"
          onClick={(e) => e.stopPropagation()}>
          {children}
        </div>
      )}
    </div>
  );

  const Separator = () => <div className="border-t my-1" />;

  return (
    <div ref={menuRef} className="fixed bg-white border shadow-xl rounded-lg py-1 z-50 min-w-[200px]"
      style={{ left: x, top: y }} onClick={(e) => e.stopPropagation()}>

      {itemType === 'background' ? (
        <>
          <MenuItem icon={FolderPlus} label="Nouveau dossier" onClick={onNewFolder} />
          <MenuItem icon={Plus} label="Nouveau..." children={
            <>
              {formTemplates?.map(tpl => (
                <button key={tpl.id} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
                  onClick={() => onNewFromTemplate(tpl)}>
                  <FileText className="h-4 w-4" />{tpl.nom}
                </button>
              ))}
              {(!formTemplates || formTemplates.length === 0) && (
                <span className="px-3 py-1.5 text-sm text-gray-400 block">Aucun modèle</span>
              )}
            </>
          } />
          <Separator />
          {clipboard && <MenuItem icon={ClipboardPaste} label="Coller" onClick={onPaste} />}
          <Separator />
          <MenuItem icon={ArrowUpDown} label="Trier par..." children={
            <>
              <button className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
                onClick={() => onSort('name')}>Nom</button>
              <button className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
                onClick={() => onSort('date')}>Date</button>
              <button className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
                onClick={() => onSort('type')}>Type</button>
            </>
          } />
        </>

      ) : itemType === 'pole' ? (
        <MenuItem icon={Folder} label="Ouvrir" onClick={() => onOpen(item, 'pole')} />

      ) : itemType === 'folder' ? (
        <>
          <MenuItem icon={Folder} label="Ouvrir" onClick={() => onOpen(item, 'folder')} />
          <Separator />
          <MenuItem icon={Copy} label="Copier" onClick={() => onCopy(item, 'folder')} />
          <MenuItem icon={Scissors} label="Couper" onClick={() => onCut(item, 'folder')} />
          {clipboard && <MenuItem icon={ClipboardPaste} label="Coller" onClick={onPaste} />}
          <Separator />
          <MenuItem icon={Send} label="Envoyer vers..." children={
            poles?.filter(p => p.id !== currentPoleId).map(pole => (
              <button key={pole.id} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
                onClick={() => onSendTo(item, 'folder')}>
                <Folder className="h-4 w-4" style={{ color: pole.couleur }} />{pole.nom}
              </button>
            ))
          } />
          <Separator />
          {isAdmin && (
            <>
              <MenuItem icon={Lock} label={item.hidden_for_external ? 'Visible aux Services Externes' : 'Masquer aux Services Externes'}
                onClick={() => onToggleHiddenExternal(item, 'folder')} />
              <MenuItem icon={UserX} label={item.hidden_for_users ? 'Visible aux Utilisateurs' : 'Masquer aux Utilisateurs'}
                onClick={() => onToggleHiddenUsers(item, 'folder')} />
              <Separator />
            </>
          )}
          <MenuItem icon={Edit} label="Renommer" onClick={() => onRename(item, 'folder')} />
          {canDelete && <MenuItem icon={Trash2} label="Supprimer" onClick={() => onDelete(item, 'folder')} destructive />}
        </>

      ) : itemType === 'document' ? (
        <>
          <MenuItem icon={Eye} label="Visualiser" onClick={() => onOpen(item, 'document')} />
          <MenuItem icon={Download} label="Télécharger" onClick={() => onDownload(item)} />
          <MenuItem icon={Printer} label="Imprimer" onClick={() => onPrint(item, 'document')} />
          <Separator />
          <MenuItem icon={Copy} label="Copier" onClick={() => onCopy(item, 'document')} />
          <MenuItem icon={Scissors} label="Couper" onClick={() => onCut(item, 'document')} />
          {clipboard && <MenuItem icon={ClipboardPaste} label="Coller" onClick={onPaste} />}
          <Separator />
          <MenuItem icon={Send} label="Envoyer vers..." children={
            poles?.filter(p => p.id !== currentPoleId).map(pole => (
              <button key={pole.id} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
                onClick={() => onSendTo(item, 'document')}>
                <Folder className="h-4 w-4" style={{ color: pole.couleur }} />{pole.nom}
              </button>
            ))
          } />
          <MenuItem icon={Mail} label="Partager par email" onClick={() => {
            const mailto = `mailto:?subject=Document: ${item.fichier_nom || item.titre || 'Document'}&body=Veuillez consulter le document "${item.fichier_nom || item.titre}"`;
            window.location.href = mailto;
            onClose();
          }} />
          <MenuItem icon={Send} label="Partager par FSAO" onClick={() => onShareFSAO(item)} />
          <Separator />
          {isAdmin && (
            <>
              <MenuItem icon={Lock} label={item.hidden_for_external ? 'Visible aux Services Ext.' : 'Masquer aux Services Ext.'}
                onClick={() => onToggleHiddenExternal(item, 'document')} />
              <MenuItem icon={UserX} label={item.hidden_for_users ? 'Visible aux Utilisateurs' : 'Masquer aux Utilisateurs'}
                onClick={() => onToggleHiddenUsers(item, 'document')} />
              <Separator />
            </>
          )}
          <MenuItem icon={Link2} label="Insérer dans..." onClick={() => onInsertInto(item)} />
          <Separator />
          <MenuItem icon={Edit} label="Renommer" onClick={() => onRename(item, 'document')} />
          {canDelete && <MenuItem icon={Trash2} label="Supprimer" onClick={() => onDelete(item, 'document')} destructive />}
        </>

      ) : itemType === 'bon' ? (
        <>
          <MenuItem icon={Eye} label="Voir / Modifier le bon" onClick={() => onOpen(item, 'bon')} />
          <MenuItem icon={Printer} label="Imprimer" onClick={() => onPrint(item, 'bon')} />
          <Separator />
          <MenuItem icon={Copy} label="Copier" onClick={() => onCopy(item, 'bon')} />
          <MenuItem icon={Scissors} label="Couper" onClick={() => onCut(item, 'bon')} />
          {clipboard && <MenuItem icon={ClipboardPaste} label="Coller" onClick={onPaste} />}
          <Separator />
          <MenuItem icon={Send} label="Envoyer vers..." children={
            poles?.filter(p => p.id !== currentPoleId).map(pole => (
              <button key={pole.id} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
                onClick={() => onSendTo(item, 'bon')}>
                <Folder className="h-4 w-4" style={{ color: pole.couleur }} />{pole.nom}
              </button>
            ))
          } />
          <MenuItem icon={Mail} label="Partager par email" onClick={() => {
            const mailto = `mailto:?subject=Bon de travail: ${item.titre || 'Bon de travail'}&body=Veuillez consulter le bon de travail "${item.titre || ''}"`;
            window.location.href = mailto;
            onClose();
          }} />
          <MenuItem icon={Send} label="Partager par FSAO" onClick={() => onShareFSAO(item)} />
          <Separator />
          {isAdmin && (
            <>
              <MenuItem icon={Lock} label={item.hidden_for_external ? 'Visible aux Services Ext.' : 'Masquer aux Services Ext.'}
                onClick={() => onToggleHiddenExternal(item, 'bon')} />
              <MenuItem icon={UserX} label={item.hidden_for_users ? 'Visible aux Utilisateurs' : 'Masquer aux Utilisateurs'}
                onClick={() => onToggleHiddenUsers(item, 'bon')} />
              <Separator />
            </>
          )}
          <MenuItem icon={Edit} label="Renommer" onClick={() => onRename(item, 'bon')} />
          {canDelete && <MenuItem icon={Trash2} label="Supprimer" onClick={() => onDelete(item, 'bon')} destructive />}
        </>
      ) : null}
    </div>
  );
}
