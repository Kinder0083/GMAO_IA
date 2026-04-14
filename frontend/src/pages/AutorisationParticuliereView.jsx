import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { autorisationsAPI } from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Plus, Search, FileText, Trash2, Printer, ArrowLeft } from 'lucide-react';
import { useToast } from '../hooks/use-toast';
import AutorisationParticulierePrintDialog from '../components/AutorisationParticulierePrintDialog';

const AutorisationParticuliereView = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [autorisations, setAutorisations] = useState([]);
  const [filteredAutorisations, setFilteredAutorisations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showDialog, setShowDialog] = useState(false);
  const [selectedAutorisation, setSelectedAutorisation] = useState(null);

  // Récupérer le poleId depuis le state de navigation
  const fromPoleId = location.state?.fromPoleId;

  useEffect(() => {
    loadAutorisations();
  }, []);

  useEffect(() => {
    filterAutorisations();
  }, [searchTerm, autorisations]);

  const loadAutorisations = async () => {
    try {
      const data = await autorisationsAPI.getAll();
      // Trier par numéro décroissant (plus récent en premier)
      const sorted = data.sort((a, b) => b.numero - a.numero);
      setAutorisations(sorted);
      setLoading(false);
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Erreur lors du chargement des autorisations',
        variant: 'destructive'
      });
      console.error(error);
      setLoading(false);
    }
  };

  const filterAutorisations = () => {
    if (!searchTerm) {
      setFilteredAutorisations(autorisations);
      return;
    }

    const filtered = autorisations.filter(auto => {
      const search = searchTerm.toLowerCase();
      return (
        auto.numero.toString().includes(search) ||
        auto.service_demandeur?.toLowerCase().includes(search) ||
        auto.responsable?.toLowerCase().includes(search) ||
        auto.lieu_travaux?.toLowerCase().includes(search)
      );
    });
    setFilteredAutorisations(filtered);
  };

  const handleDelete = async (id, numero) => {
    if (!window.confirm(`Êtes-vous sûr de vouloir supprimer l'autorisation N°${numero} ?`)) {
      return;
    }

    try {
      await autorisationsAPI.delete(id);
      toast({
        title: 'Succès',
        description: 'Autorisation supprimée'
      });
      loadAutorisations();
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Erreur lors de la suppression',
        variant: 'destructive'
      });
      console.error(error);
    }
  };

  const handlePrintPDF = (id) => {
    const pdfUrl = autorisationsAPI.generatePDF(id);
    window.open(pdfUrl, '_blank');
  };

  const getStatusBadge = (statut) => {
    const colors = {
      'BROUILLON': 'bg-yellow-100 text-yellow-800',
      'VALIDE': 'bg-green-100 text-green-800'
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${colors[statut] || 'bg-gray-100 text-gray-800'}`}>
        {statut}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            onClick={() => fromPoleId ? navigate(`/documentations/${fromPoleId}`) : navigate('/documentations')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Autorisations Particulières de Travaux</h1>
            <p className="text-gray-600 mt-1">Gestion des autorisations - Format MAINT_FE_003_V03</p>
          </div>
        </div>
        <Button onClick={() => { setSelectedAutorisation(null); setShowDialog(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Nouvelle Autorisation
        </Button>
      </div>

      {/* Statistiques */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{autorisations.length}</div>
            <div className="text-sm text-gray-600">Total des autorisations</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {autorisations.filter(a => a.statut === 'BROUILLON').length}
            </div>
            <div className="text-sm text-gray-600">En brouillon</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {autorisations.filter(a => a.statut === 'VALIDE').length}
            </div>
            <div className="text-sm text-gray-600">Validées</div>
          </CardContent>
        </Card>
      </div>

      {/* Barre de recherche */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Rechercher par numéro, service, responsable ou lieu..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Liste des autorisations */}
      {filteredAutorisations.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto mb-4 text-gray-400" />
            <p className="text-gray-600">
              {searchTerm ? 'Aucune autorisation ne correspond à votre recherche' : 'Aucune autorisation créée'}
            </p>
            {!searchTerm && (
              <Button onClick={() => { setSelectedAutorisation(null); setShowDialog(true); }} className="mt-4">
                <Plus className="h-4 w-4 mr-2" />
                Créer la première autorisation
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredAutorisations.map((autorisation) => (
            <Card key={autorisation.id} className="hover:shadow-lg transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-bold">N° {autorisation.numero}</h3>
                      {getStatusBadge(autorisation.statut)}
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="font-semibold">Service :</span> {autorisation.service_demandeur}
                      </div>
                      <div>
                        <span className="font-semibold">Responsable :</span> {autorisation.responsable}
                      </div>
                      <div>
                        <span className="font-semibold">Lieu :</span> {autorisation.lieu_travaux}
                      </div>
                      <div>
                        <span className="font-semibold">Horaires :</span> {autorisation.horaire_debut} - {autorisation.horaire_fin}
                      </div>
                    </div>
                    {autorisation.personnel_autorise && autorisation.personnel_autorise.length > 0 && (
                      <div className="mt-3 text-sm">
                        <span className="font-semibold">Personnel autorisé :</span>{' '}
                        {autorisation.personnel_autorise.filter(p => p.nom).map(p => p.nom).join(', ')}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 ml-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePrintPDF(autorisation.id)}
                      title="Imprimer le PDF"
                    >
                      <Printer className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setSelectedAutorisation(autorisation); setShowDialog(true); }}
                      title="Ouvrir / Modifier"
                    >
                      <FileText className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(autorisation.id, autorisation.numero)}
                      title="Supprimer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog Autorisation Particulière V4 */}
      <AutorisationParticulierePrintDialog
        key={selectedAutorisation?.id || 'new'}
        open={showDialog}
        onClose={() => { setShowDialog(false); setSelectedAutorisation(null); }}
        poleId={fromPoleId || null}
        prefillData={selectedAutorisation}
        onSaved={() => { loadAutorisations(); }}
      />
    </div>
  );
};

export default AutorisationParticuliereView;