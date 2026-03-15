import React, { useState, useEffect } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { X, Loader2, Search, Calendar } from 'lucide-react';
import api from '../../services/api';

const FREQUENCIES = [
  { value: 'HEBDOMADAIRE', label: 'Hebdomadaire' },
  { value: 'MENSUEL', label: 'Mensuel' },
  { value: 'TRIMESTRIEL', label: 'Trimestriel' },
  { value: 'ANNUEL', label: 'Annuel' },
];

export default function CreatePreventiveDialog({ open, onClose, action, analysisId, onCreated }) {
  const [titre, setTitre] = useState('');
  const [description, setDescription] = useState('');
  const [frequence, setFrequence] = useState('MENSUEL');
  const [duree, setDuree] = useState(1);
  const [equipmentId, setEquipmentId] = useState('');
  const [assigneId, setAssigneId] = useState('');
  const [equipments, setEquipments] = useState([]);
  const [users, setUsers] = useState([]);
  const [equipSearch, setEquipSearch] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (open && action) {
      setTitre(action.titre || '');
      setDescription(action.description || '');
      setFrequence(action.frequence_suggere || 'MENSUEL');
      setDuree(1);
      setEquipmentId('');
      setAssigneId('');
      setEquipSearch('');
    }
  }, [open, action]);

  useEffect(() => {
    if (open) {
      Promise.all([
        api.get('/equipments').then(r => r.data).catch(() => []),
        api.get('/users').then(r => r.data).catch(() => [])
      ]).then(([eq, us]) => {
        setEquipments(eq || []);
        setUsers(us || []);
      });
    }
  }, [open]);

  const filteredEquipments = equipments.filter(e =>
    (e.nom || '').toLowerCase().includes(equipSearch.toLowerCase()) ||
    (e.localisation || '').toLowerCase().includes(equipSearch.toLowerCase())
  ).slice(0, 50);

  const selectedEquipment = equipments.find(e => e.id === equipmentId);

  const handleCreate = async () => {
    if (!titre.trim() || !equipmentId) return;

    setCreating(true);
    try {
      const result = await api.post(`/accident-analysis/${analysisId}/create-preventive`, {
        titre,
        description,
        frequence,
        duree: parseFloat(duree) || 1,
        equipement_id: equipmentId,
        assigne_a_id: assigneId || null
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" data-testid="create-preventive-dialog">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-blue-50">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">Creer une Maintenance Preventive</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" data-testid="close-preventive-dialog">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Titre */}
          <div>
            <Label className="text-sm font-medium">Titre *</Label>
            <Input
              value={titre}
              onChange={e => setTitre(e.target.value)}
              placeholder="Nom de la maintenance"
              data-testid="preventive-dialog-titre"
            />
          </div>

          {/* Description */}
          <div>
            <Label className="text-sm font-medium">Description</Label>
            <textarea
              className="w-full border rounded-md p-2 text-sm min-h-[60px] resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Description de la maintenance"
              data-testid="preventive-dialog-description"
            />
          </div>

          {/* Equipement (obligatoire) */}
          <div>
            <Label className="text-sm font-medium">
              Equipement * {selectedEquipment && <span className="text-green-600 font-normal">({selectedEquipment.nom})</span>}
            </Label>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                value={equipSearch}
                onChange={e => { setEquipSearch(e.target.value); setEquipmentId(''); }}
                placeholder="Rechercher un equipement..."
                className="pl-9 text-sm"
                data-testid="preventive-equip-search"
              />
            </div>
            <div className="border rounded-md max-h-36 overflow-y-auto">
              {filteredEquipments.length === 0 ? (
                <p className="text-xs text-gray-400 p-3 text-center">Aucun equipement trouve</p>
              ) : (
                filteredEquipments.map(eq => (
                  <button
                    key={eq.id}
                    type="button"
                    onClick={() => { setEquipmentId(eq.id); setEquipSearch(eq.nom); }}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left border-b last:border-b-0 transition-colors ${
                      equipmentId === eq.id ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-gray-50'
                    }`}
                  >
                    <span className="flex-1 truncate">{eq.nom}</span>
                    {eq.localisation && <span className="text-xs text-gray-400 truncate max-w-[120px]">{eq.localisation}</span>}
                  </button>
                ))
              )}
            </div>
            {!equipmentId && (
              <p className="text-xs text-red-500 mt-1">Veuillez selectionner un equipement</p>
            )}
          </div>

          {/* Frequence + Duree */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium">Frequence</Label>
              <select
                className="w-full border rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={frequence}
                onChange={e => setFrequence(e.target.value)}
                data-testid="preventive-dialog-frequence"
              >
                {FREQUENCIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-sm font-medium">Duree estimee (h)</Label>
              <Input
                type="number"
                min="0.5"
                step="0.5"
                value={duree}
                onChange={e => setDuree(e.target.value)}
                data-testid="preventive-dialog-duree"
              />
            </div>
          </div>

          {/* Assigne a */}
          <div>
            <Label className="text-sm font-medium">Assigner a (optionnel)</Label>
            <select
              className="w-full border rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={assigneId}
              onChange={e => setAssigneId(e.target.value)}
              data-testid="preventive-dialog-assigne"
            >
              <option value="">-- Non assigne --</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>
                  {u.prenom} {u.nom} ({u.role})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t bg-gray-50">
          <Button variant="ghost" onClick={onClose} data-testid="preventive-dialog-cancel">Annuler</Button>
          <Button
            onClick={handleCreate}
            disabled={creating || !titre.trim() || !equipmentId}
            className="bg-blue-600 hover:bg-blue-700"
            data-testid="preventive-dialog-create"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Calendar className="h-4 w-4 mr-2" />}
            Creer la maintenance
          </Button>
        </div>
      </div>
    </div>
  );
}
