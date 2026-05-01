import React, { useState } from 'react';
import { Checkbox } from '../ui/checkbox';
import { Button } from '../ui/button';
import { ListChecks, Play, Loader2, CheckCircle2 } from 'lucide-react';
import { useToast } from '../../hooks/use-toast';
import api from '../../services/api';

/**
 * EtapesRealisationViewer — affiche les etapes de realisation en lecture
 * dans le detail d'un OT ou d'une amelioration, avec checkbox pour
 * cocher/decocher chaque etape.
 *
 * Props :
 * - etapes : List
 * - resourceType : 'work-orders' | 'improvements'
 * - resourceId : id de l'OT ou amelioration
 * - canToggle : booleen (techniciens assignes + admins)
 * - onChange : (newEtapes) => void  (callback apres toggle reussi)
 * - onLaunchChecklist : (etape) => void  (callback pour lancer une checklist liee)
 */
export const EtapesRealisationViewer = ({
  etapes = [],
  resourceType,
  resourceId,
  canToggle = false,
  onChange,
  onLaunchChecklist
}) => {
  const { toast } = useToast();
  const [togglingId, setTogglingId] = useState(null);

  if (!etapes || etapes.length === 0) return null;

  const handleToggle = async (etape) => {
    if (!canToggle || togglingId) return;
    setTogglingId(etape.id);
    try {
      const res = await api.post(`/${resourceType}/${resourceId}/etapes/${etape.id}/toggle`);
      const updatedEtape = res.data?.etape;
      if (updatedEtape && onChange) {
        const newList = etapes.map(e => e.id === etape.id ? updatedEtape : e);
        onChange(newList);
      }
    } catch (err) {
      toast({
        title: 'Erreur',
        description: err.response?.data?.detail || 'Impossible de mettre à jour l\'étape',
        variant: 'destructive'
      });
    } finally {
      setTogglingId(null);
    }
  };

  const completedCount = etapes.filter(e => e.completed).length;
  const progress = etapes.length > 0 ? Math.round((completedCount / etapes.length) * 100) : 0;

  return (
    <div className="space-y-3" data-testid="etapes-viewer">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <ListChecks className="text-blue-600" size={20} />
          Étapes de réalisation
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600 font-medium">
            {completedCount}/{etapes.length}
          </span>
          <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${progress === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-xs text-gray-500">{progress}%</span>
        </div>
      </div>

      <div className="space-y-2">
        {etapes.map((etape) => (
          <div
            key={etape.id}
            data-testid={`etape-viewer-${etape.numero}`}
            className={`flex gap-3 p-3 rounded-lg border transition-colors ${
              etape.completed ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'
            }`}
          >
            <div className="pt-0.5">
              {togglingId === etape.id ? (
                <Loader2 size={18} className="animate-spin text-blue-500" />
              ) : (
                <Checkbox
                  data-testid={`etape-viewer-checkbox-${etape.numero}`}
                  checked={!!etape.completed}
                  disabled={!canToggle}
                  onCheckedChange={() => handleToggle(etape)}
                  className={etape.completed ? 'border-green-600 data-[state=checked]:bg-green-600' : ''}
                />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold ${etape.completed ? 'text-green-700' : 'text-blue-700'}`}>
                      Étape {etape.numero}
                    </span>
                    {etape.checklist_template_id && (
                      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-bold">
                        <ListChecks size={10} />
                        Checklist
                      </span>
                    )}
                  </div>
                  <p className={`text-sm mt-0.5 whitespace-pre-wrap ${etape.completed ? 'text-green-900' : 'text-gray-800'}`}>
                    {etape.description}
                  </p>
                  {etape.completed && etape.completed_by_name && (
                    <p className="text-[11px] text-green-700 italic mt-1 flex items-center gap-1">
                      <CheckCircle2 size={11} />
                      Validée par {etape.completed_by_name}
                      {etape.completed_at && ` le ${new Date(etape.completed_at).toLocaleString('fr-FR')}`}
                    </p>
                  )}
                </div>

                {/* Bouton "Exécuter la checklist" pour les etapes liees non terminees */}
                {etape.checklist_template_id && !etape.completed && canToggle && onLaunchChecklist && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onLaunchChecklist(etape)}
                    data-testid={`etape-launch-checklist-${etape.numero}`}
                    className="border-purple-300 text-purple-700 hover:bg-purple-50"
                  >
                    <Play size={14} className="mr-1" />
                    Exécuter
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default EtapesRealisationViewer;
