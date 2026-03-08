import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { useToast } from '../hooks/use-toast';
import {
  ArrowLeft, Save, Plus, Trash2, Play, Eye, RefreshCw,
  FileSpreadsheet, Database, Calculator, Settings,
  BarChart2, PieChart, TrendingUp, Gauge, Table2, Hash,
  HelpCircle, Check, X, AlertCircle, Loader2, MousePointer
} from 'lucide-react';
import api from '../services/api';

// Types de widgets disponibles
const WIDGET_TYPES = [
  { value: 'value', label: 'Valeur simple', icon: Hash, description: 'Affiche un grand chiffre avec titre' },
  { value: 'gauge', label: 'Jauge', icon: Gauge, description: 'Pourcentage avec couleur selon seuils' },
  { value: 'line_chart', label: 'Graphique ligne', icon: TrendingUp, description: 'Évolution temporelle' },
  { value: 'bar_chart', label: 'Graphique barres', icon: BarChart2, description: 'Comparaison de valeurs' },
  { value: 'pie_chart', label: 'Camembert', icon: PieChart, description: 'Répartition en pourcentage' },
  { value: 'donut', label: 'Donut', icon: PieChart, description: 'Camembert avec centre vide' },
  { value: 'table', label: 'Tableau', icon: Table2, description: 'Liste de données' },
];

// Types de sources de données
const SOURCE_TYPES = [
  { value: 'manual', label: 'Valeur manuelle', icon: Settings, description: 'Entrez une valeur fixe' },
  { value: 'excel', label: 'Fichier Excel', icon: FileSpreadsheet, description: 'Lecture depuis un fichier Excel sur le réseau' },
  { value: 'gmao', label: 'Données FSAO', icon: Database, description: 'Données de l\'application' },
  { value: 'formula', label: 'Formule', icon: Calculator, description: 'Calcul basé sur d\'autres sources' },
];

// Couleurs disponibles
const COLOR_SCHEMES = [
  { value: 'blue', label: 'Bleu', color: '#3b82f6' },
  { value: 'green', label: 'Vert', color: '#22c55e' },
  { value: 'red', label: 'Rouge', color: '#ef4444' },
  { value: 'purple', label: 'Violet', color: '#a855f7' },
  { value: 'orange', label: 'Orange', color: '#f97316' },
  { value: 'cyan', label: 'Cyan', color: '#06b6d4' },
  { value: 'pink', label: 'Rose', color: '#ec4899' },
  { value: 'yellow', label: 'Jaune', color: '#eab308' },
  { value: 'indigo', label: 'Indigo', color: '#6366f1' },
  { value: 'teal', label: 'Turquoise', color: '#14b8a6' },
];

// Tailles de widgets
const WIDGET_SIZES = [
  { value: 'small', label: 'Petit', cols: 1 },
  { value: 'medium', label: 'Moyen', cols: 2 },
  { value: 'large', label: 'Grand', cols: 3 },
  { value: 'full', label: 'Pleine largeur', cols: 4 },
];

