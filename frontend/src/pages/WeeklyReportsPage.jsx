import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Badge } from '../components/ui/badge';
import { useToast } from '../hooks/use-toast';
import { 
  FileText, Plus, Calendar, Clock, Send, History, Settings, 
  BarChart3, Play, Pause, Copy, Trash2, Edit, RefreshCw,
  Mail, Users, Building, CheckCircle2, XCircle, AlertTriangle
} from 'lucide-react';
import api from '../services/api';
import ReportTemplateForm from '../components/WeeklyReports/ReportTemplateForm';
import ReportTemplateCard from '../components/WeeklyReports/ReportTemplateCard';
import ReportHistoryTable from '../components/WeeklyReports/ReportHistoryTable';
import ReportGlobalSettings from '../components/WeeklyReports/ReportGlobalSettings';
import AIReportGenerator from '../components/WeeklyReports/AIReportGenerator';

const WeeklyReportsPage = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('templates');
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState([]);
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState(null);
  const [services, setServices] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  
  // Dialog states
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [templatesRes, servicesRes, statsRes, historyRes] = await Promise.all([
        api.get('/weekly-reports/templates'),
        api.get('/weekly-reports/services'),
        api.get('/weekly-reports/stats'),
        api.get('/weekly-reports/history?limit=50')
      ]);
      
      setTemplates(templatesRes.data || []);
      setServices(servicesRes.data?.services?.filter(s => s) || []);
      setIsAdmin(servicesRes.data?.is_admin || false);
      setStats(statsRes.data);
      setHistory(historyRes.data || []);
    } catch (error) {
      console.error('Erreur chargement données rapports:', error);
      toast({
        title: 'Erreur',
        description: 'Impossible de charger les données des rapports',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTemplate = () => {
    setEditingTemplate(null);
    setShowTemplateForm(true);
  };

  const handleEditTemplate = (template) => {
    setEditingTemplate(template);
    setShowTemplateForm(true);
  };

  const handleDuplicateTemplate = async (template) => {
    try {
      await api.post(`/weekly-reports/templates/${template.id}/duplicate`);
      toast({
        title: 'Succès',
        description: 'Modèle dupliqué avec succès'
      });
      loadData();
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Impossible de dupliquer le modèle',
        variant: 'destructive'
      });
    }
  };

  const handleDeleteTemplate = async (template) => {
    if (!window.confirm(`Supprimer le modèle "${template.name}" ?`)) return;
    
    try {
      await api.delete(`/weekly-reports/templates/${template.id}`);
      toast({
        title: 'Succès',
        description: 'Modèle supprimé'
      });
      loadData();
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Impossible de supprimer le modèle',
        variant: 'destructive'
      });
    }
  };

  const handleToggleActive = async (template) => {
    try {
      await api.put(`/weekly-reports/templates/${template.id}`, {
        is_active: !template.is_active
      });
      toast({
        title: 'Succès',
        description: template.is_active ? 'Rapport désactivé' : 'Rapport activé'
      });
      loadData();
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Impossible de modifier le statut',
        variant: 'destructive'
      });
    }
  };

  const handleTestTemplate = async (template) => {
    try {
      toast({
        title: 'Envoi en cours...',
        description: 'Le rapport de test est en cours de génération'
      });
      
      const response = await api.post(`/weekly-reports/templates/${template.id}/test`);
      
      toast({
        title: 'Rapport envoyé !',
        description: response.data?.message || 'Vérifiez votre boîte mail'
      });
    } catch (error) {
      toast({
        title: 'Erreur',
        description: error.response?.data?.detail || 'Impossible d\'envoyer le rapport de test',
        variant: 'destructive'
      });
    }
  };

  const handleSaveTemplate = async (templateData) => {
    try {
      if (editingTemplate) {
        await api.put(`/weekly-reports/templates/${editingTemplate.id}`, templateData);
        toast({ title: 'Succès', description: 'Modèle mis à jour' });
      } else {
        await api.post('/weekly-reports/templates', templateData);
        toast({ title: 'Succès', description: 'Modèle créé' });
      }
      setShowTemplateForm(false);
      loadData();
    } catch (error) {
      toast({
        title: 'Erreur',
        description: error.response?.data?.detail || 'Impossible de sauvegarder le modèle',
        variant: 'destructive'
      });
    }
  };

  const frequencyLabels = {
    weekly: 'Hebdomadaire',
    monthly: 'Mensuel',
    annual: 'Annuel'
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <RefreshCw className="h-12 w-12 animate-spin text-blue-600 mx-auto" />
          <p className="mt-4 text-gray-600">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="weekly-reports-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <FileText className="h-8 w-8 text-blue-600" />
            Rapports Hebdo.
          </h1>
          <p className="text-gray-600 mt-1">
            Configurez et gérez vos rapports automatiques
          </p>
        </div>
        <Button 
          onClick={handleCreateTemplate}
          className="bg-blue-600 hover:bg-blue-700"
          data-testid="create-template-btn"
        >
          <Plus className="h-4 w-4 mr-2" />
          Nouveau modèle
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Modèles</p>
                <p className="text-2xl font-bold">{stats?.total_templates || 0}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                <FileText className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Actifs</p>
                <p className="text-2xl font-bold text-green-600">{stats?.active_templates || 0}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                <Play className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Envoyés</p>
                <p className="text-2xl font-bold text-purple-600">{stats?.total_sent || 0}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-purple-100 flex items-center justify-center">
                <Send className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Dernier envoi</p>
                <p className="text-sm font-medium text-gray-700">
                  {stats?.last_sent 
                    ? new Date(stats.last_sent).toLocaleDateString('fr-FR', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit'
                      })
                    : 'Aucun'
                  }
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-orange-100 flex items-center justify-center">
                <Clock className="h-6 w-6 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="templates" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Modèles</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            <span className="hidden sm:inline">Historique</span>
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="settings" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Paramètres</span>
            </TabsTrigger>
          )}
        </TabsList>

        {/* Templates Tab */}
        <TabsContent value="templates" className="space-y-4">
          {/* Générateur IA de rapports */}
          <AIReportGenerator onGenerated={loadData} />

          {templates.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FileText className="h-16 w-16 mx-auto text-gray-300 mb-4" />
                <h3 className="text-lg font-semibold text-gray-700 mb-2">
                  Aucun modèle de rapport
                </h3>
                <p className="text-gray-500 mb-6">
                  Créez votre premier modèle pour automatiser vos rapports
                </p>
                <Button onClick={handleCreateTemplate} className="bg-blue-600 hover:bg-blue-700">
                  <Plus className="h-4 w-4 mr-2" />
                  Créer un modèle
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              {templates.map((template) => (
                <ReportTemplateCard
                  key={template.id}
                  template={template}
                  onEdit={() => handleEditTemplate(template)}
                  onDuplicate={() => handleDuplicateTemplate(template)}
                  onDelete={() => handleDeleteTemplate(template)}
                  onToggleActive={() => handleToggleActive(template)}
                  onTest={() => handleTestTemplate(template)}
                  frequencyLabels={frequencyLabels}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history">
          <ReportHistoryTable 
            history={history} 
            onRefresh={loadData}
          />
        </TabsContent>

        {/* Settings Tab (Admin only) */}
        {isAdmin && (
          <TabsContent value="settings">
            <ReportGlobalSettings onSave={loadData} />
          </TabsContent>
        )}
      </Tabs>

      {/* Template Form Dialog */}
      {showTemplateForm && (
        <ReportTemplateForm
          open={showTemplateForm}
          onClose={() => setShowTemplateForm(false)}
          onSave={handleSaveTemplate}
          template={editingTemplate}
          services={services}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
};

export default WeeklyReportsPage;
