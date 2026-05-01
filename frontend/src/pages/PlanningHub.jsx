import React from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Calendar, Activity } from 'lucide-react';
import Planning from './Planning';
import ActiviteMaintenance from './ActiviteMaintenance';

/**
 * PlanningHub : conteneur a deux onglets
 *  - Rythme (page Planning historique : disponibilite)
 *  - Activite Maintenance (planification des taches par technicien)
 */
const PlanningHub = () => {
  const [tab, setTab] = React.useState(() => {
    return localStorage.getItem('planning_active_tab') || 'rythme';
  });

  const handleTabChange = (val) => {
    setTab(val);
    localStorage.setItem('planning_active_tab', val);
  };

  return (
    <div className="space-y-4" data-testid="planning-hub">
      <Tabs value={tab} onValueChange={handleTabChange} className="space-y-4">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="rythme" data-testid="tab-rythme" className="flex items-center gap-2">
            <Calendar size={16} />
            Rythme
          </TabsTrigger>
          <TabsTrigger value="activite" data-testid="tab-activite" className="flex items-center gap-2">
            <Activity size={16} />
            Activité Maintenance
          </TabsTrigger>
        </TabsList>

        <TabsContent value="rythme" className="space-y-4 mt-2">
          <Planning />
        </TabsContent>

        <TabsContent value="activite" className="space-y-4 mt-2">
          <ActiviteMaintenance />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PlanningHub;
