import React, { useState } from 'react';
import { Button } from '../ui/button';
import { Sparkles, ChevronDown, ChevronUp, Loader2, AlertTriangle, TrendingUp, TrendingDown, Minus, Shield } from 'lucide-react';
import OfflineDisabled from '../Common/OfflineDisabled';

export default function AISensorAnalysis({ sensorId, sensorsAPI }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [expanded, setExpanded] = useState(true);
  const [error, setError] = useState(null);

  const runAnalysis = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await sensorsAPI.aiAnalyze(sensorId);
      if (res.success) setData(res);
      else setError("Erreur lors de l'analyse");
    } catch (e) {
      setError(e?.response?.data?.detail || "Erreur d'analyse IA");
    } finally {
      setLoading(false);
    }
  };

  if (!data && !loading) {
    return (
      <OfflineDisabled>
      <Button variant="outline" size="sm" onClick={runAnalysis} className="gap-2 text-violet-700 border-violet-200 hover:bg-violet-50" data-testid="ai-sensor-analyze-btn">
        <Sparkles className="h-4 w-4" /> Analyse predictive IA
      </Button>
      </OfflineDisabled>
    );
  }

  if (loading) {
    return (
      <div className="bg-violet-50 border border-violet-200 rounded-lg p-4 flex items-center gap-3">
        <Loader2 className="h-5 w-5 text-violet-600 animate-spin" />
        <span className="text-sm text-violet-700">Analyse des donnees capteur...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
        {error}
        <Button variant="link" size="sm" onClick={runAnalysis} className="ml-2">Reessayer</Button>
      </div>
    );
  }

  const a = data.analysis;
  const stateConfig = {
    normal: { color: 'bg-green-100 text-green-800 border-green-200', icon: <Shield className="h-4 w-4" /> },
    attention: { color: 'bg-amber-100 text-amber-800 border-amber-200', icon: <AlertTriangle className="h-4 w-4" /> },
    critique: { color: 'bg-red-100 text-red-800 border-red-200', icon: <AlertTriangle className="h-4 w-4" /> },
  };
  const state = stateConfig[a.etat_general] || stateConfig.normal;

  const trendIcon = a.prediction?.tendance === 'degradation' ? <TrendingDown className="h-3.5 w-3.5 text-red-500" />
    : a.prediction?.tendance === 'amelioration' ? <TrendingUp className="h-3.5 w-3.5 text-green-500" />
    : <Minus className="h-3.5 w-3.5 text-gray-400" />;

  return (
    <div className="bg-violet-50 border border-violet-200 rounded-lg overflow-hidden" data-testid="ai-sensor-analysis-panel">
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-violet-100 transition-colors">
        <span className="flex items-center gap-2 text-sm font-semibold text-violet-800">
          <Sparkles className="h-4 w-4" /> Analyse predictive
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${state.color}`}>
            {state.icon} {a.etat_general}
          </span>
        </span>
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* Anomalies */}
          {a.anomalies_detectees?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-violet-700 mb-1">Anomalies detectees</p>
              <div className="space-y-1">
                {a.anomalies_detectees.map((an, i) => (
                  <div key={i} className={`text-xs p-2 rounded bg-white border-l-2 ${an.severite === 'haute' ? 'border-red-400' : an.severite === 'moyenne' ? 'border-amber-400' : 'border-gray-300'}`}>
                    <span className="font-medium">[{an.type}]</span> {an.description}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Prédiction */}
          {a.prediction && (
            <div className="bg-white rounded p-3">
              <div className="flex items-center gap-2 mb-1">
                {trendIcon}
                <p className="text-xs font-semibold text-violet-700">Prediction : {a.prediction.tendance}</p>
                {a.prediction.risque_panne && a.prediction.risque_panne !== 'faible' && (
                  <span className={`text-xs px-2 py-0.5 rounded-full ${a.prediction.risque_panne === 'eleve' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                    Risque {a.prediction.risque_panne}
                  </span>
                )}
              </div>
              {a.prediction.estimation_delai && a.prediction.estimation_delai !== 'N/A' && (
                <p className="text-xs text-gray-600">Delai estime : {a.prediction.estimation_delai}</p>
              )}
              <p className="text-xs text-gray-500 mt-1">{a.prediction.explication}</p>
            </div>
          )}

          {/* Recommandations */}
          {a.recommandations?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-violet-700 mb-1">Recommandations</p>
              {a.recommandations.map((r, i) => (
                <div key={i} className="text-xs bg-white rounded p-2 mb-1">
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] mr-2 ${r.urgence === 'immediate' ? 'bg-red-100 text-red-600' : r.urgence === 'court_terme' ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'}`}>
                    {r.urgence}
                  </span>
                  {r.action}
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-between items-center text-xs text-gray-400">
            <span>{data.readings_count} lectures analysees</span>
            <Button variant="ghost" size="sm" onClick={runAnalysis} className="text-xs text-violet-600">Relancer</Button>
          </div>
        </div>
      )}
    </div>
  );
}
