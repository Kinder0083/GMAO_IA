import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { ScrollArea } from '../components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { ArrowLeft, Archive, Brain, FileText, Trash2, Eye, Calendar, Hash, Cpu, AlertTriangle, Loader2, ShoppingCart, DollarSign, Lightbulb } from 'lucide-react';
import { purchaseHistoryAPI } from '../services/api';
import { useToast } from '../hooks/use-toast';
import { useNavigate } from 'react-router-dom';

const PurchaseHistoryArchivesIA = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [archives, setArchives] = useState([]);
  const [stats, setStats] = useState(null);
  const [selectedArchive, setSelectedArchive] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const loadArchives = useCallback(async () => {
    try {
      setLoading(true);
      const result = await purchaseHistoryAPI.getAIArchives();
      if (result.success) {
        setArchives(result.data);
        setStats(result.stats);
      }
    } catch {
      toast({ variant: 'destructive', title: 'Erreur', description: 'Impossible de charger les archives' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadArchives(); }, [loadArchives]);

  const handleDelete = async (archiveId) => {
    if (!window.confirm('Supprimer cette archive ? Les achats pourront etre re-analyses.')) return;
    setDeleting(archiveId);
    try {
      await purchaseHistoryAPI.deleteAIArchive(archiveId);
      toast({ title: 'Archive supprimee' });
      loadArchives();
    } catch {
      toast({ variant: 'destructive', title: 'Erreur', description: 'Impossible de supprimer' });
    } finally {
      setDeleting(null);
    }
  };

  const handleView = async (archiveId) => {
    try {
      const result = await purchaseHistoryAPI.getAIArchive(archiveId);
      if (result.success) {
        setSelectedArchive(result.data);
        setDetailOpen(true);
      }
    } catch {
      toast({ variant: 'destructive', title: 'Erreur', description: 'Impossible de charger le detail' });
    }
  };

  const typeLabel = (type) => type === 'purchase_trend' ? 'Analyse IA' : 'Rapport Achat';
  const typeColor = (type) => type === 'purchase_trend' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800';
  const typeIcon = (type) => type === 'purchase_trend' ? <Brain className="h-4 w-4" /> : <FileText className="h-4 w-4" />;

  const formatDate = (iso) => {
    if (!iso) return '-';
    try { return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch { return iso; }
  };
  const formatDateShort = (d) => {
    if (!d) return '-';
    try { return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }); }
    catch { return d; }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/purchase-history')} data-testid="back-to-purchase-btn">
            <ArrowLeft className="h-4 w-4 mr-1" /> Retour
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Archive className="h-6 w-6 text-amber-600" />
              Archives IA - Historique d'Achat
            </h1>
            <p className="text-sm text-gray-500 mt-1">Historique des analyses et rapports generes par l'IA</p>
          </div>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4" data-testid="archives-stats">
          <Card><CardContent className="pt-5 text-center">
            <p className="text-3xl font-bold text-amber-600">{stats.total_archives}</p>
            <p className="text-xs text-gray-500 mt-1">Archives totales</p>
          </CardContent></Card>
          <Card><CardContent className="pt-5 text-center">
            <p className="text-3xl font-bold text-green-600">{stats.total_purchases_archived}</p>
            <p className="text-xs text-gray-500 mt-1">Achats archives</p>
          </CardContent></Card>
          <Card><CardContent className="pt-5 text-center">
            <p className="text-3xl font-bold text-gray-800">{stats.total_purchases}</p>
            <p className="text-xs text-gray-500 mt-1">Achats totaux</p>
          </CardContent></Card>
          <Card><CardContent className="pt-5 text-center">
            <p className="text-3xl font-bold text-orange-600">{stats.remaining_to_analyze}</p>
            <p className="text-xs text-gray-500 mt-1">Restant a analyser</p>
          </CardContent></Card>
        </div>
      )}

      {archives.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <Archive className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Aucune archive pour le moment.</p>
          <p className="text-sm text-gray-400 mt-1">Les analyses IA seront automatiquement archivees ici.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-3" data-testid="archives-list">
          {archives.map((archive) => (
            <Card key={archive.id} className="hover:shadow-md transition-shadow">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1">
                    <div className={`p-2 rounded-lg ${archive.type === 'purchase_trend' ? 'bg-purple-50' : 'bg-blue-50'}`}>
                      {typeIcon(archive.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={`text-xs ${typeColor(archive.type)}`}>{typeLabel(archive.type)}</Badge>
                        <span className="text-xs text-gray-400">{formatDate(archive.timestamp)}</span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span className="flex items-center gap-1"><Hash className="h-3 w-3" />{archive.purchase_count} ligne(s)</span>
                        <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDateShort(archive.date_range?.from)} - {formatDateShort(archive.date_range?.to)}</span>
                        <span className="flex items-center gap-1"><Cpu className="h-3 w-3" />{archive.provider_used}/{archive.model_used}</span>
                        {archive.generated_by_name && <span className="text-gray-400">par {archive.generated_by_name}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <Button variant="outline" size="sm" onClick={() => handleView(archive.id)} data-testid={`view-archive-${archive.id}`}>
                      <Eye className="h-4 w-4 mr-1" /> Consulter
                    </Button>
                    <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      onClick={() => handleDelete(archive.id)} disabled={deleting === archive.id}
                      data-testid={`delete-archive-${archive.id}`}>
                      {deleting === archive.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={() => { setDetailOpen(false); setSelectedArchive(null); }}>
        <DialogContent className="max-w-4xl max-h-[90vh]" data-testid="archive-detail-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedArchive && typeIcon(selectedArchive.type)}
              {selectedArchive ? typeLabel(selectedArchive.type) : 'Detail'}
              {selectedArchive && <span className="text-sm font-normal text-gray-500 ml-2">{formatDate(selectedArchive?.timestamp)}</span>}
            </DialogTitle>
          </DialogHeader>
          {selectedArchive && (
            <ScrollArea className="max-h-[70vh] pr-3">
              <div className="space-y-4">
                <div className="flex items-center gap-4 text-xs text-gray-500 bg-gray-50 p-3 rounded-lg">
                  <Badge className={typeColor(selectedArchive.type)}>{typeLabel(selectedArchive.type)}</Badge>
                  <span>{selectedArchive.purchase_count} ligne(s)</span>
                  <span>{formatDateShort(selectedArchive.date_range?.from)} - {formatDateShort(selectedArchive.date_range?.to)}</span>
                  <span>{selectedArchive.provider_used}/{selectedArchive.model_used}</span>
                </div>

                {selectedArchive.type === 'purchase_trend' && <TrendView analysis={selectedArchive.analysis} />}
                {selectedArchive.type === 'purchase_report' && <ReportView report={selectedArchive.analysis} />}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

const evalColor = (e) => e === 'STRATEGIQUE' ? 'bg-purple-100 text-purple-800' : e === 'IMPORTANT' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700';
const gravColor = (g) => g === 'CRITIQUE' ? 'bg-red-100 text-red-800' : g === 'IMPORTANT' ? 'bg-orange-100 text-orange-800' : g === 'MODERE' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800';

const TrendView = ({ analysis }) => {
  if (!analysis) return null;
  return (
    <div className="space-y-4">
      {analysis.summary && (
        <div className="p-4 bg-gray-50 rounded-lg">
          <h3 className="font-semibold text-sm mb-2">Resume</h3>
          <p className="text-sm text-gray-700">{analysis.summary}</p>
        </div>
      )}
      {analysis.analyse_fournisseurs?.length > 0 && (
        <div className="p-4 bg-gray-50 rounded-lg">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><ShoppingCart className="h-4 w-4 text-purple-500" /> Fournisseurs</h3>
          <div className="space-y-2">
            {analysis.analyse_fournisseurs.map((f, i) => (
              <div key={i} className="bg-white p-3 rounded-lg border">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">{f.fournisseur}</span>
                  <Badge className={`text-[10px] ${evalColor(f.evaluation)}`}>{f.evaluation}</Badge>
                </div>
                <p className="text-xs text-gray-500">{Number(f.montant_total || 0).toLocaleString('fr-FR')} EUR | {f.nombre_commandes} cmd</p>
              </div>
            ))}
          </div>
        </div>
      )}
      {analysis.anomalies_detectees?.length > 0 && (
        <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2 text-orange-800"><AlertTriangle className="h-4 w-4" /> Anomalies</h3>
          <div className="space-y-2">
            {analysis.anomalies_detectees.map((a, i) => (
              <div key={i} className="bg-white p-3 rounded-lg border border-orange-100">
                <p className="text-sm">{a.description}</p>
                {a.recommendation && <p className="text-xs text-green-700 mt-1 flex items-start gap-1"><Lightbulb className="h-3 w-3 mt-0.5 flex-shrink-0" /> {a.recommendation}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
      {analysis.recommandations_prioritaires?.length > 0 && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <h3 className="font-semibold text-sm mb-3 text-green-800">Recommandations</h3>
          <div className="space-y-2">
            {analysis.recommandations_prioritaires.map((r, i) => (
              <div key={i} className="bg-white p-3 rounded-lg border border-green-100">
                <p className="text-sm font-medium">{r.action}</p>
                <p className="text-xs text-gray-500 mt-1">{r.service_concerne} - {r.impact_attendu}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const ReportView = ({ report }) => {
  if (!report) return null;
  return (
    <div className="space-y-4">
      {report.titre_rapport && <div className="text-center border-b pb-3"><h2 className="text-lg font-bold">{report.titre_rapport}</h2></div>}
      {report.resume_executif && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="font-semibold text-sm text-blue-800 mb-2">Resume executif</h3>
          <p className="text-sm text-blue-700">{report.resume_executif}</p>
        </div>
      )}
      {report.indicateurs_cles && (
        <div className="p-4 bg-gray-50 rounded-lg">
          <h3 className="font-semibold text-sm mb-3">Indicateurs cles</h3>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white p-3 rounded-lg border text-center">
              <p className="text-2xl font-bold">{Number(report.indicateurs_cles.montant_total_ht || 0).toLocaleString('fr-FR')}</p>
              <p className="text-xs text-gray-500">Montant total HT</p>
            </div>
            <div className="bg-white p-3 rounded-lg border text-center">
              <p className="text-2xl font-bold text-blue-600">{report.indicateurs_cles.nombre_fournisseurs}</p>
              <p className="text-xs text-gray-500">Fournisseurs</p>
            </div>
            <div className="bg-white p-3 rounded-lg border text-center">
              <p className="text-2xl font-bold text-orange-600">{report.indicateurs_cles.taux_retour_pct}%</p>
              <p className="text-xs text-gray-500">Taux retour</p>
            </div>
          </div>
        </div>
      )}
      {report.top_fournisseurs?.length > 0 && (
        <div className="p-4 bg-gray-50 rounded-lg">
          <h3 className="font-semibold text-sm mb-3">Top fournisseurs</h3>
          <div className="space-y-2">
            {report.top_fournisseurs.map((f, i) => (
              <div key={i} className="bg-white p-3 rounded-lg border flex items-start gap-3">
                <span className="text-lg font-bold text-gray-300">#{f.rang}</span>
                <div className="flex-1">
                  <span className="text-sm font-medium">{f.fournisseur}</span>
                  <p className="text-xs text-gray-500">{Number(f.montant_total || 0).toLocaleString('fr-FR')} EUR | {f.nombre_commandes} cmd | {f.part_marche_pct}%</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {report.top_risques?.length > 0 && (
        <div className="p-4 bg-gray-50 rounded-lg">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-red-500" /> Top risques</h3>
          <div className="space-y-2">
            {report.top_risques.map((r, i) => (
              <div key={i} className="bg-white p-3 rounded-lg border flex items-start gap-3">
                <span className="text-lg font-bold text-gray-300">#{r.rang}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium">{r.risque}</span>
                    <Badge className={`text-[10px] ${gravColor(r.gravite)}`}>{r.gravite}</Badge>
                  </div>
                  <p className="text-xs text-gray-500">{r.fournisseur_concerne} - {r.recommandation}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {report.plan_action_propose?.length > 0 && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <h3 className="font-semibold text-sm mb-3 text-green-800">Plan d'action</h3>
          <div className="space-y-2">
            {report.plan_action_propose.map((a, i) => (
              <div key={i} className="bg-white p-3 rounded-lg border border-green-100">
                <p className="text-sm font-medium">{a.action}</p>
                <p className="text-xs text-gray-500 mt-1">P{a.priorite} | {a.responsable_suggere} | {a.echeance_suggeree} | Eco: {a.economie_estimee}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      {report.conclusion && (
        <div className="p-4 bg-gray-50 rounded-lg">
          <h3 className="font-semibold text-sm mb-2">Conclusion</h3>
          <p className="text-sm text-gray-700">{report.conclusion}</p>
        </div>
      )}
    </div>
  );
};

export default PurchaseHistoryArchivesIA;
