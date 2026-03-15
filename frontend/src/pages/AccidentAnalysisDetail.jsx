import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { accidentAnalysisAPI } from '../services/api';
import { useToast } from '../hooks/use-toast';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import AlarmPhaseCheckbox from './AccidentAnalysis/AlarmPhaseCheckbox';
import {
  ArrowLeft, ArrowRight, GitBranch, Brain, Send, Loader2,
  CheckCircle2, Circle, ClipboardList, Calendar, Shield,
  ChevronDown, ChevronUp, Plus, FileText, Wrench, Printer,
  Check, Archive
} from 'lucide-react';

// ========== PHASES ==========
const ALL_PHASES = [
  { key: 'QQOQCP', label: 'QQOQCP', icon: ClipboardList, color: 'text-blue-600 bg-blue-50' },
  { key: '5POURQUOI', label: '5 Pourquoi', icon: GitBranch, color: 'text-purple-600 bg-purple-50' },
  { key: 'ISHIKAWA', label: 'Ishikawa (5M)', icon: GitBranch, color: 'text-orange-600 bg-orange-50' },
  { key: 'ALARM', label: 'ALARM', icon: Shield, color: 'text-red-600 bg-red-50' },
  { key: 'ACTIONS', label: 'Actions correctives', icon: Wrench, color: 'text-green-600 bg-green-50' },
];

const GRAVITE_COLORS = {
  FAIBLE: 'bg-green-100 text-green-800',
  MOYENNE: 'bg-yellow-100 text-yellow-800',
  HAUTE: 'bg-orange-100 text-orange-800',
  CRITIQUE: 'bg-red-100 text-red-800',
};

// ========== QQOQCP Categories ==========
const QQOQCP_CATS = [
  { key: 'quoi', label: 'Quoi ?', desc: 'Que s\'est-il passe ?' },
  { key: 'qui', label: 'Qui ?', desc: 'Qui est implique ?' },
  { key: 'ou', label: 'Ou ?', desc: 'Ou cela s\'est-il passe ?' },
  { key: 'quand', label: 'Quand ?', desc: 'Quand cela s\'est-il passe ?' },
  { key: 'comment', label: 'Comment ?', desc: 'Comment est-ce arrive ?' },
  { key: 'pourquoi', label: 'Pourquoi ?', desc: 'Pourquoi est-ce arrive ?' },
];

// ========== 5M Categories ==========
const ISHIKAWA_CATS = [
  { key: 'main_oeuvre', label: 'Main d\'oeuvre', color: '#3B82F6' },
  { key: 'materiel', label: 'Materiel', color: '#EF4444' },
  { key: 'methodes', label: 'Methodes', color: '#10B981' },
  { key: 'milieu', label: 'Milieu', color: '#F59E0B' },
  { key: 'matieres', label: 'Matieres', color: '#8B5CF6' },
];

// ========== (AlarmPhase moved to AccidentAnalysis/AlarmPhaseCheckbox.jsx) ==========

