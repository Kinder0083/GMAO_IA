import React, { useState, useRef, useCallback } from 'react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Label } from '../ui/label';
import { Plus, Trash2, ChevronUp, ChevronDown, GripVertical, ListChecks, Lock, CheckCircle2 } from 'lucide-react';
import { ChecklistPickerDialog } from './ChecklistPickerDialog';

const generateId = () => `etape_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

/**
 * EtapesRealisationField — composant reutilisable pour la gestion des etapes
 * de realisation dans WorkOrderDialog et ImprovementFormDialog.
 *
 * Props :
 * - value : List[{id, numero, description, checklist_template_id?, checklist_template_name?, completed?, completed_at?, completed_by_name?}]
 * - onChange : (newList) => void
 * - equipmentId : id de l'equipement (pour pre-filtrer la liste de checklists)
 * - readonly : booleen — si true, aucune edition (lecture seule)
 */
export const EtapesRealisationField = ({ value = [], onChange, equipmentId = null, readonly = false }) => {
  const [showChecklistPicker, setShowChecklistPicker] = useState(false);
  const [pickerTargetEtapeId, setPickerTargetEtapeId] = useState(null);
  const dragIndexRef = useRef(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  const renumber = (list) => list.map((e, i) => ({ ...e, numero: i + 1 }));

  const handleAdd = () => {
    const next = [
      ...value,
      {
        id: generateId(),
        numero: value.length + 1,
        description: '',
        checklist_template_id: null,
        checklist_template_name: null,
        completed: false
      }
    ];
    onChange(renumber(next));
  };

  const handleRemove = (idx) => {
    if (value[idx]?.completed) return; // protection : pas de suppression d'etape cochee
    const next = value.filter((_, i) => i !== idx);
    onChange(renumber(next));
  };

  const handleMove = (idx, direction) => {
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= value.length) return;
    if (value[idx]?.completed || value[targetIdx]?.completed) return; // pas de swap si une des deux est verrouillee
    const next = [...value];
    [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
    onChange(renumber(next));
  };

  const handleDescriptionChange = (idx, newText) => {
    if (value[idx]?.completed) return;
    const next = value.map((e, i) => (i === idx ? { ...e, description: newText } : e));
    onChange(next);
  };

  // Detection du mot-cle "checklist" : sur blur, si le texte contient le mot
  // "checklist" (insensible a la casse) et qu'aucune checklist n'est encore liee,
  // on ouvre le picker.
  const handleDescriptionBlur = (idx) => {
    const etape = value[idx];
    if (!etape || etape.completed) return;
    const text = (etape.description || '').toLowerCase();
    if (text.includes('checklist') && !etape.checklist_template_id) {
      setPickerTargetEtapeId(etape.id);
      setShowChecklistPicker(true);
    }
  };

  const handleChecklistSelected = (template) => {
    if (!template || !pickerTargetEtapeId) {
      setShowChecklistPicker(false);
      setPickerTargetEtapeId(null);
      return;
    }
    const next = value.map((e) => {
      if (e.id !== pickerTargetEtapeId) return e;
      // Reformater la description : prefixe "Checklist : <name>" + description existante eventuelle
      const cleanDesc = (e.description || '').replace(/checklist/gi, '').trim();
      const finalDesc = cleanDesc
        ? `Checklist : ${template.name} — ${cleanDesc}`
        : `Checklist : ${template.name}`;
      return {
        ...e,
        description: finalDesc,
        checklist_template_id: template.id,
        checklist_template_name: template.name
      };
    });
    onChange(next);
    setShowChecklistPicker(false);
    setPickerTargetEtapeId(null);
  };

  const handleDetachChecklist = (idx) => {
    if (value[idx]?.completed) return;
    const next = value.map((e, i) => (i === idx ? { ...e, checklist_template_id: null, checklist_template_name: null } : e));
    onChange(next);
  };

  // === Drag & drop HTML5 ===
  const handleDragStart = useCallback((e, idx) => {
    if (value[idx]?.completed) {
      e.preventDefault();
      return;
    }
    dragIndexRef.current = idx;
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', String(idx)); } catch (_err) { /* ignore */ }
  }, [value]);

  const handleDragOver = (e, idx) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== idx) setDragOverIndex(idx);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e, targetIdx) => {
    e.preventDefault();
    const sourceIdx = dragIndexRef.current;
    dragIndexRef.current = null;
    setDragOverIndex(null);
    if (sourceIdx === null || sourceIdx === targetIdx) return;
    if (value[sourceIdx]?.completed || value[targetIdx]?.completed) return;
    const next = [...value];
    const [moved] = next.splice(sourceIdx, 1);
    next.splice(targetIdx, 0, moved);
    onChange(renumber(next));
  };

  const handleDragEnd = () => {
    dragIndexRef.current = null;
    setDragOverIndex(null);
  };

  return (
    <>
      <div className="space-y-2 pt-4 border-t" data-testid="etapes-realisation-section">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-2">
            <ListChecks size={16} className="text-blue-600" />
            Étapes de réalisation
            {value.length > 0 && (
              <span className="text-xs text-gray-500 font-normal">
                ({value.filter(e => e.completed).length}/{value.length} terminée{value.length > 1 ? 's' : ''})
              </span>
            )}
          </Label>
        </div>

        {value.length === 0 && (
          <p className="text-xs text-gray-500 italic">
            Aucune étape définie. Ajoutez des étapes intermédiaires pour structurer la réalisation.
          </p>
        )}

        <div className="space-y-2">
          {value.map((etape, idx) => {
            const isLocked = !!etape.completed;
            const isDragOver = dragOverIndex === idx && !isLocked;
            return (
              <div
                key={etape.id}
                data-testid={`etape-row-${idx}`}
                draggable={!isLocked && !readonly}
                onDragStart={(e) => handleDragStart(e, idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, idx)}
                onDragEnd={handleDragEnd}
                className={`flex gap-2 items-start p-2 rounded-lg border transition-colors ${
                  isLocked
                    ? 'bg-green-50 border-green-200'
                    : isDragOver
                      ? 'bg-blue-50 border-blue-300'
                      : 'bg-white border-gray-200 hover:border-gray-300'
                }`}
              >
                {/* Poignee de drag */}
                <div
                  className={`flex flex-col items-center pt-1.5 ${isLocked || readonly ? 'opacity-30' : 'cursor-move text-gray-400 hover:text-gray-600'}`}
                  title={isLocked ? 'Étape verrouillée' : 'Glisser pour réordonner'}
                >
                  <GripVertical size={14} />
                </div>

                {/* Numero */}
                <div className="flex flex-col items-center min-w-[28px] pt-1">
                  <span className={`text-sm font-bold ${isLocked ? 'text-green-700' : 'text-blue-700'}`}>
                    {etape.numero}.
                  </span>
                  {isLocked && <CheckCircle2 size={14} className="text-green-600 mt-0.5" />}
                </div>

                {/* Textarea */}
                <div className="flex-1 space-y-1">
                  <Textarea
                    data-testid={`etape-textarea-${idx}`}
                    value={etape.description || ''}
                    onChange={(e) => handleDescriptionChange(idx, e.target.value)}
                    onBlur={() => handleDescriptionBlur(idx)}
                    placeholder={`Étape ${etape.numero} — décrire l'action à réaliser (tapez "checklist" pour lier une checklist)`}
                    rows={2}
                    disabled={isLocked || readonly}
                    className={`text-sm resize-y min-h-[44px] ${isLocked ? 'bg-green-50 text-green-900 cursor-not-allowed' : ''}`}
                  />
                  {/* Badge checklist */}
                  {etape.checklist_template_id && (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
                        <ListChecks size={12} />
                        Checklist : {etape.checklist_template_name || '(inconnue)'}
                      </span>
                      {!isLocked && !readonly && (
                        <button
                          type="button"
                          onClick={() => handleDetachChecklist(idx)}
                          className="text-gray-500 hover:text-red-600"
                          title="Retirer la checklist"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  )}
                  {/* Info de completion */}
                  {isLocked && etape.completed_by_name && (
                    <p className="text-[11px] text-green-700 italic">
                      Validée par {etape.completed_by_name}
                      {etape.completed_at && ` le ${new Date(etape.completed_at).toLocaleString('fr-FR')}`}
                    </p>
                  )}
                </div>

                {/* Boutons d'action */}
                <div className="flex flex-col gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    data-testid={`etape-up-btn-${idx}`}
                    onClick={() => handleMove(idx, -1)}
                    disabled={idx === 0 || isLocked || readonly}
                    className="h-6 w-6 p-0"
                    title="Monter"
                  >
                    <ChevronUp size={14} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    data-testid={`etape-down-btn-${idx}`}
                    onClick={() => handleMove(idx, 1)}
                    disabled={idx === value.length - 1 || isLocked || readonly}
                    className="h-6 w-6 p-0"
                    title="Descendre"
                  >
                    <ChevronDown size={14} />
                  </Button>
                  {isLocked ? (
                    <div className="h-6 w-6 flex items-center justify-center" title="Étape verrouillée (validée)">
                      <Lock size={12} className="text-green-700" />
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      data-testid={`etape-remove-btn-${idx}`}
                      onClick={() => handleRemove(idx)}
                      disabled={readonly}
                      className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                      title="Supprimer"
                    >
                      <Trash2 size={14} />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {!readonly && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAdd}
            data-testid="etape-add-btn"
            className="w-full mt-2 border-dashed"
          >
            <Plus size={16} className="mr-1" />
            Ajouter une étape
          </Button>
        )}
      </div>

      <ChecklistPickerDialog
        open={showChecklistPicker}
        onOpenChange={(o) => {
          setShowChecklistPicker(o);
          if (!o) setPickerTargetEtapeId(null);
        }}
        onSelect={handleChecklistSelected}
        equipmentId={equipmentId}
      />
    </>
  );
};

export default EtapesRealisationField;
