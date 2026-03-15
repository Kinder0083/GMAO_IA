import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { accidentAnalysisAPI } from '../../services/api';
import { useToast } from '../../hooks/use-toast';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Switch } from '../../components/ui/switch';
import {
  ArrowLeft, Save, Loader2, Upload, Plus, Trash2, ChevronDown, ChevronUp,
  ClipboardList, GitBranch, Shield, Settings2, Info, FileText
} from 'lucide-react';
import { ALARM_PHASES } from './alarmData';

const METHOD_DEFS = [
  { key: 'QQOQCP', label: 'QQOQCP', desc: 'Quoi, Qui, Ou, Quand, Comment, Pourquoi', icon: ClipboardList, color: 'text-blue-600' },
  { key: '5POURQUOI', label: '5 Pourquoi', desc: 'Iterations successives pour trouver la cause racine', icon: GitBranch, color: 'text-purple-600' },
  { key: 'ISHIKAWA', label: 'Ishikawa (5M)', desc: 'Main d\'oeuvre, Materiel, Methodes, Milieu, Matieres', icon: GitBranch, color: 'text-orange-600' },
  { key: 'ALARM', label: 'ALARM', desc: 'Association of Litigation And Risk Management (7 phases)', icon: Shield, color: 'text-red-600' },
];

