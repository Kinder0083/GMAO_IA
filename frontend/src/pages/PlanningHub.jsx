import React, { useEffect, useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Calendar, Activity } from 'lucide-react';
import Planning from './Planning';
import ActiviteMaintenance from './ActiviteMaintenance';
import ActiviteErrorBoundary from '../components/ActiviteMaintenance/ActiviteErrorBoundary';
import { usersAPI } from '../services/api';

/**
 * PlanningHub : conteneur multi-onglets
 *  - Rythme (page Planning historique : disponibilite)
 *  - Activite <Service> (un onglet par service pour lequel >= 1 user actif existe,
 *    en commencant par MAINTENANCE qui est l'implementation de reference)
 */
const SERVICE_DISPLAY = {
  MAINTENANCE: 'Maintenance',
  PRODUCTION: 'Production',
  QHSE: 'QHSE',
  LOGISTIQUE: 'Logistique',
  LABO: 'Labo',
  ADV: 'ADV',
  INDUS: 'Indus',
  RH: 'RH',
  DIRECTION: 'Direction',
  AUTRE: 'Autre',
};
// Services pour lesquels on affiche un onglet Activite par defaut (tant qu'au moins 1 user actif y est rattache)
const ACTIVITY_SERVICES = ['MAINTENANCE', 'PRODUCTION', 'QHSE', 'LOGISTIQUE', 'LABO'];

const PlanningHub = () => {
  const [tab, setTab] = useState(() => localStorage.getItem('planning_active_tab') || 'rythme');
  const [serviceTabs, setServiceTabs] = useState(['MAINTENANCE']);

  useEffect(() => {
    (async () => {
      try {
        const res = await usersAPI.getActive();
        const used = new Set();
        (res.data || []).forEach(u => {
          const s = (u.service || '').toUpperCase();
          if (s && ACTIVITY_SERVICES.includes(s)) used.add(s);
        });
        // MAINTENANCE toujours en premier, meme s'il n'y a pas de user
        const tabs = ['MAINTENANCE', ...Array.from(used).filter(s => s !== 'MAINTENANCE').sort()];
        setServiceTabs(tabs);
      } catch (err) {
        // fallback : juste maintenance
      }
    })();
  }, []);

  const handleTabChange = (val) => {
    setTab(val);
    localStorage.setItem('planning_active_tab', val);
  };

  return (
    <div className="space-y-4" data-testid="planning-hub">
      <Tabs value={tab} onValueChange={handleTabChange} className="space-y-4">
        <div className="overflow-x-auto">
          <TabsList className="inline-flex">
            <TabsTrigger value="rythme" data-testid="tab-rythme" className="flex items-center gap-2">
              <Calendar size={16} />
              Rythme
            </TabsTrigger>
            {serviceTabs.map(svc => (
              <TabsTrigger
                key={svc}
                value={`activite_${svc}`}
                data-testid={`tab-activite-${svc.toLowerCase()}`}
                className="flex items-center gap-2"
              >
                <Activity size={16} />
                Activité {SERVICE_DISPLAY[svc] || svc}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="rythme" className="space-y-4 mt-2">
          <Planning />
        </TabsContent>

        {serviceTabs.map(svc => (
          <TabsContent key={svc} value={`activite_${svc}`} className="space-y-4 mt-2">
            <ActiviteErrorBoundary>
              <ActiviteMaintenance service={svc} />
            </ActiviteErrorBoundary>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

export default PlanningHub;
