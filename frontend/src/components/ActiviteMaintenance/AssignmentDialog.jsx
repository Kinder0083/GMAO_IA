import React, { useEffect, useState, useMemo } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Wrench, Lightbulb, Sparkles, Coffee, ListTodo, AlertCircle } from 'lucide-react';
import { useToast } from '../../hooks/use-toast';
import { maintenanceAssignmentsAPI } from '../../services/api';

const TYPE_OPTIONS = [
  { value: 'WORK_ORDER', label: 'Ordre de travail (OT)', icon: Wrench, needsRef: true },
  { value: 'IMPROVEMENT', label: 'Amélioration', icon: Lightbulb, needsRef: true },
  { value: 'PREVENTIVE_MAINTENANCE', label: 'Maintenance préventive', icon: Sparkles, needsRef: true },
  { value: 'FREE_TASK', label: 'Tâche libre', icon: ListTodo, needsRef: false },
  { value: 'CONGE', label: 'Congé / Indisponibilité', icon: Coffee, needsRef: false },
];

const CATEGORY_OPTIONS = [
  { value: 'REUNION', label: 'Réunion', color: '#3b82f6' },
  { value: 'FORMATION', label: 'Formation', color: '#8b5cf6' },
  { value: 'ASTREINTE', label: 'Astreinte', color: '#f97316' },
  { value: 'AUTRE', label: 'Autre', color: '#6b7280' },
];

