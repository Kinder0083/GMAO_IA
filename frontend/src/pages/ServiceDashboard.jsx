import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../components/ui/dropdown-menu';
import { ScrollArea } from '../components/ui/scroll-area';
import { useToast } from '../hooks/use-toast';
import api from '../services/api';
import {
  Plus, RefreshCw, Loader2, Trash2, MoreVertical, Edit,
  Eye, EyeOff, Hash, Gauge, TrendingUp, PieChart, Table2,
  BarChart2, LayoutGrid, Users
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart, Line,
  BarChart, Bar,
  PieChart as RechartsPie, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from 'recharts';

const CHART_COLORS = {
  blue: ['#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe'],
  green: ['#22c55e', '#4ade80', '#86efac', '#bbf7d0'],
  red: ['#ef4444', '#f87171', '#fca5a5', '#fecaca'],
  purple: ['#a855f7', '#c084fc', '#d8b4fe', '#e9d5ff'],
  orange: ['#f97316', '#fb923c', '#fdba74', '#fed7aa'],
  cyan: ['#06b6d4', '#22d3ee', '#67e8f9', '#a5f3fc'],
  pink: ['#ec4899', '#f472b6', '#f9a8d4', '#fbcfe8'],
  yellow: ['#eab308', '#facc15', '#fde047', '#fef08a'],
  indigo: ['#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe'],
  teal: ['#14b8a6', '#2dd4bf', '#5eead4', '#99f6e4'],
};

const ServiceDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState(null);
  const [services, setServices] = useState([]);
  const [activeService, setActiveService] = useState(null);
  const [widgets, setWidgets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingWidgets, setLoadingWidgets] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Templates
  const [templates, setTemplates] = useState([]);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [availableSensors, setAvailableSensors] = useState([]);
  const [availableMeters, setAvailableMeters] = useState([]);
  const [selectedSensorId, setSelectedSensorId] = useState('');
  const [selectedMeterId, setSelectedMeterId] = useState('');
  const [creatingFromTemplate, setCreatingFromTemplate] = useState(false);

  // Init: load user, services, preferences
  useEffect(() => {
    const init = async () => {
      const userData = localStorage.getItem('user');
      let currentUser = null;
      if (userData) {
        currentUser = JSON.parse(userData);
        setUser(currentUser);
      }

      try {
        // Load services list
        const servicesRes = await api.get('/roles/services/list');
        const svcList = servicesRes.data || [];
        setServices(svcList);

        // Load saved preference
        let savedTab = null;
        try {
          const prefsRes = await api.get('/user-preferences');
          savedTab = prefsRes.data?.service_dashboard_tab;
        } catch {}

        // Set active tab: saved preference > user's service > first service
        if (savedTab && svcList.includes(savedTab)) {
          setActiveService(savedTab);
        } else if (currentUser?.service && svcList.includes(currentUser.service.toUpperCase())) {
          setActiveService(currentUser.service.toUpperCase());
        } else if (svcList.length > 0) {
          setActiveService(svcList[0]);
        }
      } catch (error) {
        console.error('Erreur init dashboard service:', error);
      } finally {
        setLoading(false);
      }
    };
    init();
    loadTemplates();
  }, []);

  // Load widgets when service changes
  useEffect(() => {
    if (activeService) {
      loadWidgets();
    }
  }, [activeService]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh || !activeService) return;
    const interval = setInterval(() => loadWidgets(true), 60000);
    return () => clearInterval(interval);
  }, [autoRefresh, activeService]);

  const loadWidgets = async (silent = false) => {
    if (!activeService) return;
    try {
      if (!silent) setLoadingWidgets(true);
      const response = await api.get(`/custom-widgets?service=${activeService}`);
      setWidgets(response.data || []);
    } catch (error) {
      if (!silent) toast({ title: 'Erreur', description: 'Impossible de charger les widgets', variant: 'destructive' });
    } finally {
      setLoadingWidgets(false);
    }
  };

  const loadTemplates = async () => {
    try {
      const response = await api.get('/custom-widgets/tpl/list');
      setTemplates(response.data || []);
    } catch {}
  };

  const loadSensorsAndMeters = async () => {
    try {
      const [sensorsRes, metersRes] = await Promise.all([
        api.get('/custom-widgets/data-sources/sensors'),
        api.get('/custom-widgets/data-sources/meters')
      ]);
      setAvailableSensors(sensorsRes.data || []);
      setAvailableMeters(metersRes.data || []);
    } catch {}
  };

  const handleTabChange = async (service) => {
    setActiveService(service);
    try {
      await api.put('/user-preferences', { service_dashboard_tab: service });
    } catch {}
  };

  const openTemplateModal = async () => {
    await loadSensorsAndMeters();
    setSelectedTemplate(null);
    setSelectedSensorId('');
    setSelectedMeterId('');
    setShowTemplateModal(true);
  };

  const createFromTemplate = async () => {
    if (!selectedTemplate) return;
    if (selectedTemplate.requires_selection === 'sensor' && !selectedSensorId) {
      toast({ title: 'Selection requise', description: 'Veuillez selectionner un capteur', variant: 'destructive' });
      return;
    }
    if (selectedTemplate.requires_selection === 'meter' && !selectedMeterId) {
      toast({ title: 'Selection requise', description: 'Veuillez selectionner un compteur', variant: 'destructive' });
      return;
    }
    setCreatingFromTemplate(true);
    try {
      const params = new URLSearchParams();
      if (selectedSensorId) params.append('sensor_id', selectedSensorId);
      if (selectedMeterId) params.append('meter_id', selectedMeterId);
      params.append('service', activeService);
      await api.post(`/custom-widgets/tpl/${selectedTemplate.id}/create?${params.toString()}`);
      toast({ title: 'Widget cree', description: `Widget "${selectedTemplate.name}" cree pour ${activeService}` });
      setShowTemplateModal(false);
      loadWidgets();
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de creer le widget', variant: 'destructive' });
    } finally {
      setCreatingFromTemplate(false);
    }
  };

  const refreshWidget = async (widgetId) => {
    try {
      await api.post(`/custom-widgets/${widgetId}/refresh`);
      await loadWidgets(true);
      toast({ title: 'Widget rafraichi' });
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de rafraichir', variant: 'destructive' });
    }
  };

  const deleteWidget = async (widgetId) => {
    if (!window.confirm('Supprimer ce widget ?')) return;
    try {
      await api.delete(`/custom-widgets/${widgetId}`);
      setWidgets(prev => prev.filter(w => w.id !== widgetId));
      toast({ title: 'Widget supprime' });
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de supprimer', variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  // Template categories for display
  const templateCategories = templates.reduce((acc, t) => {
    const cat = t.category || 'Autre';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(t);
    return acc;
  }, {});

  return (
    <div className="p-6" data-testid="service-dashboard">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <LayoutGrid className="h-6 w-6 text-blue-600" />
            Dashboard Service
          </h1>
          <p className="text-sm text-gray-500">Tableau de bord par service — chaque onglet est independant</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setAutoRefresh(!autoRefresh)} data-testid="toggle-auto-refresh">
            {autoRefresh ? <Eye className="h-4 w-4 mr-1" /> : <EyeOff className="h-4 w-4 mr-1" />}
            Auto-refresh {autoRefresh ? 'ON' : 'OFF'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => loadWidgets()} data-testid="refresh-all-btn">
            <RefreshCw className="h-4 w-4 mr-1" /> Rafraichir
          </Button>
          <Button variant="outline" size="sm" onClick={openTemplateModal} data-testid="from-template-btn">
            <LayoutGrid className="h-4 w-4 mr-1" /> Template
          </Button>
          <Button size="sm" onClick={() => navigate('/service-dashboard/widgets/new')} data-testid="new-widget-btn">
            <Plus className="h-4 w-4 mr-1" /> Nouveau widget
          </Button>
        </div>
      </div>

      {/* Service Tabs */}
      {services.length > 0 && (
        <Tabs value={activeService || ''} onValueChange={handleTabChange} className="w-full" data-testid="service-tabs">
          <TabsList className="flex flex-wrap h-auto gap-1 bg-gray-100 p-1 rounded-lg mb-6">
            {services.map(svc => (
              <TabsTrigger
                key={svc}
                value={svc}
                className="data-[state=active]:bg-white data-[state=active]:shadow-sm px-4 py-2 text-sm"
                data-testid={`tab-${svc.toLowerCase()}`}
              >
                {svc}
                <Badge variant="secondary" className="ml-2 text-[10px] h-5">
                  {widgets.filter(w => w.service === svc || (!w.service && svc === activeService)).length === 0 && svc === activeService
                    ? widgets.length
                    : ''}
                </Badge>
              </TabsTrigger>
            ))}
          </TabsList>

          {services.map(svc => (
            <TabsContent key={svc} value={svc} className="mt-0">
              {loadingWidgets ? (
                <div className="flex items-center justify-center h-48">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                </div>
              ) : widgets.length === 0 ? (
                <Card>
                  <CardContent className="py-16 text-center">
                    <LayoutGrid className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <h3 className="text-lg font-medium text-gray-700 mb-1">Aucun widget pour {svc}</h3>
                    <p className="text-sm text-gray-500 mb-4">
                      Creez des widgets personnalises ou utilisez un template
                    </p>
                    <div className="flex items-center justify-center gap-3">
                      <Button variant="outline" onClick={openTemplateModal}>
                        <LayoutGrid className="h-4 w-4 mr-1" /> Depuis un template
                      </Button>
                      <Button onClick={() => navigate('/service-dashboard/widgets/new')}>
                        <Plus className="h-4 w-4 mr-1" /> Nouveau widget
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {widgets.map(widget => (
                    <WidgetCard
                      key={widget.id}
                      widget={widget}
                      onRefresh={() => refreshWidget(widget.id)}
                      onEdit={() => navigate(`/service-dashboard/widgets/${widget.id}/edit`)}
                      onDelete={() => deleteWidget(widget.id)}
                      isOwner={widget.created_by === user?.id}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}

      {/* Template Modal */}
      <Dialog open={showTemplateModal} onOpenChange={setShowTemplateModal}>
        <DialogContent className="max-w-2xl max-h-[85vh]" data-testid="template-modal">
          <DialogHeader>
            <DialogTitle>Creer un widget depuis un template</DialogTitle>
            <DialogDescription>
              Pour le service : <strong>{activeService}</strong>
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-3">
            <div className="space-y-4">
              {Object.entries(templateCategories).map(([category, tpls]) => (
                <div key={category}>
                  <h4 className="text-sm font-semibold text-gray-600 mb-2">{category}</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {tpls.map(tpl => (
                      <div
                        key={tpl.id}
                        className={`p-3 rounded-lg border cursor-pointer transition-all ${
                          selectedTemplate?.id === tpl.id ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'hover:border-gray-300'
                        }`}
                        onClick={() => setSelectedTemplate(tpl)}
                        data-testid={`tpl-${tpl.id}`}
                      >
                        <p className="text-sm font-medium">{tpl.name}</p>
                        <p className="text-xs text-gray-500 mt-1">{tpl.description}</p>
                        <Badge variant="secondary" className="mt-2 text-[10px]">{tpl.preview_value}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          {/* Sensor/Meter selection if needed */}
          {selectedTemplate?.requires_selection === 'sensor' && (
            <div className="mt-3">
              <label className="text-sm font-medium mb-1 block">Capteur</label>
              {availableSensors.length === 0 ? (
                <p className="text-sm text-gray-500 italic">Aucun capteur disponible.</p>
              ) : (
                <Select value={selectedSensorId} onValueChange={setSelectedSensorId}>
                  <SelectTrigger><SelectValue placeholder="Choisir un capteur..." /></SelectTrigger>
                  <SelectContent>
                    {availableSensors.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name} ({s.type})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
          {selectedTemplate?.requires_selection === 'meter' && (
            <div className="mt-3">
              <label className="text-sm font-medium mb-1 block">Compteur</label>
              {availableMeters.length === 0 ? (
                <p className="text-sm text-gray-500 italic">Aucun compteur disponible.</p>
              ) : (
                <Select value={selectedMeterId} onValueChange={setSelectedMeterId}>
                  <SelectTrigger><SelectValue placeholder="Choisir un compteur..." /></SelectTrigger>
                  <SelectContent>
                    {availableMeters.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.name} ({m.type} - {m.unit || 'Sans unite'})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 mt-4 pt-3 border-t">
            <Button variant="outline" onClick={() => setShowTemplateModal(false)}>Annuler</Button>
            <Button onClick={createFromTemplate} disabled={!selectedTemplate || creatingFromTemplate}>
              {creatingFromTemplate ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Creer le widget
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Widget Card Component
const WidgetCard = ({ widget, onRefresh, onEdit, onDelete, isOwner }) => {
  const visualization = widget.visualization || {};
  const colorScheme = visualization.color_scheme || 'blue';
  const colors = CHART_COLORS[colorScheme] || CHART_COLORS.blue;
  const primarySource = widget.data_sources?.find(s => s.id === widget.primary_source_id);
  const value = primarySource?.cached_value;

  const sizeClasses = {
    small: 'col-span-1',
    medium: 'col-span-1 md:col-span-2',
    large: 'col-span-1 md:col-span-2 lg:col-span-3',
    full: 'col-span-1 md:col-span-2 lg:col-span-4',
  };

  const getWidgetIcon = () => {
    const icons = { value: Hash, gauge: Gauge, line_chart: TrendingUp, bar_chart: BarChart2, pie_chart: PieChart, donut: PieChart, table: Table2 };
    const Icon = icons[visualization.type] || Hash;
    return <Icon className="h-4 w-4" />;
  };

  return (
    <Card className={`${sizeClasses[visualization.size] || 'col-span-1'} relative group`} data-testid={`widget-${widget.id}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded bg-${colorScheme}-100`}>{getWidgetIcon()}</div>
            <CardTitle className="text-sm font-medium">{visualization.title || widget.name}</CardTitle>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onRefresh}><RefreshCw className="h-4 w-4 mr-2" />Rafraichir</DropdownMenuItem>
              {isOwner && (
                <>
                  <DropdownMenuItem onClick={onEdit}><Edit className="h-4 w-4 mr-2" />Modifier</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onDelete} className="text-red-600"><Trash2 className="h-4 w-4 mr-2" />Supprimer</DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {visualization.subtitle && <p className="text-xs text-gray-500">{visualization.subtitle}</p>}
      </CardHeader>
      <CardContent>
        <WidgetVisualization type={visualization.type} value={value} colors={colors} colorScheme={colorScheme} suffix={visualization.suffix} />
      </CardContent>
    </Card>
  );
};

// Widget Visualization Component
const WidgetVisualization = ({ type, value, colors, colorScheme, suffix = '' }) => {
  if (value === null || value === undefined) {
    return <p className="text-gray-400 text-sm italic">Aucune donnee</p>;
  }

  if (type === 'value' || type === 'gauge') {
    const displayValue = typeof value === 'number' ? value.toLocaleString('fr-FR') : value;
    return (
      <div className="flex items-end gap-1">
        <span className="text-3xl font-bold" style={{ color: colors[0] }}>{displayValue}</span>
        {suffix && <span className="text-sm text-gray-500 mb-1">{suffix}</span>}
      </div>
    );
  }

  if ((type === 'line_chart' || type === 'bar_chart') && Array.isArray(value)) {
    return (
      <div className="h-32">
        <ResponsiveContainer width="100%" height="100%">
          {type === 'line_chart' ? (
            <LineChart data={value}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Line type="monotone" dataKey="value" stroke={colors[0]} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          ) : (
            <BarChart data={value}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="value" fill={colors[0]} radius={[4, 4, 0, 0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    );
  }

  if ((type === 'pie_chart' || type === 'donut') && Array.isArray(value)) {
    return (
      <div className="h-32">
        <ResponsiveContainer width="100%" height="100%">
          <RechartsPie>
            <Pie
              data={value}
              dataKey="value"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius={type === 'donut' ? 25 : 0}
              outerRadius={50}
            >
              {value.map((entry, i) => (
                <Cell key={i} fill={colors[i % colors.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: '10px' }} />
          </RechartsPie>
        </ResponsiveContainer>
      </div>
    );
  }

  if (type === 'table' && Array.isArray(value)) {
    return (
      <div className="max-h-32 overflow-auto text-xs">
        <table className="w-full">
          <tbody>
            {value.slice(0, 10).map((row, i) => (
              <tr key={i} className={i % 2 === 0 ? 'bg-gray-50' : ''}>
                <td className="px-2 py-1 font-medium">{row.label}</td>
                <td className="px-2 py-1 text-right">{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return <p className="text-2xl font-bold" style={{ color: colors[0] }}>{String(value)}{suffix}</p>;
};

export default ServiceDashboard;
