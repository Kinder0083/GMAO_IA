import React from 'react';
import { useNavigate } from 'react-router-dom';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '../ui/hover-card';
import { Badge } from '../ui/badge';
import {
  Wrench, Lightbulb, Sparkles, Coffee, Activity as ActivityIcon,
  ExternalLink, Calendar, Clock, AlertCircle, FileText
} from 'lucide-react';

const TYPE_META = {
  WORK_ORDER: { color: '#0ea5e9', icon: Wrench, label: 'Ordre de travail', linkText: "Voir l'ordre de travail", resourcePath: '/work-orders', paramKey: 'id' },
  IMPROVEMENT: { color: '#10b981', icon: Lightbulb, label: 'Amélioration', linkText: "Voir l'amélioration", resourcePath: '/improvements', paramKey: 'open' },
  PREVENTIVE_MAINTENANCE: { color: '#f59e0b', icon: Sparkles, label: 'M.Préventive', linkText: 'Voir la maintenance préventive', resourcePath: '/preventive-maintenance', paramKey: 'open' },
  FREE_TASK: { color: '#6b7280', icon: ActivityIcon, label: 'Tâche libre', linkText: '', resourcePath: null, paramKey: null },
  CONGE: { color: '#9ca3af', icon: Coffee, label: 'Congé / Indispo', linkText: '', resourcePath: null, paramKey: null },
};

const CATEGORY_LABELS = {
  REUNION: 'Réunion',
  FORMATION: 'Formation',
  ASTREINTE: 'Astreinte',
  AUTRE: 'Autre',
};

/**
 * AssignmentHoverCard — wrap un element trigger avec un HoverCard Shadcn
 * affichant en detail l'affectation au survol (numero, titre complet,
 * durée, description, créateur, lien vers la ressource source).
 */
const AssignmentHoverCard = ({ assignment, children }) => {
  const navigate = useNavigate();
  const meta = TYPE_META[assignment.type] || TYPE_META.FREE_TASK;
  const Icon = meta.icon;
  const hasReference = !!assignment.reference_id && !!meta.resourcePath && !!meta.paramKey;

  const handleOpenResource = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (hasReference) {
      navigate(`${meta.resourcePath}?${meta.paramKey}=${encodeURIComponent(assignment.reference_id)}`);
    }
  };

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent
        side="top"
        align="start"
        className="w-80 p-0 overflow-hidden border-0 shadow-lg"
        data-testid={`assign-hover-${assignment.id}`}
      >
        {/* Bandeau colore */}
        <div className="px-3 py-2 text-white flex items-center gap-2" style={{ backgroundColor: meta.color }}>
          <Icon size={16} className="shrink-0" />
          <span className="text-xs font-bold uppercase tracking-wide">{meta.label}</span>
          {assignment.category && (
            <Badge className="ml-auto bg-white/20 text-white text-[10px] hover:bg-white/30">
              {CATEGORY_LABELS[assignment.category] || assignment.category}
            </Badge>
          )}
        </div>

        <div className="p-3 space-y-2">
          {/* Numero + titre */}
          {assignment.reference_numero && (
            <div className="text-xs text-gray-500 font-mono">#{assignment.reference_numero}</div>
          )}
          <h4 className="text-sm font-semibold text-gray-900 leading-snug">
            {assignment.title || '(Sans titre)'}
          </h4>

          {/* Durée + date */}
          <div className="flex items-center gap-3 text-xs text-gray-600 pt-1 border-t">
            <span className="flex items-center gap-1">
              <Clock size={12} />
              <strong>{assignment.duration_hours || 0}h</strong>
            </span>
            {assignment.start_hour !== null && assignment.start_hour !== undefined && (
              <span className="flex items-center gap-1 text-gray-500">
                Début {Math.floor(assignment.start_hour)}h{String(Math.round((assignment.start_hour % 1) * 60)).padStart(2, '0')}
              </span>
            )}
            <span className="flex items-center gap-1 ml-auto">
              <Calendar size={12} />
              {assignment.date ? new Date(assignment.date).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' }) : ''}
            </span>
          </div>

          {/* Description */}
          {assignment.description && (
            <div className="pt-2 border-t">
              <p className="text-xs text-gray-700 flex items-start gap-1.5">
                <FileText size={12} className="text-gray-400 mt-0.5 shrink-0" />
                <span className="whitespace-pre-wrap">{assignment.description}</span>
              </p>
            </div>
          )}

          {/* Auteur */}
          {assignment.created_by_name && (
            <p className="text-[10px] text-gray-400 italic pt-1">
              Créée par {assignment.created_by_name}
            </p>
          )}

          {/* Indicateur CONGE auto */}
          {assignment.auto_generated && (
            <div className="flex items-center gap-1 text-[10px] text-gray-500 bg-gray-50 px-2 py-1 rounded">
              <AlertCircle size={11} />
              Synchronisé automatiquement depuis Rythme
            </div>
          )}

          {/* Lien vers la ressource source */}
          {hasReference && (
            <button
              type="button"
              onClick={handleOpenResource}
              data-testid={`hover-link-${assignment.id}`}
              className="inline-flex items-center gap-1 text-xs hover:underline pt-1 border-t w-full justify-center font-medium"
              style={{ color: meta.color }}
            >
              <ExternalLink size={12} />
              {meta.linkText || `Voir le ${meta.label.toLowerCase()}`}
            </button>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
};

export default AssignmentHoverCard;
