import React, { useState } from 'react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { ChevronRight, ChevronDown, Plus, Edit, Trash2, Eye, Cog, Shield, GripVertical, ArrowUp, ArrowDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  DndContext,
  closestCenter
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import QuickStatusChanger from './QuickStatusChanger';

const EquipmentTreeNode = ({ 
  equipment, 
  level = 0, 
  onEdit, 
  onDelete, 
  onAddChild,
  onViewDetails,
  allEquipments,
  onStatusChange,
  onViewInventory,
  isReordering,
  index,
  totalCount,
  onMoveUp,
  onMoveDown
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const navigate = useNavigate();

  const children = allEquipments.filter(eq => eq.parent_id === equipment.id);

  const getStatusColor = (status) => {
    const colors = {
      'OPERATIONNEL': 'bg-green-100 text-green-700',
      'EN_FONCTIONNEMENT': 'bg-emerald-100 text-emerald-700',
      'A_LARRET': 'bg-gray-100 text-gray-700',
      'EN_MAINTENANCE': 'bg-yellow-100 text-yellow-700',
      'EN_CT': 'bg-purple-100 text-purple-700',
      'HORS_SERVICE': 'bg-red-100 text-red-700',
      'DEGRADE': 'bg-blue-100 text-blue-700',
      'ALERTE_S_EQUIP': 'bg-pink-100 text-pink-700'
    };
    return colors[status] || 'bg-gray-100 text-gray-700';
  };

  const getStatusLabel = (status) => {
    const labels = {
      'OPERATIONNEL': 'Opérationnel',
      'EN_FONCTIONNEMENT': 'En Fonctionnement',
      'A_LARRET': 'A l\'arrêt',
      'EN_MAINTENANCE': 'En maintenance',
      'EN_CT': 'En C.T',
      'HORS_SERVICE': 'Hors service',
      'DEGRADE': 'Dégradé',
      'ALERTE_S_EQUIP': 'Alerte S.Équip'
    };
    return labels[status] || status;
  };

  const indentWidth = level * 40;

  return (
    <div>
      <Card className={`mb-2 hover:shadow-md transition-shadow ${isReordering && level === 0 ? 'border-2 border-dashed border-blue-300 bg-blue-50/30' : ''}`}>
        <CardContent className="py-3 px-4">
          <div className="flex items-center gap-2" style={{ marginLeft: `${indentWidth}px` }}>
            {/* Contrôles de réordonnement (uniquement racine) */}
            {isReordering && level === 0 && (
              <div className="flex items-center gap-1 mr-1 flex-shrink-0">
                <span className="bg-blue-600 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
                  {index + 1}
                </span>
                <button
                  onClick={() => onMoveUp(index)}
                  disabled={index === 0}
                  className="bg-gray-700 text-white rounded-md p-1 hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Monter"
                  data-testid={`tree-move-up-${equipment.id}`}
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  onClick={() => onMoveDown(index)}
                  disabled={index === totalCount - 1}
                  className="bg-gray-700 text-white rounded-md p-1 hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Descendre"
                  data-testid={`tree-move-down-${equipment.id}`}
                >
                  <ArrowDown size={14} />
                </button>
              </div>
            )}

            {level > 0 && (
              <div className="flex items-center">
                <div className="w-6 h-px bg-gray-300"></div>
              </div>
            )}

            {children.length > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => setIsExpanded(!isExpanded)}
              >
                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </Button>
            ) : (
              <div className="w-6"></div>
            )}

            <div className="flex-1 flex items-center gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-900">{equipment.nom}</h3>
                  {equipment.loto_active && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-600 text-white animate-pulse" data-testid={`loto-badge-${equipment.id}`}>
                      <Shield size={12} /> CONSIGNE
                    </span>
                  )}
                  {!isReordering && (
                    <QuickStatusChanger 
                      equipment={equipment}
                      onStatusChange={onStatusChange}
                    />
                  )}
                </div>
                <div className="flex gap-4 mt-1 text-sm text-gray-600">
                  {equipment.categorie && <span>Catégorie: {equipment.categorie}</span>}
                  {equipment.numeroSerie && <span>N° Série: {equipment.numeroSerie}</span>}
                  {equipment.emplacement && (
                    <span>Emplacement: {equipment.emplacement.nom}</span>
                  )}
                </div>
              </div>

              {!isReordering && (
                <div className="flex gap-2 flex-shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => navigate(`/assets/${equipment.id}`)} className="hover:bg-blue-50 h-8 w-8 p-0" title="Voir les détails">
                    <Eye size={16} />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onAddChild(equipment)} className="hover:bg-green-50 h-8 w-8 p-0" title="Ajouter un sous-équipement">
                    <Plus size={16} />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onEdit(equipment)} className="hover:bg-yellow-50 h-8 w-8 p-0" title="Modifier">
                    <Edit size={16} />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onViewInventory(equipment)} className="hover:bg-purple-50 h-8 w-8 p-0" title="Voir les pièces de l'inventaire">
                    <Cog size={16} />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onDelete(equipment)} className="hover:bg-red-50 h-8 w-8 p-0" title="Supprimer">
                    <Trash2 size={16} />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {isExpanded && children.length > 0 && !isReordering && (
        <div>
          {children.map(child => (
            <EquipmentTreeNode
              key={child.id}
              equipment={child}
              level={level + 1}
              onEdit={onEdit}
              onDelete={onDelete}
              onAddChild={onAddChild}
              onViewDetails={onViewDetails}
              onStatusChange={onStatusChange}
              onViewInventory={onViewInventory}
              allEquipments={allEquipments}
              isReordering={false}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// Wrapper sortable pour le drag & drop en mode arborescence
const SortableTreeNode = ({ equipment, ...props }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: equipment.id, disabled: !props.isReordering });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 'auto'
  };

  return (
    <div ref={setNodeRef} style={style} className="relative">
      {props.isReordering && (
        <div
          {...attributes}
          {...listeners}
          className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-8 bg-blue-600 text-white rounded-md p-1.5 cursor-grab active:cursor-grabbing hover:bg-blue-700 shadow-md z-10"
          title="Glisser-déposer"
          data-testid={`tree-drag-handle-${equipment.id}`}
        >
          <GripVertical size={14} />
        </div>
      )}
      <EquipmentTreeNode equipment={equipment} {...props} />
    </div>
  );
};

const EquipmentTreeView = ({ 
  equipments, onEdit, onDelete, onAddChild, onViewDetails, onStatusChange, onViewInventory,
  isReordering, orderedEquipments, sensors, onDragEnd, onMoveUp, onMoveDown
}) => {
  const rootEquipments = isReordering ? orderedEquipments : equipments.filter(eq => !eq.parent_id);

  if (rootEquipments.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        Aucun équipement trouvé
      </div>
    );
  }

  if (isReordering) {
    return (
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={rootEquipments.map(eq => eq.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2 pl-10">
            {rootEquipments.map((equipment, index) => (
              <SortableTreeNode
                key={equipment.id}
                equipment={equipment}
                level={0}
                onEdit={onEdit}
                onDelete={onDelete}
                onAddChild={onAddChild}
                onViewDetails={onViewDetails}
                onStatusChange={onStatusChange}
                onViewInventory={onViewInventory}
                allEquipments={equipments}
                isReordering={true}
                index={index}
                totalCount={rootEquipments.length}
                onMoveUp={onMoveUp}
                onMoveDown={onMoveDown}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    );
  }

  return (
    <div className="space-y-2">
      {rootEquipments.map(equipment => (
        <EquipmentTreeNode
          key={equipment.id}
          equipment={equipment}
          level={0}
          onEdit={onEdit}
          onDelete={onDelete}
          onAddChild={onAddChild}
          onViewDetails={onViewDetails}
          onStatusChange={onStatusChange}
          onViewInventory={onViewInventory}
          allEquipments={equipments}
          isReordering={false}
        />
      ))}
    </div>
  );
};

export default EquipmentTreeView;