export default function AccidentAnalysisAdmin() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Methods config
  const [methods, setMethods] = useState({ QQOQCP: true, '5POURQUOI': true, ISHIKAWA: true, ALARM: true });

  // ALARM items config - deep clone from defaults
  const [alarmPhases, setAlarmPhases] = useState([]);
  const [expandedPhase, setExpandedPhase] = useState(null);
  const [expandedService, setExpandedService] = useState(null);

  // Import
  const [importing, setImporting] = useState(false);
  const [importTarget, setImportTarget] = useState(null); // {phaseIdx, serviceIdx}

  const loadConfig = useCallback(async () => {
    try {
      const [methodsCfg, alarmItems] = await Promise.all([
        accidentAnalysisAPI.getMethodsConfig(),
        accidentAnalysisAPI.getAlarmItems()
      ]);

      if (methodsCfg?.methods) setMethods(methodsCfg.methods);

      if (alarmItems?.phases) {
        setAlarmPhases(alarmItems.phases);
      } else {
        // Initialize from defaults
        const defaults = ALARM_PHASES.map(phase => ({
          ...phase,
          services: phase.services.map(service => ({
            ...service,
            items: service.items.map(item => ({ ...item, active: true }))
          }))
        }));
        setAlarmPhases(defaults);
      }
    } catch (e) {
      console.error(e);
      toast({ title: 'Erreur chargement config', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all([
        accidentAnalysisAPI.updateMethodsConfig({ methods }),
        accidentAnalysisAPI.updateAlarmItems({ phases: alarmPhases })
      ]);
      toast({ title: 'Configuration sauvegardee' });
    } catch {
      toast({ title: 'Erreur de sauvegarde', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const toggleItem = (phaseIdx, serviceIdx, itemIdx) => {
    setAlarmPhases(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      next[phaseIdx].services[serviceIdx].items[itemIdx].active = !next[phaseIdx].services[serviceIdx].items[itemIdx].active;
      return next;
    });
  };

  const updateItem = (phaseIdx, serviceIdx, itemIdx, field, value) => {
    setAlarmPhases(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      next[phaseIdx].services[serviceIdx].items[itemIdx][field] = value;
      return next;
    });
  };

  const addItem = (phaseIdx, serviceIdx) => {
    setAlarmPhases(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      const newId = `custom_${Date.now()}`;
      next[phaseIdx].services[serviceIdx].items.push({
        id: newId, label: '', tooltip: '', active: true
      });
      return next;
    });
  };

  const removeItem = (phaseIdx, serviceIdx, itemIdx) => {
    setAlarmPhases(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      next[phaseIdx].services[serviceIdx].items.splice(itemIdx, 1);
      return next;
    });
  };

  const handleImport = async (phaseIdx, serviceIdx, file) => {
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('phase_id', alarmPhases[phaseIdx].titre);
      formData.append('service_id', alarmPhases[phaseIdx].services[serviceIdx].label);

      const result = await accidentAnalysisAPI.importAlarmDocument(formData);

      if (result.items?.length > 0) {
        setAlarmPhases(prev => {
          const next = JSON.parse(JSON.stringify(prev));
          result.items.forEach(item => {
            const exists = next[phaseIdx].services[serviceIdx].items.some(i => i.id === item.id);
            if (!exists) {
              next[phaseIdx].services[serviceIdx].items.push({
                id: item.id || `import_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                label: item.label || '',
                tooltip: item.tooltip || '',
                active: true
              });
            }
          });
          return next;
        });
        toast({ title: `${result.items.length} item(s) extraits`, description: `Depuis ${result.source_file}` });
      } else {
        toast({ title: 'Aucun item extrait', description: 'L\'IA n\'a pas trouve d\'items ALARM dans ce document', variant: 'destructive' });
      }
    } catch (e) {
      toast({ title: 'Erreur import', description: String(e?.response?.data?.detail || e.message), variant: 'destructive' });
    } finally {
      setImporting(false);
      setImportTarget(null);
    }
  };

  if (loading) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>;

  return (
    <div className="min-h-screen bg-gray-50 py-6 px-4 sm:px-6 lg:px-8" data-testid="accident-analysis-admin">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/accident-analysis')} data-testid="admin-back-btn">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Settings2 className="h-5 w-5" /> Configuration - Arbre des Causes
              </h1>
              <p className="text-sm text-gray-500">Administration des methodes d'analyse et de la grille ALARM</p>
            </div>
          </div>
          <Button onClick={handleSave} disabled={saving} data-testid="save-config-btn">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Sauvegarder
          </Button>
        </div>

        {/* Section 1: Methods Toggle */}
        <Card className="mb-6" data-testid="methods-config-card">
          <CardHeader>
            <CardTitle className="text-base">Methodes d'analyse</CardTitle>
            <p className="text-sm text-gray-500">Activez ou desactivez les methodes proposees lors d'une nouvelle analyse</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {METHOD_DEFS.map(m => {
              const Icon = m.icon;
              return (
                <div key={m.key} className="flex items-center justify-between p-3 border rounded-lg" data-testid={`method-toggle-${m.key}`}>
                  <div className="flex items-center gap-3">
                    <Icon className={`h-5 w-5 ${m.color}`} />
                    <div>
                      <p className="font-medium text-sm">{m.label}</p>
                      <p className="text-xs text-gray-500">{m.desc}</p>
                    </div>
                  </div>
                  <Switch
                    checked={methods[m.key] !== false}
                    onCheckedChange={checked => setMethods(prev => ({ ...prev, [m.key]: checked }))}
                    data-testid={`method-switch-${m.key}`}
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Section 2: ALARM Items Editor */}
        <Card data-testid="alarm-items-config-card">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-5 w-5 text-red-600" /> Items de la grille ALARM
            </CardTitle>
            <p className="text-sm text-gray-500">Gerez les items, ajoutez-en de nouveaux ou importez depuis un document</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {alarmPhases.map((phase, phaseIdx) => {
              const isPhaseExpanded = expandedPhase === phaseIdx;
              const totalItems = phase.services.reduce((sum, s) => sum + s.items.length, 0);
              const activeItems = phase.services.reduce((sum, s) => sum + s.items.filter(i => i.active !== false).length, 0);

              return (
                <div key={phase.id} className="border rounded-lg overflow-hidden" data-testid={`admin-phase-${phase.id}`}>
                  <button
                    className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100"
                    onClick={() => setExpandedPhase(isPhaseExpanded ? null : phaseIdx)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-red-600 text-white text-xs font-bold flex items-center justify-center">{phase.numero}</span>
                      <span className="font-medium text-sm">{phase.titre}</span>
                      <Badge variant="outline" className="text-xs">{activeItems}/{totalItems} actifs</Badge>
                    </div>
                    {isPhaseExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>

                  {isPhaseExpanded && (
                    <div className="p-3 space-y-3">
                      {phase.services.map((service, serviceIdx) => {
                        const isServiceExpanded = expandedService === `${phaseIdx}-${serviceIdx}`;
                        const sActive = service.items.filter(i => i.active !== false).length;

                        return (
                          <div key={service.id} className="border rounded-lg overflow-hidden">
                            <button
                              className="w-full flex items-center justify-between p-2.5 bg-blue-50/50 hover:bg-blue-50"
                              onClick={() => setExpandedService(isServiceExpanded ? null : `${phaseIdx}-${serviceIdx}`)}
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">{service.label}</span>
                                <Badge variant="outline" className="text-xs">{sActive}/{service.items.length}</Badge>
                              </div>
                              <div className="flex items-center gap-2">
                                {isServiceExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                              </div>
                            </button>

                            {isServiceExpanded && (
                              <div className="p-2.5 space-y-1.5">
                                {service.items.map((item, itemIdx) => (
                                  <div
                                    key={item.id}
                                    className={`flex items-center gap-2 p-2 rounded border text-sm ${item.active !== false ? 'bg-white border-gray-200' : 'bg-gray-100 border-gray-100 opacity-60'}`}
                                  >
                                    <Switch
                                      checked={item.active !== false}
                                      onCheckedChange={() => toggleItem(phaseIdx, serviceIdx, itemIdx)}
                                      className="scale-75"
                                    />
                                    <Input
                                      value={item.label}
                                      onChange={e => updateItem(phaseIdx, serviceIdx, itemIdx, 'label', e.target.value)}
                                      className="h-7 text-xs flex-1 max-w-[200px]"
                                      placeholder="Label"
                                    />
                                    <Input
                                      value={item.tooltip}
                                      onChange={e => updateItem(phaseIdx, serviceIdx, itemIdx, 'tooltip', e.target.value)}
                                      className="h-7 text-xs flex-1"
                                      placeholder="Tooltip / description"
                                    />
                                    <Button
                                      variant="ghost" size="icon"
                                      className="h-7 w-7 text-red-400 hover:text-red-600"
                                      onClick={() => removeItem(phaseIdx, serviceIdx, itemIdx)}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                ))}

                                <div className="flex gap-2 mt-2">
                                  <Button size="sm" variant="outline" className="text-xs" onClick={() => addItem(phaseIdx, serviceIdx)}>
                                    <Plus className="h-3 w-3 mr-1" /> Ajouter un item
                                  </Button>
                                  <Button
                                    size="sm" variant="outline" className="text-xs"
                                    disabled={importing}
                                    onClick={() => {
                                      setImportTarget({ phaseIdx, serviceIdx });
                                      document.getElementById('alarm-file-input')?.click();
                                    }}
                                    data-testid={`import-btn-${phase.id}-${service.id}`}
                                  >
                                    {importing && importTarget?.phaseIdx === phaseIdx && importTarget?.serviceIdx === serviceIdx
                                      ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                      : <Upload className="h-3 w-3 mr-1" />
                                    }
                                    Importer via document (IA)
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Hidden file input for import */}
        <input
          id="alarm-file-input"
          type="file"
          accept=".pdf,.docx,.doc,.txt,.csv,.xlsx,.md"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0];
            if (file && importTarget) {
              handleImport(importTarget.phaseIdx, importTarget.serviceIdx, file);
            }
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
