import React, { useState } from 'react';
import { Button } from '../ui/button';
import { Sparkles, Loader2, ChevronDown, ChevronUp, FileText, AlertTriangle, Target } from 'lucide-react';
import { aiReportsAPI } from '../../services/api';

export default function AIReportGenerator({ service, onGenerated }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [expanded, setExpanded] = useState(true);
  const [error, setError] = useState(null);
  const [period, setPeriod] = useState(7);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const reportType = period <= 7 ? 'hebdomadaire' : period <= 31 ? 'mensuel' : 'annuel';
      const res = await aiReportsAPI.generate(service, period, reportType);
      if (res.success) {
        setData(res);
        if (onGenerated) onGenerated();
      }
      else setError("Erreur de generation");
    } catch (e) {
      setError(e?.response?.data?.detail || "Erreur de generation IA");
    } finally {
      setLoading(false);
    }
  };

  if (!data && !loading) {
    return (
      <div className="flex items-center gap-2" data-testid="ai-report-generator">
        <select value={period} onChange={(e) => setPeriod(Number(e.target.value))} className="text-sm border rounded px-2 py-1.5">
          <option value={7}>7 jours</option>
          <option value={14}>14 jours</option>
          <option value={30}>30 jours</option>
          <option value={90}>Trimestre</option>
          <option value={365}>Annee</option>
        </select>
        <Button variant="outline" size="sm" onClick={generate} className="gap-2 text-violet-700 border-violet-200 hover:bg-violet-50">
          <Sparkles className="h-4 w-4" /> Generer rapport IA
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-violet-50 border border-violet-200 rounded-lg p-6 flex items-center gap-3" data-testid="ai-report-loading">
        <Loader2 className="h-5 w-5 text-violet-600 animate-spin" />
        <span className="text-sm text-violet-700">Compilation des donnees et generation du rapport...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
        {error}
        <Button variant="link" size="sm" onClick={generate} className="ml-2">Reessayer</Button>
      </div>
    );
  }

  const r = data.report;

  return (
    <div className="bg-white border border-violet-200 rounded-lg overflow-hidden shadow-sm" data-testid="ai-report-panel">
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center justify-between px-5 py-4 bg-violet-50 hover:bg-violet-100 transition-colors">
        <span className="flex items-center gap-2 text-base font-semibold text-violet-800">
          <Sparkles className="h-5 w-5" /> {r.titre || 'Rapport IA'}
        </span>
        {expanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
      </button>

      {expanded && (
        <div className="p-5 space-y-5">
          {/* Résumé exécutif */}
          {r.resume_executif && (
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Resume executif</p>
              <p className="text-sm text-gray-800 leading-relaxed">{r.resume_executif}</p>
            </div>
          )}

          {/* Sections */}
          {r.sections?.map((s, i) => (
            <div key={i} className="border-l-3 border-violet-300 pl-4">
              <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-2 mb-2">
                <FileText className="h-4 w-4 text-violet-500" /> {s.titre}
              </h4>
              <p className="text-sm text-gray-700 leading-relaxed">{s.contenu}</p>
              {s.indicateurs?.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {s.indicateurs.map((ind, j) => (
                    <span key={j} className="inline-flex items-center gap-1 text-xs bg-violet-50 text-violet-700 px-2 py-1 rounded-full">
                      {ind.nom}: <strong>{ind.valeur}</strong>
                      {ind.tendance && <span className={ind.tendance === 'hausse' ? 'text-green-600' : ind.tendance === 'baisse' ? 'text-red-600' : 'text-gray-500'}>{ind.tendance === 'hausse' ? ' +' : ind.tendance === 'baisse' ? ' -' : ' ='}</span>}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Points d'attention */}
          {r.points_attention?.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-xs font-semibold text-amber-700 flex items-center gap-1 mb-2">
                <AlertTriangle className="h-3.5 w-3.5" /> Points d'attention
              </p>
              <ul className="text-sm text-gray-700 list-disc ml-4 space-y-1">
                {r.points_attention.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            </div>
          )}

          {/* Actions prioritaires */}
          {r.actions_prioritaires?.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-xs font-semibold text-blue-700 flex items-center gap-1 mb-2">
                <Target className="h-3.5 w-3.5" /> Actions prioritaires
              </p>
              <ul className="text-sm text-gray-700 list-disc ml-4 space-y-1">
                {r.actions_prioritaires.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            </div>
          )}

          <div className="flex justify-between items-center pt-3 border-t">
            <span className="text-xs text-gray-400">Periode : {data.period}</span>
            <Button variant="ghost" size="sm" onClick={generate} className="text-xs text-violet-600">Regenerer</Button>
          </div>
        </div>
      )}
    </div>
  );
}
