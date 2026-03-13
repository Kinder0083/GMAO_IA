import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Plus, Search, Building, Mail, Phone, MapPin, Pencil, Trash2, LayoutGrid, List, Sparkles, Globe, CreditCard } from 'lucide-react';
import VendorFormDialog from '../components/Vendors/VendorFormDialog';
import VendorAIExtract from '../components/Vendors/VendorAIExtract';
import { vendorsAPI } from '../services/api';
import { useToast } from '../hooks/use-toast';
import OfflineDisabled from '../components/Common/OfflineDisabled';
import { useConfirmDialog } from '../components/ui/confirm-dialog';
import { useVendors } from '../hooks/useVendors';

const CATEGORIE_LABELS = {
  MAINTENANCE: 'Maintenance', FOURNITURES: 'Fournitures', SERVICES: 'Services',
  EQUIPEMENTS: 'Équipements', SOUS_TRAITANCE: 'Sous-traitance', ENERGIE: 'Énergie',
  INFORMATIQUE: 'Informatique', LOGISTIQUE: 'Logistique', NETTOYAGE: 'Nettoyage',
  SECURITE: 'Sécurité', AUTRE: 'Autre'
};

const CONDITIONS_LABELS = {
  '30J_NET': '30j net', '30J_FDM': '30j FDM', '45J_FDM': '45j FDM',
  '60J_FDM': '60j FDM', '90J_FDM': '90j FDM'
};

