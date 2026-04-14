import React, { useEffect, useState } from 'react';
import { Label } from '../ui/label';
import { Checkbox } from '../ui/checkbox';
import { usersAPI } from '../../services/api';
import { ShieldCheck } from 'lucide-react';

const PermissionsGrid = ({ role, permissions, onChange }) => {
  const [defaultPermissions, setDefaultPermissions] = useState(null);

  // Deep clone pour eviter les mutations d'objets imbriques
  const deepClonePermissions = (perms) => {
    if (!perms) return {};
    const clone = {};
    for (const key of Object.keys(perms)) {
      clone[key] = { ...perms[key] };
    }
    return clone;
  };

  // Charger les permissions par defaut quand le role change
  useEffect(() => {
    const loadDefaultPermissions = async () => {
      if (role) {
        try {
          const response = await usersAPI.getDefaultPermissionsByRole(role);
          const defaults = deepClonePermissions(response.data.permissions);
          setDefaultPermissions(defaults);
          if (!permissions || Object.keys(permissions).length === 0) {
            onChange(deepClonePermissions(defaults));
          }
        } catch (error) {
          console.error('Erreur chargement permissions par defaut:', error);
        }
      }
    };
    loadDefaultPermissions();
  }, [role]);

  const modules = [
    { key: 'dashboard', label: 'Tableau de bord' },
    { key: 'serviceDashboard', label: 'Dashboard Service' },
    { key: 'interventionRequests', label: 'Demandes d\'inter.' },
    { key: 'workOrders', label: 'Ordres de travail' },
    { key: 'improvementRequests', label: 'Demandes d\'amél.' },
    { key: 'improvements', label: 'Améliorations' },
    { key: 'preventiveMaintenance', label: 'Maintenance prev.' },
    { key: 'planningMprev', label: 'Planning M.Prev.' },
    { key: 'consignationsLoto', label: 'Consignations LOTO' },
    { key: 'assets', label: 'Équipements' },
    { key: 'inventory', label: 'Inventaire' },
    { key: 'locations', label: 'Zones' },
    { key: 'meters', label: 'Compteurs' },
    { key: 'surveillance', label: 'Plan de Surveillance' },
    { key: 'surveillanceRapport', label: 'Rapport Surveillance' },
    { key: 'mes', label: 'M.E.S' },
    { key: 'mesReports', label: 'Rapports M.E.S' },
    { key: 'presquaccident', label: 'Presqu\'accident' },
    { key: 'presquaccidentRapport', label: 'Rapport P.accident' },
    { key: 'documentations', label: 'Documentations' },
    { key: 'vendors', label: 'Fournisseurs' },
    { key: 'contrats', label: 'Contrats' },
    { key: 'reports', label: 'Rapports' },
    { key: 'weeklyReports', label: 'Rapports Hebdo.' },
    { key: 'people', label: 'Utilisateurs' },
    { key: 'planning', label: 'Planning' },
    { key: 'training', label: 'Formations' },
    { key: 'purchaseHistory', label: 'Historique Achat' },
    { key: 'purchaseRequests', label: 'Demandes d\'achat' },
    { key: 'achat', label: 'Achat (Gestion statuts)' },
    { key: 'demandesArret', label: 'Demandes d\'arrêt' },
    { key: 'cameras', label: 'Caméras' },
    { key: 'timeTracking', label: 'Gestion d\'équipe' },
    { key: 'analyticsChecklists', label: 'Analytics Checklists' },
    { key: 'autorisationsParticulieres', label: 'Autorisations Part.' },
    { key: 'importExport', label: 'Import / Export' },
    { key: 'journal', label: 'Journal d\'audit' },
    { key: 'settings', label: 'Paramètres' },
    { key: 'personalization', label: 'Personnalisation' },
    { key: 'chatLive', label: 'Chat Live' },
    { key: 'sensors', label: 'Capteurs MQTT' },
    { key: 'iotDashboard', label: 'Dashboard IoT' },
    { key: 'mqttLogs', label: 'Logs MQTT' },
    { key: 'whiteboard', label: 'Tableau d\'affichage' },
    { key: 'accidentAnalysis', label: 'Arbre des Causes' }
  ];

  const handlePermissionChange = (moduleKey, permissionType, checked) => {
    const newPermissions = deepClonePermissions(permissions);
    if (!newPermissions[moduleKey]) {
      newPermissions[moduleKey] = { view: false, edit: false, delete: false };
    }
    newPermissions[moduleKey][permissionType] = checked;
    onChange(newPermissions);
  };

  if (!permissions) {
    return <div className="text-center py-4">Chargement des permissions...</div>;
  }

  // Nombre de modules avec droits complets (edit activé)
  const fullRightsCount = modules.filter(m => permissions[m.key]?.edit === true).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-base font-semibold">Permissions par module</Label>
        <div className="flex items-center gap-3">
          {fullRightsCount > 0 && (
            <span className="flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
              <ShieldCheck className="h-3 w-3" />
              {fullRightsCount} module{fullRightsCount > 1 ? 's' : ''} en droits complets
            </span>
          )}
          {defaultPermissions && (
            <button
              type="button"
              className="text-sm text-blue-600 hover:text-blue-800"
              onClick={() => onChange(deepClonePermissions(defaultPermissions))}
              data-testid="reset-permissions-btn"
            >
              Réinitialiser par défaut
            </button>
          )}
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <div className="grid grid-cols-4 gap-2 bg-gray-50 p-3 font-semibold text-sm border-b">
          <div>Module</div>
          <div className="text-center">Visualisation</div>
          <div className="text-center">Édition</div>
          <div className="text-center">Suppression</div>
        </div>

        <div className="divide-y max-h-[250px] overflow-y-scroll bg-white" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 #f1f5f9' }}>
          {modules.map((module) => {
            const modulePermissions = permissions[module.key] || { view: false, edit: false, delete: false };
            const hasFullRights = modulePermissions.edit === true;

            return (
              <div
                key={module.key}
                className={`grid grid-cols-4 gap-2 p-3 transition-colors ${hasFullRights ? 'bg-amber-50 hover:bg-amber-100' : 'hover:bg-gray-50'}`}
                data-testid={`permission-row-${module.key}`}
              >
                <div className="flex items-center gap-1.5 text-sm">
                  <span className={hasFullRights ? 'font-medium text-amber-900' : ''}>{module.label}</span>
                  {hasFullRights && (
                    <span
                      className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-700 bg-amber-100 border border-amber-300 rounded-full px-1.5 py-0.5 leading-none whitespace-nowrap"
                      title="Cet utilisateur a les mêmes droits qu'un administrateur sur ce module"
                      data-testid={`full-rights-badge-${module.key}`}
                    >
                      <ShieldCheck className="h-2.5 w-2.5" />
                      Droits complets
                    </span>
                  )}
                </div>
                <div className="flex justify-center">
                  <Checkbox
                    checked={modulePermissions.view}
                    onCheckedChange={(checked) => handlePermissionChange(module.key, 'view', checked)}
                    data-testid={`perm-view-${module.key}`}
                  />
                </div>
                <div className="flex justify-center">
                  <Checkbox
                    checked={modulePermissions.edit}
                    onCheckedChange={(checked) => handlePermissionChange(module.key, 'edit', checked)}
                    disabled={!modulePermissions.view}
                    data-testid={`perm-edit-${module.key}`}
                  />
                </div>
                <div className="flex justify-center">
                  <Checkbox
                    checked={modulePermissions.delete}
                    onCheckedChange={(checked) => handlePermissionChange(module.key, 'delete', checked)}
                    disabled={!modulePermissions.view}
                    data-testid={`perm-delete-${module.key}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-xs text-gray-500">
          Note : Les permissions d'édition et de suppression nécessitent la visualisation.
        </p>
        <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
          <ShieldCheck className="h-3 w-3 shrink-0" />
          <span>
            <strong>Droits complets</strong> : l'activation de l'<em>Édition</em> sur un module confère à l'utilisateur les mêmes droits qu'un administrateur sur cette page (création, modification, validation, suppression).
          </span>
        </div>
      </div>
    </div>
  );
};

export default PermissionsGrid;
