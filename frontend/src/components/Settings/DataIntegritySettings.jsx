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
  UserCheck,
} from 'lucide-react';
import axios from 'axios';
import { BACKEND_URL } from '../../utils/config';
import { useToast } from '../../hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import OrphanReassignDialog from './OrphanReassignDialog';

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
  const [reassignDoc, setReassignDoc] = useState(null);

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  // runScan exposed for OrphanReassignDialog onReassigned callback
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
              const isInformational = check.informational || check.fixable === false;

              return (
                <div
                  key={check.id}
                  className={`border rounded-lg ${
                    hasIssues ? (isInformational ? 'border-sky-300 bg-sky-50' : 'border-amber-300 bg-amber-50') : 'border-gray-200 bg-white'
                  }`}
                  data-testid={`data-integrity-check-${check.id}`}
                >
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          {hasIssues ? (
                            isInformational ? (
                              <AlertTriangle className="h-4 w-4 text-sky-600" />
                            ) : (
                              <AlertTriangle className="h-4 w-4 text-amber-600" />
                            )
                          ) : (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          )}
                          <span className="font-medium text-gray-900">{check.label}</span>
                          <Badge
                            variant={hasIssues ? (isInformational ? 'secondary' : 'destructive') : 'secondary'}
                            data-testid={`data-integrity-count-${check.id}`}
                          >
                            {check.issues_count}
                          </Badge>
                          {isInformational && hasIssues && (
                            <span className="text-[10px] uppercase tracking-wide text-sky-700 bg-sky-100 px-1.5 py-0.5 rounded font-medium">
                              Action manuelle
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600">{check.description}</p>
                      </div>

                      {hasIssues && !isInformational && (
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

                    {hasIssues && !isInformational && (
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

                    {(isExpanded || (isInformational && hasIssues)) && hasIssues && (
                      <div className={`mt-3 border-t pt-3 ${isInformational ? 'border-sky-200' : 'border-amber-200'}`}>
                        <CheckDetails
                          checkId={check.id}
                          details={check.details}
                          onReassignClick={(d) => setReassignDoc(d)}
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
      <OrphanReassignDialog
        open={!!reassignDoc}
        doc={reassignDoc}
        onClose={() => setReassignDoc(null)}
        onReassigned={() => {
          // Re-scan pour rafraîchir la liste après réassignation
          runScan();
        }}
      />
    </Card>
  );
};

/**
 * Affichage tabulaire propre selon le type de check.
 */
const CheckDetails = ({ checkId, details, onReassignClick }) => {
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

  if (checkId === 'time_entries_integrity') {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-gray-700 border-b border-amber-200">
              <th className="py-1 pr-2">Type</th>
              <th className="py-1 pr-2">Document</th>
              <th className="py-1 pr-2">Utilisateur</th>
              <th className="py-1 pr-2">Problème</th>
              <th className="py-1">Action</th>
            </tr>
          </thead>
          <tbody>
            {details.map((d, idx) => (
              <tr key={`${d.entry_id}-${idx}`} className="border-b border-amber-100 last:border-0">
                <td className="py-1 pr-2">{d.collection === 'work_orders' ? 'OT' : 'Amélioration'}</td>
                <td className="py-1 pr-2 truncate max-w-[200px]" title={d.doc_title}>{d.doc_title}</td>
                <td className="py-1 pr-2">{d.user_name}</td>
                <td className="py-1 pr-2 text-amber-700">{d.issue_type}</td>
                <td className="py-1 text-green-700 font-medium">→ {String(d.target).slice(0, 40)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (checkId === 'orphan_user_assignments') {
    // Groupé par collection
    const grouped = details.reduce((acc, d) => {
      const k = d.type_label;
      if (!acc[k]) acc[k] = [];
      acc[k].push(d);
      return acc;
    }, {});
    return (
      <div className="space-y-3">
        <p className="text-xs text-gray-600 italic">
          Cliquez sur un numéro pour ouvrir le document et réassigner manuellement le pointage à un utilisateur actif.
        </p>
        {Object.entries(grouped).map(([typeLabel, items]) => (
          <div key={typeLabel}>
            <p className="text-xs font-semibold text-gray-800 mb-1">{typeLabel} ({items.length})</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-700 border-b border-amber-200">
                    <th className="py-1 pr-2">N°</th>
                    <th className="py-1 pr-2">Titre</th>
                    <th className="py-1 pr-2">Statut</th>
                    <th className="py-1 pr-2">Pointages orphelins</th>
                    <th className="py-1">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((d) => {
                    const canReassign =
                      (d.collection === 'work_orders' || d.collection === 'improvements') &&
                      onReassignClick;
                    return (
                      <tr key={d.doc_id} className="border-b border-amber-100 last:border-0 hover:bg-amber-100/40">
                        <td className="py-1 pr-2 font-mono text-amber-800">{d.numero || '—'}</td>
                        <td className="py-1 pr-2 truncate max-w-[260px]" title={d.titre}>{d.titre}</td>
                        <td className="py-1 pr-2 text-gray-500">{d.statut || '—'}</td>
                        <td className="py-1 pr-2 font-medium">
                          {d.orphan_count} pointage{d.orphan_count > 1 ? 's' : ''}{' '}
                          <span className="text-gray-500">({d.entries.reduce((s, e) => s + (e.hours || 0), 0).toFixed(1)}h)</span>
                        </td>
                        <td className="py-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {canReassign && (
                              <button
                                type="button"
                                onClick={() => onReassignClick(d)}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 font-medium"
                                data-testid={`orphan-reassign-${d.collection}-${d.doc_id}`}
                              >
                                <UserCheck size={12} />
                                Réassigner
                              </button>
                            )}
                            <a
                              href={d.open_url}
                              className="inline-flex items-center gap-1 text-sky-600 hover:underline font-medium"
                              data-testid={`orphan-open-${d.collection}-${d.doc_id}`}
                            >
                              Ouvrir →
                            </a>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
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
