import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { usePreferences } from '../contexts/PreferencesContext';
import { useToast } from '../hooks/use-toast';
import {
  Palette,
  Layout,
  Menu,
  Settings,
  Home,
  RotateCcw,
  Save,
  Grid3x3,
  List,
  Download,
  Upload,
  Bot,
  PanelTop
} from 'lucide-react';

// Import des sections
import AppearanceSection from '../components/Personnalisation/AppearanceSection';
import SidebarSection from '../components/Personnalisation/SidebarSection';
import MenuOrganizationSection from '../components/Personnalisation/MenuOrganizationSection';
import HeaderOrganizationSection from '../components/Personnalisation/HeaderOrganizationSection';
import DisplayPreferencesSection from '../components/Personnalisation/DisplayPreferencesSection';
import DashboardSection from '../components/Personnalisation/DashboardSection';
import AISection from '../components/Personnalisation/AISection';

const Personnalisation = () => {
  const { preferences, updatePreferences, resetPreferences, loading } = usePreferences();
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState(preferences?.customization_view_mode || 'tabs');
  const [hasChanges, setHasChanges] = useState(false);

  const handleReset = async () => {
    if (!window.confirm('Êtes-vous sûr de vouloir réinitialiser toutes vos préférences ?')) {
      return;
    }

    try {
      await resetPreferences();
      toast({
        title: 'Succès',
        description: 'Préférences réinitialisées avec succès'
      });
      setHasChanges(false);
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Impossible de réinitialiser les préférences',
        variant: 'destructive'
      });
    }
  };

  const handleViewModeChange = async (mode) => {
    setViewMode(mode);
    try {
      await updatePreferences({ customization_view_mode: mode });
    } catch (error) {
      console.error('Erreur lors du changement de mode:', error);
    }
  };

  const handleExport = () => {
    const config = JSON.stringify(preferences, null, 2);
    const blob = new Blob([config], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gmao-preferences-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: 'Succès',
      description: 'Configuration exportée avec succès'
    });
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (file) {
        try {
          const text = await file.text();
          const config = JSON.parse(text);
          
          // Valider et importer les préférences
          await updatePreferences(config);
          
          toast({
            title: 'Succès',
            description: 'Configuration importée avec succès'
          });
        } catch (error) {
          toast({
            title: 'Erreur',
            description: 'Fichier de configuration invalide',
            variant: 'destructive'
          });
        }
      }
    };
    input.click();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Chargement des préférences...</p>
        </div>
      </div>
    );
  }

  const sections = [
    {
      id: 'appearance',
      title: 'Apparence Générale',
      icon: Palette,
      component: AppearanceSection
    },
    {
      id: 'sidebar',
      title: 'Sidebar',
      icon: Layout,
      component: SidebarSection
    },
    {
      id: 'menu',
      title: 'Organisation du Menu',
      icon: Menu,
      component: MenuOrganizationSection
    },
    {
      id: 'header',
      title: 'Organisation du Header',
      icon: PanelTop,
      component: HeaderOrganizationSection
    },
    {
      id: 'display',
      title: 'Préférences d\'Affichage',
      icon: Settings,
      component: DisplayPreferencesSection
    },
    {
      id: 'dashboard',
      title: 'Dashboard Personnalisé',
      icon: Home,
      component: DashboardSection
    },
    {
      id: 'ai',
      title: 'IA',
      icon: Bot,
      component: AISection
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Personnalisation</h1>
          <p className="text-gray-600 mt-1">Personnalisez votre expérience utilisateur</p>
        </div>
        <div className="flex gap-2">
          {/* Toggle View Mode */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
            <Button
              variant={viewMode === 'tabs' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => handleViewModeChange('tabs')}
              className="gap-2"
            >
              <Grid3x3 size={16} />
              Onglets
            </Button>
            <Button
              variant={viewMode === 'scroll' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => handleViewModeChange('scroll')}
              className="gap-2"
            >
              <List size={16} />
              Liste
            </Button>
          </div>

          <Button
            variant="outline"
            onClick={handleExport}
            className="gap-2"
          >
            <Download size={16} />
            Exporter
          </Button>
          <Button
            variant="outline"
            onClick={handleImport}
            className="gap-2"
          >
            <Upload size={16} />
            Importer
          </Button>
          <Button
            variant="outline"
            onClick={handleReset}
            className="gap-2"
          >
            <RotateCcw size={16} />
            Réinitialiser
          </Button>
        </div>
      </div>

      {/* Content */}
      {viewMode === 'tabs' ? (
        <Tabs defaultValue="appearance" className="w-full">
          <TabsList className="grid grid-cols-8 w-full">
            {sections.map((section) => {
              const Icon = section.icon;
              return (
                <TabsTrigger key={section.id} value={section.id} className="gap-1 text-xs px-2">
                  <Icon size={14} />
                  <span className="hidden sm:inline truncate">{section.title}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>

          {sections.map((section) => {
            const Component = section.component;
            return (
              <TabsContent key={section.id} value={section.id}>
                <Component />
              </TabsContent>
            );
          })}
        </Tabs>
      ) : (
        <div className="space-y-6">
          {sections.map((section) => {
            const Component = section.component;
            const Icon = section.icon;
            return (
              <Card key={section.id}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Icon size={20} />
                    {section.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Component />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Personnalisation;
