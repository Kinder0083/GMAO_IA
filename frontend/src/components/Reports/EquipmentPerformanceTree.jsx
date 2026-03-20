import React, { useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { Button } from '../ui/button';

const EquipmentPerformanceNode = ({ 
  equipment, 
  level = 0, 
  allEquipments,
  equipementStats
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Récupérer les enfants de cet équipement
  const children = allEquipments.filter(eq => eq.parent_id === equipment.id);

  // Calculer la disponibilité
  const getAvailability = (status) => {
    switch(status) {
      case 'OPERATIONNEL':
      case 'EN_FONCTIONNEMENT':
        return 95;
      case 'EN_MAINTENANCE':
      case 'EN_CT':
        return 70;
      case 'DEGRADE':
      case 'ALERTE_S_EQUIP':
        return 50;
      case 'A_LARRET':
        return 30;
      case 'HORS_SERVICE':
        return 0;
      default:
        return 0;
    }
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      'OPERATIONNEL': { label: 'Opérationnel', color: 'bg-green-100 text-green-700' },
      'EN_FONCTIONNEMENT': { label: 'En Fonctionnement', color: 'bg-emerald-100 text-emerald-700' },
      'A_LARRET': { label: 'À l\'arrêt', color: 'bg-gray-100 text-gray-700' },
      'EN_MAINTENANCE': { label: 'En maintenance', color: 'bg-yellow-100 text-yellow-700' },
      'EN_CT': { label: 'En C.T', color: 'bg-purple-100 text-purple-700' },
      'HORS_SERVICE': { label: 'Hors service', color: 'bg-red-100 text-red-700' },
      'DEGRADE': { label: 'Dégradé', color: 'bg-blue-100 text-blue-700' },
      'ALERTE_S_EQUIP': { label: 'Alerte S.Équip', color: 'bg-pink-100 text-pink-700' }
    };
    const config = statusConfig[status] || { label: status, color: 'bg-gray-100 text-gray-700' };
    return (
      <span className={`px-2 py-1 rounded text-xs font-medium ${config.color}`}>
        {config.label}
      </span>
    );
  };

  const availability = getAvailability(equipment.statut);
  const stats = equipementStats[equipment.id] || { interventions: 0, temps_total: 0 };
  const indentWidth = level * 32;

  return (
    <>
      <tr className="border-b hover:bg-gray-50 transition-colors">
        {/* Nom avec indentation et chevron */}
        <td className="py-3 px-4">
          <div className="flex items-center" style={{ paddingLeft: `${indentWidth}px` }}>
            {/* Ligne de connexion pour les sous-équipements */}
            {level > 0 && (
              <div className="w-4 h-px bg-gray-300 mr-1"></div>
            )}
            
            {/* Bouton expand/collapse */}
            {children.length > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 mr-2"
                onClick={() => setIsExpanded(!isExpanded)}
              >
                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </Button>
            ) : (
              <div className="w-8"></div>
            )}
            
            <span className={`text-sm font-medium ${level === 0 ? 'text-gray-900' : 'text-gray-700'}`}>
              {equipment.nom}
            </span>
            {children.length > 0 && (
              <span className="ml-2 text-xs text-gray-400">
                ({children.length} sous-équip.)
              </span>
            )}
          </div>
        </td>
        
        {/* Catégorie */}
        <td className="py-3 px-4 text-sm text-gray-700">
          {equipment.categorie || '-'}
        </td>
        
        {/* Statut */}
        <td className="py-3 px-4">
          {getStatusBadge(equipment.statut)}
        </td>
        
        {/* Dernière maintenance */}
        <td className="py-3 px-4 text-sm text-gray-700">
          {equipment.derniereMaintenance || '-'}
        </td>
        
        {/* Coût d'achat */}
        <td className="py-3 px-4 text-sm text-gray-700">
          {(equipment.coutAchat || 0).toLocaleString('fr-FR')} €
        </td>

        {/* Interventions sur la période */}
        <td className="py-3 px-4 text-sm text-center">
          {stats.interventions > 0 ? (
            <div>
              <span className="font-semibold text-gray-900">{stats.interventions}</span>
              {stats.temps_total > 0 && (
                <span className="text-xs text-gray-500 ml-1">({stats.temps_total}h)</span>
              )}
            </div>
          ) : (
            <span className="text-gray-400">-</span>
          )}
        </td>

        {/* Disponibilité */}
        <td className="py-3 px-4">
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-gray-200 rounded-full h-2 max-w-[100px]">
              <div
                className={`h-2 rounded-full ${
                  availability >= 90 ? 'bg-green-500' :
                  availability >= 70 ? 'bg-orange-500' : 'bg-red-500'
                }`}
                style={{ width: `${availability}%` }}
              ></div>
            </div>
            <span className="text-sm font-medium text-gray-900">{availability}%</span>
          </div>
        </td>
      </tr>
      
      {/* Enfants (récursif) */}
      {isExpanded && children.map(child => (
        <EquipmentPerformanceNode
          key={child.id}
          equipment={child}
          level={level + 1}
          allEquipments={allEquipments}
          equipementStats={equipementStats}
        />
      ))}
    </>
  );
};

const EquipmentPerformanceTree = ({ equipments, equipementStats = {} }) => {
  // Filtrer uniquement les équipements racines (sans parent)
  const rootEquipments = equipments.filter(eq => !eq.parent_id);

  if (rootEquipments.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        Aucun équipement trouvé
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b">
            <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Équipement</th>
            <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Catégorie</th>
            <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Statut</th>
            <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Dernière maintenance</th>
            <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Coût d&apos;achat</th>
            <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700">Interventions</th>
            <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Disponibilité</th>
          </tr>
        </thead>
        <tbody>
          {rootEquipments.map(equipment => (
            <EquipmentPerformanceNode
              key={equipment.id}
              equipment={equipment}
              level={0}
              allEquipments={equipments}
              equipementStats={equipementStats}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default EquipmentPerformanceTree;