const CustomWidgetEditor = () => {
  const navigate = useNavigate();
  const { widgetId } = useParams();
  const { toast } = useToast();
  const isEditing = !!widgetId;

  // État du widget
  const [widget, setWidget] = useState({
    name: '',
    description: '',
    data_sources: [],
    primary_source_id: '',
    visualization: {
      title: '',
      subtitle: '',
      type: 'value',
      unit: '',
      prefix: '',
      suffix: '',
      decimal_places: 0,
      min_value: 0,
      max_value: 100,
      thresholds: null,
      size: 'medium',
      color_scheme: 'blue',
      icon: null,
    },
    refresh_interval: 5,
    is_shared: false,
    shared_with_roles: [],
    service: null,
  });

  // États UI
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [gmaoDataTypes, setGmaoDataTypes] = useState([]);
  const [availableSensors, setAvailableSensors] = useState([]);
  const [availableMeters, setAvailableMeters] = useState([]);
  const [loadingSensors, setLoadingSensors] = useState(false);
  const [loadingMeters, setLoadingMeters] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [activeTab, setActiveTab] = useState('general');

  // Charger les types de données FSAO
  useEffect(() => {
    loadGmaoDataTypes();
    loadSensorsAndMeters();
    if (isEditing) {
      loadWidget();
    }
  }, [widgetId]);

  const loadGmaoDataTypes = async () => {
    try {
      const response = await api.get('/custom-widgets/data-types/gmao');
      setGmaoDataTypes(response.data);
    } catch (error) {
      console.error('Erreur chargement types FSAO:', error);
    }
  };

  const loadSensorsAndMeters = async () => {
    // Charger les capteurs
    setLoadingSensors(true);
    try {
      const response = await api.get('/custom-widgets/data-sources/sensors');
      setAvailableSensors(response.data || []);
    } catch (error) {
      console.error('Erreur chargement capteurs:', error);
    } finally {
      setLoadingSensors(false);
    }

    // Charger les compteurs
    setLoadingMeters(true);
    try {
      const response = await api.get('/custom-widgets/data-sources/meters');
      setAvailableMeters(response.data || []);
    } catch (error) {
      console.error('Erreur chargement compteurs:', error);
    } finally {
      setLoadingMeters(false);
    }
  };

  const loadWidget = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/custom-widgets/${widgetId}`);
      setWidget(response.data);
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Impossible de charger le widget',
        variant: 'destructive'
      });
      navigate('/service-dashboard');
    } finally {
      setLoading(false);
    }
  };

  // Ajouter une source de données
  const addDataSource = (type) => {
    const newSource = {
      id: `source_${Date.now()}`,
      name: `Source ${widget.data_sources.length + 1}`,
      type: type,
      manual_value: type === 'manual' ? 0 : null,
      excel_config: type === 'excel' ? {
        smb_path: '',
        sheet_name: '',
        cell_reference: '',
        column_name: '',
        aggregation: null,
      } : null,
      gmao_config: type === 'gmao' ? {
        data_type: '',
        service_filter: null,
        status_filter: null,
        date_from: null,
        date_to: null,
      } : null,
      formula: type === 'formula' ? '' : null,
      cached_value: null,
      last_updated: null,
      error_message: null,
    };

    setWidget(prev => ({
      ...prev,
      data_sources: [...prev.data_sources, newSource],
      primary_source_id: prev.primary_source_id || newSource.id
    }));
  };

  // Supprimer une source de données
  const removeDataSource = (sourceId) => {
    setWidget(prev => ({
      ...prev,
      data_sources: prev.data_sources.filter(s => s.id !== sourceId),
      primary_source_id: prev.primary_source_id === sourceId ? (prev.data_sources[0]?.id || '') : prev.primary_source_id
    }));
  };

  // Mettre à jour une source de données
  const updateDataSource = (sourceId, updates) => {
    setWidget(prev => ({
      ...prev,
      data_sources: prev.data_sources.map(s => 
        s.id === sourceId ? { ...s, ...updates } : s
      )
    }));
  };

  // Tester une source Excel
  const testExcelConnection = async (source) => {
    try {
      setTestResult({ loading: true, sourceId: source.id });
      const excelConfig = source.excel_config || {};
      const response = await api.post('/custom-widgets/test/excel-connection', null, {
        params: { 
          smb_path: excelConfig.smb_path,
          username: excelConfig.smb_username || null,
          password: excelConfig.smb_password || null
        }
      });
      setTestResult({
        sourceId: source.id,
        success: response.data.success,
        message: response.data.success ? `Connexion réussie - Feuilles: ${response.data.sheets?.join(', ')}` : response.data.error,
        sheets: response.data.sheets
      });
    } catch (error) {
      setTestResult({
        sourceId: source.id,
        success: false,
        message: error.response?.data?.detail || 'Erreur de connexion SMB'
      });
    }
  };

  // Tester une formule
  const testFormula = async (source) => {
    try {
      setTestResult({ loading: true, sourceId: source.id });
      
      // Construire les valeurs de test depuis les autres sources
      const testValues = {};
      widget.data_sources.forEach(s => {
        if (s.id !== source.id && s.name) {
          testValues[s.name] = s.cached_value || s.manual_value || 0;
        }
      });

      const response = await api.post('/custom-widgets/test/formula', null, {
        params: { formula: source.formula },
        data: testValues
      });

      setTestResult({
        sourceId: source.id,
        success: response.data.success,
        message: response.data.success ? `Résultat: ${response.data.result}` : response.data.error,
        result: response.data.result
      });
    } catch (error) {
      setTestResult({
        sourceId: source.id,
        success: false,
        message: error.response?.data?.detail || 'Erreur de formule'
      });
    }
  };

  // Sauvegarder le widget
  const handleSave = async () => {
    // Validation
    if (!widget.name.trim()) {
      toast({ title: 'Erreur', description: 'Le nom est obligatoire', variant: 'destructive' });
      return;
    }
    if (widget.data_sources.length === 0) {
      toast({ title: 'Erreur', description: 'Ajoutez au moins une source de données', variant: 'destructive' });
      return;
    }
    if (!widget.primary_source_id) {
      toast({ title: 'Erreur', description: 'Sélectionnez une source principale', variant: 'destructive' });
      return;
    }

    try {
      setSaving(true);

      // Préparer les données
      const widgetData = {
        ...widget,
        visualization: {
          ...widget.visualization,
          title: widget.visualization.title || widget.name
        }
      };

      if (isEditing) {
        await api.put(`/custom-widgets/${widgetId}`, widgetData);
        toast({ title: 'Widget mis à jour', description: 'Les modifications ont été enregistrées' });
      } else {
        await api.post('/custom-widgets', widgetData);
        toast({ title: 'Widget créé', description: 'Le widget a été créé avec succès' });
      }

      navigate('/service-dashboard');
    } catch (error) {
      toast({
        title: 'Erreur',
        description: error.response?.data?.detail || 'Impossible de sauvegarder le widget',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate('/service-dashboard')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour
          </Button>
          <div>
            <h1 className="text-2xl font-bold">
              {isEditing ? 'Modifier le widget' : 'Créer un widget personnalisé'}
            </h1>
            <p className="text-gray-500 text-sm">
              Configurez votre widget avec des sources de données et une visualisation
            </p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          {isEditing ? 'Enregistrer' : 'Créer le widget'}
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 mb-6">
          <TabsTrigger value="general">1. Général</TabsTrigger>
          <TabsTrigger value="sources">2. Sources de données</TabsTrigger>
          <TabsTrigger value="visualization">3. Visualisation</TabsTrigger>
          <TabsTrigger value="sharing">4. Partage</TabsTrigger>
        </TabsList>

        {/* Tab 1: Général */}
        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle>Informations générales</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nom du widget *</Label>
                  <Input
                    id="name"
                    value={widget.name}
                    onChange={(e) => setWidget(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Ex: Taux de disponibilité équipements"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="refresh">Fréquence de mise à jour (minutes)</Label>
                  <Input
                    id="refresh"
                    type="number"
                    min={1}
                    value={widget.refresh_interval}
                    onChange={(e) => setWidget(prev => ({ ...prev, refresh_interval: parseInt(e.target.value) || 5 }))}
                  />
                  <p className="text-xs text-gray-500">Défaut: 5 minutes</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={widget.description || ''}
                  onChange={(e) => setWidget(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Description du widget et de son utilité"
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Sources de données */}
        <TabsContent value="sources">
          <div className="space-y-4">
            {/* Boutons d'ajout */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Sources de données</span>
                  <div className="flex gap-2">
                    {SOURCE_TYPES.map(type => (
                      <Button
                        key={type.value}
                        variant="outline"
                        size="sm"
                        onClick={() => addDataSource(type.value)}
                      >
                        <type.icon className="h-4 w-4 mr-1" />
                        {type.label}
                      </Button>
                    ))}
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {widget.data_sources.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Database className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>Aucune source de données</p>
                    <p className="text-sm">Cliquez sur un des boutons ci-dessus pour ajouter une source</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {widget.data_sources.map((source, index) => (
                      <DataSourceEditor
                        key={source.id}
                        source={source}
                        index={index}
                        isPrimary={source.id === widget.primary_source_id}
                        gmaoDataTypes={gmaoDataTypes}
                        allSources={widget.data_sources}
                        availableSensors={availableSensors}
                        availableMeters={availableMeters}
                        testResult={testResult?.sourceId === source.id ? testResult : null}
                        onUpdate={(updates) => updateDataSource(source.id, updates)}
                        onRemove={() => removeDataSource(source.id)}
                        onSetPrimary={() => setWidget(prev => ({ ...prev, primary_source_id: source.id }))}
                        onTestExcel={() => testExcelConnection(source)}
                        onTestFormula={() => testFormula(source)}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 3: Visualisation */}
        <TabsContent value="visualization">
          <div className="grid grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Type de visualisation</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  {WIDGET_TYPES.map(type => (
                    <button
                      key={type.value}
                      onClick={() => setWidget(prev => ({
                        ...prev,
                        visualization: { ...prev.visualization, type: type.value }
                      }))}
                      className={`p-4 rounded-lg border-2 text-left transition-all ${
                        widget.visualization.type === type.value
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <type.icon className={`h-6 w-6 mb-2 ${
                        widget.visualization.type === type.value ? 'text-blue-600' : 'text-gray-400'
                      }`} />
                      <div className="font-medium text-sm">{type.label}</div>
                      <div className="text-xs text-gray-500">{type.description}</div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Apparence</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Titre affiché</Label>
                    <Input
                      value={widget.visualization.title || ''}
                      onChange={(e) => setWidget(prev => ({
                        ...prev,
                        visualization: { ...prev.visualization, title: e.target.value }
                      }))}
                      placeholder={widget.name || 'Titre du widget'}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Sous-titre</Label>
                    <Input
                      value={widget.visualization.subtitle || ''}
                      onChange={(e) => setWidget(prev => ({
                        ...prev,
                        visualization: { ...prev.visualization, subtitle: e.target.value }
                      }))}
                      placeholder="Sous-titre optionnel"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Taille</Label>
                      <Select
                        value={widget.visualization.size}
                        onValueChange={(value) => setWidget(prev => ({
                          ...prev,
                          visualization: { ...prev.visualization, size: value }
                        }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {WIDGET_SIZES.map(size => (
                            <SelectItem key={size.value} value={size.value}>
                              {size.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Couleur</Label>
                      <Select
                        value={widget.visualization.color_scheme}
                        onValueChange={(value) => setWidget(prev => ({
                          ...prev,
                          visualization: { ...prev.visualization, color_scheme: value }
                        }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {COLOR_SCHEMES.map(color => (
                            <SelectItem key={color.value} value={color.value}>
                              <div className="flex items-center gap-2">
                                <div 
                                  className="w-4 h-4 rounded-full" 
                                  style={{ backgroundColor: color.color }}
                                />
                                {color.label}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Options pour valeur simple */}
                  {widget.visualization.type === 'value' && (
                    <div className="grid grid-cols-3 gap-4 pt-4 border-t">
                      <div className="space-y-2">
                        <Label>Préfixe</Label>
                        <Input
                          value={widget.visualization.prefix || ''}
                          onChange={(e) => setWidget(prev => ({
                            ...prev,
                            visualization: { ...prev.visualization, prefix: e.target.value }
                          }))}
                          placeholder="Ex: €"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Suffixe / Unité</Label>
                        <Input
                          value={widget.visualization.suffix || widget.visualization.unit || ''}
                          onChange={(e) => setWidget(prev => ({
                            ...prev,
                            visualization: { ...prev.visualization, suffix: e.target.value, unit: e.target.value }
                          }))}
                          placeholder="Ex: %"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Décimales</Label>
                        <Input
                          type="number"
                          min={0}
                          max={4}
                          value={widget.visualization.decimal_places || 0}
                          onChange={(e) => setWidget(prev => ({
                            ...prev,
                            visualization: { ...prev.visualization, decimal_places: parseInt(e.target.value) || 0 }
                          }))}
                        />
                      </div>
                    </div>
                  )}

                  {/* Options pour jauge */}
                  {widget.visualization.type === 'gauge' && (
                    <div className="space-y-4 pt-4 border-t">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Valeur minimum</Label>
                          <Input
                            type="number"
                            value={widget.visualization.min_value || 0}
                            onChange={(e) => setWidget(prev => ({
                              ...prev,
                              visualization: { ...prev.visualization, min_value: parseFloat(e.target.value) || 0 }
                            }))}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Valeur maximum</Label>
                          <Input
                            type="number"
                            value={widget.visualization.max_value || 100}
                            onChange={(e) => setWidget(prev => ({
                              ...prev,
                              visualization: { ...prev.visualization, max_value: parseFloat(e.target.value) || 100 }
                            }))}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Tab 4: Partage */}
        <TabsContent value="sharing">
          <Card>
            <CardHeader>
              <CardTitle>Options de partage</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Partager ce widget</Label>
                  <p className="text-sm text-gray-500">
                    Permettre à d'autres utilisateurs de voir ce widget
                  </p>
                </div>
                <Switch
                  checked={widget.is_shared}
                  onCheckedChange={(checked) => setWidget(prev => ({ ...prev, is_shared: checked }))}
                />
              </div>

              {widget.is_shared && (
                <div className="space-y-4 pt-4 border-t">
                  <Label>Partager avec les rôles</Label>
                  <div className="flex flex-wrap gap-2">
                    {['ADMIN', 'RSP_SERVICE', 'TECHNICIEN', 'OPERATEUR'].map(role => (
                      <Badge
                        key={role}
                        variant={widget.shared_with_roles?.includes(role) ? 'default' : 'outline'}
                        className="cursor-pointer"
                        onClick={() => {
                          const roles = widget.shared_with_roles || [];
                          const newRoles = roles.includes(role)
                            ? roles.filter(r => r !== role)
                            : [...roles, role];
                          setWidget(prev => ({ ...prev, shared_with_roles: newRoles }));
                        }}
                      >
                        {widget.shared_with_roles?.includes(role) && <Check className="h-3 w-3 mr-1" />}
                        {role}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

// Constructeur visuel de formules
const FORMULA_FUNCTIONS = [
  { cat: 'Math', items: [
    { name: 'SUM', tpl: 'SUM(, )', desc: 'Somme' },
    { name: 'AVG', tpl: 'AVG(, )', desc: 'Moyenne' },
    { name: 'MIN', tpl: 'MIN(, )', desc: 'Minimum' },
    { name: 'MAX', tpl: 'MAX(, )', desc: 'Maximum' },
    { name: 'ABS', tpl: 'ABS()', desc: 'Valeur absolue' },
    { name: 'ROUND', tpl: 'ROUND(, 2)', desc: 'Arrondi' },
    { name: 'SQRT', tpl: 'SQRT()', desc: 'Racine carree' },
    { name: 'POW', tpl: 'POW(, 2)', desc: 'Puissance' },
  ]},
  { cat: 'Logique', items: [
    { name: 'IF', tpl: 'IF(, , )', desc: 'Condition SI' },
    { name: 'IFERROR', tpl: 'IFERROR(, 0)', desc: 'Si erreur' },
  ]},
  { cat: 'Pourcentage', items: [
    { name: 'PERCENTAGE', tpl: 'PERCENTAGE(, )', desc: 'Pourcentage (part, total)' },
    { name: 'GROWTH_RATE', tpl: 'GROWTH_RATE(, )', desc: 'Taux de croissance' },
  ]},
  { cat: 'Comptage', items: [
    { name: 'COUNT', tpl: 'COUNT()', desc: 'Nombre d\'elements' },
  ]},
];

const FORMULA_OPERATORS = [
  { symbol: '+', label: '+', desc: 'Addition' },
  { symbol: '-', label: '-', desc: 'Soustraction' },
  { symbol: '*', label: '*', desc: 'Multiplication' },
  { symbol: '/', label: '/', desc: 'Division' },
  { symbol: '%', label: '%', desc: 'Modulo' },
  { symbol: '(', label: '(', desc: 'Parenthese ouvrante' },
  { symbol: ')', label: ')', desc: 'Parenthese fermante' },
];

const VisualFormulaBuilder = ({ formula, allSources, testResult, onFormulaChange, onTestFormula }) => {
  const textareaRef = React.useRef(null);
  const [showFunctions, setShowFunctions] = useState(false);

  const insertAtCursor = (text) => {
    const el = textareaRef.current;
    if (!el) {
      onFormulaChange((formula || '') + text);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const before = (formula || '').substring(0, start);
    const after = (formula || '').substring(end);
    const newFormula = before + text + after;
    onFormulaChange(newFormula);
    // Place cursor after inserted text
    setTimeout(() => {
      el.focus();
      const pos = start + text.length;
      el.setSelectionRange(pos, pos);
    }, 0);
  };

  const insertSource = (sourceName) => {
    insertAtCursor(`$${sourceName}`);
  };

  const insertOperator = (op) => {
    insertAtCursor(` ${op} `);
  };

  const insertFunction = (fn) => {
    insertAtCursor(fn.tpl);
    setShowFunctions(false);
  };

  const clearFormula = () => {
    onFormulaChange('');
    textareaRef.current?.focus();
  };

  // Syntax highlight for display
  const renderHighlightedFormula = () => {
    if (!formula) return <span className="text-gray-400 italic">Formule vide - utilisez les blocs ci-dessous</span>;
    const parts = formula.split(/(\$\w+|SUM|AVG|MIN|MAX|COUNT|ABS|ROUND|SQRT|POW|IF|IFERROR|PERCENTAGE|GROWTH_RATE|CONCAT|VS_PREV_MONTH|VS_PREV_YEAR)/g);
    return parts.map((part, i) => {
      if (part.startsWith('$')) {
        return <span key={i} className="inline-block bg-blue-100 text-blue-700 px-1 rounded text-xs font-semibold">{part}</span>;
      }
      if (/^(SUM|AVG|MIN|MAX|COUNT|ABS|ROUND|SQRT|POW|IF|IFERROR|PERCENTAGE|GROWTH_RATE|CONCAT|VS_PREV_MONTH|VS_PREV_YEAR)$/.test(part)) {
        return <span key={i} className="inline-block bg-purple-100 text-purple-700 px-1 rounded text-xs font-semibold">{part}</span>;
      }
      return <span key={i} className="text-xs">{part}</span>;
    });
  };

  return (
    <div className="space-y-3" data-testid="visual-formula-builder">
      {/* Formula preview with syntax highlighting */}
      <div className="border rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-3 py-1.5 bg-gradient-to-r from-violet-50 to-purple-50 border-b">
          <div className="flex items-center gap-2">
            <Calculator className="h-4 w-4 text-purple-600" />
            <span className="text-xs font-semibold text-purple-800">Constructeur de formule</span>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={clearFormula}>
              <Trash2 className="h-3 w-3 mr-1" />Effacer
            </Button>
          </div>
        </div>

        {/* Highlighted preview */}
        <div className="px-3 py-2 bg-white min-h-[28px] flex flex-wrap items-center gap-0.5 border-b" data-testid="formula-preview">
          {renderHighlightedFormula()}
        </div>

        {/* Raw textarea */}
        <textarea
          ref={textareaRef}
          value={formula}
          onChange={(e) => onFormulaChange(e.target.value)}
          placeholder="Tapez directement ou utilisez les blocs ci-dessous..."
          rows={2}
          className="w-full px-3 py-2 text-xs font-mono bg-gray-50 border-0 focus:ring-0 focus:outline-none resize-none"
          data-testid="formula-textarea"
        />
      </div>

      {/* Sources - clickable chips */}
      {allSources.length > 0 && (
        <div data-testid="formula-sources">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Sources disponibles</p>
          <div className="flex flex-wrap gap-1.5">
            {allSources.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => insertSource(s.name)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 text-xs font-medium hover:bg-blue-100 hover:border-blue-300 hover:shadow-sm transition-all active:scale-95"
                data-testid={`source-chip-${s.name}`}
              >
                <Database className="h-3 w-3" />
                ${s.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Operators */}
      <div data-testid="formula-operators">
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Operateurs</p>
        <div className="flex flex-wrap gap-1">
          {FORMULA_OPERATORS.map(op => (
            <button
              key={op.symbol}
              type="button"
              onClick={() => insertOperator(op.symbol)}
              title={op.desc}
              className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 text-sm font-bold hover:bg-gray-100 hover:border-gray-300 hover:shadow-sm transition-all active:scale-95"
              data-testid={`op-${op.symbol === '(' ? 'paren-open' : op.symbol === ')' ? 'paren-close' : op.label}`}
            >
              {op.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => insertAtCursor(' 0 ')}
            title="Inserer zero"
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 text-xs font-bold hover:bg-gray-100 transition-all active:scale-95"
          >
            0
          </button>
          <button
            type="button"
            onClick={() => insertAtCursor(' 100 ')}
            title="Inserer 100"
            className="px-3 h-9 flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 text-xs font-bold hover:bg-gray-100 transition-all active:scale-95"
          >
            100
          </button>
        </div>
      </div>

      {/* Functions palette */}
      <div data-testid="formula-functions">
        <button
          type="button"
          onClick={() => setShowFunctions(!showFunctions)}
          className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5 hover:text-purple-600 transition-colors"
        >
          <Calculator className="h-3 w-3" />
          Fonctions {showFunctions ? '(masquer)' : '(afficher)'}
        </button>
        {showFunctions && (
          <div className="grid grid-cols-2 gap-2 p-3 bg-gray-50 rounded-lg border" data-testid="functions-palette">
            {FORMULA_FUNCTIONS.map(cat => (
              <div key={cat.cat}>
                <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">{cat.cat}</p>
                <div className="space-y-0.5">
                  {cat.items.map(fn => (
                    <button
                      key={fn.name}
                      type="button"
                      onClick={() => insertFunction(fn)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left hover:bg-purple-50 hover:text-purple-700 transition-colors group"
                      data-testid={`fn-${fn.name}`}
                    >
                      <code className="text-[11px] font-bold text-purple-600 group-hover:text-purple-800 min-w-[80px]">{fn.name}()</code>
                      <span className="text-[10px] text-gray-500 group-hover:text-purple-600">{fn.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Test button + result */}
      <div className="flex items-center gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={onTestFormula} data-testid="test-formula-btn">
          <Play className="h-4 w-4 mr-1" />
          Tester la formule
        </Button>
        {testResult && (
          <div className={`flex items-center gap-1 text-sm ${testResult.success ? 'text-green-600' : 'text-red-600'}`}>
            {testResult.success ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
            {testResult.message}
          </div>
        )}
      </div>
    </div>
  );
};


// Composant de pre-visualisation interactive Excel
const ExcelPreviewTable = ({ fileId, sheets, excelConfig, onSelectCell, onSelectColumn }) => {
  const [previewData, setPreviewData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeSheet, setActiveSheet] = useState(sheets?.[0] || '');
  const [selectedCell, setSelectedCell] = useState(null); // {row, col, ref}
  const [selectedCol, setSelectedCol] = useState(null); // col index
  const [selectionMode, setSelectionMode] = useState('cell'); // 'cell' or 'column'

  const loadPreview = async (sheetName) => {
    if (!fileId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (sheetName) params.append('sheet_name', sheetName);
      params.append('max_rows', '30');
      const res = await api.post(`/custom-widgets/preview/excel-local/${fileId}?${params.toString()}`);
      if (res.data?.success) {
        setPreviewData(res.data);
        setActiveSheet(res.data.active_sheet || sheetName || sheets?.[0]);
      }
    } catch (err) {
      console.error('Preview error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (fileId) loadPreview(activeSheet);
  }, [fileId]);

  const handleSheetChange = (sheet) => {
    setActiveSheet(sheet);
    setSelectedCell(null);
    setSelectedCol(null);
    loadPreview(sheet);
  };

  const handleCellClick = (rowIdx, colIdx) => {
    if (!previewData) return;
    const colLetter = previewData.col_letters?.[colIdx] || String.fromCharCode(65 + colIdx);
    const cellRef = `${colLetter}${rowIdx + 1}`;
    
    if (selectionMode === 'column') {
      setSelectedCol(colIdx);
      setSelectedCell(null);
      const headerValue = previewData.rows?.[0]?.[colIdx] || colLetter;
      onSelectColumn?.(headerValue, colLetter, activeSheet);
    } else {
      setSelectedCell({ row: rowIdx, col: colIdx, ref: cellRef });
      setSelectedCol(null);
      const value = previewData.rows?.[rowIdx]?.[colIdx] || '';
      onSelectCell?.(cellRef, value, activeSheet);
    }
  };

  if (!fileId) return null;
  if (loading && !previewData) {
    return (
      <div className="flex items-center justify-center py-6 border rounded-lg bg-gray-50">
        <Loader2 className="h-5 w-5 animate-spin text-blue-600 mr-2" />
        <span className="text-sm text-gray-600">Chargement de l'apercu...</span>
      </div>
    );
  }
  if (!previewData) return null;

  const rows = previewData.rows || [];
  const colLetters = previewData.col_letters || [];

  return (
    <div className="border rounded-lg overflow-hidden bg-white" data-testid="excel-preview-table">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-gradient-to-r from-emerald-50 to-teal-50 border-b">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
          <span className="text-xs font-semibold text-emerald-800">Apercu interactif</span>
          <span className="text-[10px] text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded">
            {previewData.preview_rows} / {previewData.total_rows} lignes
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex gap-0.5 p-0.5 bg-white/60 rounded-md border">
            <button
              type="button"
              onClick={() => { setSelectionMode('cell'); setSelectedCol(null); }}
              className={`px-2 py-1 text-[10px] font-medium rounded transition-all ${
                selectionMode === 'cell' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
              data-testid="select-mode-cell"
            >
              Cellule
            </button>
            <button
              type="button"
              onClick={() => { setSelectionMode('column'); setSelectedCell(null); }}
              className={`px-2 py-1 text-[10px] font-medium rounded transition-all ${
                selectionMode === 'column' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
              data-testid="select-mode-column"
            >
              Colonne
            </button>
          </div>
          {loading && <Loader2 className="h-3 w-3 animate-spin text-emerald-600" />}
        </div>
      </div>

      {/* Sheet tabs */}
      {sheets && sheets.length > 1 && (
        <div className="flex gap-0 border-b bg-gray-50 px-1 pt-1">
          {sheets.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => handleSheetChange(s)}
              className={`px-3 py-1.5 text-[11px] font-medium rounded-t border border-b-0 transition-all ${
                s === activeSheet
                  ? 'bg-white text-emerald-700 border-gray-200 -mb-px z-10'
                  : 'bg-transparent text-gray-400 border-transparent hover:text-gray-600'
              }`}
              data-testid={`sheet-tab-${s}`}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Selection indicator */}
      {(selectedCell || selectedCol !== null) && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border-b text-xs">
          <MousePointer className="h-3 w-3 text-blue-600" />
          {selectedCell && (
            <span className="text-blue-700">
              Cellule <strong className="font-mono">{selectedCell.ref}</strong> selectionnee
              {activeSheet && activeSheet !== 'CSV' && <span className="text-blue-500"> (feuille: {activeSheet})</span>}
            </span>
          )}
          {selectedCol !== null && (
            <span className="text-blue-700">
              Colonne <strong className="font-mono">{colLetters[selectedCol]}</strong> selectionnee
              {rows[0]?.[selectedCol] && (
                <span className="text-blue-500"> - "{rows[0][selectedCol]}"</span>
              )}
            </span>
          )}
        </div>
      )}

      {/* Spreadsheet table */}
      <div className="overflow-auto max-h-[280px]">
        <table className="w-full text-[11px] border-collapse" data-testid="excel-preview-grid">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="w-10 bg-gray-100 border border-gray-200 text-gray-400 font-normal px-1 py-1 text-center sticky left-0 z-20">
                
              </th>
              {colLetters.map((letter, ci) => (
                <th
                  key={ci}
                  onClick={() => handleCellClick(0, ci)}
                  className={`bg-gray-100 border border-gray-200 px-2 py-1 font-semibold text-center cursor-pointer whitespace-nowrap transition-colors ${
                    selectedCol === ci
                      ? 'bg-blue-200 text-blue-800 border-blue-300'
                      : 'text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {letter}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} className={ri === 0 ? 'font-semibold bg-amber-50/50' : ''}>
                <td className="bg-gray-50 border border-gray-200 text-gray-400 font-normal px-1 py-0.5 text-center text-[10px] sticky left-0 z-10">
                  {ri + 1}
                </td>
                {colLetters.map((_, ci) => {
                  const isSelectedCell = selectedCell?.row === ri && selectedCell?.col === ci;
                  const isSelectedColumn = selectedCol === ci;
                  return (
                    <td
                      key={ci}
                      onClick={() => handleCellClick(ri, ci)}
                      className={`border border-gray-200 px-2 py-0.5 cursor-pointer whitespace-nowrap max-w-[150px] truncate transition-colors ${
                        isSelectedCell
                          ? 'bg-blue-100 ring-2 ring-blue-500 ring-inset text-blue-900 font-medium'
                          : isSelectedColumn
                            ? 'bg-blue-50 border-blue-200'
                            : ri === 0
                              ? 'hover:bg-amber-100/70'
                              : 'hover:bg-gray-100'
                      }`}
                      title={row[ci] || ''}
                      data-testid={`cell-${colLetters[ci]}${ri + 1}`}
                    >
                      {row[ci] || ''}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Hint */}
      <div className="px-3 py-1.5 bg-gray-50 border-t text-[10px] text-gray-400 flex items-center gap-1">
        <MousePointer className="h-3 w-3" />
        {selectionMode === 'cell'
          ? 'Cliquez sur une cellule pour remplir automatiquement la reference'
          : 'Cliquez sur une colonne pour remplir automatiquement le nom de colonne'}
      </div>
    </div>
  );
};


// Composant pour éditer une source de données
const DataSourceEditor = ({
  source,
  index,
  isPrimary,
  gmaoDataTypes,
  allSources,
  testResult,
  availableSensors,
  availableMeters,
  onUpdate,
  onRemove,
  onSetPrimary,
  onTestExcel,
  onTestFormula
}) => {
  const sourceType = SOURCE_TYPES.find(t => t.value === source.type);
  const Icon = sourceType?.icon || Database;

  // Grouper les types FSAO par catégorie
  const gmaoCategories = gmaoDataTypes.reduce((acc, dt) => {
    if (!acc[dt.category]) acc[dt.category] = [];
    acc[dt.category].push(dt);
    return acc;
  }, {});

  // Trouver le type FSAO sélectionné pour vérifier s'il nécessite une sélection supplémentaire
  const selectedGmaoType = gmaoDataTypes.find(dt => dt.type === source.gmao_config?.data_type);
  const requiresSensorSelection = selectedGmaoType?.requires_selection === 'sensor';
  const requiresMeterSelection = selectedGmaoType?.requires_selection === 'meter';

  return (
    <div className={`p-4 border rounded-lg ${isPrimary ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${isPrimary ? 'bg-blue-100' : 'bg-gray-100'}`}>
            <Icon className={`h-5 w-5 ${isPrimary ? 'text-blue-600' : 'text-gray-600'}`} />
          </div>
          <div>
            <Input
              value={source.name}
              onChange={(e) => onUpdate({ name: e.target.value })}
              className="font-medium border-none p-0 h-auto focus:ring-0"
              placeholder="Nom de la source"
            />
            <Badge variant="secondary" className="text-xs mt-1">
              {sourceType?.label}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isPrimary && (
            <Button variant="outline" size="sm" onClick={onSetPrimary}>
              Définir comme principale
            </Button>
          )}
          {isPrimary && (
            <Badge variant="default">Source principale</Badge>
          )}
          <Button variant="ghost" size="icon" onClick={onRemove}>
            <Trash2 className="h-4 w-4 text-red-500" />
          </Button>
        </div>
      </div>

      {/* Configuration selon le type */}
      {source.type === 'manual' && (
        <div className="space-y-2">
          <Label>Valeur</Label>
          <Input
            type="number"
            value={source.manual_value || ''}
            onChange={(e) => onUpdate({ manual_value: parseFloat(e.target.value) || 0 })}
            placeholder="Entrez une valeur numérique"
          />
        </div>
      )}

      {source.type === 'excel' && (
        <div className="space-y-4">
          {/* Choix source Excel */}
          <div className="flex gap-2 p-1 bg-gray-100 rounded-lg" data-testid="excel-source-toggle">
            <button
              type="button"
              className={`flex-1 py-2 px-3 text-xs font-medium rounded-md transition-all ${
                (source.excel_config?.source_mode || 'smb') === 'smb'
                  ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => onUpdate({
                excel_config: { ...source.excel_config, source_mode: 'smb' }
              })}
            >
              Serveur Samba / Reseau
            </button>
            <button
              type="button"
              className={`flex-1 py-2 px-3 text-xs font-medium rounded-md transition-all ${
                source.excel_config?.source_mode === 'local'
                  ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => onUpdate({
                excel_config: { ...source.excel_config, source_mode: 'local' }
              })}
            >
              Fichier local (upload)
            </button>
          </div>

          {/* Mode Samba */}
          {(source.excel_config?.source_mode || 'smb') === 'smb' && (
            <>
              <div className="space-y-2">
                <Label>Chemin SMB du fichier Excel</Label>
                <div className="flex gap-2">
                  <Input
                    value={source.excel_config?.smb_path || ''}
                    onChange={(e) => onUpdate({
                      excel_config: { ...source.excel_config, smb_path: e.target.value }
                    })}
                    placeholder="\\serveur\partage\dossier\fichier.xlsx"
                    className="font-mono text-sm"
                  />
                  <Button variant="outline" onClick={onTestExcel}>
                    <Play className="h-4 w-4 mr-1" />
                    Tester
                  </Button>
                </div>
                {testResult && (
                  <div className={`flex items-center gap-2 text-sm ${testResult.success ? 'text-green-600' : 'text-red-600'}`}>
                    {testResult.loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : testResult.success ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <X className="h-4 w-4" />
                    )}
                    {testResult.message}
                  </div>
                )}
              </div>

              {/* Credentials SMB */}
              <div className="p-3 border rounded-lg bg-gray-50">
                <Label className="text-sm font-medium mb-2 block">Identifiants SMB (optionnel)</Label>
                <p className="text-xs text-gray-500 mb-3">
                  Laissez vide pour utiliser les identifiants système, ou entrez des identifiants spécifiques pour ce fichier.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Nom d'utilisateur</Label>
                    <Input
                      type="text"
                      value={source.excel_config?.smb_username || ''}
                      onChange={(e) => onUpdate({
                        excel_config: { ...source.excel_config, smb_username: e.target.value }
                      })}
                      placeholder="DOMAINE\\utilisateur"
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Mot de passe</Label>
                    <Input
                      type="password"
                      value={source.excel_config?.smb_password || ''}
                      onChange={(e) => onUpdate({
                        excel_config: { ...source.excel_config, smb_password: e.target.value }
                      })}
                      placeholder="••••••••"
                      className="text-sm"
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Mode Upload Local */}
          {source.excel_config?.source_mode === 'local' && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Fichier Excel depuis votre ordinateur</Label>
                {source.excel_config?.uploaded_filename ? (
                  <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <Check className="h-5 w-5 text-green-600" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-green-800">{source.excel_config.uploaded_filename}</p>
                      <p className="text-xs text-green-600">Fichier uploade avec succes</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        onUpdate({
                          excel_config: { ...source.excel_config, uploaded_file_id: null, uploaded_filename: null, uploaded_path: null }
                        });
                      }}
                    >
                      Changer
                    </Button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      data-testid="excel-file-input"
                      className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer border rounded-lg p-1"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const formData = new FormData();
                        formData.append('file', file);
                        try {
                          onUpdate({ excel_config: { ...source.excel_config, _uploading: true } });
                          const response = await api.post('/custom-widgets/upload/excel', formData, {
                            headers: { 'Content-Type': 'multipart/form-data' }
                          });
                          const data = response.data;
                          if (data.success) {
                            onUpdate({
                              excel_config: {
                                ...source.excel_config,
                                source_mode: 'local',
                                uploaded_file_id: data.file_id,
                                uploaded_filename: data.filename,
                                uploaded_path: data.stored_path,
                                _uploading: false,
                                _upload_sheets: data.sheets
                              }
                            });
                          }
                        } catch (err) {
                          onUpdate({ excel_config: { ...source.excel_config, _uploading: false } });
                          alert('Erreur lors de l\'upload: ' + (err.response?.data?.detail || err.message));
                        }
                      }}
                    />
                    {source.excel_config?._uploading && (
                      <div className="absolute inset-0 bg-white/80 flex items-center justify-center rounded-lg">
                        <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                        <span className="ml-2 text-sm text-blue-600">Upload en cours...</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Interactive Excel Preview */}
              {source.excel_config?.uploaded_file_id && (
                <ExcelPreviewTable
                  fileId={source.excel_config.uploaded_file_id}
                  sheets={source.excel_config._upload_sheets || []}
                  excelConfig={source.excel_config}
                  onSelectCell={(cellRef, value, sheetName) => {
                    onUpdate({
                      excel_config: {
                        ...source.excel_config,
                        cell_reference: cellRef,
                        sheet_name: sheetName && sheetName !== 'CSV' ? sheetName : source.excel_config.sheet_name
                      }
                    });
                  }}
                  onSelectColumn={(headerName, colLetter, sheetName) => {
                    onUpdate({
                      excel_config: {
                        ...source.excel_config,
                        column_name: headerName,
                        sheet_name: sheetName && sheetName !== 'CSV' ? sheetName : source.excel_config.sheet_name
                      }
                    });
                  }}
                />
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Feuille (optionnel)</Label>
              <Input
                value={source.excel_config?.sheet_name || ''}
                onChange={(e) => onUpdate({
                  excel_config: { ...source.excel_config, sheet_name: e.target.value }
                })}
                placeholder="Sheet1"
              />
            </div>
            <div className="space-y-2">
              <Label>Cellule ou plage</Label>
              <Input
                value={source.excel_config?.cell_reference || ''}
                onChange={(e) => onUpdate({
                  excel_config: { ...source.excel_config, cell_reference: e.target.value }
                })}
                placeholder="A1 ou A1:D10"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Colonne (pour recherche)</Label>
              <Input
                value={source.excel_config?.column_name || ''}
                onChange={(e) => onUpdate({
                  excel_config: { ...source.excel_config, column_name: e.target.value }
                })}
                placeholder="Nom de colonne"
              />
            </div>
            <div className="space-y-2">
              <Label>Agrégation</Label>
              <Select
                value={source.excel_config?.aggregation || 'none'}
                onValueChange={(value) => onUpdate({
                  excel_config: { ...source.excel_config, aggregation: value === "none" ? null : value }
                })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Aucune" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucune</SelectItem>
                  <SelectItem value="SUM">Somme (SUM)</SelectItem>
                  <SelectItem value="AVG">Moyenne (AVG)</SelectItem>
                  <SelectItem value="MIN">Minimum (MIN)</SelectItem>
                  <SelectItem value="MAX">Maximum (MAX)</SelectItem>
                  <SelectItem value="COUNT">Compte (COUNT)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}

      {source.type === 'gmao' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Type de données FSAO</Label>
            <Select
              value={source.gmao_config?.data_type || ''}
              onValueChange={(value) => onUpdate({
                gmao_config: { ...source.gmao_config, data_type: value }
              })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sélectionnez un type de données" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(gmaoCategories).map(([category, types]) => (
                  <div key={category}>
                    <div className="px-2 py-1 text-xs font-semibold text-gray-500 bg-gray-100">
                      {category}
                    </div>
                    {types.map(dt => (
                      <SelectItem key={dt.type} value={dt.type}>
                        {dt.label}
                      </SelectItem>
                    ))}
                  </div>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Sélecteur de capteur MQTT */}
          {requiresSensorSelection && (
            <div className="space-y-2 p-3 border rounded-lg bg-cyan-50 border-cyan-200">
              <Label className="flex items-center gap-2">
                <Database className="h-4 w-4 text-cyan-600" />
                Sélectionner un capteur MQTT
              </Label>
              {availableSensors.length === 0 ? (
                <div className="text-sm text-gray-500 italic">
                  Aucun capteur MQTT disponible. Configurez vos capteurs dans la section "Capteurs MQTT".
                </div>
              ) : (
                <Select
                  value={source.gmao_config?.sensor_id || ''}
                  onValueChange={(value) => onUpdate({
                    gmao_config: { ...source.gmao_config, sensor_id: value || null }
                  })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir un capteur..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableSensors.map(sensor => (
                      <SelectItem key={sensor.id} value={sensor.id}>
                        <div className="flex flex-col">
                          <span className="font-medium">{sensor.name}</span>
                          <span className="text-xs text-gray-500">
                            {sensor.type} - {sensor.location || 'Sans emplacement'} 
                            {sensor.current_value !== null && ` (${sensor.current_value}${sensor.unit || ''})`}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {!source.gmao_config?.sensor_id && availableSensors.length > 0 && (
                <p className="text-xs text-orange-600 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Vous devez sélectionner un capteur pour que ce widget fonctionne
                </p>
              )}
            </div>
          )}

          {/* Sélecteur de compteur */}
          {requiresMeterSelection && (
            <div className="space-y-2 p-3 border rounded-lg bg-teal-50 border-teal-200">
              <Label className="flex items-center gap-2">
                <Gauge className="h-4 w-4 text-teal-600" />
                Sélectionner un compteur
              </Label>
              {availableMeters.length === 0 ? (
                <div className="text-sm text-gray-500 italic">
                  Aucun compteur disponible. Configurez vos compteurs dans la section "Compteurs".
                </div>
              ) : (
                <Select
                  value={source.gmao_config?.meter_id || ''}
                  onValueChange={(value) => onUpdate({
                    gmao_config: { ...source.gmao_config, meter_id: value || null }
                  })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir un compteur..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableMeters.map(meter => (
                      <SelectItem key={meter.id} value={meter.id}>
                        <div className="flex flex-col">
                          <span className="font-medium">{meter.name}</span>
                          <span className="text-xs text-gray-500">
                            {meter.type} - {meter.unit || 'Sans unité'}
                            {meter.current_value !== null && ` (${meter.current_value})`}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {!source.gmao_config?.meter_id && availableMeters.length > 0 && (
                <p className="text-xs text-orange-600 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Vous devez sélectionner un compteur pour que ce widget fonctionne
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Filtrer par service</Label>
              <Input
                value={source.gmao_config?.service_filter || ''}
                onChange={(e) => onUpdate({
                  gmao_config: { ...source.gmao_config, service_filter: e.target.value || null }
                })}
                placeholder="Tous les services"
              />
            </div>
            <div className="space-y-2">
              <Label>Période (depuis)</Label>
              <Select
                value={source.gmao_config?.date_from || 'all'}
                onValueChange={(value) => onUpdate({
                  gmao_config: { ...source.gmao_config, date_from: value === 'all' ? null : value }
                })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Toute la période" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toute la période</SelectItem>
                  <SelectItem value="-7d">7 derniers jours</SelectItem>
                  <SelectItem value="-30d">30 derniers jours</SelectItem>
                  <SelectItem value="-1m">Mois en cours</SelectItem>
                  <SelectItem value="-3m">3 derniers mois</SelectItem>
                  <SelectItem value="-1y">Année en cours</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}

      {source.type === 'formula' && (
        <VisualFormulaBuilder
          formula={source.formula || ''}
          allSources={allSources.filter(s => s.id !== source.id && s.name)}
          testResult={testResult}
          onFormulaChange={(formula) => onUpdate({ formula })}
          onTestFormula={onTestFormula}
        />
      )}

      {/* Valeur en cache */}
      {source.cached_value !== null && source.cached_value !== undefined && (
        <div className="mt-4 pt-4 border-t flex items-center justify-between">
          <div className="text-sm text-gray-500">
            Dernière valeur: <span className="font-mono font-medium text-gray-800">
              {typeof source.cached_value === 'object' ? JSON.stringify(source.cached_value) : source.cached_value}
            </span>
          </div>
          {source.last_updated && (
            <span className="text-xs text-gray-400">
              Mis à jour: {new Date(source.last_updated).toLocaleString('fr-FR')}
            </span>
          )}
        </div>
      )}

      {source.error_message && (
        <div className="mt-2 flex items-center gap-2 text-sm text-red-600">
          <AlertCircle className="h-4 w-4" />
          {source.error_message}
        </div>
      )}
    </div>
  );
};

export default CustomWidgetEditor;
