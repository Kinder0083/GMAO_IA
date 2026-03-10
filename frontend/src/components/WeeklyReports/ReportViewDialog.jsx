import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { 
  Eye, Download, Printer, Mail, Send, X, Loader2,
  FileText, AlertTriangle, Target, ChevronUp, ChevronDown
} from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../../hooks/use-toast';

const ReportViewDialog = ({ open, onOpenChange, historyItem, onRefresh }) => {
  const { toast } = useToast();
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  useEffect(() => {
    if (open && historyItem?.id) {
      loadContent();
    } else {
      setContent(null);
      setShowEmailForm(false);
    }
  }, [open, historyItem?.id]);

  const loadContent = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/weekly-reports/history/${historyItem.id}/content`);
      setContent(res.data);
    } catch (e) {
      toast({ title: 'Erreur', description: 'Impossible de charger le rapport', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = async () => {
    try {
      const res = await api.get(`/weekly-reports/history/${historyItem.id}/html`, { responseType: 'text' });
      const printWindow = window.open('', '_blank');
      printWindow.document.write(typeof res.data === 'string' ? res.data : res.data.toString());
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 500);
    } catch (e) {
      toast({ title: 'Erreur', description: "Impossible d'ouvrir l'impression", variant: 'destructive' });
    }
  };

  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      const response = await api.get(`/weekly-reports/history/${historyItem.id}/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `rapport_${historyItem.template_name}_${historyItem.sent_at?.slice(0, 10)}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast({ title: 'PDF téléchargé' });
    } catch (e) {
      toast({ title: 'Erreur', description: 'Impossible de générer le PDF', variant: 'destructive' });
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleSendEmail = async () => {
    if (!emailTo.trim()) return;
    const recipients = emailTo.split(',').map(e => e.trim()).filter(Boolean);
    setSendingEmail(true);
    try {
      const res = await api.post(`/weekly-reports/history/${historyItem.id}/send-email`, { recipients });
      if (res.data?.success) {
        toast({ title: 'Email envoyé', description: `Rapport envoyé à ${res.data.sent_count} destinataire(s)` });
        setShowEmailForm(false);
        setEmailTo('');
        if (onRefresh) onRefresh();
      } else {
        toast({ title: 'Erreur', description: res.data?.errors?.join(', ') || "Échec de l'envoi", variant: 'destructive' });
      }
    } catch (e) {
      toast({ title: 'Erreur', description: e.response?.data?.detail || "Impossible d'envoyer l'email", variant: 'destructive' });
    } finally {
      setSendingEmail(false);
    }
  };

  const r = content?.report_content;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="report-view-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Eye className="h-5 w-5 text-blue-600" />
            {historyItem?.template_name || 'Rapport'}
          </DialogTitle>
        </DialogHeader>

        {/* Action bar */}
        <div className="flex flex-wrap gap-2 border-b pb-4" data-testid="report-actions-bar">
          <Button variant="outline" size="sm" onClick={handleDownloadPdf} disabled={downloadingPdf} data-testid="report-download-pdf-btn">
            {downloadingPdf ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
            Télécharger PDF
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint} data-testid="report-print-btn">
            <Printer className="h-4 w-4 mr-1" />
            Imprimer
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowEmailForm(!showEmailForm)} data-testid="report-email-toggle-btn">
            <Mail className="h-4 w-4 mr-1" />
            Envoyer par email
          </Button>
        </div>

        {/* Email form */}
        {showEmailForm && (
          <div className="flex items-end gap-2 p-3 bg-gray-50 rounded-lg" data-testid="report-email-form">
            <div className="flex-1">
              <Label className="text-xs text-gray-500">Destinataire(s) (séparés par des virgules)</Label>
              <Input
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                placeholder="email@exemple.com, autre@exemple.com"
                data-testid="report-email-input"
              />
            </div>
            <Button size="sm" onClick={handleSendEmail} disabled={sendingEmail || !emailTo.trim()} className="bg-blue-600 hover:bg-blue-700" data-testid="report-send-email-btn">
              {sendingEmail ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
              Envoyer
            </Button>
          </div>
        )}

        {/* Report content */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : r ? (
          <div className="space-y-5 mt-2">
            {/* Period info */}
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Badge variant="secondary">
                {content.period_start ? new Date(content.period_start).toLocaleDateString('fr-FR') : '?'}
                {' → '}
                {content.period_end ? new Date(content.period_end).toLocaleDateString('fr-FR') : '?'}
              </Badge>
              <span>Généré le {content.sent_at ? new Date(content.sent_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '?'}</span>
            </div>

            {/* Executive summary */}
            {r.resume_executif && (
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Résumé exécutif</p>
                <p className="text-sm text-gray-800 leading-relaxed">{r.resume_executif}</p>
              </div>
            )}

            {/* Sections */}
            {r.sections?.map((s, i) => (
              <div key={i} className="border-l-[3px] border-violet-300 pl-4">
                <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-2 mb-2">
                  <FileText className="h-4 w-4 text-violet-500" /> {s.titre}
                </h4>
                <p className="text-sm text-gray-700 leading-relaxed">{s.contenu}</p>
                {s.indicateurs?.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {s.indicateurs.map((ind, j) => (
                      <span key={j} className="inline-flex items-center gap-1 text-xs bg-violet-50 text-violet-700 px-2 py-1 rounded-full">
                        {ind.nom}: <strong>{ind.valeur}</strong>
                        {ind.tendance && (
                          <span className={ind.tendance === 'hausse' ? 'text-green-600' : ind.tendance === 'baisse' ? 'text-red-600' : 'text-gray-500'}>
                            {ind.tendance === 'hausse' ? ' ↑' : ind.tendance === 'baisse' ? ' ↓' : ' →'}
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Points d'attention */}
            {r.points_attention?.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <p className="text-xs font-semibold text-amber-700 flex items-center gap-1 mb-2">
                  <AlertTriangle className="h-3.5 w-3.5" /> Points d'attention
                </p>
                <ul className="text-sm text-gray-700 list-disc ml-4 space-y-1">
                  {r.points_attention.map((p, i) => <li key={i}>{p}</li>)}
                </ul>
              </div>
            )}

            {/* Actions prioritaires */}
            {r.actions_prioritaires?.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-xs font-semibold text-blue-700 flex items-center gap-1 mb-2">
                  <Target className="h-3.5 w-3.5" /> Actions prioritaires
                </p>
                <ul className="text-sm text-gray-700 list-disc ml-4 space-y-1">
                  {r.actions_prioritaires.map((a, i) => <li key={i}>{a}</li>)}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <FileText className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <p>Aucun contenu détaillé disponible pour ce rapport.</p>
            <p className="text-sm mt-1">Seuls les rapports générés par IA ont un contenu visualisable.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ReportViewDialog;
