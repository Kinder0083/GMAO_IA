import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { AlertCircle, TrendingUp, BarChart3, Table2, Grid3X3, PieChart, Clock, CalendarDays, FileDown, FileSpreadsheet, Loader2 } from 'lucide-react';
import { surveillanceAPI } from '../services/api';
import { useToast } from '../hooks/use-toast';
import { ResponsivePie } from '@nivo/pie';
import { ResponsiveBar } from '@nivo/bar';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import OfflineDisabled from '../components/Common/OfflineDisabled';

const SurveillanceRapport = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [availableYears, setAvailableYears] = useState([]);
  const [selectedYear, setSelectedYear] = useState(null);
  const [exporting, setExporting] = useState(null); // 'pdf' | 'excel' | null
  const reportRef = useRef(null);
  const [displayMode, setDisplayMode] = useState(() => {
    return localStorage.getItem('surveillance_rapport_display_mode') || 'cards';
  });

  // Charger les années disponibles
  useEffect(() => {
    const loadYears = async () => {
      try {
        const data = await surveillanceAPI.getAvailableYears();
        setAvailableYears(data.years || []);
        setSelectedYear(data.current_year || new Date().getFullYear());
      } catch (error) {
        console.error('Erreur chargement années:', error);
        const currentYear = new Date().getFullYear();
        setAvailableYears([currentYear - 1, currentYear, currentYear + 1]);
        setSelectedYear(currentYear);
      }
    };
    loadYears();
  }, []);

  const loadStats = useCallback(async () => {
    if (!selectedYear) return;
    try {
      setLoading(true);
      const data = await surveillanceAPI.getRapportStats(selectedYear);
      setStats(data);
    } catch (error) {
      console.error('Erreur chargement statistiques:', error);
      toast({ variant: 'destructive', title: 'Erreur', description: 'Impossible de charger les statistiques' });
    } finally {
      setLoading(false);
    }
  }, [selectedYear, toast]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    localStorage.setItem('surveillance_rapport_display_mode', displayMode);
  }, [displayMode]);

  // Export PDF visuel
  const handleExportPDF = async () => {
    if (!reportRef.current || !stats) return;
    setExporting('pdf');
    try {
      const canvas = await html2canvas(reportRef.current, {
        scale: 2, useCORS: true, logging: false,
        backgroundColor: '#f9fafb',
        windowWidth: 1200,
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.85);
      const imgWidth = 210; // A4 width in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      // Si l'image dépasse une page, paginer
      const pageHeight = 297; // A4 height in mm
      let heightLeft = imgHeight;
      let position = 0;
      
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      
      pdf.save(`rapport-surveillance-${selectedYear}.pdf`);
      toast({ title: 'Export PDF', description: `Rapport ${selectedYear} téléchargé` });
    } catch (error) {
      console.error('Erreur export PDF:', error);
      toast({ title: 'Erreur', description: "Échec de l'export PDF", variant: 'destructive' });
    } finally {
      setExporting(null);
    }
  };

  // Export Excel structuré
  const handleExportExcel = () => {
    if (!stats) return;
    setExporting('excel');
    try {
      const wb = XLSX.utils.book_new();
      
      // Onglet Global
      const globalData = [
        ['Indicateur', 'Valeur'],
        ['Année', selectedYear],
        ['Total contrôles', stats.global.total],
        ['Réalisés', stats.global.realises],
        ['Taux de réalisation (%)', stats.global.pourcentage_realisation],
        ['En retard', stats.global.en_retard],
        ['Dans les temps (±8%)', stats.global.dans_les_temps_total > 0 ? `${stats.global.pourcentage_dans_les_temps}% (${stats.global.dans_les_temps}/${stats.global.dans_les_temps_total})` : 'N/A'],
        ['Écart moyen (jours)', stats.global.ecart_moyen !== null ? stats.global.ecart_moyen : 'N/A'],
        ['Anomalies', stats.anomalies],
      ];
      const wsGlobal = XLSX.utils.aoa_to_sheet(globalData);
      wsGlobal['!cols'] = [{ wch: 25 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, wsGlobal, 'Synthèse');
      
      // Onglet Catégories
      const catRows = Object.entries(stats.by_category).map(([k, v]) => [
        k.replace(/_/g, ' '), v.total, v.realises, v.pourcentage, v.ecart_moyen !== null && v.ecart_moyen !== undefined ? v.ecart_moyen : 'N/A'
      ]);
      const wsCat = XLSX.utils.aoa_to_sheet([['Catégorie', 'Total', 'Réalisés', 'Taux (%)', 'Écart moy. (j)'], ...catRows]);
      wsCat['!cols'] = [{ wch: 30 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 15 }];
      XLSX.utils.book_append_sheet(wb, wsCat, 'Par catégorie');
      
      // Onglet Bâtiments
      const batRows = Object.entries(stats.by_batiment).map(([k, v]) => [k, v.total, v.realises, v.pourcentage]);
      const wsBat = XLSX.utils.aoa_to_sheet([['Bâtiment', 'Total', 'Réalisés', 'Taux (%)'], ...batRows]);
      wsBat['!cols'] = [{ wch: 30 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];
      XLSX.utils.book_append_sheet(wb, wsBat, 'Par bâtiment');
      
      // Onglet Périodicités
      const perRows = Object.entries(stats.by_periodicite).map(([k, v]) => [k, v.total, v.realises, v.pourcentage]);
      const wsPer = XLSX.utils.aoa_to_sheet([['Périodicité', 'Total', 'Réalisés', 'Taux (%)'], ...perRows]);
      wsPer['!cols'] = [{ wch: 20 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];
      XLSX.utils.book_append_sheet(wb, wsPer, 'Par périodicité');
      
      XLSX.writeFile(wb, `rapport-surveillance-${selectedYear}.xlsx`);
      toast({ title: 'Export Excel', description: `Rapport ${selectedYear} téléchargé` });
    } catch (error) {
      console.error('Erreur export Excel:', error);
      toast({ title: 'Erreur', description: "Échec de l'export Excel", variant: 'destructive' });
    } finally {
      setExporting(null);
    }
  };

  const currentYear = new Date().getFullYear();

  if (!selectedYear) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">Chargement...</p>
      </div>
    );
  }

  // Préparer les données pour les graphiques
  const categoryChartData = stats ? Object.entries(stats.by_category).map(([key, value]) => ({
    id: key, label: key.replace(/_/g, ' '), value: value.pourcentage,
    count: value.realises, total: value.total
  })) : [];

  const batimentChartData = stats ? Object.entries(stats.by_batiment).map(([key, value]) => ({
    id: key, label: key, value: value.pourcentage, Réalisé: value.realises, Total: value.total
  })) : [];

  const periodiciteChartData = stats ? Object.entries(stats.by_periodicite).map(([key, value]) => ({
    id: key, label: key, value: value.pourcentage, Réalisé: value.realises, Total: value.total
  })) : [];

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900" data-testid="rapport-title">Rapport - Plan de Surveillance</h1>
          <p className="text-gray-600 mt-1">Statistiques et indicateurs de performance</p>
        </div>
        <div className="flex items-center gap-2">
          <OfflineDisabled message="Export necessite une connexion">
          <Button
            variant="outline" size="sm"
            onClick={handleExportPDF}
            disabled={!stats || exporting !== null}
            data-testid="export-pdf-btn"
          >
            {exporting === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <FileDown className="h-4 w-4 mr-1" />}
            PDF
          </Button>
          </OfflineDisabled>
          <OfflineDisabled message="Export necessite une connexion">
          <Button
            variant="outline" size="sm"
            onClick={handleExportExcel}
            disabled={!stats || exporting !== null}
            data-testid="export-excel-btn"
          >
            {exporting === 'excel' ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <FileSpreadsheet className="h-4 w-4 mr-1" />}
            Excel
          </Button>
          </OfflineDisabled>
          <span className="text-sm text-gray-600 font-medium ml-2">Mode :</span>
          <Select value={displayMode} onValueChange={setDisplayMode}>
            <SelectTrigger className="w-44" data-testid="display-mode-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cards"><div className="flex items-center gap-2"><Grid3X3 size={16} /><span>Cartes</span></div></SelectItem>
              <SelectItem value="table"><div className="flex items-center gap-2"><Table2 size={16} /><span>Tableau</span></div></SelectItem>
              <SelectItem value="charts"><div className="flex items-center gap-2"><PieChart size={16} /><span>Graphiques</span></div></SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Onglets d'années */}
      <div className="flex items-center gap-2 flex-wrap" data-testid="year-tabs">
        <CalendarDays className="h-4 w-4 text-gray-500" />
        <span className="text-sm text-gray-600 font-medium mr-1">Année :</span>
        {availableYears.map((year) => (
          <button
            key={year}
            onClick={() => setSelectedYear(year)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              selectedYear === year
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            data-testid={`year-tab-${year}`}
          >
            {year}{year === currentYear ? ' (en cours)' : ''}
          </button>
        ))}
      </div>

      {loading || !stats ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-gray-500">Chargement des statistiques pour {selectedYear}...</p>
        </div>
      ) : (
        <div ref={reportRef}>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* Taux de réalisation */}
            <Card className="hover:shadow-lg transition-shadow" data-testid="kpi-realisation">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Taux de réalisation</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">{stats.global.pourcentage_realisation}%</p>
                    <p className="text-xs text-gray-500 mt-1">{stats.global.realises} / {stats.global.total}</p>
                  </div>
                  <div className="bg-green-100 p-3 rounded-xl">
                    <TrendingUp size={24} className="text-green-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Contrôles en retard */}
            <Card className="hover:shadow-lg transition-shadow" data-testid="kpi-retard">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Contrôles en retard</p>
                    <p className="text-3xl font-bold text-red-600 mt-2">{stats.global.en_retard}</p>
                    <p className="text-xs text-gray-500 mt-1">À traiter en priorité</p>
                  </div>
                  <div className="bg-red-100 p-3 rounded-xl">
                    <AlertCircle size={24} className="text-red-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Contrôles dans les temps (±8%) */}
            <Card className="hover:shadow-lg transition-shadow" data-testid="kpi-dans-les-temps">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Dans les temps (±8%)</p>
                    {stats.global.dans_les_temps_total > 0 ? (
                      <>
                        <p className="text-3xl font-bold text-blue-600 mt-2">{stats.global.pourcentage_dans_les_temps}%</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {stats.global.dans_les_temps}/{stats.global.dans_les_temps_total} dans la tolérance
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-3xl font-bold text-gray-400 mt-2">-</p>
                        <p className="text-xs text-gray-500 mt-1">Aucun écart enregistré</p>
                      </>
                    )}
                  </div>
                  <div className="bg-blue-100 p-3 rounded-xl">
                    <Clock size={24} className="text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Écart moyen */}
            <Card className="hover:shadow-lg transition-shadow" data-testid="kpi-ecart-moyen">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Écart moyen</p>
                    {stats.global.ecart_moyen !== null ? (
                      <>
                        <p className={`text-3xl font-bold mt-2 ${
                          stats.global.ecart_moyen <= 0 ? 'text-emerald-600' :
                          stats.global.ecart_moyen <= 7 ? 'text-amber-600' :
                          'text-red-600'
                        }`}>
                          {stats.global.ecart_moyen > 0 ? '+' : ''}{stats.global.ecart_moyen}j
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {stats.global.ecart_moyen <= 0 ? 'En avance' : 'En retard'} en moyenne
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-3xl font-bold text-gray-400 mt-2">-</p>
                        <p className="text-xs text-gray-500 mt-1">Aucun écart enregistré</p>
                      </>
                    )}
                  </div>
                  <div className={`p-3 rounded-xl ${
                    stats.global.ecart_moyen === null ? 'bg-gray-100' :
                    stats.global.ecart_moyen <= 0 ? 'bg-emerald-100' :
                    stats.global.ecart_moyen <= 7 ? 'bg-amber-100' : 'bg-red-100'
                  }`}>
                    <BarChart3 size={24} className={
                      stats.global.ecart_moyen === null ? 'text-gray-400' :
                      stats.global.ecart_moyen <= 0 ? 'text-emerald-600' :
                      stats.global.ecart_moyen <= 7 ? 'text-amber-600' : 'text-red-600'
                    } />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Affichage conditionnel */}
          {displayMode === 'cards' && <CardsDisplay stats={stats} />}
          {displayMode === 'table' && <TableDisplay stats={stats} />}
          {displayMode === 'charts' && <ChartsDisplay stats={stats} categoryChartData={categoryChartData} batimentChartData={batimentChartData} periodiciteChartData={periodiciteChartData} />}
        </div>
      )}
    </div>
  );
};

