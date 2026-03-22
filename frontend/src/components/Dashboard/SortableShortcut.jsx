import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Pencil, Trash2, ExternalLink } from 'lucide-react';
import { Button } from '../ui/button';
import * as LucideIcons from 'lucide-react';

const ICON_SIZES = {
  small: { icon: 28, container: 48, text: 'text-[10px]', width: 80 },
  medium: { icon: 40, container: 56, text: 'text-xs', width: 100 },
  large: { icon: 56, container: 72, text: 'text-sm', width: 120 },
};

function getIcon(iconName, size, customIconUrl) {
  if (customIconUrl) {
    return <img src={customIconUrl} alt="" className="object-contain rounded" style={{ width: size, height: size }} />;
  }
  const IconComp = LucideIcons[iconName];
  if (IconComp) return <IconComp size={size} className="text-blue-600" />;
  return <ExternalLink size={size} className="text-gray-500" />;
}

const SortableShortcut = ({ item, isEditMode, onDelete, onEdit }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: !isEditMode });

  const navigate = useNavigate();
  const sizeConfig = ICON_SIZES[item.iconSize] || ICON_SIZES.medium;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 1,
  };

  const handleClick = () => {
    if (isEditMode) return;
    if (item.targetType === 'url') {
      window.open(item.target, '_blank', 'noopener,noreferrer');
    } else {
      navigate(item.target);
    }
  };

  const labelAbove = item.labelPosition === 'above';

  return (
    <div
      ref={setNodeRef}
      className={`relative flex flex-col items-center justify-center p-2 rounded-lg transition-all group select-none ${
        isEditMode ? 'ring-1 ring-dashed ring-blue-300 bg-blue-50/30' : 'hover:bg-gray-100 cursor-pointer'
      }`}
      data-testid={`shortcut-${item.id}`}
      onClick={handleClick}
      style={{ ...style, width: sizeConfig.width, minHeight: sizeConfig.container + 30 }}
    >
      {/* Drag handle + action buttons in edit mode */}
      {isEditMode && (
        <div className="absolute -top-1 -right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5 bg-white shadow-sm border"
            onClick={(e) => { e.stopPropagation(); onEdit(item); }}
            data-testid={`shortcut-edit-${item.id}`}
          >
            <Pencil className="h-3 w-3 text-blue-600" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5 bg-white shadow-sm border"
            onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
            data-testid={`shortcut-delete-${item.id}`}
          >
            <Trash2 className="h-3 w-3 text-red-500" />
          </Button>
        </div>
      )}
      {isEditMode && (
        <div
          {...attributes}
          {...listeners}
          className="absolute -top-1 -left-1 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity z-10"
        >
          <div className="h-5 w-5 bg-white shadow-sm border rounded flex items-center justify-center">
            <GripVertical className="h-3 w-3 text-gray-400" />
          </div>
        </div>
      )}

      {/* Label above */}
      {labelAbove && (
        <span className={`${sizeConfig.text} text-gray-700 font-medium text-center leading-tight mb-1 w-full line-clamp-2`} title={item.name}>
          {item.name}
        </span>
      )}

      {/* Icon */}
      <div className="flex items-center justify-center flex-shrink-0" style={{ width: sizeConfig.container, height: sizeConfig.container }}>
        {getIcon(item.icon, sizeConfig.icon, item.customIconUrl)}
      </div>

      {/* Label below */}
      {!labelAbove && (
        <span className={`${sizeConfig.text} text-gray-700 font-medium text-center leading-tight mt-1 w-full line-clamp-2`} title={item.name}>
          {item.name}
        </span>
      )}

      {/* URL indicator */}
      {item.targetType === 'url' && !isEditMode && (
        <ExternalLink className="absolute top-1 right-1 h-3 w-3 text-gray-400" />
      )}
    </div>
  );
};

export { ICON_SIZES };
export default SortableShortcut;
