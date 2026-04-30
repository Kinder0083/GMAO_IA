import React, { useState } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Wrench,
  Search,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import axios from 'axios';
import { BACKEND_URL } from '../../utils/config';
import { useToast } from '../../hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';

/**
 * DataIntegritySettings
 * =====================
 * Scanne et répare les incohérences de données connues :
 *  - users dont `actif` (legacy) est désynchronisé de `statut` (UI)
 *  - doublons dans `service_responsables`
 *
 * Workflow : Scanner → voir les détails → Preview (dry-run) → Réparer.
 */
const DataIntegritySettings = () => {
  const { toast } = useToast();
  const [scanData, setScanData] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [repairingId, setRepairingId] = useState(null);
  const [expanded, setExpanded] = useState({});

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  const runScan = async () => {
    setScanning(true);
    try {
      const res = await axios.get(`${BACKEND_URL}/api/admin/data-integrity/scan`, { headers });
      setScanData(res.data);
      toast({
        title: 'Scan terminé',
        description:
          res.data.total_issues === 0
            ? 'Aucune incohérence détectée.'
            : `${res.data.total_issues} incohérence(s) détectée(s).`,
      });
    } catch (err) {
      toast({
        title: 'Erreur',
        description: err.response?.data?.detail || 'Impossible de scanner la base.',
        variant: 'destructive',
      });
    } finally {
      setScanning(false);
    }
  };

  const runRepair = async (checkId, dryRun) => {
    setRepairingId(`${checkId}:${dryRun ? 'dry' : 'apply'}`);
    try {
      const res = await axios.post(
        `${BACKEND_URL}/api/admin/data-integrity/repair`,
        { check_id: checkId, dry_run: dryRun },
        { headers }
      );
      const r = res.data.results[checkId];
      if (dryRun) {
        toast({
          title: 'Simulation (dry-run)',
          description: `${r.planned_count} modification(s) seraient appliquées.`,
        });
      } else {
        toast({
          title: 'Réparation effectuée',
          description: `${r.modified_count} correction(s) appliquée(s).`,
        });
        // Relancer le scan pour rafraichir l'affichage
        await runScan();
      }
    } catch (err) {
      toast({
        title: 'Erreur',
        description: err.response?.data?.detail || 'Impossible de réparer.',
        variant: 'destructive',
      });
    } finally {
      setRepairingId(null);
    }
  };

  const toggleExpand = (id) => setExpanded((s) => ({ ...s, [id]: !s[id] }));

  return (
    <Card data-testid="data-integrity-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          Cohérence des données
        </CardTitle>
        <CardDescription>
          Détecte et répare les incohérences connues dans la base (champs désynchronisés,
          doublons, etc.). Toutes les réparations disposent d&apos;un mode simulation (dry-run).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3 mb-4">
          <Button
            onClick={runScan}
            disabled={scanning}
            data-testid="data-integrity-scan-btn"
          >
            {scanning ? (
              <Loader2 size={16} className="animate-spin mr-2" />
            ) : (
              <Search size={16} className="mr-2" />
            )}
            Scanner la base
          </Button>
          {scanData && (
            <span className="text-sm text-gray-600">
              Dernier scan :{' '}
              {new Date(scanData.scanned_at).toLocaleString('fr-FR')}
            </span>
          )}
        </div>

        {!scanData && (
          <p className="text-sm text-gray-500 italic">
            Lancez un scan pour voir l&apos;état de cohérence de la base.
          </p>
        )}

        {scanData && scanData.total_issues === 0 && (
          <div
            className="flex items-center gap-2 p-4 rounded-lg bg-green-50 border border-green-200 text-green-800"
            data-testid="data-integrity-all-clean"
          >
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-medium">Aucune incohérence détectée. La base est saine.</span>
          </div>
        )}

        {scanData && scanData.total_issues > 0 && (
          <div className="space-y-3" data-testid="data-integrity-issues-list">
            {scanData.checks.map((check) => {
              const hasIssues = check.issues_count > 0;
              const isExpanded = expanded[check.id];
              const isRepairingDry = repairingId === `${check.id}:dry`;
              const isRepairingApply = repairingId === `${check.id}:apply`;

              return (
                <div
                  key={check.id}
                  className={`border rounded-lg ${
                    hasIssues ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white'
                  }`}
                  data-testid={`data-integrity-check-${check.id}`}
                >
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          {hasIssues ? (
                            <AlertTriangle className="h-4 w-4 text-amber-600" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          )}
                          <span className="font-medium text-gray-900">{check.label}</span>
                          <Badge
                            variant={hasIssues ? 'destructive' : 'secondary'}
                            data-testid={`data-integrity-count-${check.id}`}
                          >
                            {check.issues_count}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-600">{check.description}</p>
                      </div>

                      {hasIssues && (
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => runRepair(check.id, true)}
                            disabled={repairingId !== null}
                            data-testid={`data-integrity-preview-${check.id}`}
                          >
                            {isRepairingDry ? (
                              <Loader2 size={14} className="animate-spin mr-1" />
                            ) : null}
                            Simuler
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => runRepair(check.id, false)}
                            disabled={repairingId !== null}
                            data-testid={`data-integrity-repair-${check.id}`}
                          >
                            {isRepairingApply ? (
                              <Loader2 size={14} className="animate-spin mr-1" />
                            ) : (
                              <Wrench size={14} className="mr-1" />
                            )}
                            Réparer
                          </Button>
                        </div>
                      )}
                    </div>

                    {hasIssues && (
                      <button
                        type="button"
                        onClick={() => toggleExpand(check.id)}
                        className="mt-3 flex items-center gap-1 text-xs text-gray-700 hover:text-gray-900"
                        data-testid={`data-integrity-toggle-${check.id}`}
                      >
                        {isExpanded ? (
                          <ChevronDown size={14} />
                        ) : (
                          <ChevronRight size={14} />
                        )}
                        {isExpanded ? 'Masquer' : 'Voir'} le détail
                      </button>
                    )}

                    {isExpanded && hasIssues && (
                      <div className="mt-3 border-t border-amber-200 pt-3">
                        <CheckDetails checkId={check.id} details={check.details} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

/**
 * Affichage tabulaire propre selon le type de check.
 */
const CheckDetails = ({ checkId, details }) => {
  if (!details || details.length === 0) return null;

  if (checkId === 'user_actif_statut_sync') {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-gray-700 border-b border-amber-200">
              <th className="py-1 pr-2">Utilisateur</th>
              <th className="py-1 pr-2">Service</th>
              <th className="py-1 pr-2">actif (actuel)</th>
              <th className="py-1 pr-2">statut</th>
              <th className="py-1">actif (cible)</th>
            </tr>
          </thead>
          <tbody>
            {details.map((d) => (
              <tr key={d._id} className="border-b border-amber-100 last:border-0">
                <td className="py-1 pr-2 font-mono">{d.email}</td>
                <td className="py-1 pr-2">{d.service || '-'}</td>
                <td className="py-1 pr-2">{String(d.actif)}</td>
                <td className="py-1 pr-2">{d.statut || '-'}</td>
                <td className="py-1 font-medium text-green-700">
                  {String(d.target_actif)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (checkId === 'service_responsables_duplicates') {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-gray-700 border-b border-amber-200">
              <th className="py-1 pr-2">Service</th>
              <th className="py-1 pr-2">Responsable</th>
              <th className="py-1 pr-2">Entrées trouvées</th>
              <th className="py-1">À supprimer</th>
            </tr>
          </thead>
          <tbody>
            {details.map((d) => (
              <tr key={`${d.service}:${d.user_id}`} className="border-b border-amber-100 last:border-0">
                <td className="py-1 pr-2">{d.service}</td>
                <td className="py-1 pr-2">{d.user_name}</td>
                <td className="py-1 pr-2">{d.total_found}</td>
                <td className="py-1 font-medium text-red-700">
                  {d.remove_ids.length}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <pre className="text-xs bg-white p-2 rounded border border-amber-200 overflow-auto max-h-60">
      {JSON.stringify(details, null, 2)}
    </pre>
  );
};

export default DataIntegritySettings;
