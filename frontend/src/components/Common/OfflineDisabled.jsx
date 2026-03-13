import React from 'react';
import { WifiOff } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import useOnlineStatus from '../../hooks/useOnlineStatus';

/**
 * Composant wrapper qui desactive visuellement un element quand l'application est hors ligne.
 * Affiche un tooltip "Necessite une connexion internet" au survol.
 *
 * Usage:
 *   <OfflineDisabled>
 *     <Button onClick={handleAIAnalysis}>Analyse IA</Button>
 *   </OfflineDisabled>
 */
const OfflineDisabled = ({ children, message = 'Necessite une connexion internet' }) => {
  const { isOnline } = useOnlineStatus();

  if (isOnline) return children;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="relative inline-flex" data-testid="offline-disabled-wrapper">
          <div className="opacity-50 pointer-events-none select-none">
            {children}
          </div>
          <div className="absolute -top-1 -right-1 bg-gray-600 rounded-full p-0.5">
            <WifiOff size={10} className="text-white" />
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="bg-gray-900 text-white text-xs px-2 py-1">
        <div className="flex items-center gap-1.5">
          <WifiOff size={11} />
          <span>{message}</span>
        </div>
      </TooltipContent>
    </Tooltip>
  );
};

export default OfflineDisabled;
