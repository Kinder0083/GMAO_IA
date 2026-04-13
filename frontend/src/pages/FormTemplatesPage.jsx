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
  X,
  Sparkles,
  Loader2,
  Printer
} from 'lucide-react';
import BonDeTravailPrintDialog from '../components/BonDeTravailPrintDialog';
import { useToast } from '../hooks/use-toast';
import { useConfirmDialog } from '../components/ui/confirm-dialog';
import api, { documentationsAPI } from '../services/api';
import FormBuilderDialog from '../components/FormBuilderDialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';

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
    setSelectedTemplate(template);
    setShowFormBuilder(true);
  };

  const [viewTemplate, setViewTemplate] = useState(null);
  const [showBonTravailPrint, setShowBonTravailPrint] = useState(false);

  // AI generation state
  const [showAIDialog, setShowAIDialog] = useState(false);
  const [aiMode, setAIMode] = useState('description'); // 'description' | 'json' | 'file'
  const [aiDescription, setAIDescription] = useState('');
  const [aiJsonPrompt, setAIJsonPrompt] = useState('');
  const [aiFile, setAIFile] = useState(null);
  const [aiGenerating, setAIGenerating] = useState(false);
  const [aiResult, setAIResult] = useState(null);

  const handleViewTemplate = (template) => {
    setViewTemplate(template);
  };

  const handleGenerateAI = async () => {
    setAIGenerating(true);
    setAIResult(null);
    try {
      const formData = new FormData();
      if (aiMode === 'description' && aiDescription.trim()) {
        formData.append('description', aiDescription.trim());
      } else if (aiMode === 'json' && aiJsonPrompt.trim()) {
        formData.append('json_prompt', aiJsonPrompt.trim());
      } else if (aiMode === 'file' && aiFile) {
        formData.append('file', aiFile);
        if (aiDescription.trim()) formData.append('description', aiDescription.trim());
      } else {
        toast({ title: 'Erreur', description: 'Veuillez fournir une entrée', variant: 'destructive' });
        setAIGenerating(false);
        return;
      }

      const result = await documentationsAPI.generateFormAI(formData);
      if (result.success && result.template) {
        setAIResult(result.template);
        toast({ title: 'Formulaire généré', description: `${result.template.fields?.length || 0} champ(s) détecté(s)` });
      }
    } catch (err) {
      toast({ title: 'Erreur IA', description: err?.response?.data?.detail || "Échec de la génération", variant: 'destructive' });
    } finally {
      setAIGenerating(false);
    }
  };

  const handleSaveAIResult = async () => {
    if (!aiResult) return;
    try {
      const templateData = {
        nom: aiResult.nom || 'Formulaire IA',
        description: aiResult.description || 'Généré par IA',
        type: 'CUSTOM',
        fields: aiResult.fields || [],
        actif: true
      };
      await api.post('/documentations/form-templates', templateData);
      toast({ title: 'Succès', description: 'Modèle créé avec succès' });
      setShowAIDialog(false);
      setAIResult(null);
      setAIDescription('');
      setAIJsonPrompt('');
      setAIFile(null);
      loadTemplates();
    } catch (err) {
      toast({ title: 'Erreur', description: 'Impossible de sauvegarder', variant: 'destructive' });
    }
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
          <div className="flex gap-2">
            <Button onClick={() => setShowAIDialog(true)} variant="outline" className="border-purple-300 text-purple-700 hover:bg-purple-50">
              <Sparkles className="mr-2 h-4 w-4" />
              Création IA
            </Button>
            <Button onClick={handleCreate} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="mr-2 h-4 w-4" />
              Nouveau modèle
            </Button>
          </div>
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
                onClick={() => {
                  if (template.id === 'default-bon-travail') {
                    setShowBonTravailPrint(true);
                  } else {
                    handleViewTemplate(template);
                  }
                }}>
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
                    <div className="flex items-center gap-1">
                      {template.id === 'default-bon-travail' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setShowBonTravailPrint(true); }}
                          className="p-1 rounded hover:bg-blue-100 text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Imprimer un bon de travail"
                          data-testid="btn-print-bon-travail"
                        >
                          <Printer className="h-4 w-4" />
                        </button>
                      )}
                      <Eye className="h-4 w-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
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
                    {template.id === 'default-bon-travail' ? (
                      <span className="text-xs text-blue-600 flex items-center gap-1">
                        <Printer className="h-3 w-3" />
                        Survoler pour imprimer
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">
                        Cliquer pour visualiser
                      </span>
                    )}
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

      {/* AI Generation Dialog */}
      <Dialog open={showAIDialog} onOpenChange={(open) => { setShowAIDialog(open); if (!open) { setAIResult(null); setAIDescription(''); setAIJsonPrompt(''); setAIFile(null); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-600" />
              Création de formulaire par IA
            </DialogTitle>
          </DialogHeader>

          {!aiResult ? (
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium">Mode de création</Label>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {[
                    { value: 'description', label: 'Description texte', icon: AlignLeft },
                    { value: 'file', label: 'Fichier (Excel/Image)', icon: Upload },
                    { value: 'json', label: 'Prompt JSON', icon: Settings }
                  ].map(({ value, label, icon: Icon }) => (
                    <button key={value}
                      className={`p-3 rounded-lg border text-sm flex flex-col items-center gap-2 transition-colors
                        ${aiMode === value ? 'border-purple-400 bg-purple-50 text-purple-700' : 'border-gray-200 hover:border-gray-300'}`}
                      onClick={() => setAIMode(value)}>
                      <Icon className="h-5 w-5" />{label}
                    </button>
                  ))}
                </div>
              </div>

              {aiMode === 'description' && (
                <div>
                  <Label>Description du formulaire souhaité</Label>
                  <Textarea rows={5} value={aiDescription} onChange={(e) => setAIDescription(e.target.value)}
                    placeholder="Ex: Un formulaire de demande d'intervention avec les champs : nom du demandeur, date, urgence (haute/moyenne/basse), description du problème, localisation, équipement concerné, signature..."
                    data-testid="ai-description-input" />
                </div>
              )}

              {aiMode === 'file' && (
                <div className="space-y-3">
                  <div>
                    <Label>Fichier (Excel, CSV, Word, PDF ou Image de formulaire)</Label>
                    <Input type="file" accept=".xlsx,.xls,.csv,.png,.jpg,.jpeg,.webp,.pdf,.doc,.docx"
                      onChange={(e) => setAIFile(e.target.files?.[0])}
                      data-testid="ai-file-input" />
                    <p className="text-xs text-gray-500 mt-1">Formats acceptés : Excel (.xlsx, .csv), Word (.docx), PDF (.pdf), Images (.png, .jpg)</p>
                  </div>
                  <div>
                    <Label>Description complémentaire (optionnel)</Label>
                    <Textarea rows={3} value={aiDescription} onChange={(e) => setAIDescription(e.target.value)}
                      placeholder="Précisions supplémentaires pour aider l'IA..." />
                  </div>
                </div>
              )}

              {aiMode === 'json' && (
                <div>
                  <Label>Prompt JSON</Label>
                  <Textarea rows={8} value={aiJsonPrompt} onChange={(e) => setAIJsonPrompt(e.target.value)}
                    className="font-mono text-sm"
                    placeholder={'{\n  "nom": "Mon formulaire",\n  "fields": [\n    {"label": "Nom", "type": "text", "required": true},\n    {"label": "Date", "type": "date"},\n    {"label": "Priorité", "type": "select", "options": ["Haute", "Moyenne", "Basse"]}\n  ]\n}'}
                    data-testid="ai-json-input" />
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAIDialog(false)}>Annuler</Button>
                <Button onClick={handleGenerateAI} disabled={aiGenerating}
                  className="bg-purple-600 hover:bg-purple-700" data-testid="ai-generate-btn">
                  {aiGenerating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Génération en cours...</>
                    : <><Sparkles className="h-4 w-4 mr-2" /> Générer</>}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h3 className="font-semibold text-green-800">{aiResult.nom}</h3>
                {aiResult.description && <p className="text-sm text-green-700 mt-1">{aiResult.description}</p>}
                <p className="text-sm text-green-600 mt-2">{aiResult.fields?.length || 0} champ(s) détecté(s)</p>
              </div>

              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {(aiResult.fields || []).map((field, idx) => {
                  const FieldIcon = FIELD_TYPE_ICONS[field.type] || Type;
                  return (
                    <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border">
                      <div className="p-1.5 bg-white rounded border">
                        <FieldIcon className="h-4 w-4 text-gray-500" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{field.label}</p>
                        <p className="text-xs text-gray-400">{field.type}{field.required ? ' - Obligatoire' : ''}</p>
                      </div>
                      {field.options && (
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
              </div>

              <DialogFooter className="flex gap-2">
                <Button variant="outline" onClick={() => setAIResult(null)}>
                  Regénérer
                </Button>
                <Button variant="outline" onClick={() => {
                  setSelectedTemplate({ ...aiResult, type: 'CUSTOM', actif: true, fields: aiResult.fields });
                  setShowFormBuilder(true);
                  setShowAIDialog(false);
                  setAIResult(null);
                }}>
                  <Edit className="h-4 w-4 mr-1" /> Modifier avant de sauvegarder
                </Button>
                <Button onClick={handleSaveAIResult} className="bg-green-600 hover:bg-green-700">
                  <Plus className="h-4 w-4 mr-1" /> Sauvegarder le modèle
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog />

      {/* Dialog d'impression Bon de Travail MAINT/FE/004 V2 */}
      <BonDeTravailPrintDialog
        open={showBonTravailPrint}
        onClose={() => setShowBonTravailPrint(false)}
      />
    </div>
  );
}

export default FormTemplatesPage;
