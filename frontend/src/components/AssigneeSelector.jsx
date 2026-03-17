import React, { useState, useEffect, useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Label } from './ui/label';
import api from '../services/api';

/**
 * Composant réutilisable pour l'assignation à un utilisateur OU un service.
 * Affiche les services (pôles) en haut, puis les utilisateurs par ordre alphabétique.
 *
 * Props:
 *   value        - ID sélectionné (user id ou "service:NOM")
 *   onChange      - (value, type, serviceName) => void
 *   label         - Texte du label (défaut: "Assigner à")
 *   required      - Champ obligatoire
 *   disabled      - Désactiver le sélecteur
 *   dataTestId    - data-testid pour les tests
 */
export default function AssigneeSelector({
  value = '',
  onChange,
  label = 'Assigner à',
  required = false,
  disabled = false,
  dataTestId = 'assignee-selector'
}) {
  const [targets, setTargets] = useState({ poles: [], users: [] });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.get('/assignment-targets')
      .then(res => {
        setTargets(res.data || { poles: [], users: [] });
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const handleChange = (val) => {
    if (!val || val === '_none_') {
      onChange('', null, null);
    } else if (val.startsWith('service:')) {
      const serviceName = val.replace('service:', '');
      onChange(val, 'service', serviceName);
    } else {
      onChange(val, 'user', null);
    }
  };

  const displayValue = useMemo(() => {
    if (!value) return '';
    if (value.startsWith('service:')) {
      const svc = targets.poles.find(p => p.id === value);
      return svc ? `${svc.nom}` : value.replace('service:', '');
    }
    const user = targets.users.find(u => u.id === value);
    return user ? `${user.prenom} ${user.nom}` : value;
  }, [value, targets]);

  return (
    <div>
      <Label htmlFor={dataTestId}>
        {label} {required && <span className="text-red-500">*</span>}
      </Label>
      <Select
        value={value || '_none_'}
        onValueChange={handleChange}
        disabled={disabled}
      >
        <SelectTrigger data-testid={dataTestId}>
          <SelectValue placeholder="Non assigné">
            {value ? displayValue : 'Non assigné'}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="_none_">Non assigné</SelectItem>

          {targets.poles.length > 0 && (
            <>
              <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 bg-gray-50 uppercase tracking-wider">
                Services
              </div>
              {targets.poles.filter(pole => pole.id).map(pole => (
                <SelectItem key={pole.id} value={pole.id}>
                  <span className="flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
                    {pole.nom}
                    <span className="text-xs text-gray-400">({pole.membres} membre{pole.membres > 1 ? 's' : ''})</span>
                  </span>
                </SelectItem>
              ))}
            </>
          )}

          {targets.users.length > 0 && (
            <>
              <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 bg-gray-50 uppercase tracking-wider">
                Utilisateurs
              </div>
              {targets.users.filter(user => user.id).map(user => (
                <SelectItem key={user.id} value={user.id}>
                  <span className="flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                    {user.prenom} {user.nom}
                    <span className="text-xs text-gray-400">({user.role})</span>
                  </span>
                </SelectItem>
              ))}
            </>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