const AssignmentDialog = ({ open, onOpenChange, context, editing, techs = [], pool = [], onSaved }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState('FREE_TASK');
  const [refSearch, setRefSearch] = useState('');
  const [selectedRefId, setSelectedRefId] = useState(null);
  const [form, setForm] = useState({
    user_id: '',
    date: '',
    title: '',
    description: '',
    duration_hours: 1.0,
    start_hour: '',
    category: 'AUTRE',
    color: '',
  });

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setType(editing.type);
      setForm({
        user_id: editing.user_id,
        date: editing.date,
        title: editing.title || '',
        description: editing.description || '',
        duration_hours: editing.duration_hours || 1.0,
        start_hour: editing.start_hour ?? '',
        category: editing.category || 'AUTRE',
        color: editing.color || '',
      });
      setSelectedRefId(editing.reference_id || null);
    } else if (context) {
      setType(context.source ? context.source.type : 'FREE_TASK');
      setForm({
        user_id: context.user_id || '',
        date: context.date || '',
        title: context.source ? context.source.title : '',
        description: '',
        duration_hours: context.source ? (context.source.duration_hours || 1.0) : 1.0,
        start_hour: '',
        category: 'AUTRE',
        color: '',
      });
      setSelectedRefId(context.source ? context.source.id : null);
      setRefSearch('');
    }
  }, [open, editing, context]);

  const filteredRefs = useMemo(() => {
    if (!type || !TYPE_OPTIONS.find(t => t.value === type)?.needsRef) return [];
    return pool.filter(p => {
      if (p.type !== type) return false;
      if (!refSearch.trim()) return true;
      const q = refSearch.toLowerCase();
      return (p.title || '').toLowerCase().includes(q) || (p.numero || '').toLowerCase().includes(q);
    }).slice(0, 30);
  }, [pool, type, refSearch]);

  const selectedRefItem = useMemo(() => {
    return pool.find(p => p.id === selectedRefId && p.type === type);
  }, [pool, selectedRefId, type]);

  const isOverloadDay = useMemo(() => {
    // On affiche un avertissement informatif (les data sont chargées au niveau de la page)
    // On se contente de calculer la duree elle-meme superieure a 8h
    return form.duration_hours > 8;
  }, [form.duration_hours]);

  const needsRef = TYPE_OPTIONS.find(t => t.value === type)?.needsRef;

  const handleSubmit = async () => {
    if (!form.user_id || !form.date || !form.title) {
      toast({ title: 'Champs requis', description: 'Technicien, date et titre sont obligatoires', variant: 'destructive' });
      return;
    }
    if (needsRef && !editing) {
      // En mode creation pour un type avec ref, on exige une reference valide dans le pool
      if (!selectedRefId || !selectedRefItem) {
        toast({ title: 'Référence requise', description: 'Veuillez choisir un OT/Amélioration/PM dans la liste', variant: 'destructive' });
        return;
      }
    }
    setLoading(true);
    try {
      const payload = {
        user_id: form.user_id,
        date: form.date,
        title: form.title,
        description: form.description || null,
        duration_hours: parseFloat(form.duration_hours) || 1.0,
        start_hour: form.start_hour !== '' ? parseFloat(form.start_hour) : null,
        category: type === 'FREE_TASK' ? form.category : null,
        color: form.color || null,
      };
      if (!editing) {
        payload.type = type;
        if (needsRef && selectedRefItem) {
          payload.reference_id = selectedRefItem.id;
          payload.reference_numero = selectedRefItem.numero;
          if (!payload.title) payload.title = selectedRefItem.title;
          if (!payload.duration_hours) payload.duration_hours = selectedRefItem.duration_hours;
        }
        await maintenanceAssignmentsAPI.create(payload);
      } else {
        await maintenanceAssignmentsAPI.update(editing.id, payload);
      }
      toast({ title: 'Succès', description: editing ? 'Affectation modifiée' : 'Affectation créée' });
      onSaved();
    } catch (err) {
      const msg = typeof err.response?.data?.detail === 'string'
        ? err.response.data.detail
        : 'Echec';
      toast({ title: 'Erreur', description: msg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="assignment-dialog">
        <DialogHeader>
          <DialogTitle>
            {editing ? 'Modifier l\'affectation' : 'Nouvelle affectation'}
          </DialogTitle>
          <DialogDescription>
            Attribuez une tâche à un technicien pour une journée donnée
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {!editing && (
            <div className="space-y-1">
              <Label className="text-xs">Type d'activité</Label>
              <div className="grid grid-cols-5 gap-1">
                {TYPE_OPTIONS.map(opt => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setType(opt.value);
                        // Reset la reference quand le type change pour eviter une selection stale
                        setSelectedRefId(null);
                        setRefSearch('');
                      }}
                      data-testid={`type-${opt.value}`}
                      className={`p-2 rounded border-2 text-[10px] font-medium transition ${
                        type === opt.value ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      <Icon size={14} className="mx-auto mb-0.5" />
                      {opt.label.split(' ')[0]}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Pour OT/IMP/PM : selection de la reference */}
          {!editing && needsRef && (
            <div className="space-y-1">
              <Label className="text-xs">Sélectionner {type === 'WORK_ORDER' ? 'un OT' : type === 'IMPROVEMENT' ? 'une amélioration' : 'une MP'}</Label>
              <Input
                placeholder="Rechercher par titre ou numéro..."
                value={refSearch}
                onChange={(e) => setRefSearch(e.target.value)}
                className="h-8 text-xs"
                data-testid="ref-search"
              />
              <div className="max-h-44 overflow-y-auto space-y-1 border rounded p-1 bg-gray-50">
                {filteredRefs.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-3">Aucun résultat</p>
                ) : filteredRefs.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setSelectedRefId(p.id);
                      setForm(prev => ({
                        ...prev,
                        title: p.title,
                        duration_hours: p.duration_hours || 1.0,
                      }));
                    }}
                    data-testid={`ref-item-${p.id}`}
                    className={`w-full text-left p-1.5 rounded text-xs ${
                      selectedRefId === p.id ? 'bg-blue-100 border-blue-300 border' : 'bg-white hover:bg-gray-100 border border-gray-200'
                    }`}
                  >
                    <div className="font-mono text-[10px] text-gray-500">#{p.numero || '—'}</div>
                    <div>{p.title}</div>
                    <div className="text-[10px] text-gray-500">{p.duration_hours}h · {p.priorite}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Technicien</Label>
              <Select value={form.user_id} onValueChange={(v) => setForm(p => ({ ...p, user_id: v }))}>
                <SelectTrigger data-testid="user-select" className="h-9">
                  <SelectValue placeholder="Choisir..." />
                </SelectTrigger>
                <SelectContent>
                  {techs.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.prenom} {t.nom}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Date</Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm(p => ({ ...p, date: e.target.value }))}
                data-testid="date-input"
                className="h-9"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Titre</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))}
              placeholder="Ex: Maintenance pompe P-12"
              data-testid="title-input"
              className="h-9"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Description (optionnelle)</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))}
              rows={2}
              data-testid="description-input"
              className="text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Durée (h)</Label>
              <Input
                type="number"
                step="0.25"
                min="0.25"
                max="24"
                value={form.duration_hours}
                onChange={(e) => setForm(p => ({ ...p, duration_hours: e.target.value }))}
                data-testid="duration-input"
                className={`h-9 ${isOverloadDay ? 'border-red-500 bg-red-50' : ''}`}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Heure de début (optionnelle)</Label>
              <Input
                type="number"
                step="0.5"
                min="0"
                max="24"
                placeholder="ex: 8.5 = 8h30"
                value={form.start_hour}
                onChange={(e) => setForm(p => ({ ...p, start_hour: e.target.value }))}
                data-testid="start-hour-input"
                className="h-9"
              />
            </div>
          </div>

          {type === 'FREE_TASK' && (
            <div className="space-y-1">
              <Label className="text-xs">Catégorie</Label>
              <div className="grid grid-cols-4 gap-1">
                {CATEGORY_OPTIONS.map(c => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setForm(p => ({ ...p, category: c.value, color: c.color }))}
                    data-testid={`category-${c.value}`}
                    className={`p-2 rounded border-2 text-xs transition ${
                      form.category === c.value ? 'ring-2 ring-blue-500 border-transparent' : 'border-gray-200'
                    }`}
                    style={{ backgroundColor: c.color + '22', color: c.color }}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {isOverloadDay && (
            <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 p-2 rounded border border-red-200" data-testid="overload-warning">
              <AlertCircle size={14} />
              Cette tâche dure {form.duration_hours}h, soit plus que la journée standard (8h).
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={handleSubmit} disabled={loading} data-testid="submit-assignment-btn">
            {loading ? 'Enregistrement...' : (editing ? 'Modifier' : 'Créer')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AssignmentDialog;
