import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Loader2, Search, ListChecks, FileText } from 'lucide-react';
import { checklistsAPI } from '../../services/api';

/**
 * ChecklistPickerDialog — affiche la liste des templates de checklist
 * disponibles, filtrable par texte, et appelle onSelect(template) au click.
 *
 * Props :
 * - open, onOpenChange
 * - onSelect : (template) => void
 * - equipmentId : string optionnel — si fourni, les checklists liees a cet equipement
 *   sont remontees en premier (mais toutes restent accessibles).
 */
export const ChecklistPickerDialog = ({ open, onOpenChange, onSelect, equipmentId = null }) => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (open) {
      loadTemplates();
      setSearch('');
    }
  }, [open]);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const res = await checklistsAPI.getTemplates();
      setTemplates(res.data || []);
    } catch (err) {
      console.error('Erreur chargement checklists:', err);
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  // Tri : checklists liees a l'equipement en premier, puis alphabetique
  const sortedTemplates = [...templates]
    .filter((t) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (t.name || '').toLowerCase().includes(q) ||
             (t.description || '').toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (equipmentId) {
        const aLinked = (a.equipment_ids || []).includes(equipmentId) ? 0 : 1;
        const bLinked = (b.equipment_ids || []).includes(equipmentId) ? 0 : 1;
        if (aLinked !== bLinked) return aLinked - bLinked;
      }
      return (a.name || '').localeCompare(b.name || '');
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] flex flex-col" data-testid="checklist-picker-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListChecks size={20} className="text-blue-600" />
            Sélectionner une checklist
          </DialogTitle>
          <DialogDescription>
            Choisissez une checklist parmi celles disponibles. Elle sera liée à cette étape et proposée au technicien.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            data-testid="checklist-picker-search"
            placeholder="Rechercher une checklist..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            autoFocus
          />
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 min-h-[200px]">
          {loading && (
            <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Chargement des checklists...
            </div>
          )}
          {!loading && sortedTemplates.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-8">
              {search.trim() ? 'Aucune checklist ne correspond à votre recherche.' : 'Aucune checklist disponible. Créez-en une depuis le module Checklists.'}
            </p>
          )}
          {!loading && sortedTemplates.map((tpl) => {
            const isLinked = equipmentId && (tpl.equipment_ids || []).includes(equipmentId);
            return (
              <button
                key={tpl.id}
                type="button"
                data-testid={`checklist-picker-item-${tpl.id}`}
                onClick={() => onSelect(tpl)}
                className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="font-medium text-gray-900 flex items-center gap-2">
                      <FileText size={14} className="text-blue-600" />
                      {tpl.name}
                      {isLinked && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-bold">
                          Lié à cet équipement
                        </span>
                      )}
                    </div>
                    {tpl.description && (
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">{tpl.description}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      {(tpl.items || []).length} item(s) à contrôler
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="checklist-picker-cancel">
            Annuler
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ChecklistPickerDialog;
