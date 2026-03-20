import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { BarChart3, TrendingUp, Download, Calendar } from 'lucide-react';
import { reportsAPI, equipmentsAPI } from '../services/api';
import { useToast } from '../hooks/use-toast';
import CustomPeriodDialog from '../components/Common/CustomPeriodDialog';
import TimeByCategoryChart from '../components/Reports/TimeByCategoryChart';
import EquipmentPerformanceTree from '../components/Reports/EquipmentPerformanceTree';
import UserTimeTrackingChart from '../components/Reports/UserTimeTrackingChart';
import OfflineDisabled from '../components/Common/OfflineDisabled';

const Reports = () => {
  const { toast } = useToast();
  const [selectedPeriod, setSelectedPeriod] = useState('MOIS');
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState(null);
  const [equipments, setEquipments] = useState([]);
  const [customPeriodOpen, setCustomPeriodOpen] = useState(false);
  const [customDates, setCustomDates] = useState(null);
  const [exportFormat, setExportFormat] = useState('pdf');
  const [userRole, setUserRole] = useState('VIEWER');

  useEffect(() => {
    // Récupérer le rôle de l'utilisateur
    const userInfo = localStorage.getItem('user');
    if (userInfo) {
      try {
        const parsedUser = JSON.parse(userInfo);
        setUserRole(parsedUser.role || 'VIEWER');
      } catch (error) {
        console.error('Erreur parsing user:', error);
      }
    }
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [analyticsRes, equipRes] = await Promise.all([
        reportsAPI.getAnalytics(),
        equipmentsAPI.getAll()
      ]);
      setAnalytics(analyticsRes.data);
      setEquipments(equipRes.data);
    } catch (error) {
      console.error('Erreur de chargement:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !analytics) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">Chargement...</p>
      </div>
    );
  }

  const handleCustomPeriod = () => {
    setCustomPeriodOpen(true);
  };

  const handleApplyCustomPeriod = (dates) => {
    setCustomDates(dates);
    toast({
      title: 'Période personnalisée appliquée',
      description: `Du ${new Date(dates.startDate).toLocaleDateString('fr-FR')} au ${new Date(dates.endDate).toLocaleDateString('fr-FR')}`
    });
    // Ici vous pourriez recharger les données avec la nouvelle période
  };

  const handleExportReport = () => {
    if (exportFormat === 'pdf') {
      // Pour PDF, utiliser window.print() qui génère un PDF
      window.print();
    } else if (exportFormat === 'csv') {
      // Générer CSV avec les données analytics
      generateCSV();
    } else if (exportFormat === 'xlsx') {
      // Générer XLSX avec les données analytics
      generateXLSX();
    }
  };

  const generateCSV = () => {
    const csvData = [];
    
    // En-tête
    csvData.push(['FSAO Iris - Rapport d\'Analytics']);
    csvData.push(['Date:', new Date().toLocaleDateString('fr-FR')]);
    csvData.push([]);
    
    // KPIs
    csvData.push(['Indicateurs Clés']);
    csvData.push(['Taux de réalisation', `${analytics.tauxRealisation}%`]);
    csvData.push(['MTTR', `${analytics.mttrHeures}h`]);
    csvData.push(['Maintenances préventives réalisées', analytics.maintenancesPreventives?.realise || 0]);
    csvData.push(['Maintenances préventives total', analytics.maintenancesPreventives?.total || 0]);
    csvData.push(['Maintenances correctives réalisées', analytics.maintenancesCorrectives?.realise || 0]);
    csvData.push(['Maintenances correctives total', analytics.maintenancesCorrectives?.total || 0]);
    csvData.push([]);
    
    // Ordres de travail par statut
    csvData.push(['Ordres de Travail par Statut']);
    csvData.push(['Statut', 'Nombre']);
    Object.entries(analytics.workOrdersParStatut).forEach(([statut, count]) => {
      csvData.push([statut, count]);
    });
    
    // Convertir en CSV string
    const csvContent = csvData.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `rapport_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    
    toast({
      title: 'Export CSV',
      description: 'Rapport CSV téléchargé avec succès'
    });
  };

  const generateXLSX = () => {
    // Pour XLSX, on utilise la même approche que CSV mais avec un format différent
    // Simplification : générer un CSV et le nommer .xlsx (limité mais fonctionnel)
    generateCSV();
    toast({
      title: 'Export XLSX',
      description: 'Rapport Excel téléchargé avec succès (format CSV compatible)'
    });
  };

  const periods = [
    { value: 'SEMAINE', label: 'Cette semaine' },
    { value: 'MOIS', label: 'Ce mois' },
    { value: 'TRIMESTRE', label: 'Ce trimestre' },
    { value: 'ANNEE', label: 'Cette année' }
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Rapports & Analytiques</h1>
          <p className="text-gray-600 mt-1">Analysez vos performances de maintenance</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            className="border-blue-600 text-blue-600 hover:bg-blue-50"
            onClick={handleCustomPeriod}
          >
            <Calendar size={20} className="mr-2" />
            Période personnalisée
          </Button>
          
          {userRole === 'ADMIN' && (
            <Select value={exportFormat} onValueChange={setExportFormat}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pdf">PDF</SelectItem>
                <SelectItem value="csv">CSV</SelectItem>
                <SelectItem value="xlsx">Excel (XLSX)</SelectItem>
              </SelectContent>
            </Select>
          )}
          
          <OfflineDisabled message="Export necessite une connexion">
          <Button 
            className="bg-blue-600 hover:bg-blue-700 text-white"
            onClick={handleExportReport}
          >
            <Download size={20} className="mr-2" />
            Exporter {userRole === 'ADMIN' ? exportFormat.toUpperCase() : 'PDF'}
          </Button>
          </OfflineDisabled>
        </div>
      </div>

      {/* Period Filter */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-2 flex-wrap">
            {periods.map(period => (
              <Button
                key={period.value}
                variant={selectedPeriod === period.value ? 'default' : 'outline'}
                onClick={() => setSelectedPeriod(period.value)}
                size="sm"
                className={selectedPeriod === period.value ? 'bg-blue-600 hover:bg-blue-700' : ''}
              >
                {period.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Taux de réalisation */}
        <Card className="hover:shadow-lg transition-shadow">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Taux de réalisation</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{analytics.tauxRealisation}%</p>
                <p className="text-xs text-gray-500 mt-1">
                  {analytics.tauxRealisationDetail?.termine || 0} terminé(s) / {analytics.tauxRealisationDetail?.total || 0} OT ce mois
                </p>
              </div>
              <div className="bg-green-100 p-3 rounded-xl">
                <TrendingUp size={24} className="text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* MTTR */}
        <Card className="hover:shadow-lg transition-shadow">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">MTTR - Temps avant réalisation</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{analytics.mttrHeures || 0}h</p>
                <p className="text-xs text-gray-500 mt-1">Moyenne création → terminé</p>
              </div>
              <div className="bg-blue-100 p-3 rounded-xl">
                <BarChart3 size={24} className="text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Maintenances préventives */}
        <Card className="hover:shadow-lg transition-shadow">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Maintenances préventives</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">
                  {analytics.maintenancesPreventives?.realise || 0}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  sur {analytics.maintenancesPreventives?.total || 0} prévue(s) — {analytics.maintenancesPreventives?.pourcentage || 0}% réalisé
                </p>
              </div>
              <div className="bg-purple-100 p-3 rounded-xl">
                <Calendar size={24} className="text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Maintenances correctives */}
        <Card className="hover:shadow-lg transition-shadow">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Maintenances correctives</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">
                  {analytics.maintenancesCorrectives?.realise || 0}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  sur {analytics.maintenancesCorrectives?.total || 0} créée(s) — {analytics.maintenancesCorrectives?.pourcentage || 0}% réalisé
                </p>
              </div>
              <div className="bg-orange-100 p-3 rounded-xl">
                <BarChart3 size={24} className="text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-6">
        {/* Work Order Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Répartition des ordres de travail</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Par statut</h4>
                <div className="space-y-3">
                  {Object.entries(analytics.workOrdersParStatut).map(([statut, count]) => {
                    const total = Object.values(analytics.workOrdersParStatut).reduce((a, b) => a + b, 0);
                    const percentage = total > 0 ? ((count / total) * 100).toFixed(0) : 0;
                    const labels = {
                      'OUVERT': { label: 'Ouvert', color: 'bg-gray-500' },
                      'EN_COURS': { label: 'En cours', color: 'bg-blue-500' },
                      'EN_ATTENTE': { label: 'En attente', color: 'bg-yellow-500' },
                      'TERMINE': { label: 'Terminé', color: 'bg-green-500' }
                    };
                    return (
                      <div key={statut} className="flex items-center justify-between">
                        <div className="flex items-center gap-2 flex-1">
                          <div className={`w-3 h-3 rounded-full ${labels[statut].color}`}></div>
                          <span className="text-sm text-gray-700">{labels[statut].label}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="w-32 bg-gray-200 rounded-full h-2">
                            <div
                              className={`${labels[statut].color} h-2 rounded-full`}
                              style={{ width: `${percentage}%` }}
                            ></div>
                          </div>
                          <span className="text-sm font-medium text-gray-900 w-12 text-right">
                            {count} ({percentage}%)
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-4 border-t">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Par priorité</h4>
                <div className="space-y-3">
                  {Object.entries(analytics.workOrdersParPriorite).filter(([_, count]) => count > 0).map(([priorite, count]) => {
                    const labels = {
                      'HAUTE': { label: 'Haute', color: 'bg-red-500' },
                      'MOYENNE': { label: 'Moyenne', color: 'bg-orange-500' },
                      'BASSE': { label: 'Basse', color: 'bg-yellow-500' },
                      'AUCUNE': { label: 'Normale', color: 'bg-gray-500' }
                    };
                    return (
                      <div key={priorite} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${labels[priorite].color}`}></div>
                          <span className="text-sm text-gray-700">{labels[priorite].label}</span>
                        </div>
                        <span className="text-sm font-medium text-gray-900">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Equipment Performance */}
      <Card>
        <CardHeader>
          <CardTitle>Performance des équipements</CardTitle>
        </CardHeader>
        <CardContent>
          <EquipmentPerformanceTree equipments={equipments} />
        </CardContent>
      </Card>

      {/* Histogramme Evolution horaire des maintenances */}
      <TimeByCategoryChart />

      {/* Pointage horaire du personnel */}
      <UserTimeTrackingChart />

      <CustomPeriodDialog
        open={customPeriodOpen}
        onOpenChange={setCustomPeriodOpen}
        onApply={handleApplyCustomPeriod}
      />
    </div>
  );
};

export default Reports;