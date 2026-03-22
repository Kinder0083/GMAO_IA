import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Pencil, Trash2, ExternalLink } from 'lucide-react';
import { Button } from '../ui/button';
import * as LucideIcons from 'lucide-react';

const ICON_SIZES = {
  small: { card: 64, icon: 36, text: 'text-[10px]' },
  medium: { card: 88, icon: 52, text: 'text-xs' },
  large: { card: 116, icon: 72, text: 'text-sm' },
};

function getIcon(iconName, size, customIconUrl) {
  if (customIconUrl) {
    return <img src={customIconUrl} alt="" className="object-cover rounded" style={{ width: size, height: size }} />;
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
  const sz = ICON_SIZES[item.iconSize] || ICON_SIZES.medium;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 1,
    width: sz.card,
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
      className={`relative flex flex-col items-center group select-none ${
        isEditMode ? 'ring-1 ring-dashed ring-blue-300 bg-blue-50/30 rounded-lg' : 'hover:bg-gray-100 cursor-pointer rounded-lg'
      }`}
      data-testid={`shortcut-${item.id}`}
      onClick={handleClick}
      style={style}
    >
      {isEditMode && (
        <div className="absolute -top-1 -right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
          <Button size="icon" variant="ghost" className="h-5 w-5 bg-white shadow-sm border"
            onClick={(e) => { e.stopPropagation(); onEdit(item); }}
            data-testid={`shortcut-edit-${item.id}`}>
            <Pencil className="h-3 w-3 text-blue-600" />
          </Button>
          <Button size="icon" variant="ghost" className="h-5 w-5 bg-white shadow-sm border"
            onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
            data-testid={`shortcut-delete-${item.id}`}>
            <Trash2 className="h-3 w-3 text-red-500" />
          </Button>
        </div>
      )}
      {isEditMode && (
        <div {...attributes} {...listeners}
          className="absolute -top-1 -left-1 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity z-10">
          <div className="h-5 w-5 bg-white shadow-sm border rounded flex items-center justify-center">
            <GripVertical className="h-3 w-3 text-gray-400" />
          </div>
        </div>
      )}

      {labelAbove && (
        <span className={`${sz.text} text-gray-700 font-medium text-center leading-tight py-0.5 w-full line-clamp-2`} title={item.name}>
          {item.name}
        </span>
      )}

      <div className="flex items-center justify-center" style={{ width: sz.card, height: sz.card }}>
        {getIcon(item.icon, sz.icon, item.customIconUrl)}
      </div>

      {!labelAbove && (
        <span className={`${sz.text} text-gray-700 font-medium text-center leading-tight py-0.5 w-full line-clamp-2`} title={item.name}>
          {item.name}
        </span>
      )}

      {item.targetType === 'url' && !isEditMode && (
        <ExternalLink className="absolute top-0.5 right-0.5 h-3 w-3 text-gray-400" />
      )}
    </div>
  );
};

export { ICON_SIZES };
export default SortableShortcut;
