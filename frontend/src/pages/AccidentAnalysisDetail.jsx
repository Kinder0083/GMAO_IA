import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { accidentAnalysisAPI } from '../services/api';
import { useToast } from '../hooks/use-toast';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import {
  ArrowLeft, ArrowRight, GitBranch, Brain, Send, Loader2,
  CheckCircle2, Circle, ClipboardList, Calendar, Shield,
  ChevronDown, ChevronUp, Plus, FileText, Wrench
} from 'lucide-react';

// ========== PHASES ==========
const PHASES = [
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

// ========== ALARM Categories ==========
const ALARM_CATS = [
  { key: 'patient_facteurs', label: 'Facteurs patient/victime' },
  { key: 'taches_facteurs', label: 'Facteurs taches' },
  { key: 'individus_facteurs', label: 'Facteurs individuels' },
  { key: 'equipe_facteurs', label: 'Facteurs equipe' },
  { key: 'environnement_facteurs', label: 'Facteurs environnement' },
  { key: 'organisation_facteurs', label: 'Facteurs organisation' },
  { key: 'contexte_facteurs', label: 'Facteurs contexte institutionnel' },
];

export default function AccidentAnalysisDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activePhase, setActivePhase] = useState(0);
  const [aiLoading, setAiLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await accidentAnalysisAPI.get(id);
      setAnalysis(data);
      const idx = PHASES.findIndex(p => p.key === data.phase_actuelle);
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

  const goNextPhase = async () => {
    if (activePhase < PHASES.length - 1) {
      const nextPhase = activePhase + 1;
      setActivePhase(nextPhase);
      await accidentAnalysisAPI.update(id, { phase_actuelle: PHASES[nextPhase].key });
    }
  };

  const goPrevPhase = () => {
    if (activePhase > 0) setActivePhase(activePhase - 1);
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
          {activePhase === 0 && <QQOQCPPhase analysis={analysis} onSave={saveAnalysis} aiLoading={aiLoading} setAiLoading={setAiLoading} toast={toast} />}
          {activePhase === 1 && <CinqPourquoiPhase analysis={analysis} onSave={saveAnalysis} aiLoading={aiLoading} setAiLoading={setAiLoading} toast={toast} />}
          {activePhase === 2 && <IshikawaPhase analysis={analysis} onSave={saveAnalysis} aiLoading={aiLoading} setAiLoading={setAiLoading} toast={toast} />}
          {activePhase === 3 && <AlarmPhase analysis={analysis} onSave={saveAnalysis} aiLoading={aiLoading} setAiLoading={setAiLoading} toast={toast} />}
          {activePhase === 4 && <ActionsPhase analysis={analysis} onSave={saveAnalysis} onReload={load} aiLoading={aiLoading} setAiLoading={setAiLoading} toast={toast} />}
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
function QQOQCPPhase({ analysis, onSave, aiLoading, setAiLoading, toast }) {
  const [qqoqcp, setQqoqcp] = useState(analysis.qqoqcp || {});
  const [aiResult, setAiResult] = useState(null);

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
function CinqPourquoiPhase({ analysis, onSave, aiLoading, setAiLoading, toast }) {
  const [iterations, setIterations] = useState(analysis.cinq_pourquoi?.iterations || []);
  const [causeRacine, setCauseRacine] = useState(analysis.cinq_pourquoi?.cause_racine || '');
  const [currentReponse, setCurrentReponse] = useState('');
  const [aiResult, setAiResult] = useState(null);

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
function IshikawaPhase({ analysis, onSave, aiLoading, setAiLoading, toast }) {
  const [ishikawa, setIshikawa] = useState(analysis.ishikawa || {});
  const [userInput, setUserInput] = useState('');
  const [expanded, setExpanded] = useState({});

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


// ========== ALARM Phase ==========
function AlarmPhase({ analysis, onSave, aiLoading, setAiLoading, toast }) {
  const [alarm, setAlarm] = useState(analysis.alarm || {});
  const [userInput, setUserInput] = useState('');
  const [aiResult, setAiResult] = useState(null);

  const askAI = async () => {
    setAiLoading(true);
    try {
      const result = await accidentAnalysisAPI.aiAlarm(analysis.id, { user_input: userInput });
      setAiResult(result);
      // Map AI result to alarm structure
      if (result.facteurs) {
        const mapped = {};
        const mapping = {
          'patient': 'patient_facteurs', 'tache': 'taches_facteurs', 'individu': 'individus_facteurs',
          'equipe': 'equipe_facteurs', 'environnement': 'environnement_facteurs',
          'organisation': 'organisation_facteurs', 'contexte': 'contexte_facteurs'
        };
        result.facteurs.forEach(f => {
          const cat = f.categorie?.toLowerCase() || '';
          const key = Object.entries(mapping).find(([k]) => cat.includes(k))?.[1] || 'contexte_facteurs';
          mapped[key] = (f.facteurs_identifies || []).map(fi => fi.facteur || fi);
        });
        setAlarm(prev => ({ ...prev, ...mapped }));
      }
    } catch {
      toast({ title: 'Erreur IA', variant: 'destructive' });
    } finally {
      setAiLoading(false);
    }
  };

  const save = () => onSave({ alarm });

  const addFactor = (catKey) => {
    setAlarm(prev => ({ ...prev, [catKey]: [...(prev[catKey] || []), ''] }));
  };

  const updateFactor = (catKey, idx, value) => {
    const updated = [...(alarm[catKey] || [])];
    updated[idx] = value;
    setAlarm(prev => ({ ...prev, [catKey]: updated }));
  };

  const removeFactor = (catKey, idx) => {
    const updated = [...(alarm[catKey] || [])];
    updated.splice(idx, 1);
    setAlarm(prev => ({ ...prev, [catKey]: updated }));
  };

  return (
    <Card data-testid="alarm-phase">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Shield className="h-5 w-5 text-red-600" /> Grille ALARM
          </CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={askAI} disabled={aiLoading} data-testid="ai-alarm-btn">
              {aiLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Brain className="h-4 w-4 mr-1" />}
              Analyse IA
            </Button>
            <Button size="sm" onClick={save} data-testid="save-alarm-btn">Sauvegarder</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 mb-4">
          <Input
            data-testid="alarm-input"
            placeholder="Informations supplementaires pour l'IA..."
            value={userInput}
            onChange={e => setUserInput(e.target.value)}
          />
        </div>

        <div className="space-y-3">
          {ALARM_CATS.map(cat => {
            const factors = alarm[cat.key] || [];
            return (
              <div key={cat.key} className="border rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium text-gray-700">{cat.label}</h4>
                  <Badge variant="outline">{factors.length}</Badge>
                </div>
                <div className="space-y-1">
                  {factors.map((f, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <Input
                        value={typeof f === 'string' ? f : f.facteur || ''}
                        onChange={e => updateFactor(cat.key, i, e.target.value)}
                        className="text-sm flex-1"
                        placeholder="Facteur identifie..."
                      />
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => removeFactor(cat.key, i)}>x</Button>
                    </div>
                  ))}
                  <Button size="sm" variant="ghost" onClick={() => addFactor(cat.key)} className="text-xs">
                    <Plus className="h-3 w-3 mr-1" /> Ajouter
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {aiResult?.synthese && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg" data-testid="ai-alarm-result">
            <p className="text-sm text-red-700 italic">{aiResult.synthese}</p>
            {aiResult.facteurs_critiques?.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-medium text-red-800">Facteurs critiques :</p>
                <ul className="list-disc list-inside text-sm text-red-700">
                  {aiResult.facteurs_critiques.map((f, i) => <li key={i}>{f}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}


// ========== Actions Phase ==========
function ActionsPhase({ analysis, onSave, onReload, aiLoading, setAiLoading, toast }) {
  const [actions, setActions] = useState(analysis.actions_correctives || []);
  const [aiActions, setAiActions] = useState(null);
  const [creatingAction, setCreatingAction] = useState(null);

  const generateActions = async () => {
    setAiLoading(true);
    try {
      const result = await accidentAnalysisAPI.aiGenerateActions(analysis.id);
      setAiActions(result);
      if (result.actions) {
        setActions(result.actions);
      }
    } catch {
      toast({ title: 'Erreur IA', variant: 'destructive' });
    } finally {
      setAiLoading(false);
    }
  };

  const save = () => onSave({ actions_correctives: actions });

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
        frequence: 'MENSUELLE',
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
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Wrench className="h-5 w-5 text-green-600" /> Actions correctives & preventives
          </CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={generateActions} disabled={aiLoading} data-testid="ai-generate-actions-btn">
              {aiLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Brain className="h-4 w-4 mr-1" />}
              Generer via IA
            </Button>
            <Button size="sm" onClick={save} data-testid="save-actions-btn">Sauvegarder</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {actions.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <Wrench className="h-10 w-10 mx-auto mb-2" />
            <p>Cliquez sur "Generer via IA" pour obtenir des actions correctives basees sur votre analyse.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {actions.map((action, i) => (
              <div key={i} className="border rounded-lg p-4" data-testid={`action-${i}`}>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium text-gray-900">{action.titre}</h4>
                      <Badge className={PRIO_COLORS[action.priorite] || ''}>{action.priorite}</Badge>
                      <Badge variant="outline">{action.type?.replace('_', ' ')}</Badge>
                    </div>
                    <p className="text-sm text-gray-600">{action.description}</p>
                    {action.categorie_5m && <p className="text-xs text-gray-400 mt-1">Categorie 5M: {action.categorie_5m}</p>}
                  </div>
                </div>
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
              </div>
            ))}
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
      </CardContent>
    </Card>
  );
}
