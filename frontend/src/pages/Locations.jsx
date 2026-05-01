import React, { useState } from 'react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Plus, Search, MapPin, Pencil, Trash2, LayoutGrid, List, ChevronRight, ChevronDown } from 'lucide-react';
import LocationFormDialog from '../components/Locations/LocationFormDialog';
import { locationsAPI } from '../services/api';
import { useToast } from '../hooks/use-toast';
import { useConfirmDialog } from '../components/ui/confirm-dialog';
import { formatErrorMessage } from '../utils/errorFormatter';
import { useLocations } from '../hooks/useLocations';

const Locations = () => {
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('grid');
  const [expandedZones, setExpandedZones] = useState(new Set());
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [parentForNew, setParentForNew] = useState(null);

  // Utiliser le hook temps réel
  const { locations, loading, refresh: loadLocations } = useLocations();

  const handleDelete = async (id) => {
    confirm({
      title: 'Supprimer la zone',
      description: 'Êtes-vous sûr de vouloir supprimer cette zone ? Cette action est irréversible.',
      confirmText: 'Supprimer',
      cancelText: 'Annuler',
      variant: 'destructive',
      onConfirm: async () => {
        try {
          await locationsAPI.delete(id);
          toast({
            title: 'Succès',
            description: 'Zone supprimée'
          });
          loadLocations();
        } catch (error) {
          toast({
            title: 'Erreur',
            description: formatErrorMessage(error, 'Impossible de supprimer la zone'),
            variant: 'destructive'
          });
        }
      }
    });
  };

  const handleAddSubZone = (parentLocation) => {
    setParentForNew(parentLocation);
    setSelectedLocation(null);
    setFormDialogOpen(true);
  };

  const toggleExpand = (zoneId) => {
    const newExpanded = new Set(expandedZones);
    if (newExpanded.has(zoneId)) {
      newExpanded.delete(zoneId);
    } else {
      newExpanded.add(zoneId);
    }
    setExpandedZones(newExpanded);
  };

  const filteredLocations = locations.filter(loc => {
    const searchLower = searchTerm.toLowerCase();
    return loc.nom.toLowerCase().includes(searchLower) ||
           (loc.ville && loc.ville.toLowerCase().includes(searchLower)) ||
           (loc.type && loc.type.toLowerCase().includes(searchLower));
  });

  const rootZones = filteredLocations.filter(loc => !loc.parent_id);
  const totalZones = locations.length;

  const buildHierarchy = (parentId = null, level = 0) => {
    return filteredLocations
      .filter(loc => loc.parent_id === parentId)
      .map(loc => ({
        ...loc,
        children: buildHierarchy(loc.id, level + 1),
        level
      }));
  };

  const hierarchy = buildHierarchy();

  const renderZoneCard = (zone) => {
    const hasChildren = zone.children && zone.children.length > 0;
    const isExpanded = expandedZones.has(zone.id);
    const indentClass = zone.level === 0 ? '' : zone.level === 1 ? 'ml-8' : 'ml-16';

    return (
      <div key={zone.id} className={indentClass}>
        <Card 
          className="hover:shadow-xl transition-all duration-300 mb-4"
          data-ai-type="LOCATION"
          data-ai-id={zone.id}
          data-ai-name={zone.nom}
          data-zone-id={zone.id}
          data-zone-name={zone.nom}
          data-zone-parent-id={zone.parent_id || ''}
          data-zone-level={zone.level}
          data-ai-extra={JSON.stringify({ 
            level: zone.level, 
            type: zone.type,
            parent: zone.parent?.nom,
            ville: zone.ville 
          })}
        >
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              {hasChildren && (
                <button
                  onClick={() => toggleExpand(zone.id)}
                  className="mt-1 text-gray-500 hover:text-blue-600 transition-colors"
                >
                  {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                </button>
              )}
              {!hasChildren && <div className="w-5" />}

              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg flex items-center justify-center shadow-md flex-shrink-0">
                <MapPin size={24} className="text-white" />
              </div>

              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-lg font-bold text-gray-900">{zone.nom}</h3>
                  {zone.level > 0 && (
                    <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">
                      Niveau {zone.level}
                    </span>
                  )}
                  {zone.type && (
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                      {zone.type}
                    </span>
                  )}
                </div>

                {zone.parent && (
                  <p className="text-sm text-gray-600 mb-2">
                    📍 Parent: {zone.parent.nom}
                  </p>
                )}

                {zone.adresse && (
                  <p className="text-sm text-gray-600 mb-1">{zone.adresse}</p>
                )}
                {zone.ville && zone.codePostal && (
                  <p className="text-sm text-gray-600">{zone.codePostal} {zone.ville}</p>
                )}

                <div className="flex gap-2 mt-4">
                  {zone.level < 2 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="hover:bg-purple-50 hover:text-purple-600"
                      onClick={() => handleAddSubZone(zone)}
                    >
                      <Plus size={16} className="mr-1" />
                      Sous-zone
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="hover:bg-green-50 hover:text-green-600"
                    onClick={() => {
                      setSelectedLocation(zone);
                      setParentForNew(null);
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
                    onClick={() => handleDelete(zone.id)}
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {hasChildren && isExpanded && (
          <div className="ml-4 border-l-2 border-blue-200 pl-4">
            {zone.children.map(child => renderZoneCard(child))}
          </div>
        )}
      </div>
    );
  };

  const renderZoneRow = (zone, depth = 0) => {
    const hasChildren = zone.children && zone.children.length > 0;
    const isExpanded = expandedZones.has(zone.id);
    const indent = depth * 40;

    return (
      <React.Fragment key={zone.id}>
        <tr className="hover:bg-gray-50 transition-colors border-b">
          <td className="px-6 py-4" style={{ paddingLeft: `${24 + indent}px` }}>
            <div className="flex items-center">
              {hasChildren ? (
                <button
                  onClick={() => toggleExpand(zone.id)}
                  className="mr-2 text-gray-500 hover:text-blue-600"
                >
                  {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                </button>
              ) : (
                <div className="w-[26px] mr-2" />
              )}
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-700 rounded flex items-center justify-center mr-3">
                <MapPin size={16} className="text-white" />
              </div>
              <div>
                <div className="font-medium text-gray-900">{zone.nom}</div>
                {zone.parent && (
                  <div className="text-xs text-gray-500">Parent: {zone.parent.nom}</div>
                )}
              </div>
            </div>
          </td>
          <td className="px-6 py-4 text-sm text-gray-700">
            {zone.type && (
              <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">
                {zone.type}
              </span>
            )}
          </td>
          <td className="px-6 py-4 text-sm text-gray-700">
            {zone.ville || '-'}
          </td>
          <td className="px-6 py-4 text-sm text-gray-700">
            {zone.codePostal || '-'}
          </td>
          <td className="px-6 py-4 text-sm">
            <span className={`px-2 py-1 rounded text-xs ${
              zone.level === 0 ? 'bg-green-100 text-green-700' :
              zone.level === 1 ? 'bg-yellow-100 text-yellow-700' :
              'bg-orange-100 text-orange-700'
            }`}>
              Niveau {zone.level}
            </span>
          </td>
          <td className="px-6 py-4 text-right">
            <div className="flex justify-end gap-2">
              {zone.level < 2 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="hover:bg-purple-50 hover:text-purple-600"
                  onClick={() => handleAddSubZone(zone)}
                >
                  <Plus size={14} />
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="hover:bg-green-50 hover:text-green-600"
                onClick={() => {
                  setSelectedLocation(zone);
                  setParentForNew(null);
                  setFormDialogOpen(true);
                }}
              >
                <Pencil size={14} />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="hover:bg-red-50 hover:text-red-600"
                onClick={() => handleDelete(zone.id)}
              >
                <Trash2 size={14} />
              </Button>
            </div>
          </td>
        </tr>
        {hasChildren && isExpanded && zone.children.map(child => renderZoneRow(child, depth + 1))}
      </React.Fragment>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Zones</h1>
          <p className="text-gray-600 mt-1">Gérez vos zones et sous-zones</p>
        </div>
        <Button
          className="bg-blue-600 hover:bg-blue-700 text-white"
          onClick={() => {
            setSelectedLocation(null);
            setParentForNew(null);
            setFormDialogOpen(true);
          }}
        >
          <Plus size={20} className="mr-2" />
          Nouvelle zone
        </Button>
      </div>

      <Card className="hover:shadow-lg transition-shadow">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center text-center">
            <p className="text-sm font-medium text-gray-600">Total zones (incluant sous-zones)</p>
            <p className="text-4xl font-bold text-blue-600 mt-2">{totalZones}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <Input
                placeholder="Rechercher une zone..."
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

      {loading ? (
        <div className="text-center py-8">
          <p className="text-gray-500">Chargement...</p>
        </div>
      ) : filteredLocations.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-500">Aucune zone trouvée</p>
        </div>
      ) : viewMode === 'grid' ? (
        <div>
          {hierarchy.map(zone => renderZoneCard(zone))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Zone
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Ville
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Code Postal
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Niveau
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {hierarchy.map(zone => renderZoneRow(zone))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <LocationFormDialog
        open={formDialogOpen}
        onOpenChange={(open) => {
          setFormDialogOpen(open);
          if (!open) {
            setParentForNew(null);
          }
        }}
        location={selectedLocation}
        parentLocation={parentForNew}
        onSuccess={loadLocations}
        allLocations={locations}
      />
      
      {/* Confirm Dialog */}
      <ConfirmDialog />
    </div>
  );
};

export default Locations;
