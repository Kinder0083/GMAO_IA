import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  AlertTriangle,
  Thermometer,
  Zap,
  RefreshCw,
  Download,
  FileSpreadsheet,
  Calendar,
  X
} from 'lucide-react';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import api, { sensorsAPI } from '../services/api';
import { useSensors } from '../hooks/useSensors';
import { useToast } from '../hooks/use-toast';
import SensorChart from '../components/Sensors/SensorChart';
import AISensorAnalysis from '../components/Sensors/AISensorAnalysis';
import { formatLocalDate as formatLocalDateUtil } from '../utils/dateUtils';
import OfflineDisabled from '../components/Common/OfflineDisabled';

const IoTDashboard = () => {
  const [sensorReadings, setSensorReadings] = useState({});
  const [statistics, setStatistics] = useState({});
  const [groupsByType, setGroupsByType] = useState([]);
  const [groupsByLocation, setGroupsByLocation] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState(8); // heures - par défaut 8h
  const [activeTab, setActiveTab] = useState('overview');
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportPeriod, setExportPeriod] = useState('7');
  const [exportFormat, setExportFormat] = useState('csv');
  const [exporting, setExporting] = useState(false);
  const [timezoneOffset, setTimezoneOffset] = useState(1); // Défaut GMT+1 (France)
  
  const { toast } = useToast();
  const { sensors: realtimeSensors, loading: loadingSensors, refresh: refreshSensors } = useSensors();

  // Wrapper pour utiliser l'utilitaire commun avec le timezoneOffset local
  const formatLocalDate = useCallback((isoTimestamp, options = {}) => {
    return formatLocalDateUtil(isoTimestamp, timezoneOffset, options);
  }, [timezoneOffset]);

  // Charger le fuseau horaire configuré
  useEffect(() => {
    const loadTimezoneOffset = async () => {
      try {
        const response = await api.timezone.getOffset();
        if (response.data && typeof response.data.timezone_offset === 'number') {
          setTimezoneOffset(response.data.timezone_offset);
        }
      } catch (error) {
        console.warn('Erreur chargement timezone offset, utilisation défaut GMT+1:', error);
      }
    };
    loadTimezoneOffset();
  }, []);

  // Charger les données détaillées
  const loadDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      
      const sensorsToUse = realtimeSensors && realtimeSensors.length > 0 
        ? realtimeSensors 
        : (await api.sensors.getAll()).data;
      
      const [groupsTypeResponse, groupsLocationResponse] = await Promise.all([
        api.sensors.getGroupsByType(),
        api.sensors.getGroupsByLocation()
      ]);
      
      setGroupsByType(groupsTypeResponse.data.groups || []);
      setGroupsByLocation(groupsLocationResponse.data.groups || []);

      if (sensorsToUse.length > 0) {
        const readingsPromises = sensorsToUse.map(sensor =>
          api.sensors.getReadings(sensor.id, 500, timeRange).catch(() => ({ data: [] }))
        );
        const statsPromises = sensorsToUse.map(sensor =>
          api.sensors.getStatistics(sensor.id, timeRange).catch(() => ({ data: {} }))
        );

        const readingsResults = await Promise.all(readingsPromises);
        const statsResults = await Promise.all(statsPromises);

        const readingsMap = {};
        const statsMap = {};
        
        sensorsToUse.forEach((sensor, index) => {
          readingsMap[sensor.id] = readingsResults[index].data;
          statsMap[sensor.id] = statsResults[index].data;
        });

        setSensorReadings(readingsMap);
        setStatistics(statsMap);
      }
    } catch (error) {
      console.error('Erreur chargement dashboard:', error);
      toast({
        title: "Erreur",
        description: "Impossible de charger les données du dashboard",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, [realtimeSensors, timeRange, toast]);

  useEffect(() => {
    if (!loadingSensors) {
      loadDashboardData();
    }
  }, [loadingSensors, timeRange]);

  const sensors = realtimeSensors || [];

  // Formater les données pour le graphique avec le bon fuseau horaire
  const formatChartData = useCallback((readings) => {
    if (!readings || readings.length === 0) return [];
    
    return readings.map(r => {
      // Parser le timestamp en forçant UTC (ajout du Z si absent)
      let ts = String(r.timestamp);
      if (!ts.endsWith('Z') && !ts.includes('+') && !/\d{2}:\d{2}:\d{2}-/.test(ts)) {
        ts += 'Z';
      }
      const utcDate = new Date(ts);
      // Appliquer le décalage horaire configuré dans Paramètres Spéciaux
      const localDate = new Date(utcDate.getTime() + (timezoneOffset * 60 * 60 * 1000));
      
      return {
        time: localDate.toLocaleTimeString('fr-FR', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'UTC' // Utiliser UTC car on a déjà appliqué le décalage manuellement
        }),
        value: r.value,
        timestamp: r.timestamp
      };
    }).reverse();
  }, [timezoneOffset]);

  // Export des données
  const handleExport = async () => {
    try {
      setExporting(true);
      const periodDays = parseInt(exportPeriod);
      
      const response = await api.sensors.exportReadings(periodDays, exportFormat);
      
      // Créer un lien de téléchargement
      const blob = new Blob([response.data], { 
        type: exportFormat === 'xlsx' 
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
          : 'text/csv'
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `capteurs_historique_${new Date().toISOString().slice(0,10)}.${exportFormat}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "Export réussi",
        description: `Les données ont été exportées en ${exportFormat.toUpperCase()}`,
      });
      
      setExportDialogOpen(false);
    } catch (error) {
      console.error('Erreur export:', error);
      toast({
        title: "Erreur d'export",
        description: "Impossible d'exporter les données",
        variant: "destructive"
      });
    } finally {
      setExporting(false);
    }
  };

  // KPIs
  const getKPICards = () => {
    const activeSensors = sensors.filter(s => s.actif).length;
    const alertCount = sensors.filter(s => {
      if (!s.alert_enabled || s.current_value === null || s.current_value === undefined) return false;
      return (s.min_threshold && s.current_value < s.min_threshold) ||
             (s.max_threshold && s.current_value > s.max_threshold);
    }).length;

    const tempSensors = sensors.filter(s => s.type === 'TEMPERATURE' && s.current_value !== null && s.current_value !== undefined);
    const avgTemperature = tempSensors.length > 0 
      ? tempSensors.reduce((sum, s) => sum + s.current_value, 0) / tempSensors.length
      : null;

    const powerSensors = sensors.filter(s => s.type === 'POWER' && s.current_value !== null && s.current_value !== undefined);
    const totalPower = powerSensors.reduce((sum, s) => sum + s.current_value, 0);

    return [
      {
        title: 'Capteurs Actifs',
        value: activeSensors,
        icon: Activity,
        color: 'bg-blue-500',
      },
      {
        title: 'Alertes Actives',
        value: alertCount,
        icon: AlertTriangle,
        color: alertCount > 0 ? 'bg-red-500' : 'bg-green-500',
      },
      {
        title: 'Température Moyenne',
        value: avgTemperature !== null ? `${avgTemperature.toFixed(1)}°C` : '--',
        icon: Thermometer,
        color: 'bg-orange-500',
      },
      {
        title: 'Puissance Totale',
        value: powerSensors.length > 0 ? `${totalPower.toFixed(0)} W` : '--',
        icon: Zap,
        color: 'bg-yellow-500',
      }
    ];
  };

  // Jauge circulaire
  const GaugeWidget = ({ sensor }) => {
    if (!sensor) return null;
    const rawValue = sensor.current_value;
    const value = (rawValue !== null && rawValue !== undefined && !isNaN(rawValue)) ? Number(rawValue) : 0;
    const max = sensor.max_threshold || 100;
    const percentage = Math.min((value / max) * 100, 100);
    
    // Couleur selon les seuils
    let color = '#10b981'; // vert par défaut
    if (sensor.alert_enabled && rawValue !== null) {
      if (sensor.min_threshold && rawValue < sensor.min_threshold) color = '#f59e0b';
      if (sensor.max_threshold && rawValue > sensor.max_threshold) color = '#ef4444';
    }

    return (
      <div className="flex flex-col items-center justify-center h-full">
        <div className="relative w-36 h-36">
          <svg className="transform -rotate-90 w-36 h-36">
            <circle cx="72" cy="72" r="64" stroke="#e5e7eb" strokeWidth="8" fill="none" />
            <circle
              cx="72" cy="72" r="64"
              stroke={color}
              strokeWidth="8"
              fill="none"
              strokeDasharray={`${2 * Math.PI * 64}`}
              strokeDashoffset={`${2 * Math.PI * 64 * (1 - percentage / 100)}`}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold" style={{ color }}>
              {typeof value === 'number' ? value.toFixed(1) : '--'}
            </span>
            <span className="text-xs text-gray-600">{sensor.unite}</span>
          </div>
        </div>
        <p className="text-sm font-medium mt-3 text-center">{sensor.nom}</p>
        {sensor.last_update && (
          <p className="text-xs text-gray-500">
            {formatLocalDate(sensor.last_update, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </p>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-center h-96">
          <RefreshCw className="h-12 w-12 animate-spin text-purple-600" />
        </div>
      </div>
    );
  }

  const kpiCards = getKPICards();

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header avec bouton Export */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Activity className="text-purple-600" size={32} />
            Dashboard IoT
          </h1>
          <p className="text-gray-600 mt-1">
            Surveillance en temps réel de vos capteurs et compteurs
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Bouton Export Global */}
          <OfflineDisabled message="Export necessite une connexion">
          <Button
            variant="outline"
            onClick={() => setExportDialogOpen(true)}
            className="flex items-center gap-2"
            data-testid="export-global-btn"
          >
            <Download size={18} />
            Exporter
          </Button>
          </OfflineDisabled>
          
          {/* Sélecteur de période */}
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(parseInt(e.target.value))}
            className="px-4 py-2 border border-gray-300 rounded-lg bg-white"
            data-testid="time-range-select"
          >
            <option value={1}>1 heure</option>
            <option value={2}>2 heures</option>
            <option value={4}>4 heures</option>
            <option value={8}>8 heures</option>
            <option value={24}>24 heures</option>
            <option value={168}>7 jours</option>
          </select>
          
          <Button
            variant="outline"
            onClick={loadDashboardData}
            disabled={loading}
            data-testid="refresh-btn"
          >
            <RefreshCw className={loading ? 'animate-spin' : ''} size={18} />
          </Button>
        </div>
      </div>

      {/* Dialog Export */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="text-purple-600" size={20} />
              Exporter les données
            </DialogTitle>
            <DialogDescription>
              Exportez l'historique des lectures de tous les capteurs
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="export-period">Période</Label>
              <Select value={exportPeriod} onValueChange={setExportPeriod}>
                <SelectTrigger id="export-period" data-testid="export-period-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Dernières 24 heures</SelectItem>
                  <SelectItem value="7">7 derniers jours</SelectItem>
                  <SelectItem value="30">30 derniers jours</SelectItem>
                  <SelectItem value="90">3 derniers mois</SelectItem>
                  <SelectItem value="180">6 derniers mois</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="export-format">Format</Label>
              <Select value={exportFormat} onValueChange={setExportFormat}>
                <SelectTrigger id="export-format" data-testid="export-format-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="csv">CSV</SelectItem>
                  <SelectItem value="xlsx">Excel (XLSX)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setExportDialogOpen(false)}
            >
              Annuler
            </Button>
            <Button 
              onClick={handleExport} 
              disabled={exporting}
              data-testid="export-confirm-btn"
            >
              {exporting ? (
                <>
                  <RefreshCw className="animate-spin mr-2" size={16} />
                  Export en cours...
                </>
              ) : (
                <>
                  <Download className="mr-2" size={16} />
                  Télécharger
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tabs Navigation */}
      <div className="flex gap-2 mb-6 border-b">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-6 py-3 font-medium transition-colors ${
            activeTab === 'overview'
              ? 'text-purple-600 border-b-2 border-purple-600'
              : 'text-gray-600 hover:text-purple-600'
          }`}
          data-testid="tab-overview"
        >
          Vue d'ensemble
        </button>
        <button
          onClick={() => setActiveTab('groups-type')}
          className={`px-6 py-3 font-medium transition-colors ${
            activeTab === 'groups-type'
              ? 'text-purple-600 border-b-2 border-purple-600'
              : 'text-gray-600 hover:text-purple-600'
          }`}
          data-testid="tab-groups-type"
        >
          Groupes par Type
        </button>
        <button
          onClick={() => setActiveTab('groups-location')}
          className={`px-6 py-3 font-medium transition-colors ${
            activeTab === 'groups-location'
              ? 'text-purple-600 border-b-2 border-purple-600'
              : 'text-gray-600 hover:text-purple-600'
          }`}
          data-testid="tab-groups-location"
        >
          Groupes par Localisation
        </button>
      </div>

      {/* KPI Cards - Vue d'ensemble uniquement */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          {kpiCards.map((kpi, index) => {
            const Icon = kpi.icon;
            return (
              <Card key={index} className="p-6" data-testid={`kpi-card-${index}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">{kpi.title}</p>
                    <p className="text-2xl font-bold">{kpi.value}</p>
                  </div>
                  <div className={`p-3 rounded-lg ${kpi.color}`}>
                    <Icon className="text-white" size={24} />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Vue d'ensemble Tab */}
      {activeTab === 'overview' && (
        <>
          {/* Section Jauges */}
          {sensors.filter(s => ['TEMPERATURE', 'HUMIDITY', 'PRESSURE', 'POWER'].includes(s.type)).length > 0 && (
            <Card className="p-6 mb-6">
              <h2 className="text-xl font-semibold mb-4">Valeurs Actuelles</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {sensors
                  .filter(s => ['TEMPERATURE', 'HUMIDITY', 'PRESSURE', 'POWER'].includes(s.type))
                  .slice(0, 4)
                  .map(sensor => (
                    <GaugeWidget key={sensor.id} sensor={sensor} />
                  ))}
              </div>
            </Card>
          )}

          {/* Section Graphiques */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {sensors.slice(0, 6).map(sensor => {
              const chartData = formatChartData(sensorReadings[sensor.id]);
              const stats = statistics[sensor.id];

              return (
                <Card key={sensor.id} className="p-4" data-testid={`sensor-chart-${sensor.id}`}>
                  {/* Header du graphique */}
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-gray-800">{sensor.nom}</h3>
                      <p className="text-sm text-gray-500">{sensor.type}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-purple-600">
                        {sensor.current_value !== null && sensor.current_value !== undefined 
                          ? `${Number(sensor.current_value).toFixed(1)}`
                          : '--'}
                        <span className="text-sm font-normal text-gray-500 ml-1">
                          {sensor.unite}
                        </span>
                      </p>
                    </div>
                  </div>
                  
                  {/* Graphique */}
                  <div className="bg-gray-50 rounded-lg p-2">
                    <SensorChart 
                      sensor={sensor}
                      chartData={chartData}
                      stats={stats}
                      height={200}
                    />
                  </div>
                  
                  {/* Footer avec statistiques */}
                  <div className="flex justify-between items-center mt-3 px-2 text-xs text-gray-500">
                    <span>
                      {stats?.min != null ? `Min: ${Number(stats.min).toFixed(1)} ${sensor.unite}` : ''}
                    </span>
                    <span>
                      {sensor.last_update && formatLocalDate(sensor.last_update)}
                    </span>
                    <span>
                      {stats?.max != null ? `Max: ${Number(stats.max).toFixed(1)} ${sensor.unite}` : ''}
                    </span>
                  </div>
                  
                  {/* Analyse IA */}
                  <div className="mt-3 px-1">
                    <AISensorAnalysis sensorId={sensor.id} sensorsAPI={sensorsAPI} />
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {/* Groupes par Type Tab */}
      {activeTab === 'groups-type' && (
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">Statistiques par Type de Capteur</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {groupsByType.map(group => (
                <Card key={group.type} className="p-4 bg-gradient-to-br from-purple-50 to-blue-50">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-lg">{group.type_label}</h3>
                    <span className="text-2xl font-bold text-purple-600">{group.count}</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Moyenne:</span>
                      <span className="font-semibold">{group.avg_value != null ? Number(group.avg_value).toFixed(1) : 'N/A'}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Min:</span>
                      <span className="font-semibold text-blue-600">{group.min_value != null ? Number(group.min_value).toFixed(1) : 'N/A'}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Max:</span>
                      <span className="font-semibold text-red-600">{group.max_value != null ? Number(group.max_value).toFixed(1) : 'N/A'}</span>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </Card>

          {/* Graphique de comparaison */}
          {groupsByType.length > 0 && (
            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Comparaison des Moyennes par Type</h2>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={groupsByType.filter(g => g.avg_value !== null)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="type_label" stroke="#9ca3af" style={{ fontSize: '12px' }} />
                  <YAxis stroke="#9ca3af" style={{ fontSize: '12px' }} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                  />
                  <Legend />
                  <Bar dataKey="avg_value" fill="#8b5cf6" name="Moyenne" />
                  <Bar dataKey="min_value" fill="#3b82f6" name="Min" />
                  <Bar dataKey="max_value" fill="#ef4444" name="Max" />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}

          {/* Détails par type */}
          {groupsByType.map(group => (
            <Card key={`details-${group.type}`} className="p-6">
              <h3 className="text-lg font-semibold mb-4">
                {group.type_label} - Détails des Capteurs ({group.count})
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">Nom</th>
                      <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">Valeur Actuelle</th>
                      <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">Unité</th>
                      <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">Emplacement</th>
                      <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">Dernière MAJ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {group.sensors.map(sensor => (
                      <tr key={sensor.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm">{sensor.nom}</td>
                        <td className="px-4 py-3 text-sm font-semibold">
                          {sensor.current_value != null ? Number(sensor.current_value).toFixed(2) : 'N/A'}
                        </td>
                        <td className="px-4 py-3 text-sm">{sensor.unite}</td>
                        <td className="px-4 py-3 text-sm">
                          {sensor.emplacement?.nom || 'Non défini'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {sensor.last_update 
                            ? formatLocalDate(sensor.last_update)
                            : 'Jamais'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Groupes par Localisation Tab */}
      {activeTab === 'groups-location' && (
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">Statistiques par Localisation</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {groupsByLocation.map(group => (
                <Card key={group.location_id} className="p-4 bg-gradient-to-br from-green-50 to-teal-50">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-lg">{group.location_name}</h3>
                    <span className="text-2xl font-bold text-green-600">{group.count}</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Moyenne:</span>
                      <span className="font-semibold">{group.avg_value != null ? Number(group.avg_value).toFixed(1) : 'N/A'}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Alertes actives:</span>
                      <span className={`font-semibold ${group.alerts_active > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {group.alerts_active}
                      </span>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </Card>

          {/* Graphique par localisation */}
          {groupsByLocation.length > 0 && (
            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Répartition des Capteurs par Localisation</h2>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={groupsByLocation}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="location_name" stroke="#9ca3af" style={{ fontSize: '12px' }} />
                  <YAxis stroke="#9ca3af" style={{ fontSize: '12px' }} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                  />
                  <Legend />
                  <Bar dataKey="count" fill="#10b981" name="Nombre de capteurs" />
                  <Bar dataKey="alerts_active" fill="#ef4444" name="Alertes actives" />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}

          {/* Détails par localisation */}
          {groupsByLocation.map(group => (
            <Card key={`details-${group.location_id}`} className="p-6">
              <h3 className="text-lg font-semibold mb-4">
                {group.location_name} - Détails des Capteurs ({group.count})
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">Nom</th>
                      <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">Type</th>
                      <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">Valeur</th>
                      <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">Unité</th>
                      <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">Alerte</th>
                      <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">Dernière MAJ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {group.sensors.map(sensor => (
                      <tr key={sensor.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm">{sensor.nom}</td>
                        <td className="px-4 py-3 text-sm">{sensor.type}</td>
                        <td className="px-4 py-3 text-sm font-semibold">
                          {sensor.current_value != null ? Number(sensor.current_value).toFixed(2) : 'N/A'}
                        </td>
                        <td className="px-4 py-3 text-sm">{sensor.unite}</td>
                        <td className="px-4 py-3">
                          {sensor.alert_enabled ? (
                            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                              Activée
                            </span>
                          ) : (
                            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">
                              Désactivée
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {sensor.last_update 
                            ? formatLocalDate(sensor.last_update)
                            : 'Jamais'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Message si aucun capteur */}
      {sensors.length === 0 && (
        <Card className="p-12 text-center">
          <Activity size={48} className="mx-auto mb-4 text-gray-400" />
          <p className="text-gray-600 mb-4">Aucun capteur configuré</p>
          <Button onClick={() => window.location.href = '/sensors'}>
            Créer un capteur
          </Button>
        </Card>
      )}
    </div>
  );
};

export default IoTDashboard;