export default function AccidentAnalysisDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activePhase, setActivePhase] = useState(0);
  const [aiLoading, setAiLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [methodsConfig, setMethodsConfig] = useState(null);
  const phaseDataRef = React.useRef(null);

  // Phases filtrees selon la config admin
  const PHASES = React.useMemo(() => {
    if (!methodsConfig) return ALL_PHASES;
    return ALL_PHASES.filter(p => {
      if (p.key === 'ACTIONS') return true; // Toujours afficher les actions
      return methodsConfig[p.key] !== false;
    });
  }, [methodsConfig]);

  const load = useCallback(async () => {
    try {
      const [data, cfg] = await Promise.all([
        accidentAnalysisAPI.get(id),
        accidentAnalysisAPI.getMethodsConfig().catch(() => null)
      ]);
      setAnalysis(data);
      if (cfg?.methods) setMethodsConfig(cfg.methods);
      const idx = (cfg?.methods ? ALL_PHASES.filter(p => p.key === 'ACTIONS' || cfg.methods[p.key] !== false) : ALL_PHASES).findIndex(p => p.key === data.phase_actuelle);
      if (idx >= 0) setActivePhase(idx);
    } catch {
      toast({ title: 'Erreur', description: 'Analyse introuvable', variant: 'destructive' });
      navigate('/accident-analysis');
    } finally {
      setLoading(false);
    }
  }, [id, navigate, toast]);

  useEffect(() => { load(); }, [load]);

  const saveAnalysis = useCallback(async (updates) => {
    setSaving(true);
    try {
      const data = await accidentAnalysisAPI.update(id, { ...updates, phase_actuelle: PHASES[activePhase].key });
      setAnalysis(data);
    } catch {
      toast({ title: 'Erreur de sauvegarde', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }, [id, activePhase, toast]);

  const saveCurrentPhaseAndSwitch = useCallback(async (targetPhase) => {
    setSaving(true);
    try {
      const phaseData = phaseDataRef.current ? phaseDataRef.current() : {};
      await accidentAnalysisAPI.update(id, { ...phaseData, phase_actuelle: PHASES[targetPhase].key });
      const freshData = await accidentAnalysisAPI.get(id);
      setAnalysis(freshData);
      setActivePhase(targetPhase);
    } catch {
      toast({ title: 'Erreur de sauvegarde', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }, [id, toast]);

  const goNextPhase = async () => {
    if (activePhase < PHASES.length - 1) {
      await saveCurrentPhaseAndSwitch(activePhase + 1);
    }
  };

  const goPrevPhase = async () => {
    if (activePhase > 0) {
      await saveCurrentPhaseAndSwitch(activePhase - 1);
    }
  };

  if (loading) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>;
  if (!analysis) return null;

  return (
    <div className="min-h-screen bg-gray-50 py-6 px-4 sm:px-6 lg:px-8" data-testid="accident-analysis-detail">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/accident-analysis')} data-testid="back-btn">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900 truncate">{analysis.titre}</h1>
              <Badge className={GRAVITE_COLORS[analysis.gravite]}>{analysis.gravite}</Badge>
            </div>
            <p className="text-sm text-gray-500">{analysis.lieu} - {analysis.date_accident}</p>
          </div>
          {saving && <span className="text-sm text-gray-400 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Sauvegarde...</span>}
        </div>

        {/* Phase Stepper */}
        <div className="flex items-center gap-1 mb-6 overflow-x-auto pb-2">
          {PHASES.map((phase, idx) => {
            const Icon = phase.icon;
            const isActive = idx === activePhase;
            const isDone = idx < activePhase;
            return (
              <React.Fragment key={phase.key}>
                {idx > 0 && <div className={`h-0.5 w-8 flex-shrink-0 ${isDone ? 'bg-green-500' : 'bg-gray-200'}`} />}
                <button
                  data-testid={`phase-${phase.key}`}
                  onClick={() => setActivePhase(idx)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all flex-shrink-0 ${
                    isActive ? phase.color + ' ring-2 ring-offset-1 ring-current' : isDone ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {isDone ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  {phase.label}
                </button>
              </React.Fragment>
            );
          })}
        </div>

        {/* Phase Content */}
        <div className="mb-6">
          {PHASES[activePhase]?.key === 'QQOQCP' && <QQOQCPPhase analysis={analysis} onSave={saveAnalysis} phaseDataRef={phaseDataRef} aiLoading={aiLoading} setAiLoading={setAiLoading} toast={toast} />}
          {PHASES[activePhase]?.key === '5POURQUOI' && <CinqPourquoiPhase analysis={analysis} onSave={saveAnalysis} phaseDataRef={phaseDataRef} aiLoading={aiLoading} setAiLoading={setAiLoading} toast={toast} />}
          {PHASES[activePhase]?.key === 'ISHIKAWA' && <IshikawaPhase analysis={analysis} onSave={saveAnalysis} phaseDataRef={phaseDataRef} aiLoading={aiLoading} setAiLoading={setAiLoading} toast={toast} />}
          {PHASES[activePhase]?.key === 'ALARM' && <AlarmPhaseCheckbox analysis={analysis} onSave={saveAnalysis} phaseDataRef={phaseDataRef} aiLoading={aiLoading} setAiLoading={setAiLoading} toast={toast} />}
          {PHASES[activePhase]?.key === 'ACTIONS' && <ActionsPhase analysis={analysis} onSave={saveAnalysis} phaseDataRef={phaseDataRef} onReload={load} aiLoading={aiLoading} setAiLoading={setAiLoading} toast={toast} />}
        </div>

        {/* Navigation */}
        <div className="flex justify-between">
          <Button variant="outline" onClick={goPrevPhase} disabled={activePhase === 0} data-testid="prev-phase-btn">
            <ArrowLeft className="h-4 w-4 mr-2" /> Phase precedente
          </Button>
          {activePhase < PHASES.length - 1 ? (
            <Button onClick={goNextPhase} data-testid="next-phase-btn">
              Phase suivante <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button onClick={async () => { await saveAnalysis({ statut: 'TERMINEE', phase_actuelle: 'TERMINEE' }); toast({ title: 'Analyse terminee !' }); navigate('/accident-analysis'); }} data-testid="finish-analysis-btn" className="bg-green-600 hover:bg-green-700">
              <CheckCircle2 className="h-4 w-4 mr-2" /> Terminer l'analyse
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}


// ========== QQOQCP Phase ==========
function QQOQCPPhase({ analysis, onSave, phaseDataRef, aiLoading, setAiLoading, toast }) {
  const [qqoqcp, setQqoqcp] = useState(analysis.qqoqcp || {});
  const [aiResult, setAiResult] = useState(null);

  React.useEffect(() => {
    phaseDataRef.current = () => ({ qqoqcp });
  }, [qqoqcp, phaseDataRef]);

  const askAI = async () => {
    setAiLoading(true);
    try {
      const result = await accidentAnalysisAPI.aiQqoqcp(analysis.id, { user_input: JSON.stringify(qqoqcp) });
      setAiResult(result);
    } catch {
      toast({ title: 'Erreur IA', variant: 'destructive' });
    } finally {
      setAiLoading(false);
    }
  };

  const save = () => onSave({ qqoqcp });

  return (
    <Card data-testid="qqoqcp-phase">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-blue-600" /> Methode QQOQCP
          </CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={askAI} disabled={aiLoading} data-testid="ai-qqoqcp-btn">
              {aiLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Brain className="h-4 w-4 mr-1" />}
              Aide IA
            </Button>
            <Button size="sm" onClick={save} data-testid="save-qqoqcp-btn">Sauvegarder</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2">
          {QQOQCP_CATS.map(cat => (
            <div key={cat.key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{cat.label} <span className="text-gray-400 font-normal">{cat.desc}</span></label>
              <textarea
                data-testid={`qqoqcp-${cat.key}`}
                className="w-full border rounded-md p-2 text-sm min-h-[70px] resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={qqoqcp[cat.key] || ''}
                onChange={e => setQqoqcp(prev => ({ ...prev, [cat.key]: e.target.value }))}
              />
            </div>
          ))}
        </div>

        {/* AI Suggestions */}
        {aiResult && (
          <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200" data-testid="ai-qqoqcp-result">
            <h4 className="font-medium text-blue-800 mb-2 flex items-center gap-1"><Brain className="h-4 w-4" /> Suggestions IA</h4>
            {aiResult.questions?.length > 0 && (
              <div className="space-y-2">
                {aiResult.questions.map((q, i) => (
                  <div key={i} className="bg-white p-2 rounded text-sm">
                    <Badge variant="outline" className="mb-1">{q.categorie}</Badge>
                    <p className="font-medium">{q.question}</p>
                    {q.aide && <p className="text-gray-500 text-xs mt-1">{q.aide}</p>}
                  </div>
                ))}
              </div>
            )}
            {aiResult.synthese && <p className="mt-3 text-sm text-blue-700 italic">{aiResult.synthese}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}


// ========== 5 Pourquoi Phase ==========
function CinqPourquoiPhase({ analysis, onSave, phaseDataRef, aiLoading, setAiLoading, toast }) {
  const [iterations, setIterations] = useState(analysis.cinq_pourquoi?.iterations || []);
  const [causeRacine, setCauseRacine] = useState(analysis.cinq_pourquoi?.cause_racine || '');
  const [currentReponse, setCurrentReponse] = useState('');
  const [aiResult, setAiResult] = useState(null);

  React.useEffect(() => {
    phaseDataRef.current = () => ({ cinq_pourquoi: { iterations, cause_racine: causeRacine } });
  }, [iterations, causeRacine, phaseDataRef]);

  const askAI = async () => {
    if (!currentReponse && iterations.length === 0) {
      toast({ title: 'Entrez une premiere reponse' }); return;
    }
    setAiLoading(true);
    try {
      const result = await accidentAnalysisAPI.ai5Pourquoi(analysis.id, { iterations, derniere_reponse: currentReponse });
      setAiResult(result);
      if (currentReponse) {
        const newIter = [...iterations, { question: `Pourquoi ${iterations.length + 1}`, reponse: currentReponse }];
        setIterations(newIter);
        setCurrentReponse('');
      }
      if (result.est_cause_racine && result.cause_racine_identifiee) {
        setCauseRacine(result.cause_racine_identifiee);
      }
    } catch {
      toast({ title: 'Erreur IA', variant: 'destructive' });
    } finally {
      setAiLoading(false);
    }
  };

  const save = () => onSave({ cinq_pourquoi: { iterations, cause_racine: causeRacine } });

  return (
    <Card data-testid="5pourquoi-phase">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-purple-600" /> Methode des 5 Pourquoi
          </CardTitle>
          <Button size="sm" onClick={save} data-testid="save-5pourquoi-btn">Sauvegarder</Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Iterations */}
        <div className="space-y-3 mb-4">
          {iterations.map((it, i) => (
            <div key={i} className="flex gap-3 items-start">
              <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-sm font-bold flex-shrink-0">{i + 1}</div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-700">{it.question}</p>
                <p className="text-sm text-gray-900 bg-gray-50 p-2 rounded mt-1">{it.reponse}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Next question input */}
        {!causeRacine && (
          <div className="flex gap-2 mb-4">
            <div className="w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">{iterations.length + 1}</div>
            <Input
              data-testid="5pourquoi-input"
              placeholder={iterations.length === 0 ? "Pourquoi l'accident s'est-il produit ?" : "Pourquoi ?"}
              value={currentReponse}
              onChange={e => setCurrentReponse(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && askAI()}
              className="flex-1"
            />
            <Button onClick={askAI} disabled={aiLoading} size="icon" data-testid="ai-5pourquoi-btn">
              {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        )}

        {/* AI Result */}
        {aiResult && (
          <div className={`p-4 rounded-lg border ${aiResult.est_cause_racine ? 'bg-green-50 border-green-200' : 'bg-purple-50 border-purple-200'}`} data-testid="ai-5pourquoi-result">
            {aiResult.est_cause_racine ? (
              <>
                <h4 className="font-medium text-green-800 flex items-center gap-1"><CheckCircle2 className="h-4 w-4" /> Cause racine identifiee</h4>
                <p className="text-sm text-green-700 mt-1 font-medium">{aiResult.cause_racine_identifiee}</p>
              </>
            ) : (
              <>
                <h4 className="font-medium text-purple-800 flex items-center gap-1"><Brain className="h-4 w-4" /> Prochaine question</h4>
                <p className="text-sm text-purple-700 mt-1">{aiResult.pourquoi_suivant}</p>
              </>
            )}
            {aiResult.analyse && <p className="text-sm text-gray-600 mt-2 italic">{aiResult.analyse}</p>}
            {aiResult.suggestions_pistes?.length > 0 && (
              <div className="mt-2">
                <p className="text-xs text-gray-500 font-medium">Pistes :</p>
                <ul className="list-disc list-inside text-sm text-gray-600">
                  {aiResult.suggestions_pistes.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Cause Racine */}
        {causeRacine && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg" data-testid="cause-racine">
            <h4 className="font-medium text-green-800">Cause racine</h4>
            <textarea
              className="w-full border rounded-md p-2 text-sm mt-1 bg-white resize-none"
              value={causeRacine}
              onChange={e => setCauseRacine(e.target.value)}
              rows={2}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}


// ========== Ishikawa (5M) Phase ==========
function IshikawaPhase({ analysis, onSave, phaseDataRef, aiLoading, setAiLoading, toast }) {
  const [ishikawa, setIshikawa] = useState(analysis.ishikawa || {});
  const [userInput, setUserInput] = useState('');
  const [expanded, setExpanded] = useState({});

  React.useEffect(() => {
    phaseDataRef.current = () => ({ ishikawa });
  }, [ishikawa, phaseDataRef]);

  const askAI = async () => {
    setAiLoading(true);
    try {
      const result = await accidentAnalysisAPI.aiIshikawa(analysis.id, { user_input: userInput });
      setIshikawa(result);
    } catch {
      toast({ title: 'Erreur IA', variant: 'destructive' });
    } finally {
      setAiLoading(false);
    }
  };

  const save = () => onSave({ ishikawa });

  const addCause = (catKey) => {
    const current = ishikawa[catKey] || [];
    setIshikawa(prev => ({ ...prev, [catKey]: [...current, { cause: '', detail: '' }] }));
  };

  const updateCause = (catKey, idx, field, value) => {
    const updated = [...(ishikawa[catKey] || [])];
    updated[idx] = { ...updated[idx], [field]: value };
    setIshikawa(prev => ({ ...prev, [catKey]: updated }));
  };

  const removeCause = (catKey, idx) => {
    const updated = [...(ishikawa[catKey] || [])];
    updated.splice(idx, 1);
    setIshikawa(prev => ({ ...prev, [catKey]: updated }));
  };

  return (
    <Card data-testid="ishikawa-phase">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-orange-600" /> Diagramme d'Ishikawa (5M)
          </CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={askAI} disabled={aiLoading} data-testid="ai-ishikawa-btn">
              {aiLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Brain className="h-4 w-4 mr-1" />}
              Analyse IA
            </Button>
            <Button size="sm" onClick={save} data-testid="save-ishikawa-btn">Sauvegarder</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* AI input */}
        <div className="flex gap-2 mb-4">
          <Input
            data-testid="ishikawa-input"
            placeholder="Informations supplementaires pour l'IA..."
            value={userInput}
            onChange={e => setUserInput(e.target.value)}
            className="flex-1"
          />
        </div>

        {/* Ishikawa Diagram visual */}
        <IshikawaDiagram ishikawa={ishikawa} />

        {/* 5M Categories */}
        <div className="grid gap-3 mt-4">
          {ISHIKAWA_CATS.map(cat => {
            const causes = ishikawa[cat.key] || [];
            const isExpanded = expanded[cat.key] !== false;
            return (
              <div key={cat.key} className="border rounded-lg overflow-hidden">
                <button
                  className="w-full flex items-center justify-between p-3 text-left"
                  style={{ backgroundColor: cat.color + '15', borderLeft: `4px solid ${cat.color}` }}
                  onClick={() => setExpanded(prev => ({ ...prev, [cat.key]: !isExpanded }))}
                >
                  <span className="font-medium text-sm" style={{ color: cat.color }}>{cat.label} ({causes.length})</span>
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                {isExpanded && (
                  <div className="p-3 space-y-2">
                    {causes.map((c, i) => (
                      <div key={i} className="flex gap-2 items-start">
                        <div className="flex-1 grid grid-cols-2 gap-2">
                          <Input
                            placeholder="Cause"
                            value={c.cause || ''}
                            onChange={e => updateCause(cat.key, i, 'cause', e.target.value)}
                            className="text-sm"
                          />
                          <Input
                            placeholder="Detail"
                            value={c.detail || ''}
                            onChange={e => updateCause(cat.key, i, 'detail', e.target.value)}
                            className="text-sm"
                          />
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => removeCause(cat.key, i)}>x</Button>
                      </div>
                    ))}
                    <Button size="sm" variant="outline" onClick={() => addCause(cat.key)} className="w-full">
                      <Plus className="h-3 w-3 mr-1" /> Ajouter une cause
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {ishikawa.synthese && (
          <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
            <p className="text-sm text-orange-700 italic">{ishikawa.synthese}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}


// ========== Ishikawa Visual Diagram ==========
function IshikawaDiagram({ ishikawa }) {
  const hasCauses = ISHIKAWA_CATS.some(cat => (ishikawa[cat.key] || []).length > 0);
  if (!hasCauses) return null;

  return (
    <div className="relative bg-white border rounded-lg p-6 overflow-hidden" data-testid="ishikawa-diagram">
      {/* Central spine */}
      <div className="flex items-center justify-center mb-2">
        <div className="text-center px-4 py-2 bg-red-600 text-white rounded-lg font-bold text-sm shadow-md z-10">
          ACCIDENT
        </div>
      </div>
      <div className="h-1 bg-gray-800 w-full rounded mb-4" />

      {/* 5M Branches */}
      <div className="grid grid-cols-5 gap-2">
        {ISHIKAWA_CATS.map(cat => {
          const causes = ishikawa[cat.key] || [];
          return (
            <div key={cat.key} className="text-center">
              <div className="inline-block px-2 py-1 rounded text-xs font-bold text-white mb-2" style={{ backgroundColor: cat.color }}>
                {cat.label}
              </div>
              <div className="space-y-1">
                {causes.map((c, i) => (
                  <div key={i} className="text-xs bg-gray-50 rounded px-2 py-1 border" style={{ borderColor: cat.color + '60' }}>
                    {c.cause || '...'}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


// ========== Actions Phase ==========
function ActionsPhase({ analysis, onSave, phaseDataRef, onReload, aiLoading, setAiLoading, toast }) {
  const [actions, setActions] = useState(analysis.actions_correctives || []);
  const [selected, setSelected] = useState(() => {
    return new Set((analysis.actions_correctives || []).map((_, i) => i));
  });
  const [aiActions, setAiActions] = useState(null);
  const [creatingAction, setCreatingAction] = useState(null);
  const [archiving, setArchiving] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualAction, setManualAction] = useState({ titre: '', description: '', type: 'OT_CORRECTIF', priorite: 'MOYENNE' });

  React.useEffect(() => {
    phaseDataRef.current = () => ({ actions_correctives: actions });
  }, [actions, phaseDataRef]);

  const addManualAction = () => {
    if (!manualAction.titre.trim()) {
      toast({ title: 'Le titre est requis', variant: 'destructive' });
      return;
    }
    const newAction = { ...manualAction, source: 'MANUELLE' };
    const newActions = [...actions, newAction];
    setActions(newActions);
    setSelected(prev => new Set([...prev, newActions.length - 1]));
    setManualAction({ titre: '', description: '', type: 'OT_CORRECTIF', priorite: 'MOYENNE' });
    setShowManualForm(false);
    toast({ title: 'Action ajoutee' });
  };

  const removeAction = (idx) => {
    const newActions = actions.filter((_, i) => i !== idx);
    setActions(newActions);
    setSelected(prev => {
      const next = new Set();
      prev.forEach(i => { if (i < idx) next.add(i); else if (i > idx) next.add(i - 1); });
      return next;
    });
  };

  const generateActions = async () => {
    setAiLoading(true);
    try {
      const result = await accidentAnalysisAPI.aiGenerateActions(analysis.id);
      setAiActions(result);
      if (result.actions) {
        setActions(result.actions);
        setSelected(new Set(result.actions.map((_, i) => i)));
      }
    } catch {
      toast({ title: 'Erreur IA', variant: 'destructive' });
    } finally {
      setAiLoading(false);
    }
  };

  const toggleSelect = (idx) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === actions.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(actions.map((_, i) => i)));
    }
  };

  const save = () => onSave({ actions_correctives: actions });

  const openPdf = () => {
    const baseUrl = process.env.REACT_APP_BACKEND_URL || '';
    const token = localStorage.getItem('token');
    const selectedIndices = [...selected].sort((a, b) => a - b).join(',');
    const url = `${baseUrl}/api/accident-analysis/${analysis.id}/pdf?token=${token}&actions=${selectedIndices}`;
    window.open(url, '_blank');
  };

  const archivePdf = async () => {
    setArchiving(true);
    try {
      const selectedIndices = [...selected].sort((a, b) => a - b);
      await accidentAnalysisAPI.archivePdf(analysis.id, { selected_actions: selectedIndices });
      toast({ title: 'Rapport archive', description: `${selectedIndices.length} action(s) retenue(s)` });
      onReload();
    } catch {
      toast({ title: 'Erreur', variant: 'destructive' });
    } finally {
      setArchiving(false);
    }
  };

  const createOT = async (action) => {
    setCreatingAction(action.titre);
    try {
      const result = await accidentAnalysisAPI.createWorkOrder(analysis.id, {
        titre: action.titre,
        description: action.description,
        priorite: action.priorite,
      });
      toast({ title: 'OT cree', description: `OT #${result.numero} - ${result.titre}` });
      onReload();
    } catch {
      toast({ title: 'Erreur', variant: 'destructive' });
    } finally {
      setCreatingAction(null);
    }
  };

  const createMP = async (action) => {
    setCreatingAction(action.titre);
    try {
      const result = await accidentAnalysisAPI.createPreventive(analysis.id, {
        titre: action.titre,
        description: action.description,
        priorite: action.priorite,
        frequence: 'MENSUEL',
      });
      toast({ title: 'Maintenance preventive creee', description: result.titre });
      onReload();
    } catch {
      toast({ title: 'Erreur', variant: 'destructive' });
    } finally {
      setCreatingAction(null);
    }
  };

  const createChecklist = async (action) => {
    setCreatingAction(action.titre);
    try {
      const result = await accidentAnalysisAPI.createChecklist(analysis.id, {
        titre: action.titre,
        description: action.description,
        items: [],
      });
      toast({ title: 'Checklist creee', description: result.titre });
      onReload();
    } catch {
      toast({ title: 'Erreur', variant: 'destructive' });
    } finally {
      setCreatingAction(null);
    }
  };

  const PRIO_COLORS = {
    URGENTE: 'bg-red-100 text-red-800',
    HAUTE: 'bg-orange-100 text-orange-800',
    MOYENNE: 'bg-yellow-100 text-yellow-800',
    BASSE: 'bg-green-100 text-green-800',
  };

  return (
    <Card data-testid="actions-phase">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Wrench className="h-5 w-5 text-green-600" /> Actions correctives & preventives
          </CardTitle>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => setShowManualForm(v => !v)} data-testid="add-manual-action-btn">
              <Plus className="h-4 w-4 mr-1" />
              Ajouter manuellement
            </Button>
            <Button size="sm" variant="outline" onClick={generateActions} disabled={aiLoading} data-testid="ai-generate-actions-btn">
              {aiLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Brain className="h-4 w-4 mr-1" />}
              Generer via IA
            </Button>
            <Button size="sm" onClick={save} data-testid="save-actions-btn">Sauvegarder</Button>
          </div>
        </div>
        {/* PDF & Archive buttons - only when actions exist */}
        {actions.length > 0 && (
          <div className="flex items-center justify-between mt-3 pt-3 border-t">
            <div className="flex items-center gap-3">
              <button
                onClick={toggleAll}
                className="text-xs text-blue-600 hover:underline"
                data-testid="toggle-all-actions"
              >
                {selected.size === actions.length ? 'Tout deselectionner' : 'Tout selectionner'}
              </button>
              <span className="text-xs text-gray-500">
                {selected.size} / {actions.length} action(s) retenue(s)
              </span>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={openPdf} disabled={selected.size === 0} data-testid="generate-pdf-btn">
                <Printer className="h-4 w-4 mr-1" />
                Rapport PDF
              </Button>
              <Button size="sm" variant="outline" onClick={archivePdf} disabled={selected.size === 0 || archiving} data-testid="archive-pdf-btn">
                {archiving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Archive className="h-4 w-4 mr-1" />}
                Archiver
              </Button>
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {/* Manual action form */}
        {showManualForm && (
          <div className="mb-4 p-4 border-2 border-dashed border-blue-300 rounded-lg bg-blue-50/30" data-testid="manual-action-form">
            <h4 className="font-medium text-gray-800 mb-3 flex items-center gap-2">
              <Plus className="h-4 w-4 text-blue-600" /> Nouvelle action manuelle
            </h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-gray-500 mb-1 block">Titre *</label>
                <Input
                  value={manualAction.titre}
                  onChange={e => setManualAction(p => ({ ...p, titre: e.target.value }))}
                  placeholder="Titre de l'action"
                  data-testid="manual-action-titre"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-gray-500 mb-1 block">Description</label>
                <textarea
                  className="w-full border rounded-md p-2 text-sm min-h-[60px] resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={manualAction.description}
                  onChange={e => setManualAction(p => ({ ...p, description: e.target.value }))}
                  placeholder="Description detaillee de l'action"
                  data-testid="manual-action-description"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Type</label>
                <select
                  className="w-full border rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={manualAction.type}
                  onChange={e => setManualAction(p => ({ ...p, type: e.target.value }))}
                  data-testid="manual-action-type"
                >
                  <option value="OT_CORRECTIF">OT Correctif</option>
                  <option value="MAINTENANCE_PREVENTIVE">Maintenance Preventive</option>
                  <option value="CHECKLIST">Checklist</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Priorite</label>
                <select
                  className="w-full border rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={manualAction.priorite}
                  onChange={e => setManualAction(p => ({ ...p, priorite: e.target.value }))}
                  data-testid="manual-action-priorite"
                >
                  <option value="URGENTE">Urgente</option>
                  <option value="HAUTE">Haute</option>
                  <option value="MOYENNE">Moyenne</option>
                  <option value="BASSE">Basse</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={addManualAction} data-testid="confirm-manual-action-btn">
                <Check className="h-4 w-4 mr-1" /> Ajouter
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowManualForm(false)} data-testid="cancel-manual-action-btn">
                Annuler
              </Button>
            </div>
          </div>
        )}

        {actions.length === 0 && !showManualForm ? (
          <div className="text-center py-8 text-gray-400">
            <Wrench className="h-10 w-10 mx-auto mb-2" />
            <p>Cliquez sur "Generer via IA" ou "Ajouter manuellement" pour creer des actions correctives.</p>
          </div>
        ) : actions.length > 0 && (
          <div className="space-y-3">
            {actions.map((action, i) => {
              const isSelected = selected.has(i);
              return (
                <div
                  key={i}
                  className={`border rounded-lg p-4 transition-all ${isSelected ? 'border-green-300 bg-green-50/30' : 'border-gray-200 bg-gray-50/30 opacity-60'}`}
                  data-testid={`action-${i}`}
                >
                  <div className="flex items-start gap-3">
                    {/* Checkbox */}
                    <button
                      onClick={() => toggleSelect(i)}
                      className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                        isSelected ? 'bg-green-600 border-green-600 text-white' : 'border-gray-300 hover:border-gray-400'
                      }`}
                      data-testid={`select-action-${i}`}
                    >
                      {isSelected && <Check className="h-3 w-3" />}
                    </button>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h4 className="font-medium text-gray-900">{action.titre}</h4>
                        <Badge className={PRIO_COLORS[action.priorite] || ''}>{action.priorite}</Badge>
                        <Badge variant="outline">{action.type?.replace('_', ' ')}</Badge>
                        {action.source === 'MANUELLE' && <Badge className="bg-blue-100 text-blue-800 text-[10px]">Manuelle</Badge>}
                      </div>
                      <p className="text-sm text-gray-600">{action.description}</p>
                      {action.categorie_5m && <p className="text-xs text-gray-400 mt-1">Categorie 5M: {action.categorie_5m}</p>}
                      {action.source === 'MANUELLE' && (
                        <button
                          onClick={() => removeAction(i)}
                          className="text-xs text-red-500 hover:text-red-700 mt-1"
                          data-testid={`remove-action-${i}`}
                        >
                          Supprimer
                        </button>
                      )}
                      {isSelected && (
                        <div className="flex gap-2 mt-3">
                          {(action.type === 'OT_CORRECTIF' || !action.type) && (
                            <Button size="sm" variant="outline" onClick={() => createOT(action)} disabled={!!creatingAction} data-testid={`create-ot-${i}`}>
                              {creatingAction === action.titre ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <ClipboardList className="h-3 w-3 mr-1" />}
                              Creer OT
                            </Button>
                          )}
                          {(action.type === 'MAINTENANCE_PREVENTIVE' || !action.type) && (
                            <Button size="sm" variant="outline" onClick={() => createMP(action)} disabled={!!creatingAction} data-testid={`create-mp-${i}`}>
                              {creatingAction === action.titre ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Calendar className="h-3 w-3 mr-1" />}
                              Creer M.Prev
                            </Button>
                          )}
                          {(action.type === 'CHECKLIST' || !action.type) && (
                            <Button size="sm" variant="outline" onClick={() => createChecklist(action)} disabled={!!creatingAction} data-testid={`create-checklist-${i}`}>
                              {creatingAction === action.titre ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <FileText className="h-3 w-3 mr-1" />}
                              Creer Checklist
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {aiActions?.synthese && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg" data-testid="ai-actions-result">
            <p className="text-sm text-green-700 italic">{aiActions.synthese}</p>
          </div>
        )}

        {/* Generated items summary */}
        {(analysis.ot_generes?.length > 0 || analysis.mp_generees?.length > 0 || analysis.checklists_generees?.length > 0) && (
          <div className="mt-4 p-3 bg-gray-50 rounded-lg border" data-testid="generated-items">
            <h4 className="font-medium text-gray-700 mb-2">Elements generes</h4>
            {analysis.ot_generes?.length > 0 && (
              <div className="mb-1">
                <p className="text-xs font-medium text-gray-500">OT :</p>
                {analysis.ot_generes.map((ot, i) => <Badge key={i} variant="outline" className="mr-1 mb-1">OT #{ot.numero} - {ot.titre}</Badge>)}
              </div>
            )}
            {analysis.mp_generees?.length > 0 && (
              <div className="mb-1">
                <p className="text-xs font-medium text-gray-500">Maintenances preventives :</p>
                {analysis.mp_generees.map((mp, i) => <Badge key={i} variant="outline" className="mr-1 mb-1">{mp.titre}</Badge>)}
              </div>
            )}
            {analysis.checklists_generees?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500">Checklists :</p>
                {analysis.checklists_generees.map((cl, i) => <Badge key={i} variant="outline" className="mr-1 mb-1">{cl.titre}</Badge>)}
              </div>
            )}
          </div>
        )}

        {/* Rapports PDF archives */}
        {analysis.rapports_pdf?.length > 0 && (
          <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200" data-testid="archived-reports">
            <h4 className="font-medium text-blue-700 mb-2 flex items-center gap-1">
              <Archive className="h-4 w-4" /> Rapports archives ({analysis.rapports_pdf.length})
            </h4>
            <div className="space-y-1">
              {analysis.rapports_pdf.map((r, i) => (
                <div key={i} className="flex items-center justify-between text-sm bg-white rounded px-3 py-1.5 border border-blue-100">
                  <div>
                    <span className="text-gray-700">
                      {new Date(r.generated_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="text-gray-400 ml-2">par {r.generated_by}</span>
                    <span className="text-gray-400 ml-2">({r.retained_actions}/{r.total_actions} actions)</span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      const baseUrl = process.env.REACT_APP_BACKEND_URL || '';
                      const token = localStorage.getItem('token');
                      const actionsParam = r.selected_actions?.join(',') || '';
                      window.open(`${baseUrl}/api/accident-analysis/${analysis.id}/pdf?token=${token}&actions=${actionsParam}`, '_blank');
                    }}
                    data-testid={`view-archived-pdf-${i}`}
                  >
                    <Printer className="h-3 w-3 mr-1" /> Voir
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
