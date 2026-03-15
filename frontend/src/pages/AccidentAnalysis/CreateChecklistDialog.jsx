import React, { useState, useEffect } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { X, Plus, GripVertical, Trash2, Loader2, Search, FileText } from 'lucide-react';
import api from '../../services/api';

export default function CreateChecklistDialog({ open, onClose, action, analysisId, onCreated }) {
  const [titre, setTitre] = useState('');
  const [description, setDescription] = useState('');
  const [items, setItems] = useState([]);
  const [newItem, setNewItem] = useState('');
  const [equipments, setEquipments] = useState([]);
  const [selectedEquipmentIds, setSelectedEquipmentIds] = useState([]);
  const [equipSearch, setEquipSearch] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (open && action) {
      setTitre(action.titre || '');
      setDescription(action.description || '');
      const aiItems = (action.checklist_items || []).map((item, i) => ({
        label: typeof item === 'string' ? item : item.label || '',
        type: 'YES_NO',
        id: `ai-${i}`
      }));
      setItems(aiItems.length > 0 ? aiItems : [{ label: '', type: 'YES_NO', id: 'new-0' }]);
      setSelectedEquipmentIds([]);
      setEquipSearch('');
    }
  }, [open, action]);

  useEffect(() => {
    if (open) {
      api.get('/equipments').then(res => {
        setEquipments(res.data || []);
      }).catch(() => {});
    }
  }, [open]);

  const addItem = () => {
    if (newItem.trim()) {
      setItems(prev => [...prev, { label: newItem.trim(), type: 'YES_NO', id: `new-${Date.now()}` }]);
      setNewItem('');
    }
  };

  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));
  const updateItem = (idx, label) => setItems(prev => prev.map((it, i) => i === idx ? { ...it, label } : it));

  const toggleEquipment = (id) => {
    setSelectedEquipmentIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const filteredEquipments = equipments.filter(e =>
    (e.nom || '').toLowerCase().includes(equipSearch.toLowerCase()) ||
    (e.localisation || '').toLowerCase().includes(equipSearch.toLowerCase())
  ).slice(0, 30);

  const handleCreate = async () => {
    if (!titre.trim()) return;
    const validItems = items.filter(it => it.label.trim());
    if (validItems.length === 0) return;

    setCreating(true);
    try {
      const result = await api.post(`/accident-analysis/${analysisId}/create-checklist`, {
        titre,
        description,
        items: validItems.map(it => it.label),
        equipment_ids: selectedEquipmentIds
      }).then(r => r.data);
      onCreated(result);
      onClose();
    } catch {
      // error handled by parent
    } finally {
      setCreating(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" data-testid="create-checklist-dialog">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-green-50">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-green-600" />
            <h2 className="text-lg font-semibold text-gray-900">Creer un modele de Checklist</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" data-testid="close-checklist-dialog">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Titre */}
          <div>
            <Label className="text-sm font-medium">Titre *</Label>
            <Input
              value={titre}
              onChange={e => setTitre(e.target.value)}
              placeholder="Nom de la checklist"
              data-testid="checklist-dialog-titre"
            />
          </div>

          {/* Description */}
          <div>
            <Label className="text-sm font-medium">Description</Label>
            <textarea
              className="w-full border rounded-md p-2 text-sm min-h-[60px] resize-y focus:outline-none focus:ring-2 focus:ring-green-500"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Description de la checklist"
              data-testid="checklist-dialog-description"
            />
          </div>

          {/* Points de controle */}
          <div>
            <Label className="text-sm font-medium mb-2 block">
              Points de controle ({items.filter(i => i.label.trim()).length})
            </Label>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {items.map((item, idx) => (
                <div key={item.id} className="flex items-center gap-2">
                  <GripVertical className="h-4 w-4 text-gray-300 flex-shrink-0" />
                  <Input
                    value={item.label}
                    onChange={e => updateItem(idx, e.target.value)}
                    placeholder={`Point de controle ${idx + 1}`}
                    className="flex-1 text-sm"
                    data-testid={`checklist-item-${idx}`}
                  />
                  <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600 flex-shrink-0">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <Input
                value={newItem}
                onChange={e => setNewItem(e.target.value)}
                placeholder="Ajouter un point de controle..."
                className="flex-1 text-sm"
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addItem())}
                data-testid="checklist-new-item-input"
              />
              <Button size="sm" variant="outline" onClick={addItem} data-testid="checklist-add-item-btn">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Selection equipements */}
          <div>
            <Label className="text-sm font-medium mb-2 block">
              Equipements associes ({selectedEquipmentIds.length} selectionne{selectedEquipmentIds.length > 1 ? 's' : ''})
            </Label>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                value={equipSearch}
                onChange={e => setEquipSearch(e.target.value)}
                placeholder="Rechercher un equipement..."
                className="pl-9 text-sm"
                data-testid="checklist-equip-search"
              />
            </div>
            {selectedEquipmentIds.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {selectedEquipmentIds.map(id => {
                  const eq = equipments.find(e => e.id === id);
                  return (
                    <Badge key={id} variant="secondary" className="text-xs cursor-pointer" onClick={() => toggleEquipment(id)}>
                      {eq?.nom || id} <X className="h-3 w-3 ml-1" />
                    </Badge>
                  );
                })}
              </div>
            )}
            <div className="border rounded-md max-h-36 overflow-y-auto">
              {filteredEquipments.length === 0 ? (
                <p className="text-xs text-gray-400 p-3 text-center">Aucun equipement trouve</p>
              ) : (
                filteredEquipments.map(eq => (
                  <label
                    key={eq.id}
                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-sm border-b last:border-b-0"
                  >
                    <input
                      type="checkbox"
                      checked={selectedEquipmentIds.includes(eq.id)}
                      onChange={() => toggleEquipment(eq.id)}
                      className="rounded"
                    />
                    <span className="flex-1 truncate">{eq.nom}</span>
                    {eq.localisation && <span className="text-xs text-gray-400 truncate max-w-[120px]">{eq.localisation}</span>}
                  </label>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t bg-gray-50">
          <Button variant="ghost" onClick={onClose} data-testid="checklist-dialog-cancel">Annuler</Button>
          <Button
            onClick={handleCreate}
            disabled={creating || !titre.trim() || items.filter(i => i.label.trim()).length === 0}
            className="bg-green-600 hover:bg-green-700"
            data-testid="checklist-dialog-create"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileText className="h-4 w-4 mr-2" />}
            Creer la checklist
          </Button>
        </div>
      </div>
    </div>
  );
}
