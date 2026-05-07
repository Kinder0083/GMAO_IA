import React, { useState, useMemo } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import {
  Wand2, Radio, FileJson, RefreshCw, AlertCircle, CheckCircle2,
  Activity, Sparkles, Loader2, Eye
} from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../../hooks/use-toast';

const TARGET_OPTIONS = [
  { value: 'cadence', label: 'Cadence (cp/min)', color: 'bg-blue-100 text-blue-700' },
  { value: 'total', label: 'Compteur cumulé', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'state', label: 'État ACTIVE/IDLE', color: 'bg-amber-100 text-amber-700' },
  { value: 'shift_end', label: 'Fin de poste', color: 'bg-purple-100 text-purple-700' },
  { value: 'reset_24h', label: 'Reset 24h', color: 'bg-rose-100 text-rose-700' },
  { value: 'reset_shift', label: 'Reset poste', color: 'bg-rose-100 text-rose-700' },
  { value: 'temperature', label: 'Température', color: 'bg-orange-100 text-orange-700' },
  { value: 'speed', label: 'Vitesse', color: 'bg-indigo-100 text-indigo-700' },
  { value: 'alert', label: 'Alerte / Défaut', color: 'bg-red-100 text-red-700' },
  { value: 'quality', label: 'Qualité', color: 'bg-teal-100 text-teal-700' },
  { value: 'oee', label: 'OEE / TRS', color: 'bg-fuchsia-100 text-fuchsia-700' },
  { value: 'timestamp', label: 'Horodatage', color: 'bg-gray-100 text-gray-700' },
  { value: 'extra', label: 'Métrique custom', color: 'bg-slate-100 text-slate-600' },
];

const targetMeta = (t) => TARGET_OPTIONS.find(o => o.value === t) || TARGET_OPTIONS[TARGET_OPTIONS.length - 1];

