import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { ScrollArea } from '../components/ui/scroll-area';
import { Loader2, Brain, TrendingUp, TrendingDown, Minus, ShoppingCart, AlertTriangle, Lightbulb, Package, DollarSign } from 'lucide-react';
import { purchaseHistoryAPI } from '../services/api';
import { useToast } from '../hooks/use-toast';

export default function AIPurchaseAnalyzer({ open, onClose }) {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [stats, setStats] = useState(null);
  const { toast } = useToast();

  const handleAnalyze = async () => {
    setLoading(true);
    try {
      const result = await purchaseHistoryAPI.aiAnalyzeTrends();
      if (result.success) {
        setAnalysis(result.data);
        setStats(result.stats);
      } else {
        toast({ title: "Info", description: result.error, variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Erreur", description: "Impossible d'analyser", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => { setAnalysis(null); setStats(null); onClose(); };

  const TrendIcon = ({ trend }) => {
    if (trend === 'HAUSSE') return <TrendingUp className="h-4 w-4 text-red-600" />;
    if (trend === 'BAISSE') return <TrendingDown className="h-4 w-4 text-green-600" />;
    return <Minus className="h-4 w-4 text-gray-500" />;
  };

  const trendColor = (t) => t === 'HAUSSE' ? 'bg-red-100 text-red-800' : t === 'BAISSE' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700';
  const evalColor = (e) => e === 'STRATEGIQUE' ? 'bg-purple-100 text-purple-800' : e === 'IMPORTANT' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700';
  const anomalyColor = (t) => t === 'PRIX_ANORMAL' ? 'bg-red-100 text-red-800' : t === 'RETOURS_FREQUENTS' ? 'bg-orange-100 text-orange-800' : 'bg-yellow-100 text-yellow-800';
  const prioColor = (p) => p === 'HAUTE' ? 'bg-red-100 text-red-800' : p === 'MOYENNE' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800';

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh]" data-testid="purchase-trend-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-purple-600" />
            Analyse IA des tendances d'achat
          </DialogTitle>
        </DialogHeader>

        {!analysis && !loading && (
          <div className="text-center py-8 space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-purple-50 flex items-center justify-center">
              <ShoppingCart className="h-8 w-8 text-purple-600" />
            </div>
            <p className="text-sm text-gray-600">
              L'IA va analyser l'ensemble de l'historique d'achat pour detecter les tendances,
              anomalies de prix, optimisations possibles et risques d'approvisionnement.
            </p>
            <Button onClick={handleAnalyze} className="bg-purple-600 hover:bg-purple-700" data-testid="purchase-trend-start-btn">
              <Brain className="h-4 w-4 mr-2" /> Lancer l'analyse des achats
            </Button>
          </div>
        )}

        {loading && (
          <div className="text-center py-12 space-y-3">
            <Loader2 className="h-10 w-10 animate-spin mx-auto text-purple-600" />
            <p className="text-sm text-gray-600">Analyse IA des achats en cours...</p>
          </div>
        )}

        {analysis && (
          <ScrollArea className="max-h-[70vh] pr-3">
            <div className="space-y-4">
              {/* Summary */}
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-sm">Resume</h3>
                  <div className="flex items-center gap-2">
                    <TrendIcon trend={analysis.tendance_globale} />
                    <Badge className={trendColor(analysis.tendance_globale)}>{analysis.tendance_globale}</Badge>
                  </div>
                </div>
                <p className="text-sm text-gray-700">{analysis.summary}</p>
                {stats && <p className="text-xs text-gray-500 mt-2">{stats.total_purchases} ligne(s) analysee(s)</p>}
              </div>

              {/* KPI */}
              {analysis.kpi && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-white p-3 rounded-lg border text-center">
                    <DollarSign className="h-5 w-5 mx-auto text-green-600 mb-1" />
                    <p className="text-lg font-bold">{Number(analysis.kpi.montant_total_ht || 0).toLocaleString('fr-FR')} EUR</p>
                    <p className="text-xs text-gray-500">Montant total HT</p>
                  </div>
                  <div className="bg-white p-3 rounded-lg border text-center">
                    <Package className="h-5 w-5 mx-auto text-blue-600 mb-1" />
                    <p className="text-lg font-bold">{analysis.kpi.nombre_commandes || 0}</p>
                    <p className="text-xs text-gray-500">Commandes</p>
                  </div>
                  <div className="bg-white p-3 rounded-lg border text-center">
                    <ShoppingCart className="h-5 w-5 mx-auto text-purple-600 mb-1" />
                    <p className="text-lg font-bold">{analysis.kpi.nombre_fournisseurs || 0}</p>
                    <p className="text-xs text-gray-500">Fournisseurs</p>
                  </div>
                  <div className="bg-white p-3 rounded-lg border text-center">
                    <DollarSign className="h-5 w-5 mx-auto text-orange-600 mb-1" />
                    <p className="text-lg font-bold">{Number(analysis.kpi.panier_moyen || 0).toLocaleString('fr-FR')} EUR</p>
                    <p className="text-xs text-gray-500">Panier moyen</p>
                  </div>
                </div>
              )}

              {/* Fournisseurs */}
              {analysis.analyse_fournisseurs?.length > 0 && (
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4 text-purple-500" /> Analyse fournisseurs
                  </h3>
                  <div className="space-y-2">
                    {analysis.analyse_fournisseurs.map((f, i) => (
                      <div key={i} className="bg-white p-3 rounded-lg border">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium">{f.fournisseur}</span>
                          <Badge className={`text-[10px] ${evalColor(f.evaluation)}`}>{f.evaluation}</Badge>
                        </div>
                        <p className="text-xs text-gray-500">
                          {Number(f.montant_total || 0).toLocaleString('fr-FR')} EUR | {f.nombre_commandes} cmd | {(f.categories || []).join(', ')}
                        </p>
                        {f.risque && <p className="text-xs text-orange-600 mt-1">{f.risque}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Anomalies */}
              {analysis.anomalies_detectees?.length > 0 && (
                <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
                  <h3 className="font-semibold text-sm mb-3 flex items-center gap-2 text-orange-800">
                    <AlertTriangle className="h-4 w-4" /> Anomalies detectees
                  </h3>
                  <div className="space-y-2">
                    {analysis.anomalies_detectees.map((a, i) => (
                      <div key={i} className="bg-white p-3 rounded-lg border border-orange-100">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className={`text-[10px] ${anomalyColor(a.type)}`}>{a.type}</Badge>
                        </div>
                        <p className="text-sm">{a.description}</p>
                        <p className="text-xs text-gray-500 mt-1">Impact: {a.impact_estime}</p>
                        <p className="text-xs text-green-700 mt-1 flex items-start gap-1">
                          <Lightbulb className="h-3 w-3 mt-0.5 flex-shrink-0" /> {a.recommendation}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Optimisations */}
              {analysis.optimisations_possibles?.length > 0 && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <h3 className="font-semibold text-sm mb-3 flex items-center gap-2 text-green-800">
                    <Lightbulb className="h-4 w-4" /> Optimisations possibles
                  </h3>
                  <div className="space-y-2">
                    {analysis.optimisations_possibles.map((o, i) => (
                      <div key={i} className="bg-white p-3 rounded-lg border border-green-100">
                        <p className="text-sm font-medium">{o.action}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                          <Badge className={`text-[10px] ${prioColor(o.priorite)}`}>P{o.priorite === 'HAUTE' ? '1' : o.priorite === 'MOYENNE' ? '2' : '3'}</Badge>
                          <span>{o.economie_estimee}</span>
                          <span>{o.service_concerne}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommandations */}
              {analysis.recommandations_prioritaires?.length > 0 && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <h3 className="font-semibold text-sm mb-3 flex items-center gap-2 text-blue-800">
                    <Lightbulb className="h-4 w-4" /> Recommandations prioritaires
                  </h3>
                  <div className="space-y-2">
                    {analysis.recommandations_prioritaires.map((r, i) => (
                      <div key={i} className="bg-white p-3 rounded-lg border border-blue-100">
                        <p className="text-sm font-medium">{r.action}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                          <Badge className={`text-[10px] ${prioColor(r.priorite)}`}>{r.priorite}</Badge>
                          <span>{r.service_concerne}</span>
                          <span>{r.impact_attendu}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
