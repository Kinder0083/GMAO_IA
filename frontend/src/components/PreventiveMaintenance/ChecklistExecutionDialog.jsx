import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { useToast } from '../../hooks/use-toast';
import { checklistsAPI, workOrdersAPI } from '../../services/api';
import { formatErrorMessage } from '../../utils/errorFormatter';
import { 
  ClipboardCheck, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  Camera,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Clock
} from 'lucide-react';

const ChecklistExecutionDialog = ({ 
  open, 
  onOpenChange, 
  template, 
  workOrderId = null,
  preventiveMaintenanceId = null,
  improvementId = null,
  equipmentId = null,
  equipmentName = null,
  mode = 'full', // 'full' = termine l'OT (PM classique), 'etape' = juste l'etape (ne touche pas le statut OT)
  onSuccess 
}) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [responses, setResponses] = useState([]);
  const [generalComment, setGeneralComment] = useState('');
  const [expandedItems, setExpandedItems] = useState(new Set());
  
  // État pour le dialog de temps passé
  const [showTimeDialog, setShowTimeDialog] = useState(false);
  const [timeHours, setTimeHours] = useState(0);
  const [timeMinutes, setTimeMinutes] = useState(0);
  const [pendingSubmit, setPendingSubmit] = useState(false);

  useEffect(() => {
    if (open && template) {
      // Initialiser les réponses pour chaque item
      const initialResponses = template.items.map(item => ({
        item_id: item.id,
        item_label: item.label,
        item_type: item.type,
        value_yes_no: null,
        value_numeric: null,
        value_text: '',
        is_compliant: true,
        has_issue: false,
        issue_description: '',
        issue_photos: []
      }));
      setResponses(initialResponses);
      setGeneralComment('');
      setExpandedItems(new Set());
      setShowTimeDialog(false);
      setTimeHours(0);
      setTimeMinutes(0);
      setPendingSubmit(false);
    }
  }, [open, template]);

  const updateResponse = (index, field, value) => {
    const newResponses = [...responses];
    newResponses[index] = { ...newResponses[index], [field]: value };
    
    // Vérifier automatiquement la conformité pour les valeurs numériques
    if (field === 'value_numeric' && template.items[index].type === 'NUMERIC') {
      const item = template.items[index];
      const numValue = parseFloat(value);
      let isCompliant = true;
      
      if (item.min_value !== null && numValue < item.min_value) {
        isCompliant = false;
      }
      if (item.max_value !== null && numValue > item.max_value) {
        isCompliant = false;
      }
      
      newResponses[index].is_compliant = isCompliant;
      
      // Si non conforme, marquer comme ayant un problème
      if (!isCompliant) {
        newResponses[index].has_issue = true;
      }
    }
    
    setResponses(newResponses);
  };

  const toggleExpanded = (index) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedItems(newExpanded);
  };

  // Première étape : validation des items et ouverture du dialog temps
  const handleValidateChecklist = async (e) => {
    e.preventDefault();
    
    // Vérifier que tous les items obligatoires sont remplis
    const missingRequired = responses.some((resp, idx) => {
      const item = template.items[idx];
      if (!item.required) return false;
      
      if (item.type === 'YES_NO' && resp.value_yes_no === null) return true;
      if (item.type === 'NUMERIC' && (resp.value_numeric === null || resp.value_numeric === '')) return true;
      if (item.type === 'TEXT' && !resp.value_text) return true;
      
      return false;
    });

    if (missingRequired) {
      toast({
        title: 'Attention',
        description: 'Veuillez remplir tous les items obligatoires',
        variant: 'destructive'
      });
      return;
    }

    // Ouvrir le dialog de temps passé
    setShowTimeDialog(true);
  };

  // Deuxième étape : soumission finale avec le temps
  const handleFinalSubmit = async () => {
    setLoading(true);
    setPendingSubmit(true);

    try {
      // Calculer le temps total en heures décimales
      const totalTimeHours = parseFloat(timeHours) + parseFloat(timeMinutes) / 60;

      // Identifier les non-conformités
      const nonConformities = responses.filter((resp, idx) => {
        return !resp.is_compliant || resp.has_issue;
      }).map((resp, idx) => {
        const item = template.items.find(i => i.id === resp.item_id) || template.items[idx];
        let details = `- ${resp.item_label}`;
        
        if (resp.item_type === 'YES_NO' && resp.value_yes_no === false) {
          details += ' : Non conforme';
        } else if (resp.item_type === 'NUMERIC' && !resp.is_compliant) {
          const originalItem = template.items.find(i => i.id === resp.item_id);
          details += ` : Valeur mesurée ${resp.value_numeric} ${originalItem?.unit || ''} (attendu: ${originalItem?.min_value || '?'} - ${originalItem?.max_value || '?'} ${originalItem?.unit || ''})`;
        }
        
        if (resp.issue_description) {
          details += `\n  → ${resp.issue_description}`;
        }
        
        return details;
      });

      // Étape 1: Créer l'exécution de checklist
      const createData = {
        checklist_template_id: template.id,
        work_order_id: workOrderId,
        preventive_maintenance_id: preventiveMaintenanceId,
        improvement_id: improvementId,
        equipment_id: equipmentId
      };

      const createdExecution = await checklistsAPI.createExecution(createData);

      // Étape 2: Mettre à jour avec les réponses
      const updateData = {
        responses: responses.map(r => ({
          ...r,
          answered_at: new Date().toISOString()
        })),
        general_comment: generalComment,
        status: 'completed'
      };

      await checklistsAPI.updateExecution(createdExecution.data.id, updateData);

      // Étape 3: Mettre à jour l'OT original si workOrderId fourni (mode 'full' uniquement)
      if (workOrderId && mode === 'full') {
        await workOrdersAPI.update(workOrderId, {
          statut: 'TERMINE',
          categorie: 'TRAVAUX_PREVENTIFS',
          priorite: 'NORMALE',
          tempsReel: totalTimeHours
        });
      }

      // Étape 4: Créer un OT "RP-" si des non-conformités (skip en mode 'etape')
      if (nonConformities.length > 0 && workOrderId && mode === 'full') {
        // Récupérer les détails de l'OT original pour le nom
        let originalOTName = equipmentName || 'Maintenance';
        try {
          const originalOT = await workOrdersAPI.getById(workOrderId);
          if (originalOT.data) {
            originalOTName = originalOT.data.titre;
          }
        } catch (e) {
          console.error('Erreur récupération OT original:', e);
        }

        const rpOTData = {
          titre: `RP-${originalOTName}`,
          description: `Réparation à Planifier suite aux non-conformités détectées lors de la checklist "${template.name}".\n\nNon-conformités détectées :\n${nonConformities.join('\n')}\n\nCommentaire général : ${generalComment || 'Aucun'}`,
          statut: 'OUVERT',
          priorite: 'HAUTE',
          categorie: 'TRAVAUX_CURATIF',
          equipement_id: equipmentId,
          assigne_a_id: null, // À définir ultérieurement
          dateLimite: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        };

        const rpOTResponse = await workOrdersAPI.create(rpOTData);
        
        // Créer une notification pour le nouvel OT
        try {
          const API_BASE = process.env.REACT_APP_BACKEND_URL || '';
          const token = localStorage.getItem('token');
          await fetch(`${API_BASE}/api/notifications/create-rp`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              rp_ot_id: rpOTResponse.data.id,
              rp_ot_titre: rpOTData.titre,
              non_conformities_count: nonConformities.length,
              original_ot_titre: originalOTName
            })
          });
        } catch (notifError) {
          console.error('Erreur création notification RP:', notifError);
        }

        toast({
          title: 'Checklist validée',
          description: `OT terminé. Un nouvel OT "${rpOTData.titre}" a été créé pour ${nonConformities.length} non-conformité(s).`,
          variant: 'default'
        });
      } else {
        toast({
          title: 'Succès',
          description: mode === 'etape'
            ? `Checklist validée. L'étape liée a été cochée automatiquement. Temps passé : ${timeHours}h ${timeMinutes}min`
            : `Checklist validée et OT terminé. Temps passé : ${timeHours}h ${timeMinutes}min`
        });
      }

      setShowTimeDialog(false);
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'Erreur',
        description: formatErrorMessage(error, 'Une erreur est survenue lors de l\'exécution de la checklist'),
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
      setPendingSubmit(false);
    }
  };

  if (!template) return null;

  // Dialog de saisie du temps passé
  if (showTimeDialog) {
    return (
      <Dialog open={true} onOpenChange={() => setShowTimeDialog(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="text-blue-600" size={24} />
              Temps passé sur cet OT
            </DialogTitle>
            <DialogDescription>
              Indiquez le temps total passé sur cette intervention
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="hours">Heures</Label>
                <Input
                  id="hours"
                  type="number"
                  min="0"
                  max="99"
                  value={timeHours}
                  onChange={(e) => setTimeHours(parseInt(e.target.value) || 0)}
                  className="text-center text-lg"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="minutes">Minutes</Label>
                <Input
                  id="minutes"
                  type="number"
                  min="0"
                  max="59"
                  value={timeMinutes}
                  onChange={(e) => setTimeMinutes(Math.min(59, parseInt(e.target.value) || 0))}
                  className="text-center text-lg"
                />
              </div>
            </div>

            {/* Résumé des non-conformités */}
            {responses.some(r => !r.is_compliant || r.has_issue) && (
              <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                <div className="flex items-center gap-2 text-orange-700 font-medium">
                  <AlertTriangle size={18} />
                  {responses.filter(r => !r.is_compliant || r.has_issue).length} non-conformité(s) détectée(s)
                </div>
                <p className="text-sm text-orange-600 mt-1">
                  Un nouvel OT "RP-..." sera créé automatiquement pour planifier les réparations.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setShowTimeDialog(false)}
              disabled={loading}
            >
              Retour
            </Button>
            <Button 
              onClick={handleFinalSubmit} 
              disabled={loading}
              className="bg-green-600 hover:bg-green-700"
            >
              {loading ? 'Enregistrement...' : 'Confirmer et terminer l\'OT'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="text-blue-600" size={24} />
            Exécution de la checklist
          </DialogTitle>
          <DialogDescription>
            {template.name}
            {equipmentName && <span className="ml-2">- {equipmentName}</span>}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleValidateChecklist} className="space-y-4">
          {/* Liste des items de contrôle */}
          <div className="space-y-3">
            {template.items.map((item, index) => {
              const response = responses[index];
              if (!response) return null;

              const isExpanded = expandedItems.has(index);
              const hasIssue = response.has_issue;

              return (
                <div 
                  key={item.id} 
                  className={`border rounded-lg p-4 ${
                    hasIssue ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white'
                  }`}
                >
                  <div className="space-y-3">
                    {/* En-tête de l'item */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-sm font-medium">
                            #{index + 1}
                          </span>
                          <Label className="font-medium">
                            {item.label}
                            {item.required && <span className="text-red-500 ml-1">*</span>}
                          </Label>
                        </div>
                        {item.instructions && (
                          <p className="text-sm text-gray-500 mt-1 ml-12">{item.instructions}</p>
                        )}
                      </div>

                      {/* Indicateur de conformité */}
                      {response.value_yes_no !== null || response.value_numeric !== null || response.value_text ? (
                        response.is_compliant ? (
                          <CheckCircle className="text-green-600 flex-shrink-0" size={20} />
                        ) : (
                          <XCircle className="text-red-600 flex-shrink-0" size={20} />
                        )
                      ) : null}
                    </div>

                    {/* Champ de réponse selon le type */}
                    <div className="ml-12">
                      {item.type === 'YES_NO' && (
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant={response.value_yes_no === true ? 'default' : 'outline'}
                            className={response.value_yes_no === true ? 'bg-green-600 hover:bg-green-700' : ''}
                            onClick={() => {
                              const newResponses = [...responses];
                              newResponses[index] = {
                                ...newResponses[index],
                                value_yes_no: true,
                                is_compliant: true,
                                has_issue: false
                              };
                              setResponses(newResponses);
                            }}
                          >
                            <CheckCircle size={16} className="mr-2" />
                            Conforme
                          </Button>
                          <Button
                            type="button"
                            variant={response.value_yes_no === false ? 'default' : 'outline'}
                            className={response.value_yes_no === false ? 'bg-red-600 hover:bg-red-700' : ''}
                            onClick={() => {
                              const newResponses = [...responses];
                              newResponses[index] = {
                                ...newResponses[index],
                                value_yes_no: false,
                                is_compliant: false,
                                has_issue: true
                              };
                              setResponses(newResponses);
                              setExpandedItems(new Set([...expandedItems, index]));
                            }}
                          >
                            <XCircle size={16} className="mr-2" />
                            Non conforme
                          </Button>
                        </div>
                      )}

                      {item.type === 'NUMERIC' && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              step="0.01"
                              value={response.value_numeric ?? ''}
                              onChange={(e) => updateResponse(index, 'value_numeric', e.target.value)}
                              placeholder={`Valeur attendue: ${item.expected_value ?? '-'}`}
                              className="w-40"
                            />
                            {item.unit && (
                              <span className="text-gray-600 font-medium">{item.unit}</span>
                            )}
                          </div>
                          <div className="text-sm text-gray-500">
                            {item.min_value !== null && item.max_value !== null && (
                              <span>Plage acceptable: {item.min_value} - {item.max_value} {item.unit}</span>
                            )}
                          </div>
                        </div>
                      )}

                      {item.type === 'TEXT' && (
                        <Input
                          value={response.value_text}
                          onChange={(e) => updateResponse(index, 'value_text', e.target.value)}
                          placeholder="Saisissez votre observation..."
                        />
                      )}
                    </div>

                    {/* Section problème (dépliable) */}
                    {hasIssue && (
                      <div className="ml-12 mt-3 border-t pt-3">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleExpanded(index)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <AlertTriangle size={16} className="mr-2" />
                          {isExpanded ? 'Masquer' : 'Documenter'} le problème
                          {isExpanded ? <ChevronUp size={16} className="ml-1" /> : <ChevronDown size={16} className="ml-1" />}
                        </Button>

                        {isExpanded && (
                          <div className="mt-3 space-y-3">
                            <div>
                              <Label className="text-sm flex items-center gap-1">
                                <MessageSquare size={14} />
                                Description du problème
                              </Label>
                              <Textarea
                                value={response.issue_description}
                                onChange={(e) => updateResponse(index, 'issue_description', e.target.value)}
                                placeholder="Décrivez le problème constaté..."
                                rows={2}
                                className="mt-1"
                              />
                            </div>

                            <div>
                              <Label className="text-sm flex items-center gap-1 mb-2">
                                <Camera size={14} />
                                Photos (à implémenter)
                              </Label>
                              <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded border border-dashed">
                                La fonctionnalité d'upload de photos sera ajoutée prochainement
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Commentaire général */}
          <div className="space-y-2 p-4 bg-gray-50 rounded-lg border">
            <Label className="flex items-center gap-2">
              <MessageSquare size={16} />
              Commentaire général (optionnel)
            </Label>
            <Textarea
              value={generalComment}
              onChange={(e) => setGeneralComment(e.target.value)}
              placeholder="Ajoutez un commentaire général sur l'exécution de cette checklist..."
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700">
              {loading ? 'Enregistrement...' : 'Valider la checklist'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ChecklistExecutionDialog;