// Composant pour l'affichage en cartes
const CardsDisplay = ({ stats }) => {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Taux de réalisation par catégorie</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(stats.by_category).map(([key, value]) => (
              <Card key={key} className="border-l-4 border-l-blue-500">
                <CardContent className="pt-6">
                  <p className="text-sm font-medium text-gray-600 mb-2">{key.replace(/_/g, ' ')}</p>
                  <div className="flex items-baseline gap-3">
                    <p className="text-2xl font-bold text-gray-900">{value.pourcentage}%</p>
                    {value.ecart_moyen !== null && value.ecart_moyen !== undefined && (
                      <span className={`text-sm font-semibold ${
                        value.ecart_moyen <= 0 ? 'text-emerald-600' : value.ecart_moyen <= 7 ? 'text-amber-600' : 'text-red-600'
                      }`}>
                        ({value.ecart_moyen > 0 ? '+' : ''}{value.ecart_moyen}j)
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{value.realises} / {value.total} contrôles</p>
                  <div className="w-full bg-gray-200 rounded-full h-2 mt-3">
                    <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${value.pourcentage}%` }}></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Taux de réalisation par bâtiment</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(stats.by_batiment).map(([key, value]) => (
              <Card key={key} className="border-l-4 border-l-purple-500">
                <CardContent className="pt-6">
                  <p className="text-sm font-medium text-gray-600 mb-2">{key}</p>
                  <p className="text-2xl font-bold text-gray-900">{value.pourcentage}%</p>
                  <p className="text-xs text-gray-500 mt-1">{value.realises} / {value.total} contrôles</p>
                  <div className="w-full bg-gray-200 rounded-full h-2 mt-3">
                    <div className="bg-purple-600 h-2 rounded-full transition-all" style={{ width: `${value.pourcentage}%` }}></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Taux de réalisation par périodicité</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(stats.by_periodicite).map(([key, value]) => (
              <Card key={key} className="border-l-4 border-l-green-500">
                <CardContent className="pt-6">
                  <p className="text-sm font-medium text-gray-600 mb-2">{key}</p>
                  <p className="text-2xl font-bold text-gray-900">{value.pourcentage}%</p>
                  <p className="text-xs text-gray-500 mt-1">{value.realises} / {value.total} contrôles</p>
                  <div className="w-full bg-gray-200 rounded-full h-2 mt-3">
                    <div className="bg-green-600 h-2 rounded-full transition-all" style={{ width: `${value.pourcentage}%` }}></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// Composant pour l'affichage en tableau
const TableDisplay = ({ stats }) => {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Détails par catégorie</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Catégorie</th>
                  <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700">Total</th>
                  <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700">Réalisés</th>
                  <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700">Taux</th>
                  <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700">Écart moy.</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Progression</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(stats.by_category).map(([key, value]) => (
                  <tr key={key} className="border-b hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-4 text-sm font-medium text-gray-900">{key.replace(/_/g, ' ')}</td>
                    <td className="py-3 px-4 text-sm text-gray-700 text-center">{value.total}</td>
                    <td className="py-3 px-4 text-sm text-gray-700 text-center">{value.realises}</td>
                    <td className="py-3 px-4 text-sm font-bold text-gray-900 text-center">{value.pourcentage}%</td>
                    <td className="py-3 px-4 text-sm text-center">
                      {value.ecart_moyen !== null && value.ecart_moyen !== undefined ? (
                        <span className={`font-semibold ${
                          value.ecart_moyen <= 0 ? 'text-emerald-600' : value.ecart_moyen <= 7 ? 'text-amber-600' : 'text-red-600'
                        }`}>
                          {value.ecart_moyen > 0 ? '+' : ''}{value.ecart_moyen}j
                        </span>
                      ) : '-'}
                    </td>
                    <td className="py-3 px-4">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${value.pourcentage}%` }}></div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Détails par bâtiment</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Bâtiment</th>
                  <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700">Total</th>
                  <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700">Réalisés</th>
                  <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700">Taux</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Progression</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(stats.by_batiment).map(([key, value]) => (
                  <tr key={key} className="border-b hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-4 text-sm font-medium text-gray-900">{key}</td>
                    <td className="py-3 px-4 text-sm text-gray-700 text-center">{value.total}</td>
                    <td className="py-3 px-4 text-sm text-gray-700 text-center">{value.realises}</td>
                    <td className="py-3 px-4 text-sm font-bold text-gray-900 text-center">{value.pourcentage}%</td>
                    <td className="py-3 px-4">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-purple-600 h-2 rounded-full transition-all" style={{ width: `${value.pourcentage}%` }}></div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Détails par périodicité</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Périodicité</th>
                  <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700">Total</th>
                  <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700">Réalisés</th>
                  <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700">Taux</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Progression</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(stats.by_periodicite).map(([key, value]) => (
                  <tr key={key} className="border-b hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-4 text-sm font-medium text-gray-900">{key}</td>
                    <td className="py-3 px-4 text-sm text-gray-700 text-center">{value.total}</td>
                    <td className="py-3 px-4 text-sm text-gray-700 text-center">{value.realises}</td>
                    <td className="py-3 px-4 text-sm font-bold text-gray-900 text-center">{value.pourcentage}%</td>
                    <td className="py-3 px-4">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-green-600 h-2 rounded-full transition-all" style={{ width: `${value.pourcentage}%` }}></div>
                      </div>
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
};

// Composant pour l'affichage en graphiques
const ChartsDisplay = ({ stats, categoryChartData, batimentChartData, periodiciteChartData }) => {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Répartition par catégorie (Camembert)</CardTitle></CardHeader>
          <CardContent>
            <div style={{ height: '400px' }}>
              <ResponsivePie
                data={categoryChartData}
                margin={{ top: 40, right: 80, bottom: 80, left: 80 }}
                innerRadius={0.5} padAngle={0.7} cornerRadius={3}
                activeOuterRadiusOffset={8} borderWidth={1}
                borderColor={{ from: 'color', modifiers: [['darker', 0.2]] }}
                arcLinkLabelsSkipAngle={10} arcLinkLabelsTextColor="#333333"
                arcLinkLabelsThickness={2} arcLinkLabelsColor={{ from: 'color' }}
                arcLabelsSkipAngle={10}
                arcLabelsTextColor={{ from: 'color', modifiers: [['darker', 2]] }}
                valueFormat={(value) => `${value}%`}
                legends={[{
                  anchor: 'bottom', direction: 'row', justify: false,
                  translateX: 0, translateY: 56, itemsSpacing: 0,
                  itemWidth: 100, itemHeight: 18, itemTextColor: '#999',
                  itemDirection: 'left-to-right', itemOpacity: 1,
                  symbolSize: 18, symbolShape: 'circle'
                }]}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Taux de réalisation par catégorie (Barres)</CardTitle></CardHeader>
          <CardContent>
            <div style={{ height: '400px' }}>
              <ResponsiveBar
                data={categoryChartData} keys={['value']} indexBy="label"
                margin={{ top: 50, right: 130, bottom: 100, left: 60 }}
                padding={0.3} valueScale={{ type: 'linear' }}
                indexScale={{ type: 'band', round: true }}
                colors={{ scheme: 'nivo' }}
                borderColor={{ from: 'color', modifiers: [['darker', 1.6]] }}
                axisTop={null} axisRight={null}
                axisBottom={{ tickSize: 5, tickPadding: 5, tickRotation: -45, legend: 'Catégorie', legendPosition: 'middle', legendOffset: 80 }}
                axisLeft={{ tickSize: 5, tickPadding: 5, tickRotation: 0, legend: 'Taux (%)', legendPosition: 'middle', legendOffset: -40 }}
                labelSkipWidth={12} labelSkipHeight={12}
                labelTextColor={{ from: 'color', modifiers: [['darker', 1.6]] }}
                valueFormat={(value) => `${value}%`} legends={[]}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Répartition par bâtiment</CardTitle></CardHeader>
        <CardContent>
          <div style={{ height: '400px' }}>
            <ResponsiveBar
              data={batimentChartData} keys={['value']} indexBy="label"
              margin={{ top: 50, right: 130, bottom: 80, left: 60 }}
              padding={0.3} valueScale={{ type: 'linear' }}
              indexScale={{ type: 'band', round: true }}
              colors={{ scheme: 'set2' }}
              borderColor={{ from: 'color', modifiers: [['darker', 1.6]] }}
              axisTop={null} axisRight={null}
              axisBottom={{ tickSize: 5, tickPadding: 5, tickRotation: -45, legend: 'Bâtiment', legendPosition: 'middle', legendOffset: 60 }}
              axisLeft={{ tickSize: 5, tickPadding: 5, tickRotation: 0, legend: 'Taux (%)', legendPosition: 'middle', legendOffset: -40 }}
              labelSkipWidth={12} labelSkipHeight={12}
              labelTextColor={{ from: 'color', modifiers: [['darker', 1.6]] }}
              valueFormat={(value) => `${value}%`} legends={[]}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Répartition par périodicité</CardTitle></CardHeader>
        <CardContent>
          <div style={{ height: '400px' }}>
            <ResponsiveBar
              data={periodiciteChartData} keys={['value']} indexBy="label"
              margin={{ top: 50, right: 130, bottom: 80, left: 60 }}
              padding={0.3} valueScale={{ type: 'linear' }}
              indexScale={{ type: 'band', round: true }}
              colors={{ scheme: 'paired' }}
              borderColor={{ from: 'color', modifiers: [['darker', 1.6]] }}
              axisTop={null} axisRight={null}
              axisBottom={{ tickSize: 5, tickPadding: 5, tickRotation: -45, legend: 'Périodicité', legendPosition: 'middle', legendOffset: 60 }}
              axisLeft={{ tickSize: 5, tickPadding: 5, tickRotation: 0, legend: 'Taux (%)', legendPosition: 'middle', legendOffset: -40 }}
              labelSkipWidth={12} labelSkipHeight={12}
              labelTextColor={{ from: 'color', modifiers: [['darker', 1.6]] }}
              valueFormat={(value) => `${value}%`} legends={[]}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SurveillanceRapport;
