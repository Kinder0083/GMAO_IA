import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { accidentAnalysisAPI } from '../services/api';
import { useToast } from '../hooks/use-toast';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Badge } from '../components/ui/badge';
import { GitBranch, Plus, Search, Trash2, Eye, AlertTriangle, Calendar, MapPin, Settings2 } from 'lucide-react';

const GRAVITE_COLORS = {
  FAIBLE: 'bg-green-100 text-green-800',
  MOYENNE: 'bg-yellow-100 text-yellow-800',
  HAUTE: 'bg-orange-100 text-orange-800',
  CRITIQUE: 'bg-red-100 text-red-800',
};

const PHASE_LABELS = {
  QQOQCP: 'QQOQCP',
  '5POURQUOI': '5 Pourquoi',
  ISHIKAWA: 'Ishikawa',
  ALARM: 'ALARM',
  ACTIONS: 'Actions',
  TERMINEE: 'Terminee',
};

export default function AccidentAnalysisPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [analyses, setAnalyses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ titre: '', date_accident: '', lieu: '', description_initiale: '', gravite: 'MOYENNE' });
  const isAdmin = JSON.parse(localStorage.getItem('user') || '{}').role === 'ADMIN';

  const load = useCallback(async () => {
    try {
      const data = await accidentAnalysisAPI.list();
      setAnalyses(data);
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de charger les analyses', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!form.titre) return;
    setCreating(true);
    try {
      const created = await accidentAnalysisAPI.create(form);
      toast({ title: 'Analyse creee' });
      setShowCreate(false);
      setForm({ titre: '', date_accident: '', lieu: '', description_initiale: '', gravite: 'MOYENNE' });
      navigate(`/accident-analysis/${created.id}`);
    } catch {
      toast({ title: 'Erreur', variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Supprimer cette analyse ?')) return;
    try {
      await accidentAnalysisAPI.delete(id);
      toast({ title: 'Analyse supprimee' });
      load();
    } catch {
      toast({ title: 'Erreur', variant: 'destructive' });
    }
  };

  const filtered = analyses.filter(a =>
    (a.titre || '').toLowerCase().includes(search.toLowerCase()) ||
    (a.lieu || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50 py-6 px-4 sm:px-6 lg:px-8" data-testid="accident-analysis-page">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <GitBranch className="h-6 w-6 text-orange-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Arbre des Causes</h1>
              <p className="text-sm text-gray-500">Analyse des accidents de maintenance</p>
            </div>
          </div>
          <div className="flex gap-2">
            {isAdmin && (
              <Button variant="outline" data-testid="admin-config-btn" onClick={() => navigate('/accident-analysis/admin')}>
                <Settings2 className="h-4 w-4 mr-2" /> Modifier
              </Button>
            )}
            <Button data-testid="create-analysis-btn" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-2" /> Nouvelle analyse
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="mb-4 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            data-testid="search-analysis"
            placeholder="Rechercher par titre ou lieu..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* List */}
        {loading ? (
          <div className="text-center py-12 text-gray-500">Chargement...</div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <AlertTriangle className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">{search ? 'Aucune analyse trouvee' : 'Aucune analyse d\'accident. Cliquez sur "Nouvelle analyse" pour commencer.'}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {filtered.map(a => (
              <Card
                key={a.id}
                data-testid={`analysis-card-${a.id}`}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => navigate(`/accident-analysis/${a.id}`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-gray-900 truncate">{a.titre}</h3>
                        <Badge className={GRAVITE_COLORS[a.gravite] || 'bg-gray-100'}>
                          {a.gravite}
                        </Badge>
                        <Badge variant="outline">
                          {PHASE_LABELS[a.phase_actuelle] || a.phase_actuelle}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        {a.date_accident && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {a.date_accident}
                          </span>
                        )}
                        {a.lieu && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {a.lieu}
                          </span>
                        )}
                        {a.created_by_name && <span>Par {a.created_by_name}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <Button variant="ghost" size="icon" onClick={e => { e.stopPropagation(); navigate(`/accident-analysis/${a.id}`); }}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={e => handleDelete(a.id, e)} data-testid={`delete-analysis-${a.id}`}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-lg" data-testid="create-analysis-dialog">
          <DialogHeader>
            <DialogTitle>Nouvelle analyse d'accident</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Titre *</Label>
              <Input data-testid="analysis-titre" value={form.titre} onChange={e => setForm(f => ({ ...f, titre: e.target.value }))} placeholder="Ex: Chute d'un equipement lourd" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Date de l'accident</Label>
                <Input data-testid="analysis-date" type="date" value={form.date_accident} onChange={e => setForm(f => ({ ...f, date_accident: e.target.value }))} />
              </div>
              <div>
                <Label>Gravite</Label>
                <Select value={form.gravite} onValueChange={v => setForm(f => ({ ...f, gravite: v }))}>
                  <SelectTrigger data-testid="analysis-gravite">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FAIBLE">Faible</SelectItem>
                    <SelectItem value="MOYENNE">Moyenne</SelectItem>
                    <SelectItem value="HAUTE">Haute</SelectItem>
                    <SelectItem value="CRITIQUE">Critique</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Lieu</Label>
              <Input data-testid="analysis-lieu" value={form.lieu} onChange={e => setForm(f => ({ ...f, lieu: e.target.value }))} placeholder="Ex: Atelier mecanique" />
            </div>
            <div>
              <Label>Description initiale</Label>
              <textarea
                data-testid="analysis-description"
                className="w-full border rounded-md p-2 text-sm min-h-[80px] resize-none"
                value={form.description_initiale}
                onChange={e => setForm(f => ({ ...f, description_initiale: e.target.value }))}
                placeholder="Decrivez brievement l'accident..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Annuler</Button>
            <Button data-testid="submit-analysis" onClick={handleCreate} disabled={creating || !form.titre}>
              {creating ? 'Creation...' : 'Demarrer l\'analyse'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
