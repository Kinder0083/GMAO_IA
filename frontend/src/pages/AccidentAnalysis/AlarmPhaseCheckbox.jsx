import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip';
import { Shield, Save, ChevronDown, ChevronUp, Info, Loader2, Brain } from 'lucide-react';
import { ALARM_PHASES } from './alarmData';
import { accidentAnalysisAPI } from '../../services/api';

const SERVICE_COLORS = {
  production: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', badge: 'bg-blue-100 text-blue-800' },
  maintenance: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', badge: 'bg-orange-100 text-orange-800' },
  logistique: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', badge: 'bg-green-100 text-green-800' },
};

export default function AlarmPhaseCheckbox({ analysis, onSave, aiLoading, setAiLoading, toast }) {
  // Alarm data: { [phase_id]: { [service_id]: { checked: Set<item_id>, observations: string } } }
  const [alarmData, setAlarmData] = useState(() => initFromAnalysis(analysis));
  const [expandedPhases, setExpandedPhases] = useState(() => new Set([ALARM_PHASES[0].id]));

  const toggleCheck = (phaseId, serviceId, itemId) => {
    setAlarmData(prev => {
      const next = { ...prev };
      const service = { ...(next[phaseId]?.[serviceId] || { checked: [], observations: '' }) };
      const checkedSet = new Set(service.checked);
      if (checkedSet.has(itemId)) checkedSet.delete(itemId); else checkedSet.add(itemId);
      service.checked = [...checkedSet];
      next[phaseId] = { ...(next[phaseId] || {}), [serviceId]: service };
      return next;
    });
  };

  const setObservations = (phaseId, serviceId, value) => {
    setAlarmData(prev => {
      const next = { ...prev };
      const service = { ...(next[phaseId]?.[serviceId] || { checked: [], observations: '' }) };
      service.observations = value;
      next[phaseId] = { ...(next[phaseId] || {}), [serviceId]: service };
      return next;
    });
  };

  const togglePhase = (phaseId) => {
    setExpandedPhases(prev => {
      const next = new Set(prev);
      if (next.has(phaseId)) next.delete(phaseId); else next.add(phaseId);
      return next;
    });
  };

  const save = () => onSave({ alarm_grille: alarmData });

  const askAI = async () => {
    setAiLoading(true);
    try {
      const result = await accidentAnalysisAPI.aiAlarm(analysis.id, { user_input: JSON.stringify(alarmData) });
      toast({ title: 'Analyse IA effectuee', description: result.synthese || 'Suggestions generees' });
    } catch {
      toast({ title: 'Erreur IA', variant: 'destructive' });
    } finally {
      setAiLoading(false);
    }
  };

  // Stats
  const stats = useMemo(() => {
    let total = 0;
    let checked = 0;
    ALARM_PHASES.forEach(phase => {
      phase.services.forEach(service => {
        total += service.items.length;
        const sc = alarmData[phase.id]?.[service.id]?.checked || [];
        checked += sc.length;
      });
    });
    return { total, checked };
  }, [alarmData]);

  return (
    <TooltipProvider delayDuration={200}>
      <Card data-testid="alarm-phase">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className="h-5 w-5 text-red-600" />
                Grille ALARM - Association of Litigation And Risk Management
              </CardTitle>
              <p className="text-sm text-gray-500 mt-1">
                {stats.checked} facteur(s) identifie(s) sur {stats.total} items
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={askAI} disabled={aiLoading} data-testid="ai-alarm-btn">
                {aiLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Brain className="h-4 w-4 mr-1" />}
                Analyse IA
              </Button>
              <Button size="sm" onClick={save} data-testid="save-alarm-btn">
                <Save className="h-4 w-4 mr-1" /> Sauvegarder
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {ALARM_PHASES.map(phase => {
            const isExpanded = expandedPhases.has(phase.id);
            const phaseChecked = phase.services.reduce((sum, s) => sum + (alarmData[phase.id]?.[s.id]?.checked?.length || 0), 0);

            return (
              <div key={phase.id} className="border rounded-lg overflow-hidden" data-testid={`alarm-phase-${phase.id}`}>
                {/* Phase header */}
                <button
                  className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                  onClick={() => togglePhase(phase.id)}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-full bg-red-600 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">
                      {phase.numero}
                    </span>
                    <span className="font-semibold text-gray-900 text-sm">{phase.titre}</span>
                    {phaseChecked > 0 && (
                      <Badge className="bg-red-100 text-red-700">{phaseChecked} identifie(s)</Badge>
                    )}
                  </div>
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>

                {/* Phase content */}
                {isExpanded && (
                  <div className="p-3 grid gap-3 lg:grid-cols-3">
                    {phase.services.map(service => {
                      const colors = SERVICE_COLORS[service.id] || SERVICE_COLORS.production;
                      const serviceData = alarmData[phase.id]?.[service.id] || { checked: [], observations: '' };
                      const checkedSet = new Set(serviceData.checked);

                      return (
                        <div key={service.id} className={`rounded-lg border ${colors.border} ${colors.bg} p-3`}>
                          <div className="flex items-center justify-between mb-2">
                            <h4 className={`font-semibold text-sm ${colors.text}`}>{service.label}</h4>
                            {checkedSet.size > 0 && (
                              <Badge className={colors.badge}>{checkedSet.size}</Badge>
                            )}
                          </div>
                          <div className="space-y-1">
                            {service.items.map(item => (
                              <label
                                key={item.id}
                                className={`flex items-start gap-2 p-1.5 rounded cursor-pointer transition-colors text-sm ${
                                  checkedSet.has(item.id) ? 'bg-white/80 font-medium' : 'hover:bg-white/50'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checkedSet.has(item.id)}
                                  onChange={() => toggleCheck(phase.id, service.id, item.id)}
                                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500 flex-shrink-0"
                                  data-testid={`alarm-check-${item.id}`}
                                />
                                <span className="text-gray-800 leading-tight">{item.label}</span>
                                {item.tooltip && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Info className="h-3.5 w-3.5 text-gray-400 hover:text-gray-600 flex-shrink-0 mt-0.5 cursor-help" />
                                    </TooltipTrigger>
                                    <TooltipContent side="right" className="max-w-xs text-xs">
                                      {item.tooltip}
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                              </label>
                            ))}
                          </div>
                          {service.hasObservations && (
                            <textarea
                              className="w-full mt-2 border rounded p-2 text-xs resize-none bg-white min-h-[48px]"
                              placeholder="Observations libres / Autres facteurs..."
                              value={serviceData.observations || ''}
                              onChange={e => setObservations(phase.id, service.id, e.target.value)}
                              data-testid={`alarm-obs-${phase.id}-${service.id}`}
                            />
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
    </TooltipProvider>
  );
}


/**
 * Initialise l'etat a partir des donnees existantes de l'analyse
 */
function initFromAnalysis(analysis) {
  const existing = analysis.alarm_grille;
  if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
    // Already in new format
    return existing;
  }
  // Empty state
  return {};
}
