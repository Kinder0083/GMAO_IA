import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '../ui/dialog';
import { Badge } from '../ui/badge';
import { Separator } from '../ui/separator';
import { Calendar, MapPin, Wrench, FileText, User, Paperclip } from 'lucide-react';
import AttachmentGallery from '../shared/AttachmentGallery';
import { interventionRequestsAPI } from '../../services/api';

const InterventionRequestDialog = ({ open, onOpenChange, request }) => {
  if (!request) return null;

  const getPriorityBadge = (priorite) => {
    const badges = {
      'URGENTE': { variant: 'destructive', label: 'Urgente' },
      'HAUTE': { variant: 'destructive', label: 'Haute' },
      'MOYENNE': { variant: 'default', label: 'Moyenne' },
      'BASSE': { variant: 'secondary', label: 'Basse' },
      'AUCUNE': { variant: 'outline', label: 'Normale' }
    };
    const badge = badges[priorite] || badges['AUCUNE'];
    return <Badge variant={badge.variant}>{badge.label}</Badge>;
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('fr-FR');
  };

  const attachments = request.attachments || [];
  const galleryDownload = (id, attachmentId) => interventionRequestsAPI.downloadAttachment(id, attachmentId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">{request.titre}</DialogTitle>
          <div className="flex gap-2 mt-2">
            {getPriorityBadge(request.priorite)}
            {request.work_order_id && (
              <Badge variant="success">Convertie en ordre</Badge>
            )}
            {request.refused && (
              <Badge variant="destructive">Refusee</Badge>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div>
            <div className="flex items-start gap-2 mb-2">
              <FileText className="text-gray-600 mt-1" size={18} />
              <div>
                <p className="text-sm text-gray-600">Description</p>
                <p className="text-base text-gray-900 mt-1 whitespace-pre-wrap">{request.description}</p>
              </div>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-4">
            {request.equipement && (
              <div className="flex items-center gap-2">
                <Wrench className="text-gray-600" size={18} />
                <div>
                  <p className="text-sm text-gray-600">Equipement</p>
                  <p className="text-base font-medium text-gray-900">{request.equipement.nom}</p>
                </div>
              </div>
            )}

            {request.emplacement && (
              <div className="flex items-center gap-2">
                <MapPin className="text-gray-600" size={18} />
                <div>
                  <p className="text-sm text-gray-600">Emplacement</p>
                  <p className="text-base font-medium text-gray-900">{request.emplacement.nom}</p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Calendar className="text-gray-600" size={18} />
              <div>
                <p className="text-sm text-gray-600">Date Limite Desiree</p>
                <p className="text-base font-medium text-gray-900">{formatDate(request.date_limite_desiree)}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <User className="text-gray-600" size={18} />
              <div>
                <p className="text-sm text-gray-600">Creee par</p>
                <p className="text-base font-medium text-gray-900">{request.created_by_name || 'N/A'}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Calendar className="text-gray-600" size={18} />
              <div>
                <p className="text-sm text-gray-600">Date de creation</p>
                <p className="text-base font-medium text-gray-900">{formatDate(request.date_creation)}</p>
              </div>
            </div>
          </div>

          {/* Pieces jointes avec miniatures */}
          {attachments.length > 0 && (
            <>
              <Separator />
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Paperclip className="text-gray-600" size={18} />
                  <p className="text-sm font-semibold text-gray-700">
                    Pieces jointes ({attachments.length})
                  </p>
                </div>
                <AttachmentGallery
                  attachments={attachments}
                  downloadFunction={galleryDownload}
                  itemId={request.id}
                />
              </div>
            </>
          )}

          {/* Refus info */}
          {request.refused && request.refused_reason && (
            <>
              <Separator />
              <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                <p className="text-sm font-semibold text-red-900 mb-2">Demande refusee</p>
                <div className="space-y-1">
                  <p className="text-sm text-red-700"><strong>Motif :</strong> {request.refused_reason}</p>
                  {request.refused_by_name && (
                    <p className="text-sm text-red-600">Refuse par : {request.refused_by_name}</p>
                  )}
                  {request.refused_at && (
                    <p className="text-sm text-red-600">Le : {formatDate(request.refused_at)}</p>
                  )}
                </div>
              </div>
            </>
          )}

          {request.work_order_numero && (
            <>
              <Separator />
              <div className="bg-blue-50 p-4 rounded-lg">
                <p className="text-sm font-semibold text-blue-900 mb-2">Ordre de travail cree</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-xs text-blue-700">Numero d'ordre</p>
                    <p className="text-sm font-medium text-blue-900">#{request.work_order_numero}</p>
                  </div>
                  {request.work_order_date_limite && (
                    <div>
                      <p className="text-xs text-blue-700">Date limite</p>
                      <p className="text-sm font-medium text-blue-900">{formatDate(request.work_order_date_limite)}</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default InterventionRequestDialog;