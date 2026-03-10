import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { 
  History, Download, RefreshCw, CheckCircle2, XCircle, 
  AlertTriangle, Mail, Calendar, FileText
} from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../../hooks/use-toast';

const ReportHistoryTable = ({ history, onRefresh }) => {
  const { toast } = useToast();

  const handleDownloadPdf = async (historyItem) => {
    try {
      const response = await api.get(`/weekly-reports/history/${historyItem.id}/pdf`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `rapport_${historyItem.template_name}_${historyItem.sent_at.slice(0, 10)}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Impossible de télécharger le PDF',
        variant: 'destructive'
      });
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'sent':
        return (
          <Badge className="bg-green-500">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Envoyé
          </Badge>
        );
      case 'partial':
        return (
          <Badge className="bg-orange-500">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Partiel
          </Badge>
        );
      case 'failed':
        return (
          <Badge className="bg-red-500">
            <XCircle className="h-3 w-3 mr-1" />
            Échec
          </Badge>
        );
      case 'generated':
        return (
          <Badge className="bg-violet-500">
            <FileText className="h-3 w-3 mr-1" />
            Généré (IA)
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (history.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <History className="h-16 w-16 mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 mb-2">
            Aucun historique
          </h3>
          <p className="text-gray-500">
            Les rapports envoyés apparaîtront ici
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5 text-purple-600" />
          Historique des envois
        </CardTitle>
        <Button variant="outline" size="sm" onClick={onRefresh}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Actualiser
        </Button>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b text-left text-sm text-gray-500">
                <th className="pb-3 font-medium">Date</th>
                <th className="pb-3 font-medium">Modèle</th>
                <th className="pb-3 font-medium">Période</th>
                <th className="pb-3 font-medium">Destinataires</th>
                <th className="pb-3 font-medium">Statut</th>
                <th className="pb-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {history.map((item) => (
                <tr key={item.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="py-4">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-gray-400" />
                      <div>
                        <div className="font-medium">
                          {new Date(item.sent_at).toLocaleDateString('fr-FR', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric'
                          })}
                        </div>
                        <div className="text-xs text-gray-500">
                          {new Date(item.sent_at).toLocaleTimeString('fr-FR', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-4">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-blue-500" />
                      <span className="font-medium">{item.template_name}</span>
                    </div>
                  </td>
                  <td className="py-4 text-sm text-gray-600">
                    {item.period_start && item.period_end ? (
                      <>
                        {new Date(item.period_start).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                        {' → '}
                        {new Date(item.period_end).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                      </>
                    ) : '-'}
                  </td>
                  <td className="py-4">
                    <div className="flex items-center gap-1">
                      <Mail className="h-4 w-4 text-gray-400" />
                      <span className="text-sm">
                        {item.email_count} / {item.recipients?.length || 0}
                      </span>
                    </div>
                  </td>
                  <td className="py-4">
                    {getStatusBadge(item.status)}
                  </td>
                  <td className="py-4 text-right">
                    {item.pdf_path && (
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => handleDownloadPdf(item)}
                      >
                        <Download className="h-4 w-4 mr-1" />
                        PDF
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
};

export default ReportHistoryTable;
