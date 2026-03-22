import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { ScrollArea } from '../components/ui/scroll-area';
import { 
  FileText, Search, ChevronDown, ChevronUp, Calendar, Building2, 
  CheckCircle2, XCircle, AlertTriangle, Wrench, Clock, Filter
} from 'lucide-react';
import { surveillanceAPI } from '../services/api';
import { useToast } from '../hooks/use-toast';

function SurveillanceAIHistory() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState([]);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({ organisme: '', category: '' });
  const [selectedAnalysis, setSelectedAnalysis] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailData, setDetailData] = useState(null);

  const loadHistory = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (filters.organisme) params.organisme = filters.organisme;
      if (filters.category) params.category = filters.category;
      const data = await surveillanceAPI.getAIHistory(params);
      setHistory(data.items || []);
      setTotal(data.total || 0);
    } catch (error) {
      toast({ title: 'Erreur', description: 'Impossible de charger l\'historique', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [filters, toast]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const openDetail = async (analysis) => {
    try {
      const data = await surveillanceAPI.getAIHistoryDetail(analysis.id);
      setDetailData(data);
      setDetailOpen(true);
    } catch (error) {
      toast({ title: 'Erreur', description: 'Impossible de charger le détail', variant: 'destructive' });
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    try {
      return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return dateStr; }
  };

  const getResultIcon = (item) => {
    if (item.non_conformes_count > 0) return <XCircle className="h-5 w-5 text-red-500" />;
    if (item.avec_reserves_count > 0) return <AlertTriangle className="h-5 w-5 text-amber-500" />;
    return <CheckCircle2 className="h-5 w-5 text-emerald-500" />;
  };

  return (
    <div className="p-6" data-testid="ai-history-page">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Historique des Analyses IA</h1>
          <p className="text-sm text-muted-foreground mt-1">{total} analyse(s) enregistrée(s)</p>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Filtrer par organisme..."
            className="pl-9"
            value={filters.organisme}
            onChange={(e) => setFilters(prev => ({ ...prev, organisme: e.target.value }))}
            data-testid="filter-organisme"
          />
        </div>
        <Select value={filters.category || "all"} onValueChange={(val) => setFilters(prev => ({ ...prev, category: val === "all" ? "" : val }))}>
          <SelectTrigger className="w-[200px]" data-testid="filter-category">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Catégorie" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes catégories</SelectItem>
            <SelectItem value="ELECTRIQUE">Électrique</SelectItem>
            <SelectItem value="MANUTENTION">Manutention</SelectItem>
            <SelectItem value="INCENDIE">Incendie</SelectItem>
            <SelectItem value="SECURITE_ENVIRONNEMENT">Sécurité/Env.</SelectItem>
            <SelectItem value="MMRI">MMRI</SelectItem>
            <SelectItem value="AUTRE">Autre</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Liste */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Chargement...</div>
      ) : history.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <FileText className="h-12 w-12 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">Aucune analyse IA enregistrée</p>
            <p className="text-sm text-gray-400 mt-1">Les analyses apparaîtront ici après utilisation de la fonction "Analyse IA"</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {history.map((item) => (
            <Card key={item.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => openDetail(item)} data-testid={`history-item-${item.id}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  {getResultIcon(item)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm truncate">{item.filename}</span>
                      {item.organisme_controle && (
                        <Badge variant="outline" className="text-xs">{item.organisme_controle}</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> {formatDate(item.created_at)}
                      </span>
                      {item.date_intervention && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" /> Contrôle: {item.date_intervention}
                        </span>
                      )}
                      {item.analyzed_by_name && (
                        <span>Par: {item.analyzed_by_name}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-sm flex-shrink-0">
                    <div className="text-center">
                      <div className="font-semibold">{item.controles_count}</div>
                      <div className="text-xs text-gray-500">contrôle(s)</div>
                    </div>
                    <div className="flex gap-1">
                      {item.conformes_count > 0 && (
                        <Badge className="bg-emerald-100 text-emerald-700 text-xs">{item.conformes_count} C</Badge>
                      )}
                      {item.non_conformes_count > 0 && (
                        <Badge className="bg-red-100 text-red-700 text-xs">{item.non_conformes_count} NC</Badge>
                      )}
                      {item.avec_reserves_count > 0 && (
                        <Badge className="bg-amber-100 text-amber-700 text-xs">{item.avec_reserves_count} AR</Badge>
                      )}
                    </div>
                    {item.created_work_order_ids?.length > 0 && (
                      <Badge className="bg-blue-100 text-blue-700 text-xs flex items-center gap-1">
                        <Wrench className="h-3 w-3" /> {item.created_work_order_ids.length} BT
                      </Badge>
                    )}
                    <div className="flex flex-wrap gap-1">
                      {item.categories?.map(cat => (
                        <Badge key={cat} variant="secondary" className="text-xs">{cat}</Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog détail */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden" data-testid="history-detail-dialog">
          <DialogHeader>
            <DialogTitle>Détail de l'analyse</DialogTitle>
          </DialogHeader>
          {detailData && (
            <ScrollArea className="flex-1 min-h-0 pr-2">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-gray-500">Fichier :</span> <strong>{detailData.filename}</strong></div>
                  <div><span className="text-gray-500">Organisme :</span> <strong>{detailData.organisme_controle || 'N/A'}</strong></div>
                  <div><span className="text-gray-500">Date contrôle :</span> <strong>{detailData.date_intervention || 'N/A'}</strong></div>
                  <div><span className="text-gray-500">N° rapport :</span> <strong>{detailData.numero_rapport || 'N/A'}</strong></div>
                  <div><span className="text-gray-500">Site :</span> <strong>{detailData.site_controle || 'N/A'}</strong></div>
                  <div><span className="text-gray-500">Analysé par :</span> <strong>{detailData.analyzed_by_name || 'N/A'}</strong></div>
                </div>

                <div className="flex gap-2">
                  <Badge className="bg-emerald-100 text-emerald-700">{detailData.conformes_count} Conforme(s)</Badge>
                  <Badge className="bg-red-100 text-red-700">{detailData.non_conformes_count} Non conforme(s)</Badge>
                  <Badge className="bg-amber-100 text-amber-700">{detailData.avec_reserves_count} Avec réserves</Badge>
                </div>

                {detailData.created_work_order_ids?.length > 0 && (
                  <div className="bg-blue-50 p-3 rounded-lg text-sm">
                    <span className="font-medium flex items-center gap-1 text-blue-700 mb-1">
                      <Wrench className="h-4 w-4" /> {detailData.created_work_order_ids.length} Bon(s) de travail curatif(s) créé(s)
                    </span>
                  </div>
                )}

                {/* Détail des contrôles extraits */}
                {detailData.raw_extracted_data?.controles && (
                  <div>
                    <h3 className="font-medium text-sm mb-2">Contrôles extraits :</h3>
                    {detailData.raw_extracted_data.controles.map((ctrl, i) => (
                      <div key={i} className="border rounded p-3 mb-2 text-xs space-y-1">
                        <div className="font-medium text-sm">{ctrl.classe_type}</div>
                        <div className="grid grid-cols-2 gap-1 text-gray-600">
                          <span>Catégorie: {ctrl.category}</span>
                          <span>Résultat: {ctrl.resultat}</span>
                          <span>Périodicité: {ctrl.periodicite || ctrl.periodicite_detectee || 'N/A'}</span>
                          <span>Bâtiment: {ctrl.batiment || 'N/A'}</span>
                        </div>
                        {ctrl.anomalies && (
                          <div className="bg-red-50 p-2 rounded mt-1 text-red-700">
                            Anomalies: {ctrl.anomalies}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default SurveillanceAIHistory;
