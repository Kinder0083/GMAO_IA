import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { AlertCircle, TrendingUp, BarChart3, Table2, Grid3X3, PieChart, Clock, Brain, FileText, Archive } from 'lucide-react';
import { presquAccidentAPI } from '../services/api';
import { useToast } from '../hooks/use-toast';
import { ResponsivePie } from '@nivo/pie';
import { ResponsiveBar } from '@nivo/bar';
import { usePresquAccident } from '../hooks/usePresquAccident';
import AIPATrendAnalyzer from '../components/AIPATrendAnalyzer';
import AIQHSEReport from '../components/AIQHSEReport';
import { useNavigate } from 'react-router-dom';
import OfflineDisabled from '../components/Common/OfflineDisabled';

const PresquAccidentRapport = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [openTrendAnalysis, setOpenTrendAnalysis] = useState(false);
  const [openQHSEReport, setOpenQHSEReport] = useState(false);
  const [displayMode, setDisplayMode] = useState(() => {
    return localStorage.getItem('presqu_accident_rapport_display_mode') || 'cards';
  });
  const previousItemsRef = useRef(null);

  // Utiliser le hook temps réel pour détecter les changements
  const { items, loading: itemsLoading } = usePresquAccident();

  const loadStats = useCallback(async () => {
    try {
      setLoading(true);
      const data = await presquAccidentAPI.getRapportStats();
      setStats(data);
    } catch (error) {
      console.error('Erreur chargement statistiques:', error);
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: 'Impossible de charger les statistiques'
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Charger les stats au montage
  useEffect(() => {
    loadStats();
  }, []);

  // Recharger les stats quand les items changent (via WebSocket)
  useEffect(() => {
    // Ignorer si encore en chargement initial
    if (itemsLoading || items === null) return;
    
    // Créer une signature des données pour détecter les changements
    const currentSignature = JSON.stringify(items.map(i => ({ id: i.id, status: i.status, severite: i.severite })));
    
    // Si les données ont changé, recharger les stats
    if (previousItemsRef.current !== null && previousItemsRef.current !== currentSignature) {
      console.log('[Rapport P.Accident] Données changées, rechargement des stats');
      loadStats();
    }
    
    // Mettre à jour la référence
    previousItemsRef.current = currentSignature;
  }, [items, itemsLoading, loadStats]);

  useEffect(() => {
    localStorage.setItem('presqu_accident_rapport_display_mode', displayMode);
  }, [displayMode]);

  if ((loading && !stats) || (itemsLoading && !stats)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">Chargement des statistiques...</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">Aucune donnée disponible</p>
      </div>
    );
  }

  // Préparer les données pour les graphiques
  const serviceChartData = Object.entries(stats.by_service || {}).map(([key, value]) => ({
    id: key,
    label: key,
    value: value.pourcentage,
    count: value.termine,
    total: value.total
  }));

  const severiteChartData = Object.entries(stats.by_severite).map(([key, value]) => ({
    id: key,
    label: key,
    value: value.total,
    termine: value.termine,
    pourcentage: value.pourcentage
  }));

  const lieuChartData = Object.entries(stats.by_lieu).map(([key, value]) => ({
    id: key,
    label: key.length > 20 ? key.substring(0, 20) + '...' : key,
    Total: value.total,
    Terminé: value.termine
  }));

  // Render different views based on display mode
  const renderCardsView = () => (
    <div className="space-y-6">
      {/* Par Service */}
      <Card>
        <CardHeader>
          <CardTitle>Taux de traitement par Service</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Object.entries(stats.by_service).map(([service, data]) => (
              <Card key={service} className="bg-gradient-to-br from-blue-50 to-white">
                <CardContent className="pt-6">
                  <p className="text-sm font-medium text-gray-700">{service}</p>
                  <p className="text-2xl font-bold text-blue-600 mt-2">{data.pourcentage}%</p>
                  <p className="text-xs text-gray-500 mt-1">{data.termine} / {data.total} traités</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Par Sévérité */}
      <Card>
        <CardHeader>
          <CardTitle>Répartition par Sévérité</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {Object.entries(stats.by_severite).map(([severite, data]) => {
              const colors = {
                'FAIBLE': 'from-green-50 to-white border-green-200',
                'MOYEN': 'from-yellow-50 to-white border-yellow-200',
                'ELEVE': 'from-orange-50 to-white border-orange-200',
                'CRITIQUE': 'from-red-50 to-white border-red-200'
              };
              return (
                <Card key={severite} className={`bg-gradient-to-br ${colors[severite] || 'from-gray-50 to-white'} border-2`}>
                  <CardContent className="pt-6">
                    <p className="text-sm font-medium text-gray-700">{severite}</p>
                    <p className="text-2xl font-bold mt-2">{data.total}</p>
                    <p className="text-xs text-gray-500 mt-1">{data.pourcentage}% traités</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Top Lieux */}
      <Card>
        <CardHeader>
          <CardTitle>Top 10 des Lieux</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Object.entries(stats.by_lieu).map(([lieu, data]) => (
              <div key={lieu} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex-1">
                  <p className="font-medium text-gray-700">{lieu}</p>
                  <p className="text-sm text-gray-500">{data.termine} / {data.total} traités ({data.pourcentage}%)</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-gray-900">{data.total}</p>
                  <p className="text-xs text-gray-500">incidents</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderTableView = () => (
    <div className="space-y-6">
      {/* Table Par Service */}
      <Card>
        <CardHeader>
          <CardTitle>Statistiques par Service</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 font-semibold">Service</th>
                  <th className="text-right p-3 font-semibold">Total</th>
                  <th className="text-right p-3 font-semibold">Terminé</th>
                  <th className="text-right p-3 font-semibold">Taux</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(stats.by_service).map(([service, data]) => (
                  <tr key={service} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-medium">{service}</td>
                    <td className="p-3 text-right">{data.total}</td>
                    <td className="p-3 text-right">{data.termine}</td>
                    <td className="p-3 text-right">
                      <span className={`font-semibold ${data.pourcentage >= 80 ? 'text-green-600' : data.pourcentage >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                        {data.pourcentage}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Table Par Sévérité */}
      <Card>
        <CardHeader>
          <CardTitle>Statistiques par Sévérité</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 font-semibold">Sévérité</th>
                  <th className="text-right p-3 font-semibold">Total</th>
                  <th className="text-right p-3 font-semibold">Terminé</th>
                  <th className="text-right p-3 font-semibold">Taux</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(stats.by_severite).map(([severite, data]) => (
                  <tr key={severite} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-medium">{severite}</td>
                    <td className="p-3 text-right">{data.total}</td>
                    <td className="p-3 text-right">{data.termine}</td>
                    <td className="p-3 text-right">
                      <span className={`font-semibold ${data.pourcentage >= 80 ? 'text-green-600' : data.pourcentage >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                        {data.pourcentage}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Table Par Lieu */}
      <Card>
        <CardHeader>
          <CardTitle>Statistiques par Lieu (Top 10)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 font-semibold">Lieu</th>
                  <th className="text-right p-3 font-semibold">Total</th>
                  <th className="text-right p-3 font-semibold">Terminé</th>
                  <th className="text-right p-3 font-semibold">Taux</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(stats.by_lieu).map(([lieu, data]) => (
                  <tr key={lieu} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-medium">{lieu}</td>
                    <td className="p-3 text-right">{data.total}</td>
                    <td className="p-3 text-right">{data.termine}</td>
                    <td className="p-3 text-right">
                      <span className={`font-semibold ${data.pourcentage >= 80 ? 'text-green-600' : data.pourcentage >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                        {data.pourcentage}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderChartsView = () => (
    <div className="space-y-6">
      {/* Graphique Par Service */}
      <Card>
        <CardHeader>
          <CardTitle>Taux de traitement par Service</CardTitle>
        </CardHeader>
        <CardContent>
          <div style={{ height: '400px' }}>
            <ResponsivePie
              data={serviceChartData}
              margin={{ top: 40, right: 80, bottom: 80, left: 80 }}
              innerRadius={0.5}
              padAngle={0.7}
              cornerRadius={3}
              activeOuterRadiusOffset={8}
              borderWidth={1}
              borderColor={{ from: 'color', modifiers: [['darker', 0.2]] }}
              arcLinkLabelsSkipAngle={10}
              arcLinkLabelsTextColor="#333333"
              arcLinkLabelsThickness={2}
              arcLinkLabelsColor={{ from: 'color' }}
              arcLabelsSkipAngle={10}
              arcLabelsTextColor={{ from: 'color', modifiers: [['darker', 2]] }}
              legends={[
                {
                  anchor: 'bottom',
                  direction: 'row',
                  justify: false,
                  translateX: 0,
                  translateY: 56,
                  itemsSpacing: 0,
                  itemWidth: 100,
                  itemHeight: 18,
                  itemTextColor: '#999',
                  itemDirection: 'left-to-right',
                  itemOpacity: 1,
                  symbolSize: 18,
                  symbolShape: 'circle'
                }
              ]}
            />
          </div>
        </CardContent>
      </Card>

      {/* Graphique Par Sévérité */}
      <Card>
        <CardHeader>
          <CardTitle>Répartition par Sévérité</CardTitle>
        </CardHeader>
        <CardContent>
          <div style={{ height: '400px' }}>
            <ResponsiveBar
              data={severiteChartData}
              keys={['total']}
              indexBy="id"
              margin={{ top: 50, right: 130, bottom: 50, left: 60 }}
              padding={0.3}
              valueScale={{ type: 'linear' }}
              indexScale={{ type: 'band', round: true }}
              colors={({ data }) => {
                const colorMap = {
                  'FAIBLE': '#10b981',
                  'MOYEN': '#f59e0b',
                  'ELEVE': '#f97316',
                  'CRITIQUE': '#ef4444'
                };
                return colorMap[data.id] || '#6366f1';
              }}
              borderColor={{ from: 'color', modifiers: [['darker', 1.6]] }}
              axisTop={null}
              axisRight={null}
              axisBottom={{
                tickSize: 5,
                tickPadding: 5,
                tickRotation: 0,
                legend: 'Sévérité',
                legendPosition: 'middle',
                legendOffset: 32
              }}
              axisLeft={{
                tickSize: 5,
                tickPadding: 5,
                tickRotation: 0,
                legend: 'Nombre',
                legendPosition: 'middle',
                legendOffset: -40
              }}
              labelSkipWidth={12}
              labelSkipHeight={12}
              labelTextColor={{ from: 'color', modifiers: [['darker', 1.6]] }}
              legends={[]}
              role="application"
            />
          </div>
        </CardContent>
      </Card>

      {/* Graphique Par Lieu */}
      <Card>
        <CardHeader>
          <CardTitle>Top Lieux - Total vs Terminé</CardTitle>
        </CardHeader>
        <CardContent>
          <div style={{ height: '500px' }}>
            <ResponsiveBar
              data={lieuChartData.slice(0, 10)}
              keys={['Total', 'Terminé']}
              indexBy="label"
              margin={{ top: 50, right: 130, bottom: 100, left: 60 }}
              padding={0.3}
              layout="horizontal"
              valueScale={{ type: 'linear' }}
              indexScale={{ type: 'band', round: true }}
              colors={{ scheme: 'nivo' }}
              borderColor={{ from: 'color', modifiers: [['darker', 1.6]] }}
              axisTop={null}
              axisRight={null}
              axisBottom={{
                tickSize: 5,
                tickPadding: 5,
                tickRotation: 0,
                legend: 'Nombre de presqu\'accidents',
                legendPosition: 'middle',
                legendOffset: 40
              }}
              axisLeft={{
                tickSize: 5,
                tickPadding: 5,
                tickRotation: 0,
                legend: 'Lieu',
                legendPosition: 'middle',
                legendOffset: -40
              }}
              labelSkipWidth={12}
              labelSkipHeight={12}
              labelTextColor={{ from: 'color', modifiers: [['darker', 1.6]] }}
              legends={[
                {
                  dataFrom: 'keys',
                  anchor: 'bottom-right',
                  direction: 'column',
                  justify: false,
                  translateX: 120,
                  translateY: 0,
                  itemsSpacing: 2,
                  itemWidth: 100,
                  itemHeight: 20,
                  itemDirection: 'left-to-right',
                  itemOpacity: 0.85,
                  symbolSize: 20
                }
              ]}
              role="application"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="space-y-6 p-6">
      {/* Header avec sélecteur de mode */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Rapport - Presqu'accidents</h1>
          <p className="text-gray-600 mt-1">Statistiques et indicateurs de performance</p>
        </div>
        <div className="flex items-center gap-2">
          <OfflineDisabled>
          <Button
            variant="outline"
            className="border-purple-300 text-purple-700 hover:bg-purple-50"
            data-testid="open-pa-trend-btn"
            onClick={() => setOpenTrendAnalysis(true)}
          >
            <Brain size={16} className="mr-1" /> Analyse IA
          </Button>
          </OfflineDisabled>
          <OfflineDisabled>
          <Button
            variant="outline"
            className="border-blue-300 text-blue-700 hover:bg-blue-50"
            data-testid="open-qhse-report-btn"
            onClick={() => setOpenQHSEReport(true)}
          >
            <FileText size={16} className="mr-1" /> Rapport QHSE
          </Button>
          </OfflineDisabled>
          <OfflineDisabled>
          <Button
            variant="outline"
            className="border-amber-300 text-amber-700 hover:bg-amber-50"
            data-testid="open-archives-ia-btn"
            onClick={() => navigate('/presqu-accident-archives-ia')}
          >
            <Archive size={16} className="mr-1" /> Archives IA
          </Button>
          </OfflineDisabled>
          <span className="text-sm text-gray-600 font-medium ml-2">Affichage :</span>
          <Select value={displayMode} onValueChange={setDisplayMode}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cards">
                <div className="flex items-center gap-2">
                  <Grid3X3 size={16} />
                  <span>Cartes</span>
                </div>
              </SelectItem>
              <SelectItem value="table">
                <div className="flex items-center gap-2">
                  <Table2 size={16} />
                  <span>Tableau</span>
                </div>
              </SelectItem>
              <SelectItem value="charts">
                <div className="flex items-center gap-2">
                  <PieChart size={16} />
                  <span>Graphiques</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Statistiques globales - toujours affichées */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        <Card className="hover:shadow-lg transition-shadow">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Taux de traitement</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{stats.global.pourcentage_traitement}%</p>
                <p className="text-xs text-gray-500 mt-1">{stats.global.termine} / {stats.global.total}</p>
              </div>
              <div className="bg-green-100 p-3 rounded-xl">
                <TrendingUp size={24} className="text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Actions en retard</p>
                <p className="text-3xl font-bold text-red-600 mt-2">{stats.global.en_retard}</p>
                <p className="text-xs text-gray-500 mt-1">À traiter en priorité</p>
              </div>
              <div className="bg-red-100 p-3 rounded-xl">
                <AlertCircle size={24} className="text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">À traiter</p>
                <p className="text-3xl font-bold text-orange-600 mt-2">{stats.global.a_traiter}</p>
                <p className="text-xs text-gray-500 mt-1">En attente</p>
              </div>
              <div className="bg-orange-100 p-3 rounded-xl">
                <BarChart3 size={24} className="text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">En cours</p>
                <p className="text-3xl font-bold text-blue-600 mt-2">{stats.global.en_cours}</p>
                <p className="text-xs text-gray-500 mt-1">En traitement</p>
              </div>
              <div className="bg-blue-100 p-3 rounded-xl">
                <Clock size={24} className="text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Délai moyen</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{stats.global.delai_moyen_traitement}</p>
                <p className="text-xs text-gray-500 mt-1">jours</p>
              </div>
              <div className="bg-gray-100 p-3 rounded-xl">
                <Clock size={24} className="text-gray-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Contenu conditionnel selon le mode */}
      {displayMode === 'cards' && renderCardsView()}
      {displayMode === 'table' && renderTableView()}
      {displayMode === 'charts' && renderChartsView()}

      {/* Dialogs IA */}
      <AIPATrendAnalyzer open={openTrendAnalysis} onClose={() => setOpenTrendAnalysis(false)} />
      <AIQHSEReport open={openQHSEReport} onClose={() => setOpenQHSEReport(false)} />
    </div>
  );
};

export default PresquAccidentRapport;
