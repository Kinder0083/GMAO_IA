import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Send, FileText, Paperclip, X, Download, Loader2 } from 'lucide-react';
import { surveillanceAPI, usersAPI } from '../../services/api';
import { useToast } from '../../hooks/use-toast';

const API_URL = process.env.REACT_APP_BACKEND_URL;

function SurveillanceItemForm({ open, item, onClose }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [existingCategories, setExistingCategories] = useState([]);
  const [users, setUsers] = useState([]);
  const [formData, setFormData] = useState({
    classe_type: '',
    category: '',
    batiment: '',
    periodicite: '',
    responsable: '',
    executant: '',
    description: '',
    derniere_visite: '',
    prochain_controle: '',
    commentaire: '',
    reference_reglementaire: '',
    numero_rapport: '',
    organisme_controle: '',
    resultat_controle: '',
    duree_rappel_echeance: 30,
    responsable_notification_id: ''
  });

  useEffect(() => {
    if (open) {
      loadExistingCategories();
      loadUsers();
    }
    if (item) {
      setFormData({
        classe_type: item.classe_type || '',
        category: item.category || '',
        batiment: item.batiment || '',
        periodicite: item.periodicite || '',
        responsable: item.responsable || '',
        executant: item.executant || '',
        description: item.description || '',
        derniere_visite: item.derniere_visite ? item.derniere_visite.split('T')[0] : '',
        prochain_controle: item.prochain_controle ? item.prochain_controle.split('T')[0] : '',
        commentaire: item.commentaire || '',
        reference_reglementaire: item.reference_reglementaire || '',
        numero_rapport: item.numero_rapport || '',
        organisme_controle: item.organisme_controle || '',
        resultat_controle: item.resultat_controle || '',
        duree_rappel_echeance: item.duree_rappel_echeance || 30,
        responsable_notification_id: item.responsable_notification_id || '',
        // Champs booléens pour les mois
        janvier: item.janvier || false,
        fevrier: item.fevrier || false,
        mars: item.mars || false,
        avril: item.avril || false,
        mai: item.mai || false,
        juin: item.juin || false,
        juillet: item.juillet || false,
        aout: item.aout || false,
        septembre: item.septembre || false,
        octobre: item.octobre || false,
        novembre: item.novembre || false,
        decembre: item.decembre || false
      });
      setAttachments(item.attachments || []);
      setPendingFiles([]);
    } else {
      // Reset pour création
      setFormData({
        classe_type: '',
        category: '',
        batiment: '',
        periodicite: '',
        responsable: '',
        executant: '',
        description: '',
        derniere_visite: '',
        prochain_controle: '',
        commentaire: '',
        reference_reglementaire: '',
        numero_rapport: '',
        organisme_controle: '',
        resultat_controle: '',
        duree_rappel_echeance: 30,
        responsable_notification_id: ''
      });
    }
  }, [item, open]);

  const loadUsers = async () => {
    try {
      const response = await usersAPI.getActive();
      setUsers(response.data || []);
    } catch (error) {
      console.error('Erreur chargement utilisateurs:', error);
    }
  };

  const loadExistingCategories = async () => {
    try {
      const items = await surveillanceAPI.getItems();
      // Extraire toutes les catégories uniques
      const categories = [...new Set(items.map(i => i.category))].filter(Boolean).sort();
      setExistingCategories(categories);
    } catch (error) {
      console.error('Erreur chargement catégories:', error);
      // Catégories par défaut en cas d'erreur
      setExistingCategories(['INCENDIE', 'ELECTRIQUE', 'MMRI', 'SECURITE_ENVIRONNEMENT']);
    }
  };

  // Fonction pour calculer le prochain contrôle automatiquement
  const calculateNextControl = (lastVisitDate, periodicite) => {
    if (!lastVisitDate || !periodicite) return null;

    try {
      const date = new Date(lastVisitDate);
      const periodLower = periodicite.toLowerCase().trim();

      // Parser la périodicité
      if (periodLower.includes('jour')) {
        // "journalier" ou "1 jour" ou "30 jours"
        const match = periodLower.match(/(\d+)/);
        const days = match ? parseInt(match[1]) : 1;
        date.setDate(date.getDate() + days);
      } else if (periodLower.includes('semaine')) {
        // "1 semaine" ou "2 semaines"
        const match = periodLower.match(/(\d+)/);
        const weeks = match ? parseInt(match[1]) : 1;
        date.setDate(date.getDate() + (weeks * 7));
      } else if (periodLower.includes('mois')) {
        // "6 mois" ou "1 mois"
        const match = periodLower.match(/(\d+)/);
        const months = match ? parseInt(match[1]) : 1;
        date.setMonth(date.getMonth() + months);
      } else if (periodLower.includes('an')) {
        // "1 an" ou "3 ans"
        const match = periodLower.match(/(\d+)/);
        const years = match ? parseInt(match[1]) : 1;
        date.setFullYear(date.getFullYear() + years);
      } else {
        // Format non reconnu, retourner null
        return null;
      }

      // Formater la date en YYYY-MM-DD pour l'input date
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    } catch (error) {
      console.error('Erreur calcul prochain contrôle:', error);
      return null;
    }
  };

  // useEffect pour calculer automatiquement le prochain contrôle
  useEffect(() => {
    if (formData.derniere_visite && formData.periodicite) {
      const nextDate = calculateNextControl(formData.derniere_visite, formData.periodicite);
      if (nextDate && nextDate !== formData.prochain_controle) {
        setFormData(prev => ({ ...prev, prochain_controle: nextDate }));
      }
    }
  }, [formData.derniere_visite, formData.periodicite]);

  const handleSubmit = async () => {
    if (!formData.classe_type || !formData.category || !formData.batiment || !formData.periodicite || !formData.responsable || !formData.executant) {
      toast({ title: 'Erreur', description: 'Champs obligatoires manquants', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const apiData = Object.fromEntries(
        Object.entries(formData).map(([key, value]) => [
          key,
          value === '' ? null : value
        ])
      );
      
      let itemId = item?.id;
      
      if (item) {
        await surveillanceAPI.updateItem(item.id, apiData);
      } else {
        const result = await surveillanceAPI.createItem(apiData);
        itemId = result?.id || result?.data?.id;
      }
      
      // Upload des fichiers en attente
      if (pendingFiles.length > 0 && itemId) {
        try {
          await surveillanceAPI.uploadAttachments(itemId, pendingFiles);
        } catch (uploadError) {
          console.error('Erreur upload fichiers:', uploadError);
          toast({ title: 'Attention', description: 'Contrôle sauvegardé mais erreur lors de l\'upload des fichiers', variant: 'destructive' });
        }
      }
      
      toast({ title: 'Succès', description: item ? 'Contrôle mis à jour' : 'Contrôle créé' });
      onClose(true);
    } catch (error) {
      toast({ 
        title: 'Erreur', 
        description: error.response?.data?.detail || 'Erreur enregistrement', 
        variant: 'destructive' 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFileAdd = (e) => {
    const newFiles = Array.from(e.target.files || []);
    setPendingFiles(prev => [...prev, ...newFiles]);
  };

  const handleRemovePending = (index) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleDeleteAttachment = async (attachmentId) => {
    if (!item?.id) return;
    try {
      await surveillanceAPI.deleteAttachment(item.id, attachmentId);
      setAttachments(prev => prev.filter(a => a.id !== attachmentId));
      toast({ title: 'Succès', description: 'Pièce jointe supprimée' });
    } catch (error) {
      toast({ title: 'Erreur', description: 'Impossible de supprimer', variant: 'destructive' });
    }
  };

  const handleUploadMore = async (e) => {
    if (!item?.id) return;
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploading(true);
    try {
      const result = await surveillanceAPI.uploadAttachments(item.id, files);
      if (result.success) {
        setAttachments(prev => [...prev, ...result.attachments]);
        toast({ title: 'Succès', description: `${result.attachments.length} fichier(s) ajouté(s)` });
      }
    } catch (error) {
      toast({ title: 'Erreur', description: 'Erreur lors de l\'upload', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => onClose(false)}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item ? 'Éditer le contrôle' : 'Nouveau contrôle'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {/* Section : Identification */}
          <div className="border-b pb-2 mb-1">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1">
              <FileText className="h-4 w-4" /> Identification
            </h3>
          </div>

          <div>
            <Label>Type de contrôle *</Label>
            <Input value={formData.classe_type} onChange={(e) => setFormData({...formData, classe_type: e.target.value})} placeholder="Ex: Thermographie infrarouge installations électriques" data-testid="input-classe-type" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Catégorie *</Label>
              <Input 
                value={formData.category} 
                onChange={(e) => setFormData({...formData, category: e.target.value.toUpperCase()})} 
                placeholder="Ex: ELECTRIQUE, MANUTENTION..."
                list="categories-list"
                data-testid="input-category"
              />
              <datalist id="categories-list">
                {existingCategories.map(cat => (
                  <option key={cat} value={cat} />
                ))}
              </datalist>
            </div>
            <div>
              <Label>Bâtiment *</Label>
              <Input value={formData.batiment} onChange={(e) => setFormData({...formData, batiment: e.target.value})} placeholder="Ex: BATIMENT 2" data-testid="input-batiment" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Responsable *</Label>
              <Select value={formData.responsable} onValueChange={(val) => setFormData({...formData, responsable: val})}>
                <SelectTrigger data-testid="select-responsable"><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MAINT">MAINT</SelectItem>
                  <SelectItem value="PROD">PROD</SelectItem>
                  <SelectItem value="QHSE">QHSE</SelectItem>
                  <SelectItem value="EXTERNE">EXTERNE</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Exécutant *</Label>
              <Input value={formData.executant} onChange={(e) => setFormData({...formData, executant: e.target.value})} placeholder="Ex: APAVE, SOCOTEC" data-testid="input-executant" />
            </div>
          </div>

          <div>
            <Label>Description</Label>
            <Textarea value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} rows={2} data-testid="input-description" />
          </div>

          {/* Section : Réglementation & Rapport */}
          <div className="border-b pb-2 mb-1 mt-2">
            <h3 className="text-sm font-semibold text-gray-700">Réglementation & Rapport</h3>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Organisme de contrôle</Label>
              <Input value={formData.organisme_controle} onChange={(e) => setFormData({...formData, organisme_controle: e.target.value})} placeholder="Ex: APAVE, SOCOTEC, DEKRA" data-testid="input-organisme" />
            </div>
            <div>
              <Label>N° de rapport</Label>
              <Input value={formData.numero_rapport} onChange={(e) => setFormData({...formData, numero_rapport: e.target.value})} placeholder="Numéro du rapport" data-testid="input-numero-rapport" />
            </div>
          </div>

          <div>
            <Label>Référence réglementaire</Label>
            <Textarea value={formData.reference_reglementaire} onChange={(e) => setFormData({...formData, reference_reglementaire: e.target.value})} rows={2} placeholder="Articles de loi, arrêtés, normes..." data-testid="input-ref-reglementaire" />
          </div>

          <div>
            <Label>Résultat du contrôle</Label>
            <Select value={formData.resultat_controle || "none"} onValueChange={(val) => setFormData({...formData, resultat_controle: val === "none" ? "" : val})}>
              <SelectTrigger data-testid="select-resultat"><SelectValue placeholder="Sélectionner le résultat" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Non renseigné</SelectItem>
                <SelectItem value="Conforme">Conforme</SelectItem>
                <SelectItem value="Non conforme">Non conforme</SelectItem>
                <SelectItem value="Avec réserves">Avec réserves</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Section : Planification */}
          <div className="border-b pb-2 mb-1 mt-2">
            <h3 className="text-sm font-semibold text-gray-700">Planification</h3>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Périodicité *</Label>
              <Input value={formData.periodicite} onChange={(e) => setFormData({...formData, periodicite: e.target.value})} placeholder="Ex: 1 an, 6 mois" data-testid="input-periodicite" />
            </div>
            <div>
              <Label>Durée rappel (jours)</Label>
              <Input 
                type="number" 
                min="1" 
                max="365" 
                value={formData.duree_rappel_echeance} 
                onChange={(e) => setFormData({...formData, duree_rappel_echeance: parseInt(e.target.value) || 30})} 
                data-testid="input-duree-rappel"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Dernière visite</Label>
              <Input type="date" value={formData.derniere_visite} onChange={(e) => setFormData({...formData, derniere_visite: e.target.value})} data-testid="input-derniere-visite" />
            </div>
            <div>
              <Label>Prochain contrôle</Label>
              <Input 
                type="date" 
                value={formData.prochain_controle} 
                onChange={(e) => setFormData({...formData, prochain_controle: e.target.value})} 
                className={formData.derniere_visite && formData.periodicite ? "bg-blue-50 border-blue-200" : ""}
                data-testid="input-prochain-controle"
              />
              {formData.derniere_visite && formData.periodicite && (
                <p className="text-xs text-blue-600 mt-1">Calculé auto : Dernière visite + Périodicité</p>
              )}
            </div>
          </div>

          {/* Section : Notifications */}
          <div className="border-b pb-2 mb-1 mt-2">
            <h3 className="text-sm font-semibold text-gray-700">Notifications</h3>
          </div>

          <div>
            <Label>Responsable de notification</Label>
            <div className="flex gap-2 items-start">
              <div className="flex-1">
                <Select 
                  value={formData.responsable_notification_id || "none"} 
                  onValueChange={(val) => setFormData({...formData, responsable_notification_id: val === "none" ? "" : val})}
                >
                  <SelectTrigger data-testid="select-notification-responsable">
                    <SelectValue placeholder="Sélectionner un responsable" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucun</SelectItem>
                    {users.filter(user => user.id && user.id !== '').map(user => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.prenom || user.first_name} {user.nom || user.last_name}
                        {user.email && ` - ${user.email}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!formData.responsable_notification_id || formData.responsable_notification_id === "none" || sendingEmail || !item}
                onClick={async () => {
                  if (!item?.id) {
                    toast({
                      title: 'Attention',
                      description: 'Veuillez d\'abord enregistrer le contrôle avant d\'envoyer un rappel',
                      variant: 'destructive'
                    });
                    return;
                  }
                  setSendingEmail(true);
                  try {
                    await surveillanceAPI.sendManualReminder(item.id);
                    toast({ title: 'Succès', description: 'Email de rappel envoyé avec succès' });
                  } catch (error) {
                    toast({
                      title: 'Erreur',
                      description: error.response?.data?.detail || 'Impossible d\'envoyer l\'email',
                      variant: 'destructive'
                    });
                  } finally {
                    setSendingEmail(false);
                  }
                }}
                className="whitespace-nowrap"
                title={!item ? "Enregistrez d'abord le contrôle" : "Envoyer un email de rappel maintenant"}
                data-testid="send-reminder-btn"
              >
                <Send size={16} className="mr-1" />
                {sendingEmail ? 'Envoi...' : 'Envoi Manuel'}
              </Button>
            </div>
            <p className="text-xs text-gray-500 mt-1">Cette personne recevra un email de rappel avant l'échéance</p>
          </div>

          {/* Section : Pièces jointes */}
          <div className="border-b pb-2 mb-1 mt-2">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1">
              <Paperclip className="h-4 w-4" /> Pièces jointes
            </h3>
          </div>

          {/* Fichiers existants (mode édition) */}
          {attachments.length > 0 && (
            <div className="space-y-1.5">
              {attachments.map((att) => (
                <div key={att.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded text-sm" data-testid={`attachment-${att.id}`}>
                  <FileText className="h-4 w-4 text-blue-600 flex-shrink-0" />
                  <span className="flex-1 truncate">{att.filename}</span>
                  <span className="text-xs text-gray-400">{att.size ? `${(att.size / 1024).toFixed(0)} Ko` : ''}</span>
                  <a
                    href={`${API_URL}/api${att.url}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 hover:text-blue-800"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Download className="h-4 w-4" />
                  </a>
                  <button onClick={() => handleDeleteAttachment(att.id)} className="text-red-400 hover:text-red-600">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Fichiers en attente (mode création) */}
          {pendingFiles.length > 0 && (
            <div className="space-y-1.5">
              {pendingFiles.map((f, i) => (
                <div key={i} className="flex items-center gap-2 p-2 bg-blue-50 rounded text-sm" data-testid={`pending-file-${i}`}>
                  <FileText className="h-4 w-4 text-blue-600 flex-shrink-0" />
                  <span className="flex-1 truncate">{f.name}</span>
                  <span className="text-xs text-gray-400">{(f.size / 1024).toFixed(0)} Ko</span>
                  <button onClick={() => handleRemovePending(i)} className="text-red-400 hover:text-red-600">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div>
            {item ? (
              <label className="inline-flex items-center gap-2 cursor-pointer text-sm text-blue-600 hover:text-blue-800">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                {uploading ? 'Upload en cours...' : 'Ajouter des fichiers'}
                <input type="file" multiple hidden onChange={handleUploadMore} disabled={uploading} />
              </label>
            ) : (
              <label className="inline-flex items-center gap-2 cursor-pointer text-sm text-blue-600 hover:text-blue-800">
                <Paperclip className="h-4 w-4" />
                Ajouter des fichiers
                <input type="file" multiple hidden onChange={handleFileAdd} data-testid="file-input" />
              </label>
            )}
          </div>

          <div>
            <Label>Commentaire</Label>
            <Textarea value={formData.commentaire} onChange={(e) => setFormData({...formData, commentaire: e.target.value})} rows={3} data-testid="input-commentaire" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onClose(false)} disabled={loading} data-testid="form-cancel-btn">Annuler</Button>
          <Button onClick={handleSubmit} disabled={loading} data-testid="form-submit-btn">{loading ? 'Enregistrement...' : (item ? 'Mettre à jour' : 'Créer')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SurveillanceItemForm;
