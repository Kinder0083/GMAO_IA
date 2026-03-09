import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import { 
  ArrowLeft, 
  Plus, 
  FileText, 
  Shield, 
  Edit, 
  Trash2, 
  Search,
  ClipboardList,
  Eye,
  Settings,
  Type,
  AlignLeft,
  Hash,
  Calendar,
  List,
  CheckSquare,
  ToggleLeft,
  PenTool,
  Upload,
  Image,
  X
} from 'lucide-react';
import { useToast } from '../hooks/use-toast';
import { useConfirmDialog } from '../components/ui/confirm-dialog';
import api from '../services/api';
import FormBuilderDialog from '../components/FormBuilderDialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';

// Types de formulaires disponibles (système)
const SYSTEM_FORM_TYPES = [
  { 
    code: 'BON_TRAVAIL', 
    label: 'Bon de travail', 
    icon: FileText, 
    color: 'bg-blue-100 text-blue-700',
    description: 'Formulaire pour les bons de travail de maintenance'
  },
  { 
    code: 'AUTORISATION', 
    label: 'Autorisation particulière', 
    icon: Shield, 
    color: 'bg-yellow-100 text-yellow-700',
    description: 'Formulaire pour les autorisations de travail spéciales'
  }
];

// Icônes des types de champs
const FIELD_TYPE_ICONS = {
  text: Type,
  textarea: AlignLeft,
  number: Hash,
  date: Calendar,
  select: List,
  checkbox: CheckSquare,
  switch: ToggleLeft,
  signature: PenTool,
  file: Upload,
  logo: Image
};

function FormTemplatesPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Dialog states
  const [showFormBuilder, setShowFormBuilder] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const response = await api.get('/documentations/form-templates');
      setTemplates(response.data || []);
    } catch (error) {
      console.error('Erreur chargement templates:', error);
      toast({
        title: 'Erreur',
        description: 'Impossible de charger les modèles',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setSelectedTemplate(null);
    setShowFormBuilder(true);
  };

  const handleEdit = (template) => {
    if (template.is_system) {
      toast({
        title: 'Action non autorisée',
        description: 'Les modèles système ne peuvent pas être modifiés',
        variant: 'destructive'
      });
      return;
    }
    setSelectedTemplate(template);
    setShowFormBuilder(true);
  };

  // View state
  const [viewTemplate, setViewTemplate] = useState(null);

  const handleViewTemplate = (template) => {
    setViewTemplate(template);
  };

  const handleDelete = (template) => {
    if (template.is_system) {
      toast({
        title: 'Action non autorisée',
        description: 'Les modèles système ne peuvent pas être supprimés',
        variant: 'destructive'
      });
      return;
    }
    
    confirm({
      title: 'Supprimer le modèle',
      description: `Êtes-vous sûr de vouloir supprimer "${template.nom}" ? Les formulaires déjà remplis ne seront pas affectés.`,
      confirmText: 'Supprimer',
      cancelText: 'Annuler',
      variant: 'destructive',
      onConfirm: async () => {
        try {
          await api.delete(`/documentations/form-templates/${template.id}`);
          toast({ title: 'Succès', description: 'Modèle supprimé' });
          loadTemplates();
        } catch (error) {
          toast({
            title: 'Erreur',
            description: 'Erreur lors de la suppression',
            variant: 'destructive'
          });
        }
      }
    });
  };

  const handleSaveTemplate = async (formData) => {
    try {
      const payload = {
        nom: formData.nom,
        description: formData.description,
        type: 'CUSTOM',
        fields: formData.fields,
        actif: true
      };

      if (selectedTemplate) {
        await api.put(`/documentations/form-templates/${selectedTemplate.id}`, payload);
        toast({ title: 'Succès', description: 'Modèle mis à jour' });
      } else {
        await api.post('/documentations/form-templates', payload);
        toast({ title: 'Succès', description: 'Modèle créé' });
      }
      
      setShowFormBuilder(false);
      loadTemplates();
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Erreur lors de l\'enregistrement',
        variant: 'destructive'
      });
    }
  };

  const getFormTypeInfo = (template) => {
    if (template.type === 'BON_TRAVAIL' || template.type === 'AUTORISATION') {
      return SYSTEM_FORM_TYPES.find(t => t.code === template.type) || SYSTEM_FORM_TYPES[0];
    }
    return {
      code: 'CUSTOM',
      label: 'Personnalisé',
      icon: ClipboardList,
      color: 'bg-purple-100 text-purple-700',
      description: 'Formulaire personnalisé'
    };
  };

  // Filtrer et grouper les templates
  const filteredTemplates = templates.filter(t =>
    t.nom.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Séparer système et personnalisés
  const systemTemplates = filteredTemplates.filter(t => t.is_system);
  const customTemplates = filteredTemplates.filter(t => !t.is_system);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Chargement...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <Button variant="ghost" onClick={() => navigate('/documentations')} className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Retour aux documentations
        </Button>
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <ClipboardList className="h-8 w-8 text-blue-600" />
              Modèles de formulaires
            </h1>
            <p className="text-gray-500 mt-1">
              Gérez les modèles de formulaires disponibles dans les pôles
            </p>
          </div>
          <Button onClick={handleCreate} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="mr-2 h-4 w-4" />
            Nouveau modèle personnalisé
          </Button>
        </div>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Rechercher un modèle..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Section: Modèles système */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gray-100">
            <Settings className="h-5 w-5 text-gray-600" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Modèles système</h2>
            <p className="text-sm text-gray-500">Ces modèles sont intégrés et ne peuvent pas être modifiés</p>
          </div>
          <Badge variant="outline" className="ml-auto">
            {systemTemplates.length} modèle(s)
          </Badge>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {systemTemplates.map((template) => {
            const typeInfo = getFormTypeInfo(template);
            const Icon = typeInfo.icon;
            return (
              <Card key={template.id} className="hover:shadow-lg transition-shadow cursor-pointer group"
                onClick={() => handleViewTemplate(template)}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${typeInfo.color.split(' ')[0]}`}>
                        <Icon className={`h-5 w-5 ${typeInfo.color.split(' ')[1]}`} />
                      </div>
                      <div>
                        <CardTitle className="text-base">{template.nom}</CardTitle>
                        <Badge variant="secondary" className="text-xs mt-1">
                          Système
                        </Badge>
                      </div>
                    </div>
                    <Eye className="h-4 w-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </CardHeader>
                <CardContent>
                  {template.description && (
                    <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                      {template.description}
                    </p>
                  )}
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {(template.fields || []).length} champ(s)
                    </Badge>
                    <span className="text-xs text-gray-400">
                      Cliquer pour visualiser
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Section: Modèles personnalisés */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-100">
            <ClipboardList className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Modèles personnalisés</h2>
            <p className="text-sm text-gray-500">Créez vos propres formulaires avec des champs personnalisés</p>
          </div>
          <Badge variant="outline" className="ml-auto">
            {customTemplates.length} modèle(s)
          </Badge>
        </div>
        
        {customTemplates.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <ClipboardList className="h-12 w-12 mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500 mb-4">Aucun modèle personnalisé créé</p>
              <Button onClick={handleCreate} variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                Créer mon premier modèle
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {customTemplates.map((template) => (
              <Card key={template.id} className="hover:shadow-lg transition-shadow cursor-pointer group"
                onClick={() => handleViewTemplate(template)}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-purple-100">
                        <ClipboardList className="h-5 w-5 text-purple-600" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{template.nom}</CardTitle>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">
                            {(template.fields || []).length} champ(s)
                          </Badge>
                          {!template.actif && (
                            <Badge variant="secondary" className="text-xs text-gray-500">
                              Inactif
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <Eye className="h-4 w-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </CardHeader>
                <CardContent>
                  {template.description && (
                    <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                      {template.description}
                    </p>
                  )}
                  
                  {/* Aperçu des types de champs */}
                  {template.fields && template.fields.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-4">
                      {template.fields.slice(0, 5).map((field, idx) => {
                        const FieldIcon = FIELD_TYPE_ICONS[field.type] || Type;
                        return (
                          <div 
                            key={idx}
                            className="p-1 bg-gray-100 rounded"
                            title={field.label}
                          >
                            <FieldIcon className="h-3 w-3 text-gray-500" />
                          </div>
                        );
                      })}
                      {template.fields.length > 5 && (
                        <span className="text-xs text-gray-400 self-center">
                          +{template.fields.length - 5}
                        </span>
                      )}
                    </div>
                  )}
                  
                  <TooltipProvider delayDuration={300}>
                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleViewTemplate(template)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Voir
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="font-medium">Visualiser le modèle</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEdit(template)}
                          >
                            <Edit className="h-4 w-4 mr-1" />
                            Modifier
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="font-medium">Modifier le modèle</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 hover:bg-red-50"
                            onClick={() => handleDelete(template)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="font-medium">Supprimer le modèle</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </TooltipProvider>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Form Builder Dialog */}
      <FormBuilderDialog
        open={showFormBuilder}
        onOpenChange={setShowFormBuilder}
        template={selectedTemplate}
        onSave={handleSaveTemplate}
      />

      {/* Template Viewer Dialog */}
      <Dialog open={!!viewTemplate} onOpenChange={() => setViewTemplate(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {viewTemplate && (() => {
                const info = getFormTypeInfo(viewTemplate);
                const TplIcon = info.icon;
                return <TplIcon className={`h-5 w-5 ${info.color.split(' ')[1]}`} />;
              })()}
              {viewTemplate?.nom}
              {viewTemplate?.is_system && <Badge variant="secondary" className="text-xs">Système</Badge>}
            </DialogTitle>
          </DialogHeader>
          {viewTemplate && (
            <div className="space-y-4">
              {viewTemplate.description && (
                <p className="text-sm text-gray-600">{viewTemplate.description}</p>
              )}
              <div>
                <h3 className="font-semibold text-sm mb-3 text-gray-700">
                  Champs du formulaire ({(viewTemplate.fields || []).length})
                </h3>
                <div className="space-y-2">
                  {(viewTemplate.fields || []).map((field, idx) => {
                    const FieldIcon = FIELD_TYPE_ICONS[field.type] || Type;
                    return (
                      <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border">
                        <div className="p-1.5 bg-white rounded border">
                          <FieldIcon className="h-4 w-4 text-gray-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{field.label}</p>
                          <p className="text-xs text-gray-400 capitalize">{field.type}{field.required ? ' - Obligatoire' : ''}</p>
                        </div>
                        {field.options && field.options.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {field.options.slice(0, 3).map((opt, i) => (
                              <Badge key={i} variant="outline" className="text-[10px]">{opt}</Badge>
                            ))}
                            {field.options.length > 3 && <Badge variant="outline" className="text-[10px]">+{field.options.length - 3}</Badge>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {(!viewTemplate.fields || viewTemplate.fields.length === 0) && (
                    <p className="text-sm text-gray-400 text-center py-4">Aucun champ défini</p>
                  )}
                </div>
              </div>
              {!viewTemplate.is_system && (
                <DialogFooter>
                  <Button variant="outline" onClick={() => { setViewTemplate(null); handleEdit(viewTemplate); }}>
                    <Edit className="h-4 w-4 mr-1" /> Modifier
                  </Button>
                  <Button variant="destructive" onClick={() => { setViewTemplate(null); handleDelete(viewTemplate); }}>
                    <Trash2 className="h-4 w-4 mr-1" /> Supprimer
                  </Button>
                </DialogFooter>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog />
    </div>
  );
}

export default FormTemplatesPage;
