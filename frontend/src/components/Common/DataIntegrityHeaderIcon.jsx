import React, { useState, useEffect, useCallback } from 'react';
import { Database } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { getBackendURL } from '../../utils/config';
import axios from 'axios';

/**
 * DataIntegrityHeaderIcon
 * =======================
 * Badge topbar (admin uniquement) qui affiche l'état de cohérence des données.
 *  - Vert  : aucune incohérence détectée (ou jamais scanné)
 *  - Orange: au moins une incohérence "actionable" détectée
 *  - Click : navigue vers /system-health
 *
 * Refresh auto toutes les 5 minutes.
 */
const DataIntegrityHeaderIcon = () => {
  const navigate = useNavigate();
  const [lastScan, setLastScan] = useState(null);
  const [error, setError] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      const res = await axios.get(`${getBackendURL()}/api/admin/data-integrity/last-scan`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setLastScan(res.data);
      setError(false);
    } catch {
      // Silently fail - user might not be admin
      setError(true);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  if (error) return null;

  const actionable = lastScan?.actionable_issues ?? lastScan?.total_issues ?? 0;
  const hasData = lastScan?.has_data;
  const hasIssues = actionable > 0;

  const iconColor = !hasData
    ? 'text-gray-400'
    : hasIssues
      ? 'text-amber-500'
      : 'text-emerald-500';

  const tooltip = !hasData
    ? 'Cohérence des données — jamais scanné'
    : hasIssues
      ? `Cohérence des données — ${actionable} incohérence${actionable > 1 ? 's' : ''} à corriger`
      : 'Cohérence des données — base saine';

  const formattedTime = lastScan?.scanned_at
    ? new Date(lastScan.scanned_at).toLocaleString('fr-FR')
    : null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={() => navigate('/system-health')}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors relative"
          data-testid="data-integrity-header-icon"
          aria-label="Cohérence des données"
        >
          <Database size={20} className={`${iconColor} transition-colors`} />
          {hasIssues && (
            <span
              className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-amber-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold shadow-md border-2 border-white"
              data-testid="data-integrity-badge-count"
            >
              {actionable > 99 ? '99+' : actionable}
            </span>
          )}
          {hasData && !hasIssues && (
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-white" />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="bg-gray-900 text-white px-4 py-3 rounded-lg shadow-lg max-w-xs">
        <p className="font-medium mb-1">Cohérence des données</p>
        <p className="text-xs text-gray-300">{tooltip}</p>
        {formattedTime && (
          <p className="text-[11px] text-gray-400 mt-1">Dernier scan : {formattedTime}</p>
        )}
      </TooltipContent>
    </Tooltip>
  );
};

export default DataIntegrityHeaderIcon;