const PayloadDetectionDialog = ({
  open,
  onOpenChange,
  topic = '',
  machineName = '',
  machineType = '',
  existingMappings = [],
  onApply,
}) => {
  const { toast } = useToast();
  const [tab, setTab] = useState('paste');
  const [pastedJson, setPastedJson] = useState('');
  const [sniffSeconds, setSniffSeconds] = useState(95);
  const [sniffing, setSniffing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [detected, setDetected] = useState([]);
  const [rawSample, setRawSample] = useState(null);
  const [rawMessages, setRawMessages] = useState([]);
  const [modelUsed, setModelUsed] = useState(null);
  const [error, setError] = useState(null);

  const reset = () => {
    setDetected([]);
    setRawSample(null);
    setRawMessages([]);
    setModelUsed(null);
    setError(null);
  };

  const analyze = async (payloadStr) => {
    setAnalyzing(true);
    setError(null);
    try {
      const { data } = await api.post('/mes/ai/analyze-payload', {
        payload: payloadStr,
        machine_name: machineName || null,
        machine_type: machineType || null,
      });
      if (!data?.success) {
        setError(data?.error || 'Analyse impossible');
        setDetected([]);
      } else {
        // Pre-cocher les mappings existants pour preserver les choix utilisateur
        const existingByPath = new Map((existingMappings || []).map(m => [m.json_path, m]));
        const merged = (data.detected_fields || []).map(f => {
          const ex = existingByPath.get(f.json_path);
          return ex ? { ...f, ...ex, enabled: ex.enabled ?? f.enabled } : f;
        });
        setDetected(merged);
        setRawSample(data.raw_sample);
        setModelUsed(data.model_used);
      }
    } catch (e) {
      const msg = typeof e.response?.data?.detail === 'string'
        ? e.response.data.detail
        : 'Erreur réseau';
      setError(msg);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAnalyzePaste = async () => {
    reset();
    if (!pastedJson.trim()) {
      setError('Veuillez coller un exemple JSON');
      return;
    }
    await analyze(pastedJson);
  };

  const handleSniff = async () => {
    if (!topic) {
      toast({ title: 'Topic requis', description: "Renseignez d'abord le topic MQTT unifié", variant: 'destructive' });
      return;
    }
    reset();
    setSniffing(true);
    try {
      const { data } = await api.post('/mes/ai/sniff-mqtt', {
        topic,
        duration_seconds: Math.max(95, parseInt(sniffSeconds, 10) || 95),
      });
      if (!data?.success || data.count === 0) {
        setError(`Aucun message reçu sur "${topic}" pendant la fenêtre d'écoute. Vérifiez que le capteur publie bien sur ce topic.`);
        setSniffing(false);
        return;
      }
      setRawMessages(data.messages || []);
      // Analyser le dernier message recu
      const last = data.messages[data.messages.length - 1];
      await analyze(typeof last.payload === 'string' ? last.payload : JSON.stringify(last.payload));
    } catch (e) {
      const msg = typeof e.response?.data?.detail === 'string' ? e.response.data.detail : 'Erreur réseau';
      setError(msg);
    } finally {
      setSniffing(false);
    }
  };

  const updateField = (idx, patch) => {
    setDetected(prev => prev.map((f, i) => i === idx ? { ...f, ...patch } : f));
  };

  const enabledCount = useMemo(() => detected.filter(f => f.enabled).length, [detected]);

  const handleApply = () => {
    const selected = detected.filter(f => f.enabled);
    if (selected.length === 0) {
      toast({ title: 'Aucun champ coché', description: 'Cochez au moins un champ à mapper', variant: 'destructive' });
      return;
    }
    onApply?.(selected, rawSample);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="payload-detection-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="text-purple-600" size={20} />
            Détection automatique du format JSON
          </DialogTitle>
          <DialogDescription>
            L'IA analyse un message MQTT et propose un mapping vers les champs MES.
            Cochez les champs que vous voulez extraire ; ils seront ajoutés automatiquement à la machine.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="grid grid-cols-2">
            <TabsTrigger value="paste" data-testid="tab-paste">
              <FileJson size={14} className="mr-1" /> Coller un exemple
            </TabsTrigger>
            <TabsTrigger value="live" data-testid="tab-live">
              <Radio size={14} className="mr-1" /> Capture live MQTT
            </TabsTrigger>
          </TabsList>

          <TabsContent value="paste" className="space-y-2">
            <Label className="text-xs">Payload JSON (un seul message)</Label>
            <Textarea
              value={pastedJson}
              onChange={(e) => setPastedJson(e.target.value)}
              rows={6}
              placeholder='{"cadence":82.4,"total":1247,"etat":"ACTIVE","ts":"2026-04-09T14:32:00"}'
              className="font-mono text-xs"
              data-testid="paste-json-textarea"
            />
            <Button onClick={handleAnalyzePaste} disabled={analyzing} data-testid="analyze-paste-btn">
              {analyzing ? <><Loader2 size={14} className="mr-1 animate-spin" /> Analyse IA…</> : <><Sparkles size={14} className="mr-1" /> Analyser</>}
            </Button>
          </TabsContent>

          <TabsContent value="live" className="space-y-2">
            <div className="text-xs text-gray-600 bg-blue-50 border border-blue-200 p-2 rounded">
              <strong>Topic écouté :</strong> <code className="bg-white px-1 rounded">{topic || '(non renseigné)'}</code>
              <br />Le capteur publie typiquement toutes les 60s — on écoute donc <strong>au moins 95 secondes</strong>.
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs whitespace-nowrap">Durée d'écoute (s)</Label>
              <Input
                type="number"
                min={95}
                max={300}
                step={5}
                value={sniffSeconds}
                onChange={(e) => setSniffSeconds(e.target.value)}
                className="h-8 w-24 text-xs"
                data-testid="sniff-seconds-input"
              />
              <Button onClick={handleSniff} disabled={sniffing || !topic} data-testid="sniff-btn">
                {sniffing
                  ? <><Loader2 size={14} className="mr-1 animate-spin" /> Écoute en cours… ({sniffSeconds}s)</>
                  : <><Activity size={14} className="mr-1" /> Démarrer la capture</>}
              </Button>
            </div>
            {sniffing && (
              <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded animate-pulse">
                🎧 Capture en direct… Patience, l'analyse IA démarrera dès qu'un message est reçu.
              </p>
            )}
            {rawMessages.length > 0 && (
              <p className="text-xs text-emerald-700 bg-emerald-50 p-2 rounded">
                ✅ {rawMessages.length} message(s) capturé(s) — dernier message analysé.
              </p>
            )}
          </TabsContent>
        </Tabs>

        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded p-3" data-testid="detection-error">
            <AlertCircle size={16} className="text-red-600 shrink-0 mt-0.5" />
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}

        {detected.length > 0 && (
          <div className="space-y-3 border-t pt-3" data-testid="detection-results">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-600" />
                <span className="text-sm font-semibold">
                  {detected.length} champ(s) détecté(s) — {enabledCount} sélectionné(s)
                </span>
              </div>
              {modelUsed && (
                <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
                  Modèle : {modelUsed}
                </span>
              )}
            </div>

            <div className="border rounded overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="text-left p-2 w-8"></th>
                    <th className="text-left p-2">Champ JSON</th>
                    <th className="text-left p-2">Nom interne</th>
                    <th className="text-left p-2">Destination</th>
                    <th className="text-left p-2">Exemple</th>
                  </tr>
                </thead>
                <tbody>
                  {detected.map((f, idx) => {
                    const exVal = rawSample ? getFromPath(rawSample, f.json_path) : '—';
                    const meta = targetMeta(f.target);
                    return (
                      <tr key={f.json_path} className={`border-t ${f.enabled ? 'bg-white' : 'bg-gray-50/50 opacity-60'}`} data-testid={`field-row-${f.json_path}`}>
                        <td className="p-2 align-top">
                          <input
                            type="checkbox"
                            checked={f.enabled}
                            onChange={(e) => updateField(idx, { enabled: e.target.checked })}
                            className="cursor-pointer"
                            data-testid={`field-checkbox-${f.json_path}`}
                          />
                        </td>
                        <td className="p-2 align-top">
                          <div className="font-mono text-[11px] text-blue-700">{f.json_path}</div>
                          <div className="text-[10px] text-gray-500">{f.data_type}{f.unit ? ` · ${f.unit}` : ''}</div>
                          {f.description && <div className="text-[10px] text-gray-500 mt-0.5 italic">{f.description}</div>}
                        </td>
                        <td className="p-2 align-top">
                          <Input
                            value={f.key}
                            onChange={(e) => updateField(idx, { key: e.target.value })}
                            className="h-7 text-[11px] font-mono"
                            data-testid={`field-key-${f.json_path}`}
                          />
                        </td>
                        <td className="p-2 align-top">
                          <select
                            value={f.target}
                            onChange={(e) => updateField(idx, { target: e.target.value })}
                            className={`text-[10px] px-1.5 py-0.5 rounded border ${meta.color}`}
                            data-testid={`field-target-${f.json_path}`}
                          >
                            {TARGET_OPTIONS.map(o => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2 align-top">
                          <code className="bg-gray-100 px-1 py-0.5 rounded text-[10px] block max-w-[140px] truncate">
                            {String(exVal)}
                          </code>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {rawSample && (
              <details className="text-xs">
                <summary className="cursor-pointer text-gray-600 flex items-center gap-1">
                  <Eye size={12} /> Voir le payload brut
                </summary>
                <pre className="mt-1 bg-gray-900 text-emerald-300 p-2 rounded text-[10px] overflow-auto max-h-40">
                  {JSON.stringify(rawSample, null, 2)}
                </pre>
              </details>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="cancel-detection-btn">Annuler</Button>
          <Button
            onClick={handleApply}
            disabled={detected.length === 0}
            className="bg-purple-600 hover:bg-purple-700"
            data-testid="apply-detection-btn"
          >
            <Wand2 size={14} className="mr-1" />
            Appliquer le mapping ({enabledCount})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

function getFromPath(obj, path) {
  if (!obj || !path) return '';
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur && typeof cur === 'object' && p in cur) cur = cur[p];
    else return '';
  }
  return cur;
}

export default PayloadDetectionDialog;
