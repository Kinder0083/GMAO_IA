import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '../ui/dialog';
import { Badge } from '../ui/badge';
import { Separator } from '../ui/separator';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Calendar, Clock, User, MapPin, Wrench, FileText, MessageSquare, Send, Plus, Package, X, Pencil, Trash2, Check, Printer, Download } from 'lucide-react';
import AttachmentsList from './AttachmentsList';
import AttachmentUploader from './AttachmentUploader';
import StatusChangeDialog from './StatusChangeDialog';
import AIDiagnosticPanel from './AIDiagnosticPanel';
import AISummaryPanel from './AISummaryPanel';
import { commentsAPI, workOrdersAPI, inventoryAPI, equipmentsAPI } from '../../services/api';
import { useToast } from '../../hooks/use-toast';
import { usePermissions } from '../../hooks/usePermissions';
import { formatTimeToHoursMinutes } from '../../utils/timeFormat';
import jsPDF from 'jspdf';

const WorkOrderDialog = ({ open, onOpenChange, workOrder, onSuccess }) => {
  const { toast } = useToast();
  const { canEdit, isAdmin } = usePermissions();
  const [refreshAttachments, setRefreshAttachments] = useState(0);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [sendingComment, setSendingComment] = useState(false);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [timeInput, setTimeInput] = useState(''); // Nouveau champ unique pour le temps
  const [addingTime, setAddingTime] = useState(false);
  const [validating, setValidating] = useState(false);
  
  // États pour les pièces utilisées
  const [partsUsed, setPartsUsed] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [equipmentsList, setEquipmentsList] = useState([]);

  // États pour l'édition admin des temps et commentaires
  const [editingTimeId, setEditingTimeId] = useState(null);
  const [editingTimeValue, setEditingTimeValue] = useState('');
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editingCommentText, setEditingCommentText] = useState('');
  const [generatingPDF, setGeneratingPDF] = useState(false);

  // ==================== PDF / IMPRESSION ====================
  const buildPdfDocument = useCallback(async (forPrint = false) => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = 210;
    const pageH = 297;
    const margin = 15;
    const contentW = pageW - margin * 2;
    let y = margin;

    const addNewPageIfNeeded = (needed) => {
      if (y + needed > pageH - margin) {
        doc.addPage();
        y = margin;
        return true;
      }
      return false;
    };

    // --- En-tete ---
    try {
      const logoImg = new Image();
      logoImg.crossOrigin = 'anonymous';
      await new Promise((resolve, reject) => {
        logoImg.onload = resolve;
        logoImg.onerror = reject;
        logoImg.src = '/logo-iris.png';
      });
      doc.addImage(logoImg, 'PNG', margin, y, 20, 20);
    } catch {
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text('FSAO Iris', margin, y + 12);
    }
    doc.setFontSize(16);
    doc.setTextColor(30);
    doc.setFont(undefined, 'bold');
    doc.text(`OT-${workOrder.numero || '---'}`, margin + 24, y + 8);
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(120);
    const statusMap = { OUVERT: 'Ouvert', EN_COURS: 'En cours', ATT_MATERIEL: 'Att Materiel', ATT_DECISION: 'Att Decision', EN_ATTENTE: 'Att Materiel', TERMINE: 'Termine' };
    const prioMap = { HAUTE: 'Haute', MOYENNE: 'Moyenne', BASSE: 'Basse', AUCUNE: 'Normale' };
    doc.text(`Statut: ${statusMap[workOrder.statut] || workOrder.statut}  |  Priorite: ${prioMap[workOrder.priorite] || workOrder.priorite}`, margin + 24, y + 14);
    // Ligne horizontale
    y += 22;
    doc.setDrawColor(200);
    doc.line(margin, y, pageW - margin, y);
    y += 5;

    // --- Titre ---
    doc.setFontSize(13);
    doc.setTextColor(30);
    doc.setFont(undefined, 'bold');
    const titleLines = doc.splitTextToSize(workOrder.titre || 'Sans titre', contentW);
    doc.text(titleLines, margin, y);
    y += titleLines.length * 5.5 + 2;

    // --- Description ---
    if (workOrder.description) {
      doc.setFontSize(9);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(80);
      const descLines = doc.splitTextToSize(workOrder.description, contentW);
      const descToPrint = descLines.slice(0, 8);
      doc.text(descToPrint, margin, y);
      y += descToPrint.length * 4 + 3;
    }

    // --- Infos en grille ---
    doc.setFontSize(8.5);
    doc.setTextColor(100);
    doc.setFont(undefined, 'normal');
    const fmtDate = (d) => { try { return new Date(d).toLocaleDateString('fr-FR'); } catch { return d || '-'; } };
    const infos = [
      ['Cree le', fmtDate(workOrder.dateCreation) + (workOrder.createdByName ? ` par ${workOrder.createdByName}` : '')],
      ['Date limite', fmtDate(workOrder.dateLimite)],
      ['Temps estime', workOrder.tempsEstime ? `${workOrder.tempsEstime}h` : '-'],
      ['Emplacement', workOrder.emplacement?.nom || '-'],
      ['Equipement', workOrder.equipement?.nom || '-'],
    ];
    const colW = contentW / 2;
    infos.forEach((info, i) => {
      const col = i % 2;
      if (col === 0 && i > 0) y += 8;
      addNewPageIfNeeded(8);
      const xPos = margin + col * colW;
      doc.setFont(undefined, 'bold');
      doc.setTextColor(60);
      doc.text(info[0] + ' :', xPos, y);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(30);
      const valLines = doc.splitTextToSize(info[1], colW - 25);
      doc.text(valLines[0] || '-', xPos + 25, y);
    });
    y += 10;

    // --- Ligne separatrice ---
    doc.setDrawColor(220);
    doc.line(margin, y, pageW - margin, y);
    y += 5;

    // --- Rapport detaille (commentaires) ---
    if (comments.length > 0) {
      addNewPageIfNeeded(12);
      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(30);
      doc.text('Rapport Detaille', margin, y);
      y += 6;

      doc.setFontSize(8);
      comments.forEach((c) => {
        addNewPageIfNeeded(14);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(60);
        const header = `${c.user_name || 'Inconnu'} - ${fmtDate(c.timestamp)}`;
        doc.text(header, margin + 2, y);
        y += 4;
        doc.setFont(undefined, 'normal');
        doc.setTextColor(40);
        const cLines = doc.splitTextToSize(c.text || '', contentW - 4);
        const cToPrint = cLines.slice(0, 5);
        doc.text(cToPrint, margin + 2, y);
        y += cToPrint.length * 3.5 + 3;
      });
      y += 2;
    }

    // --- Pieces jointes (liste) ---
    let attachments = [];
    try {
      const res = await workOrdersAPI.getAttachments(workOrder.id);
      attachments = res.data || [];
    } catch { /* ignore */ }

    if (attachments.length > 0) {
      addNewPageIfNeeded(10);
      doc.setDrawColor(220);
      doc.line(margin, y, pageW - margin, y);
      y += 5;
      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(30);
      doc.text('Pieces jointes', margin, y);
      y += 5;
      doc.setFontSize(7.5);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(80);
      attachments.forEach((att) => {
        addNewPageIfNeeded(5);
        doc.text(`- ${att.filename || att.name || 'Fichier'}`, margin + 2, y);
        y += 3.5;
      });
      y += 3;
    }

    // --- Photos (remplissent le reste de la page, debordent si besoin) ---
    const imageAttachments = attachments.filter(a =>
      (a.mime_type || a.content_type || '').startsWith('image/')
    );
    if (imageAttachments.length > 0) {
      addNewPageIfNeeded(10);
      doc.setDrawColor(220);
      doc.line(margin, y, pageW - margin, y);
      y += 5;
      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(30);
      doc.text('Photos', margin, y);
      y += 6;

      // Calculer la disposition des photos
      const remainingH = pageH - margin - y;
      const cols = imageAttachments.length === 1 ? 1 : 2;
      const imgGap = 4;
      const imgW = cols === 1 ? contentW * 0.7 : (contentW - imgGap) / 2;

      for (let i = 0; i < imageAttachments.length; i++) {
        try {
          const att = imageAttachments[i];
          const imgResponse = await workOrdersAPI.downloadAttachment(workOrder.id, att.id);
          const blob = new Blob([imgResponse.data], { type: att.mime_type || 'image/jpeg' });
          const imgUrl = URL.createObjectURL(blob);

          const img = new Image();
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = imgUrl;
          });

          const ratio = img.naturalHeight / img.naturalWidth;
          const drawW = imgW;
          let drawH = drawW * ratio;
          // Limiter la hauteur max a la moitie de la page
          const maxH = (pageH - margin * 2) * 0.45;
          if (drawH > maxH) {
            drawH = maxH;
          }

          addNewPageIfNeeded(drawH + 4);

          const col = cols === 1 ? 0 : (i % 2);
          if (cols === 2 && col === 0 && i > 0) {
            // Pas de y bump, on est sur la meme ligne
          }
          const xPos = cols === 1
            ? margin + (contentW - drawW) / 2
            : margin + col * (imgW + imgGap);

          doc.addImage(img, 'JPEG', xPos, y, drawW, drawH);

          if (cols === 1 || col === 1) {
            y += drawH + imgGap;
          }

          URL.revokeObjectURL(imgUrl);
        } catch (e) {
          console.error('Erreur chargement image PDF:', e);
        }
      }
    }

    // --- Pied de page ---
    const totalPages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFontSize(7);
      doc.setTextColor(160);
      doc.text(`FSAO Iris - OT-${workOrder.numero || '---'} - Page ${p}/${totalPages}`, pageW / 2, pageH - 8, { align: 'center' });
    }

    return doc;
  }, [workOrder, comments]);

  const handleExportPDF = async () => {
    setGeneratingPDF(true);
    try {
      const doc = await buildPdfDocument();
      doc.save(`OT-${workOrder.numero || 'export'}.pdf`);
      toast({ title: 'PDF exporte', description: `OT-${workOrder.numero || ''}.pdf telecharge` });
    } catch (e) {
      console.error('Erreur export PDF:', e);
      toast({ title: 'Erreur', description: 'Impossible de generer le PDF', variant: 'destructive' });
    } finally {
      setGeneratingPDF(false);
    }
  };

  const handlePrint = async () => {
    setGeneratingPDF(true);
    try {
      const doc = await buildPdfDocument(true);
      const pdfBlob = doc.output('blob');
      const url = URL.createObjectURL(pdfBlob);
      const printWindow = window.open(url, '_blank');
      if (printWindow) {
        printWindow.addEventListener('load', () => {
          setTimeout(() => {
            printWindow.print();
          }, 500);
        });
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      console.error('Erreur impression:', e);
      toast({ title: 'Erreur', description: 'Impossible de lancer l\'impression', variant: 'destructive' });
    } finally {
      setGeneratingPDF(false);
    }
  };

  // Fonction pour parser le temps saisi dans différents formats
  const parseTimeInput = (input) => {
    if (!input || input.trim() === '') return null;
    
    const trimmed = input.trim();
    
    // Format décimal: 1.5 ou 1,5 -> 1h30
    if (/^[\d]+[.,][\d]+$/.test(trimmed)) {
      const decimal = parseFloat(trimmed.replace(',', '.'));
      const hours = Math.floor(decimal);
      const minutes = Math.round((decimal - hours) * 60);
      return { hours, minutes };
    }
    
    // Format HH:MM ou H:MM: 01:30 ou 1:30
    if (/^[\d]{1,2}:[\d]{1,2}$/.test(trimmed)) {
      const [hours, minutes] = trimmed.split(':').map(Number);
      if (minutes >= 0 && minutes < 60) {
        return { hours, minutes };
      }
    }
    
    // Format XhYY ou XhY: 1h30 ou 1h5
    if (/^[\d]{1,3}h[\d]{0,2}$/i.test(trimmed)) {
      const match = trimmed.match(/^([\d]{1,3})h([\d]{0,2})$/i);
      if (match) {
        const hours = parseInt(match[1]) || 0;
        const minutes = match[2] ? parseInt(match[2]) : 0;
        if (minutes >= 0 && minutes < 60) {
          return { hours, minutes };
        }
      }
    }
    
    // Format heures seules: 2 -> 2h00
    if (/^[\d]+$/.test(trimmed)) {
      const hours = parseInt(trimmed);
      return { hours, minutes: 0 };
    }
    
    return null;
  };

  const loadComments = async () => {
    if (!workOrder) return;
    try {
      setLoadingComments(true);
      const response = await commentsAPI.getWorkOrderComments(workOrder.id);
      setComments(response.comments || []);
    } catch (error) {
      console.error('Erreur lors du chargement des commentaires:', error);
    } finally {
      setLoadingComments(false);
    }
  };

  const handleSendComment = async () => {
    if (!newComment.trim() || !workOrder) return;
    
    try {
      setSendingComment(true);
      
      // Filtrer pour ne garder que les pièces valides
      const validParts = partsUsed.filter(part => 
        part.inventory_item_id || (part.custom_part_name && part.custom_part_name.trim() !== '')
      );
      
      const cleanedParts = validParts.map(part => {
        const cleanPart = {
          inventory_item_id: part.inventory_item_id || null,
          inventory_item_name: part.inventory_item_name || null,
          custom_part_name: part.custom_part_name || null,
          quantity: part.quantity || 0
        };
        
        // N'ajouter les champs "Prélevé Sur" que s'ils sont remplis
        if (part.source_equipment_id || (part.custom_source && part.custom_source.trim() !== '')) {
          cleanPart.source_equipment_id = part.source_equipment_id || null;
          cleanPart.source_equipment_name = part.source_equipment_name || null;
          cleanPart.custom_source = part.custom_source || null;
        }
        
        return cleanPart;
      });
      
      // Envoyer commentaire avec les pièces utilisées valides
      await commentsAPI.addWorkOrderComment(workOrder.id, {
        text: newComment,
        parts_used: cleanedParts
      });
      setNewComment('');
      setPartsUsed([]); // Réinitialiser les pièces
      await loadComments();
      
      toast({
        title: 'Succès',
        description: 'Commentaire ajouté avec succès'
      });
    } catch (error) {
      console.error('Erreur lors de l\'ajout du commentaire:', error);
      toast({
        title: 'Erreur',
        description: 'Erreur lors de l\'ajout du commentaire',
        variant: 'destructive'
      });
    } finally {
      setSendingComment(false);
    }
  };

  const addPartUsed = () => {
    setPartsUsed([...partsUsed, {
      id: Date.now().toString(),
      inventory_item_id: null,
      inventory_item_name: null,
      custom_part_name: '',
      quantity: 1,
      source_equipment_id: null,
      source_equipment_name: null,
      custom_source: ''
    }]);
  };

  const removePartUsed = (id) => {
    setPartsUsed(partsUsed.filter(p => p.id !== id));
  };

  const updatePartUsed = (id, field, value) => {
    setPartsUsed(partsUsed.map(part => 
      part.id === id ? { ...part, [field]: value } : part
    ));
  };

  // === Fonctions Admin : édition/suppression des temps ===
  const handleEditTimeEntry = (entry) => {
    setEditingTimeId(entry.id);
    // Convertir les heures décimales en format lisible
    const h = Math.floor(entry.hours);
    const m = Math.round((entry.hours - h) * 60);
    setEditingTimeValue(`${h}h${m.toString().padStart(2, '0')}`);
  };

  const handleSaveTimeEntry = async () => {
    const parsed = parseTimeInput(editingTimeValue);
    if (!parsed || (parsed.hours === 0 && parsed.minutes === 0)) {
      toast({ title: 'Erreur', description: 'Temps invalide', variant: 'destructive' });
      return;
    }
    try {
      const newHours = parsed.hours + parsed.minutes / 60;
      await workOrdersAPI.updateTimeEntry(workOrder.id, editingTimeId, newHours);
      toast({ title: 'Succès', description: 'Temps modifié' });
      setEditingTimeId(null);
      if (onSuccess) onSuccess();
    } catch (error) {
      toast({ title: 'Erreur', description: 'Impossible de modifier le temps', variant: 'destructive' });
    }
  };

  const handleDeleteTimeEntry = async (entryId) => {
    if (!window.confirm('Supprimer cette entrée de temps ?')) return;
    try {
      await workOrdersAPI.deleteTimeEntry(workOrder.id, entryId);
      toast({ title: 'Succès', description: 'Entrée de temps supprimée' });
      if (onSuccess) onSuccess();
    } catch (error) {
      toast({ title: 'Erreur', description: 'Impossible de supprimer', variant: 'destructive' });
    }
  };

  // === Fonctions Admin : édition/suppression des commentaires ===
  const handleEditComment = (comment) => {
    setEditingCommentId(comment.id);
    setEditingCommentText(comment.text);
  };

  const handleSaveComment = async () => {
    if (!editingCommentText.trim()) {
      toast({ title: 'Erreur', description: 'Le commentaire ne peut pas être vide', variant: 'destructive' });
      return;
    }
    try {
      await commentsAPI.updateComment(workOrder.id, editingCommentId, editingCommentText);
      toast({ title: 'Succès', description: 'Commentaire modifié' });
      setEditingCommentId(null);
      await loadComments();
    } catch (error) {
      toast({ title: 'Erreur', description: 'Impossible de modifier le commentaire', variant: 'destructive' });
    }
  };

  const handleDeleteComment = async (commentId) => {
    if (!window.confirm('Supprimer ce commentaire ?')) return;
    try {
      await commentsAPI.deleteComment(workOrder.id, commentId);
      toast({ title: 'Succès', description: 'Commentaire supprimé' });
      await loadComments();
    } catch (error) {
      toast({ title: 'Erreur', description: 'Impossible de supprimer le commentaire', variant: 'destructive' });
    }
  };

  const handleAddTime = async () => {
    const parsed = parseTimeInput(timeInput);

    if (!parsed || (parsed.hours === 0 && parsed.minutes === 0)) {
      toast({
        title: 'Erreur',
        description: 'Veuillez saisir un temps valide (ex: 1:30, 1h30, 1.5)',
        variant: 'destructive'
      });
      return false;
    }

    try {
      setAddingTime(true);
      await workOrdersAPI.addTimeSpent(workOrder.id, parsed.hours, parsed.minutes);
      
      toast({
        title: 'Temps ajouté',
        description: `${parsed.hours}h${parsed.minutes.toString().padStart(2, '0')}min ajouté avec succès`
      });

      setTimeInput('');
      return true;
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Impossible d\'ajouter le temps',
        variant: 'destructive'
      });
      return false;
    } finally {
      setAddingTime(false);
    }
  };

  // Nouvelle fonction pour valider commentaire + temps + ouvrir dialogue statut
  const handleValidate = async () => {
    // Vérifier que le commentaire est rempli
    if (!newComment.trim()) {
      toast({
        title: 'Commentaire requis',
        description: 'Veuillez saisir un commentaire avant de valider',
        variant: 'destructive'
      });
      return;
    }

    // Vérifier que le temps est rempli et valide
    const parsed = parseTimeInput(timeInput);
    if (!parsed || (parsed.hours === 0 && parsed.minutes === 0)) {
      toast({
        title: 'Temps requis',
        description: 'Veuillez saisir un temps valide (ex: 1:30, 1h30, 1.5)',
        variant: 'destructive'
      });
      return;
    }

    try {
      setValidating(true);

      // 1. Enregistrer le commentaire (avec les pièces si présentes)
      const validParts = partsUsed.filter(part => 
        part.inventory_item_id || (part.custom_part_name && part.custom_part_name.trim() !== '')
      );
      
      const cleanedParts = validParts.map(part => {
        const cleanPart = {
          inventory_item_id: part.inventory_item_id || null,
          inventory_item_name: part.inventory_item_name || null,
          custom_part_name: part.custom_part_name || null,
          quantity: part.quantity || 0
        };
        
        if (part.source_equipment_id || (part.custom_source && part.custom_source.trim() !== '')) {
          cleanPart.source_equipment_id = part.source_equipment_id || null;
          cleanPart.source_equipment_name = part.source_equipment_name || null;
          cleanPart.custom_source = part.custom_source || null;
        }
        
        return cleanPart;
      });

      await commentsAPI.addWorkOrderComment(workOrder.id, {
        text: newComment,
        parts_used: cleanedParts
      });

      // 2. Enregistrer le temps passé
      await workOrdersAPI.addTimeSpent(workOrder.id, parsed.hours, parsed.minutes);

      // 3. Rafraîchir les données
      if (onSuccess) onSuccess();

      // 4. Réinitialiser les champs
      setNewComment('');
      setTimeInput('');
      setPartsUsed([]);

      toast({
        title: 'Validation réussie',
        description: `Commentaire et temps (${parsed.hours}h${parsed.minutes.toString().padStart(2, '0')}) enregistrés`
      });

      // 5. Ouvrir le dialogue de changement de statut (toujours, même en lecture seule)
      setShowStatusDialog(true);

    } catch (error) {
      console.error('Erreur lors de la validation:', error);
      toast({
        title: 'Erreur',
        description: 'Erreur lors de la validation',
        variant: 'destructive'
      });
    } finally {
      setValidating(false);
    }
  };

  // Fonction pour annuler et fermer la fenêtre
  const handleCancel = () => {
    setNewComment('');
    setTimeInput('');
    setPartsUsed([]);
    onOpenChange(false);
  };

  const handleUploadComplete = () => {
    setRefreshAttachments(prev => prev + 1);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const formatter = new Intl.DateTimeFormat('fr-FR', {
      timeZone: 'Europe/Paris',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    return formatter.format(date);
  };

  const formatCreationDate = (dateString) => {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);
    return `${day}/${month}/${year}`;
  };

  const loadInventoryAndEquipments = async () => {
    try {
      const [inventoryResponse, equipmentsResponse] = await Promise.all([
        inventoryAPI.getAll(),
        equipmentsAPI.getAll()
      ]);
      setInventoryItems(inventoryResponse.data || []);
      setEquipmentsList(equipmentsResponse.data || []);
    } catch (error) {
      console.error('Erreur lors du chargement des données:', error);
    }
  };

  useEffect(() => {
    if (open && workOrder) {
      loadComments();
      loadInventoryAndEquipments();
      setIsClosing(false);
    }
  }, [open, workOrder]);

  const handleDialogClose = (isOpen) => {
    if (!isOpen && !isClosing) {
      // L'utilisateur veut fermer le dialog, montrer le dialog de changement de statut
      setShowStatusDialog(true);
      setIsClosing(true);
    }
  };

  const handleStatusChange = async (newStatus, hours = 0, minutes = 0, extraData = {}) => {
    try {
      // Soumettre les pièces utilisées si présentes (AVANT le changement de statut)
      if (partsUsed.length > 0) {
        // Filtrer pour ne garder que les pièces qui ont une sélection ou un nom personnalisé
        const validParts = partsUsed.filter(part => 
          part.inventory_item_id || (part.custom_part_name && part.custom_part_name.trim() !== '')
        );
        
        if (validParts.length > 0) {
          // Nettoyer les données avant envoi
          const cleanedParts = validParts.map(part => {
            const cleanPart = {
              inventory_item_id: part.inventory_item_id || null,
              inventory_item_name: part.inventory_item_name || null,
              custom_part_name: part.custom_part_name || null,
              quantity: part.quantity || 0
            };
            
            // N'ajouter les champs "Prélevé Sur" que s'ils sont remplis
            if (part.source_equipment_id || (part.custom_source && part.custom_source.trim() !== '')) {
              cleanPart.source_equipment_id = part.source_equipment_id || null;
              cleanPart.source_equipment_name = part.source_equipment_name || null;
              cleanPart.custom_source = part.custom_source || null;
            }
            
            return cleanPart;
          });
          
          console.log('Envoi des pièces:', cleanedParts); // Debug
          
          // Enregistrer les pièces SANS créer de commentaire
          await workOrdersAPI.addWorkOrderParts(workOrder.id, cleanedParts);
          
          // Déclencher l'événement pour mettre à jour le badge inventaire dans le header
          window.dispatchEvent(new Event('inventoryItemUpdated'));
          
          toast({
            title: 'Pièces enregistrées',
            description: `${cleanedParts.length} pièce(s) utilisée(s) enregistrée(s)`
          });
        }
        setPartsUsed([]); // Réinitialiser
      }

      // Ajouter le temps si renseigné
      if (hours > 0 || minutes > 0) {
        await workOrdersAPI.addTimeSpent(workOrder.id, hours, minutes);
      }

      // Mettre à jour le statut + infos extra (att_materiel_info, att_decision_info)
      const updateData = { statut: newStatus, ...extraData };
      await workOrdersAPI.update(workOrder.id, updateData);
      
      toast({
        title: 'Succès',
        description: 'Le statut a été mis à jour'
      });
      setShowStatusDialog(false);
      if (onSuccess) onSuccess();
      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Impossible de mettre à jour le statut',
        variant: 'destructive'
      });
    }
  };

  const handleSkipStatusChange = async () => {
    try {
      // Soumettre les pièces utilisées si présentes (même si on skip le changement de statut)
      if (partsUsed.length > 0) {
        // Filtrer pour ne garder que les pièces valides
        const validParts = partsUsed.filter(part => 
          part.inventory_item_id || (part.custom_part_name && part.custom_part_name.trim() !== '')
        );
        
        if (validParts.length > 0) {
          const cleanedParts = validParts.map(part => {
            const cleanPart = {
              inventory_item_id: part.inventory_item_id || null,
              inventory_item_name: part.inventory_item_name || null,
              custom_part_name: part.custom_part_name || null,
              quantity: part.quantity || 0
            };
            
            // N'ajouter les champs "Prélevé Sur" que s'ils sont remplis
            if (part.source_equipment_id || (part.custom_source && part.custom_source.trim() !== '')) {
              cleanPart.source_equipment_id = part.source_equipment_id || null;
              cleanPart.source_equipment_name = part.source_equipment_name || null;
              cleanPart.custom_source = part.custom_source || null;
            }
            
            return cleanPart;
          });
          
          // Enregistrer les pièces SANS créer de commentaire
          await workOrdersAPI.addWorkOrderParts(workOrder.id, cleanedParts);
          toast({
            title: 'Pièces enregistrées',
            description: `${cleanedParts.length} pièce(s) utilisée(s) enregistrée(s)`
          });
          if (onSuccess) onSuccess(); // Rafraîchir les données
        }
        setPartsUsed([]); // Réinitialiser
      }
      
      setShowStatusDialog(false);
      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Impossible d\'enregistrer les pièces',
        variant: 'destructive'
      });
    }
  };

  if (!workOrder) return null;

  const getStatusBadge = (statut) => {
    const badges = {
      'OUVERT': { variant: 'secondary', label: 'Ouvert' },
      'EN_COURS': { variant: 'default', label: 'En cours' },
      'EN_ATTENTE': { variant: 'outline', label: 'Att Materiel' },
    'ATT_MATERIEL': { variant: 'outline', label: 'Att Materiel' },
    'ATT_DECISION': { variant: 'outline', label: 'Att Decision' },
      'TERMINE': { variant: 'success', label: 'Terminé' }
    };
    const badge = badges[statut] || badges['OUVERT'];
    return <Badge variant={badge.variant}>{badge.label}</Badge>;
  };

  const getPriorityBadge = (priorite) => {
    const badges = {
      'HAUTE': { variant: 'destructive', label: 'Haute' },
      'MOYENNE': { variant: 'default', label: 'Moyenne' },
      'BASSE': { variant: 'secondary', label: 'Basse' },
      'AUCUNE': { variant: 'outline', label: 'Normale' }
    };
    const badge = badges[priorite] || badges['AUCUNE'];
    return <Badge variant={badge.variant}>{badge.label}</Badge>;
  };

  const getCategoryLabel = (categorie) => {
    const labels = {
      'CHANGEMENT_FORMAT': 'Changement de Format',
      'TRAVAUX_PREVENTIFS': 'Travaux Préventifs',
      'TRAVAUX_CURATIF': 'Travaux Curatif',
      'TRAVAUX_DIVERS': 'Travaux Divers',
      'FORMATION': 'Formation',
      'REGLAGE': 'Réglage'
    };
    return labels[categorie] || categorie;
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleDialogClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-2xl">{workOrder.titre}</DialogTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportPDF}
                disabled={generatingPDF}
                data-testid="wo-export-pdf-btn"
                className="h-8 text-xs gap-1.5"
              >
                <Download size={14} />
                Export PDF
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handlePrint}
                disabled={generatingPDF}
                data-testid="wo-print-btn"
                className="h-8 w-8 p-0"
                title="Imprimer"
              >
                <Printer size={16} />
              </Button>
              {getStatusBadge(workOrder.statut)}
              {getPriorityBadge(workOrder.priorite)}
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Catégorie */}
          {workOrder.categorie && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <Badge variant="default" className="bg-blue-600">
                  {getCategoryLabel(workOrder.categorie)}
                </Badge>
              </div>
            </div>
          )}

          {/* Description */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <FileText size={18} className="text-gray-600" />
              <h3 className="font-semibold text-gray-900">Description</h3>
            </div>
            <p className="text-gray-700 bg-gray-50 p-3 rounded-lg">{workOrder.description}</p>
          </div>

          {/* IA Panels */}
          <div className="flex flex-wrap gap-2">
            <AIDiagnosticPanel workOrderId={workOrder.id} />
            <AISummaryPanel workOrderId={workOrder.id} />
          </div>

          <Separator />

          {/* Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Créé le */}
            <div className="flex items-start gap-3 md:col-span-2">
              <Calendar size={18} className="text-blue-600 mt-1" />
              <div>
                <p className="text-sm text-gray-600">Créé le</p>
                <p className="font-medium text-gray-900">
                  {formatCreationDate(workOrder.dateCreation)} par {workOrder.createdByName || 'Utilisateur inconnu'}
                </p>
              </div>
            </div>

            {/* Date limite */}
            <div className="flex items-start gap-3">
              <Calendar size={18} className="text-red-600 mt-1" />
              <div>
                <p className="text-sm text-gray-600">Date limite</p>
                <p className="font-medium text-gray-900">{workOrder.dateLimite}</p>
              </div>
            </div>

            {/* Temps estimé */}
            <div className="flex items-start gap-3">
              <Clock size={18} className="text-green-600 mt-1" />
              <div>
                <p className="text-sm text-gray-600">Temps estimé</p>
                <p className="font-medium text-gray-900">{workOrder.tempsEstime}h</p>
              </div>
            </div>

            {/* Temps réel */}
            <div className="flex items-start gap-3">
              <Clock size={18} className="text-orange-600 mt-1" />
              <div>
                <p className="text-sm text-gray-600">Temps réel</p>
                <p className="font-medium text-gray-900">
                  {workOrder.tempsReel ? formatTimeToHoursMinutes(workOrder.tempsReel) : 'Non démarré'}
                </p>
              </div>
            </div>

            {/* Assigner à */}
            {workOrder.assigneA && (
              <div className="flex items-start gap-3">
                <User size={18} className="text-purple-600 mt-1" />
                <div>
                  <p className="text-sm text-gray-600">Assigner à</p>
                  <p className="font-medium text-gray-900">
                    {workOrder.assigneA.prenom} {workOrder.assigneA.nom}
                  </p>
                  <p className="text-xs text-gray-500">{workOrder.assigneA.email}</p>
                </div>
              </div>
            )}

            {/* Emplacement */}
            {workOrder.emplacement && (
              <div className="flex items-start gap-3">
                <MapPin size={18} className="text-indigo-600 mt-1" />
                <div>
                  <p className="text-sm text-gray-600">Emplacement</p>
                  <p className="font-medium text-gray-900">{workOrder.emplacement.nom}</p>
                </div>
              </div>
            )}

            {/* Équipement */}
            {workOrder.equipement && (
              <div className="flex items-start gap-3 md:col-span-2">
                <Wrench size={18} className="text-amber-600 mt-1" />
                <div>
                  <p className="text-sm text-gray-600">Équipement</p>
                  <p className="font-medium text-gray-900">{workOrder.equipement.nom}</p>
                </div>
              </div>
            )}
          </div>

          {/* Rapport Détaillé */}
          <Separator className="my-6" />
          <div>
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare size={20} className="text-gray-600" />
              <h3 className="text-lg font-semibold text-gray-900">Rapport Détaillé</h3>
            </div>
            
            {/* Liste des commentaires */}
            <div className="bg-gray-50 rounded-lg p-4 mb-4 max-h-64 overflow-y-auto space-y-3">
              {loadingComments ? (
                <p className="text-center text-gray-500">Chargement...</p>
              ) : comments.length === 0 ? (
                <p className="text-center text-gray-500 py-4">Aucun commentaire pour le moment</p>
              ) : (
                comments.map((comment) => (
                  <div key={comment.id} className="bg-white rounded-lg p-3 shadow-sm">
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-semibold text-sm text-gray-900">{comment.user_name}</span>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-gray-500">{formatDate(comment.timestamp)}</span>
                        {isAdmin() && (
                          <>
                            <button
                              data-testid={`edit-comment-${comment.id}`}
                              onClick={() => handleEditComment(comment)}
                              className="p-1 text-gray-400 hover:text-blue-600 rounded"
                              title="Modifier"
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              data-testid={`delete-comment-${comment.id}`}
                              onClick={() => handleDeleteComment(comment.id)}
                              className="p-1 text-gray-400 hover:text-red-600 rounded"
                              title="Supprimer"
                            >
                              <Trash2 size={13} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    {editingCommentId === comment.id ? (
                      <div className="flex gap-2 items-end">
                        <Textarea
                          data-testid={`edit-comment-textarea-${comment.id}`}
                          value={editingCommentText}
                          onChange={(e) => setEditingCommentText(e.target.value)}
                          rows={2}
                          className="flex-1 text-sm resize-none"
                        />
                        <div className="flex flex-col gap-1">
                          <button
                            data-testid={`save-comment-${comment.id}`}
                            onClick={handleSaveComment}
                            className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                            title="Enregistrer"
                          >
                            <Check size={14} />
                          </button>
                          <button
                            onClick={() => setEditingCommentId(null)}
                            className="p-1.5 text-gray-400 hover:bg-gray-100 rounded"
                            title="Annuler"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-gray-700 text-sm whitespace-pre-wrap">{comment.text}</p>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Zone de saisie du commentaire */}
            <div className="space-y-2">
              <Label>Commentaire *</Label>
              <Textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Décrivez l'intervention réalisée..."
                className="resize-none"
                rows={3}
              />
            </div>
          </div>

          {/* Pièces utilisées - Formulaire d'ajout */}
          <Separator className="my-6" />
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Package size={20} className="text-gray-600" />
                <h3 className="text-lg font-semibold text-gray-900">Ajouter des Pièces</h3>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={addPartUsed}
                className="text-sm"
              >
                <Plus size={16} className="mr-1" />
                Ajouter une pièce
              </Button>
            </div>

            {/* Historique des pièces utilisées */}
            {workOrder.parts_used && workOrder.parts_used.length > 0 && (
              <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <h4 className="text-xs font-semibold text-blue-900 mb-2">Historique des pièces utilisées</h4>
                <div className="space-y-1">
                  {workOrder.parts_used.map((part, index) => (
                    <div key={part.id || index} className="text-xs text-gray-700">
                      <span className="font-bold">{part.quantity}</span> {part.inventory_item_name || part.custom_part_name} - {part.timestamp ? formatDate(part.timestamp) : 'Date inconnue'}{part.user_name && ` par ${part.user_name}`}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {partsUsed.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4 bg-gray-50 rounded-lg">
                Aucune pièce ajoutée. Cliquez sur &quot;Ajouter une pièce&quot; pour commencer.
              </p>
            ) : (
              <div className="space-y-3">
                {partsUsed.map((part) => (
                  <div key={part.id} className="border rounded-lg p-4 bg-gray-50 relative">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removePartUsed(part.id)}
                      className="absolute top-2 right-2 h-6 w-6 p-0 hover:bg-red-100"
                    >
                      <X size={14} />
                    </Button>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Pièce */}
                      <div className="space-y-2">
                        <Label>Pièce *</Label>
                        <Select
                          value={part.inventory_item_id || 'custom'}
                          onValueChange={(value) => {
                            if (value === 'custom') {
                              // Texte libre : réinitialiser les champs inventaire
                              setPartsUsed(partsUsed.map(p => 
                                p.id === part.id 
                                  ? { ...p, inventory_item_id: null, inventory_item_name: null } 
                                  : p
                              ));
                            } else {
                              // Pièce d'inventaire : mettre à jour tous les champs en une fois
                              const item = inventoryItems.find(i => i.id === value);
                              setPartsUsed(partsUsed.map(p => 
                                p.id === part.id 
                                  ? { 
                                      ...p, 
                                      inventory_item_id: value,
                                      inventory_item_name: item?.nom || '',
                                      custom_part_name: ''
                                    } 
                                  : p
                              ));
                            }
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Sélectionner une pièce" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="custom">Texte libre (pièce externe)</SelectItem>
                            {inventoryItems.map(item => (
                              <SelectItem key={item.id} value={item.id}>
                                {item.nom} ({item.reference})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        
                        {!part.inventory_item_id && (
                          <Input
                            placeholder="Nom de la pièce externe"
                            value={part.custom_part_name}
                            onChange={(e) => updatePartUsed(part.id, 'custom_part_name', e.target.value)}
                            className="mt-2"
                          />
                        )}
                      </div>

                      {/* Quantité */}
                      <div className="space-y-2">
                        <Label>Quantité utilisée *</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.1"
                          value={part.quantity}
                          onChange={(e) => updatePartUsed(part.id, 'quantity', parseFloat(e.target.value) || 0)}
                        />
                      </div>

                      {/* Prélevée Sur */}
                      <div className="space-y-2 md:col-span-2">
                        <Label>Prélevée Sur</Label>
                        <Select
                          value={part.source_equipment_id || 'custom'}
                          onValueChange={(value) => {
                            if (value === 'custom') {
                              // Texte libre
                              setPartsUsed(partsUsed.map(p => 
                                p.id === part.id 
                                  ? { ...p, source_equipment_id: null, source_equipment_name: null } 
                                  : p
                              ));
                            } else {
                              // Équipement sélectionné
                              const equip = equipmentsList.find(e => e.id === value);
                              setPartsUsed(partsUsed.map(p => 
                                p.id === part.id 
                                  ? { 
                                      ...p, 
                                      source_equipment_id: value,
                                      source_equipment_name: equip?.nom || '',
                                      custom_source: ''
                                    } 
                                  : p
                              ));
                            }
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Sélectionner un équipement" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="custom">Texte libre (équipement non enregistré)</SelectItem>
                            {equipmentsList.map(equip => (
                              <SelectItem key={equip.id} value={equip.id}>
                                {equip.nom}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {!part.source_equipment_id && (
                          <Input
                            placeholder="Source personnalisée"
                            value={part.custom_source}
                            onChange={(e) => updatePartUsed(part.id, 'custom_source', e.target.value)}
                            className="mt-2"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Temps Passé */}
          <Separator className="my-6" />
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Clock size={20} className="text-gray-600" />
              <h3 className="text-lg font-semibold text-gray-900">Temps Passé</h3>
            </div>

            {/* Historique des temps pointés */}
            {workOrder.time_entries && workOrder.time_entries.length > 0 && (
              <div className="bg-orange-50 rounded-lg p-3 mb-4 border border-orange-200 space-y-2" data-testid="time-entries-list">
                <h4 className="text-xs font-semibold text-orange-900 mb-1">Historique des temps</h4>
                {workOrder.time_entries.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between text-sm bg-white rounded px-3 py-1.5 shadow-sm">
                    {editingTimeId === entry.id ? (
                      <div className="flex items-center gap-2 flex-1">
                        <Input
                          data-testid={`edit-time-input-${entry.id}`}
                          type="text"
                          value={editingTimeValue}
                          onChange={(e) => setEditingTimeValue(e.target.value)}
                          className="max-w-[120px] h-7 text-sm"
                          placeholder="Ex: 1h30"
                        />
                        <button
                          data-testid={`save-time-${entry.id}`}
                          onClick={handleSaveTimeEntry}
                          className="p-1 text-green-600 hover:bg-green-50 rounded"
                          title="Enregistrer"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          onClick={() => setEditingTimeId(null)}
                          className="p-1 text-gray-400 hover:bg-gray-100 rounded"
                          title="Annuler"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="text-gray-700">
                          <span className="font-semibold">{formatTimeToHoursMinutes(entry.hours)}</span>
                          {' — '}{entry.user_name}
                          <span className="text-xs text-gray-400 ml-2">{formatDate(entry.timestamp)}</span>
                        </span>
                        {isAdmin() && (
                          <div className="flex items-center gap-0.5 ml-2">
                            <button
                              data-testid={`edit-time-${entry.id}`}
                              onClick={() => handleEditTimeEntry(entry)}
                              className="p-1 text-gray-400 hover:text-blue-600 rounded"
                              title="Modifier"
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              data-testid={`delete-time-${entry.id}`}
                              onClick={() => handleDeleteTimeEntry(entry.id)}
                              className="p-1 text-gray-400 hover:text-red-600 rounded"
                              title="Supprimer"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Zone de saisie du temps - champ unique */}
            <div className="space-y-2">
              <Label>Temps passé sur cette intervention *</Label>
              <Input
                type="text"
                placeholder="Ex: 1:30, 1h30, 1.5"
                value={timeInput}
                onChange={(e) => setTimeInput(e.target.value)}
                className="max-w-[200px]"
              />
              <p className="text-xs text-gray-500">
                Formats acceptés : 01:30, 1:30, 1h30, 1.5 (décimal)
              </p>
            </div>
          </div>

          {/* Boutons Valider / Annuler */}
          <Separator className="my-6" />
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={validating}
            >
              Annuler
            </Button>
            <Button
              onClick={handleValidate}
              disabled={validating || !newComment.trim() || !timeInput.trim()}
              className="bg-green-600 hover:bg-green-700"
            >
              {validating ? 'Validation...' : 'Valider'}
            </Button>
          </div>

          {/* Pièces jointes */}
          <Separator className="my-6" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Pièces jointes</h3>
            
            <div className="mb-4">
              <AttachmentUploader 
                workOrderId={workOrder.id} 
                onUploadComplete={handleUploadComplete}
              />
            </div>

            <AttachmentsList 
              workOrderId={workOrder.id}
              refreshTrigger={refreshAttachments}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <StatusChangeDialog
      open={showStatusDialog}
      onOpenChange={setShowStatusDialog}
      currentStatus={workOrder.statut}
      workOrderId={workOrder.id}
      onStatusChange={handleStatusChange}
      onSkip={handleSkipStatusChange}
    />
    </>
  );
};

export default WorkOrderDialog;