const Vendors = () => {
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('list'); // 'grid' ou 'list'
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [aiExtractOpen, setAiExtractOpen] = useState(false);
  const [prefillData, setPrefillData] = useState(null);

  // Utiliser le hook temps réel
  const { 
    vendors, 
    loading, 
    refresh: refreshVendors 
  } = useVendors();

  const handleDelete = async (id) => {
    confirm({
      title: 'Supprimer le fournisseur',
      description: 'Êtes-vous sûr de vouloir supprimer ce fournisseur ? Cette action est irréversible.',
      confirmText: 'Supprimer',
      cancelText: 'Annuler',
      variant: 'destructive',
      onConfirm: async () => {
        try {
          await vendorsAPI.delete(id);
          toast({
            title: 'Succès',
            description: 'Fournisseur supprimé'
          });
          refreshVendors();
        } catch (error) {
          toast({
            title: 'Erreur',
            description: 'Impossible de supprimer le fournisseur',
            variant: 'destructive'
          });
        }
      }
    });
  };

  const filteredVendors = vendors.filter(vendor => {
    const search = searchTerm.toLowerCase();
    return (vendor.nom || '').toLowerCase().includes(search) ||
           (vendor.contact || '').toLowerCase().includes(search) ||
           (vendor.specialite || '').toLowerCase().includes(search) ||
           (vendor.categorie || '').toLowerCase().includes(search) ||
           (vendor.ville || '').toLowerCase().includes(search);
  });

  // Calculer les fournisseurs créés ce mois
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const createdThisMonth = vendors.filter(v => {
    const createdDate = new Date(v.dateCreation);
    return createdDate >= startOfMonth;
  }).length;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Fournisseurs</h1>
          <p className="text-gray-600 mt-1">Gérez vos fournisseurs et sous-traitants</p>
        </div>
        <div className="flex gap-2">
          <OfflineDisabled>
          <Button variant="outline" className="border-blue-300 text-blue-600 hover:bg-blue-50" onClick={() => setAiExtractOpen(true)} data-testid="vendor-ai-btn">
            <Sparkles size={18} className="mr-2" />
            Analyse IA
          </Button>
          </OfflineDisabled>
          <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => {
            setSelectedVendor(null);
            setPrefillData(null);
            setFormDialogOpen(true);
          }} data-testid="vendor-new-btn">
            <Plus size={20} className="mr-2" />
            Nouveau fournisseur
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="hover:shadow-lg transition-shadow">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center">
              <p className="text-sm font-medium text-gray-600">Total fournisseurs</p>
              <p className="text-4xl font-bold text-blue-600 mt-2">{vendors.length}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center">
              <p className="text-sm font-medium text-gray-600">Créés ce mois</p>
              <p className="text-4xl font-bold text-green-600 mt-2">{createdThisMonth}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <Input
                placeholder="Rechercher par nom, contact ou spécialité..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant={viewMode === 'grid' ? 'default' : 'outline'}
                onClick={() => setViewMode('grid')}
                className={viewMode === 'grid' ? 'bg-blue-600 hover:bg-blue-700' : ''}
              >
                <LayoutGrid size={20} />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'outline'}
                onClick={() => setViewMode('list')}
                className={viewMode === 'list' ? 'bg-blue-600 hover:bg-blue-700' : ''}
              >
                <List size={20} />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Vendors Display */}
      {loading ? (
        <div className="text-center py-8">
          <p className="text-gray-500">Chargement...</p>
        </div>
      ) : filteredVendors.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-500">Aucun fournisseur trouvé</p>
        </div>
      ) : viewMode === 'grid' ? (
        /* Vue Grille */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredVendors.map((vendor) => (
            <Card key={vendor.id} className="hover:shadow-xl transition-all duration-300">
              <CardHeader>
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg flex items-center justify-center shadow-md">
                    <Building size={24} className="text-white" />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-lg">{vendor.nom}</CardTitle>
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium mt-1 inline-block">
                      {vendor.specialite}
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {/* Contact Person */}
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <p className="text-xs text-gray-600 mb-1">Contact principal</p>
                    <p className="font-medium text-gray-900">{vendor.contact}</p>
                    {vendor.contact_fonction && <p className="text-xs text-gray-500">{vendor.contact_fonction}</p>}
                  </div>

                  {/* Email */}
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <Mail size={16} className="text-gray-500" />
                    <a href={`mailto:${vendor.email}`} className="hover:text-blue-600 truncate">
                      {vendor.email}
                    </a>
                  </div>

                  {/* Phone */}
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <Phone size={16} className="text-gray-500" />
                    <a href={`tel:${vendor.telephone}`} className="hover:text-blue-600">
                      {vendor.telephone}
                    </a>
                  </div>

                  {/* Address */}
                  <div className="flex items-start gap-2 text-sm text-gray-700">
                    <MapPin size={16} className="text-gray-500 mt-0.5" />
                    <span className="flex-1">
                      {vendor.adresse}
                      {vendor.code_postal || vendor.ville ? `, ${[vendor.code_postal, vendor.ville].filter(Boolean).join(' ')}` : ''}
                      {vendor.pays ? ` (${vendor.pays})` : ''}
                    </span>
                  </div>

                  {/* Extra info badges */}
                  <div className="flex flex-wrap gap-1.5">
                    {vendor.categorie && (
                      <Badge variant="outline" className="text-xs">{CATEGORIE_LABELS[vendor.categorie] || vendor.categorie}</Badge>
                    )}
                    {vendor.conditions_paiement && (
                      <Badge variant="outline" className="text-xs bg-gray-50">
                        <CreditCard size={10} className="mr-1" />{CONDITIONS_LABELS[vendor.conditions_paiement] || vendor.conditions_paiement}
                      </Badge>
                    )}
                    {vendor.sous_traitant && (
                      <Badge className="text-xs bg-orange-100 text-orange-700">Sous-traitant</Badge>
                    )}
                    {vendor.site_web && (
                      <a href={vendor.site_web.startsWith('http') ? vendor.site_web : `https://${vendor.site_web}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-500 hover:underline">
                        <Globe size={10} />Web
                      </a>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-3 border-t">
                    <Button 
                      variant="outline" 
                      className="flex-1 hover:bg-green-50 hover:text-green-600"
                      onClick={() => {
                        setSelectedVendor(vendor);
                        setFormDialogOpen(true);
                      }}
                    >
                      <Pencil size={16} className="mr-1" />
                      Modifier
                    </Button>
                    <Button 
                      variant="outline" 
                      className="hover:bg-red-50 hover:text-red-600"
                      onClick={() => handleDelete(vendor.id)}
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        /* Vue Liste */
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Fournisseur
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Contact
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Email / Tél
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Localisation
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Catégorie
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredVendors.map((vendor) => (
                    <tr key={vendor.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg flex items-center justify-center mr-3">
                            <Building size={20} className="text-white" />
                          </div>
                          <div>
                            <div className="font-medium text-gray-900">{vendor.nom}</div>
                            <div className="text-xs text-gray-500">{vendor.specialite}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        <div>{vendor.contact}</div>
                        {vendor.contact_fonction && <div className="text-xs text-gray-400">{vendor.contact_fonction}</div>}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        <a href={`mailto:${vendor.email}`} className="hover:text-blue-600 block">
                          {vendor.email}
                        </a>
                        <a href={`tel:${vendor.telephone}`} className="hover:text-blue-600 text-xs text-gray-500">
                          {vendor.telephone}
                        </a>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {vendor.ville || vendor.pays ? (
                          <span>{[vendor.ville, vendor.pays].filter(Boolean).join(', ')}</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-wrap gap-1">
                          {vendor.categorie && (
                            <Badge variant="outline" className="text-xs">{CATEGORIE_LABELS[vendor.categorie] || vendor.categorie}</Badge>
                          )}
                          {vendor.sous_traitant && (
                            <Badge className="text-xs bg-orange-100 text-orange-700">ST</Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="hover:bg-green-50 hover:text-green-600"
                            onClick={() => {
                              setSelectedVendor(vendor);
                              setFormDialogOpen(true);
                            }}
                          >
                            <Pencil size={16} className="mr-1" />
                            Modifier
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="hover:bg-red-50 hover:text-red-600"
                            onClick={() => handleDelete(vendor.id)}
                          >
                            <Trash2 size={16} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <VendorFormDialog
        open={formDialogOpen}
        onOpenChange={setFormDialogOpen}
        vendor={selectedVendor}
        onSuccess={refreshVendors}
        prefillData={prefillData}
      />

      <VendorAIExtract
        open={aiExtractOpen}
        onClose={() => setAiExtractOpen(false)}
        onCreateFromAI={(data) => {
          setAiExtractOpen(false);
          setPrefillData(data);
          setSelectedVendor(null);
          setFormDialogOpen(true);
        }}
      />
      
      {/* Confirm Dialog */}
      <ConfirmDialog />
    </div>
  );
};

export default Vendors;