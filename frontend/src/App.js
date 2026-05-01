import React, { useEffect } from "react";
import "./App.css";
import "./styles/preferences.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "./components/ui/toaster";
import { PreferencesProvider } from "./contexts/PreferencesContext";
import { AIContextMenuProvider } from "./contexts/AIContextMenuContext";
import { AINavigationProvider } from "./contexts/AINavigationContext";
import { GuidedTourProvider } from "./contexts/GuidedTourContext";
import { GuidedTour } from "./components/GuidedTour";
import useVersionCheck from "./hooks/useVersionCheck";
import PWABanner from "./components/shared/PWABanner";
import OfflineBanner from "./components/Common/OfflineBanner";
import GlobalToastListener from "./components/Common/GlobalToastListener";
import GlobalErrorBoundary from "./components/Common/GlobalErrorBoundary";
import { initOfflineSync } from "./services/offlineSync";
import { cleanOldCache } from "./services/offlineDb";

// Layout
import MainLayout from "./components/Layout/MainLayout";

// Pages
import Login from "./pages/Login";
import Inscription from "./pages/Inscription";
import Dashboard from "./pages/Dashboard";
import WorkOrders from "./pages/WorkOrders";
import Assets from "./pages/Assets";
import EquipmentDetail from "./pages/EquipmentDetail";
import Inventory from "./pages/Inventory";
import Locations from "./pages/Locations";
import PreventiveMaintenance from "./pages/PreventiveMaintenance";
import ChecklistsManagement from "./pages/ChecklistsManagement";
import Reports from "./pages/Reports";
import People from "./pages/People";
import RolesManagement from "./pages/RolesManagement";
import PlanningHub from "./pages/PlanningHub";
import PlanningMPrev from "./pages/PlanningMPrev";
import ValidateDemandeArret from "./pages/ValidateDemandeArret";
import ValidateReport from "./pages/ValidateReport";
import ValidateCounterProposal from "./pages/ValidateCounterProposal";
import ValidateImprovementRequest from "./pages/ValidateImprovementRequest";
import EndMaintenance from "./pages/EndMaintenance";
import Vendors from "./pages/Vendors";
import Contracts from "./pages/Contracts";
import ContractsDashboard from "./pages/ContractsDashboard";
import Settings from "./pages/Settings";
import SpecialSettings from "./pages/SpecialSettings";
import ImportExport from "./pages/ImportExport";
import PurchaseHistory from "./pages/PurchaseHistory";
import PurchaseRequests from "./pages/PurchaseRequests";
import PurchaseRequestDetail from "./pages/PurchaseRequestDetail";
import Updates from "./pages/Updates";
import Journal from "./pages/Journal";
import Trash from "./pages/Trash";
import Meters from "./pages/Meters";
import InterventionRequests from "./pages/InterventionRequests";
import ImprovementRequests from "./pages/ImprovementRequests";
import Improvements from "./pages/Improvements";
import SurveillancePlan from "./pages/SurveillancePlan";
import SurveillanceRapport from "./pages/SurveillanceRapport";
import SurveillanceAIHistory from "./pages/SurveillanceAIHistory";
import SurveillanceAIDashboard from "./pages/SurveillanceAIDashboard";
import PresquAccidentList from "./pages/PresquAccidentList";
import PresquAccidentRapport from "./pages/PresquAccidentRapport";
import PresquAccidentArchivesIA from "./pages/PresquAccidentArchivesIA";
import PurchaseHistoryArchivesIA from "./pages/PurchaseHistoryArchivesIA";
import Documentations from "./pages/Documentations";
import SSHTerminal from "./pages/SSHTerminal";
import SystemHealth from "./pages/SystemHealth";
import PoleDetails from "./pages/PoleDetails";
import BonDeTravailForm from "./pages/BonDeTravailForm";
import BonDeTravailView from "./pages/BonDeTravailView";
import AutorisationParticuliereView from "./pages/AutorisationParticuliereView";
import Personnalisation from "./pages/Personnalisation";
import ChatLive from "./pages/ChatLive";
import MQTTPubSub from "./pages/MQTTPubSub";
import Sensors from "./pages/Sensors";
import IoTDashboard from "./pages/IoTDashboard";
import MQTTLogs from "./pages/MQTTLogs";
import WhiteboardPage from "./pages/WhiteboardPage";
import PurchaseRequestsArchives from "./pages/PurchaseRequestsArchives";
import FormTemplatesPage from "./pages/FormTemplatesPage";
import WorkOrderTemplatesPage from "./pages/WorkOrderTemplatesPage";
import CustomWidgetEditor from "./pages/CustomWidgetEditor";
import QREquipmentPage from "./pages/QREquipmentPage";
import QRInventoryPage from "./pages/QRInventoryPage";
import ServiceDashboard from "./pages/ServiceDashboard";
import ServiceTeamView from "./pages/ServiceTeamView";
import WeeklyReportsPage from "./pages/WeeklyReportsPage";
import TeamManagementPage from "./pages/TeamManagementPage";
import ConsignationsLOTO from "./pages/ConsignationsLOTO";
import CamerasPage from "./pages/CamerasPage";
import MESPage from "./pages/MESPage";
import MESReportsPage from "./pages/MESReportsPage";
import AnalyticsChecklistsPage from "./pages/AnalyticsChecklistsPage";
import TrainingPage from "./pages/TrainingPage";
import TrainingPublicPage from "./pages/TrainingPublicPage";
import AccidentAnalysisPage from "./pages/AccidentAnalysisPage";
import AccidentAnalysisDetail from "./pages/AccidentAnalysisDetail";
import AccidentAnalysisAdmin from "./pages/AccidentAnalysis/AccidentAnalysisAdmin";

// Protected Route Component with Token Validation
const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem('token');
  
  if (!token) {
    return <Navigate to="/login" replace />;
  }

  // Vérifier silencieusement la validité du token
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(window.atob(base64));
    
    // Vérifier si le token est expiré
    const currentTime = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < currentTime) {
      // Token expiré, nettoyer et rediriger
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      return <Navigate to="/login" replace />;
    }
  } catch (error) {
    // Token invalide, nettoyer et rediriger
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    return <Navigate to="/login" replace />;
  }

  return children;
};

function App() {
  // Detection automatique des mises a jour
  useVersionCheck();

  // Register Service Worker for PWA - Mode offline complet
  useEffect(() => {
    // Initialiser le service de synchronisation hors-ligne
    const cleanupSync = initOfflineSync();
    // Nettoyer le cache IndexedDB ancien au demarrage (>48h)
    cleanOldCache().catch(() => {});

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then((registration) => {
        // Verifier les mises a jour du SW toutes les 30 minutes (pas 60s)
        // pour éviter les rechargements trop fréquents sur mobile PWA
        setInterval(() => registration.update(), 30 * 60 * 1000);

        // Quand un nouveau SW est detecte, NE PAS recharger automatiquement
        // pour éviter la déconnexion des utilisateurs mobiles PWA
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'activated') {
                console.log('[SW] Nouveau Service Worker activé — rechargement au prochain lancement');
                // On ne force plus le reload automatique
                // L'utilisateur verra la nouvelle version à sa prochaine ouverture de l'app
              }
            });
          }
        });
      }).catch(() => {});
      // Handle messages from SW (navigation depuis notification push)
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'NAVIGATE') {
          window.location.href = event.data.url;
        }
      });
    }

    // Ecouter les actions bloquees en mode offline pour afficher un toast
    const handleOfflineBlocked = () => {
      window.dispatchEvent(new CustomEvent('show-toast', {
        detail: {
          title: 'Action non disponible',
          description: 'Cette fonctionnalite necessite une connexion internet.',
          variant: 'destructive'
        }
      }));
    };

    // Toast quand une mutation offline est mise en file d'attente
    const handleOfflineQueued = (e) => {
      const hasFiles = e.detail?._has_files;
      window.dispatchEvent(new CustomEvent('show-toast', {
        detail: {
          title: 'Enregistre localement',
          description: hasFiles
            ? 'Les fichiers ont ete stockes et seront envoyes au retour en ligne.'
            : 'L\'action sera synchronisee au retour en ligne.',
        }
      }));
    };

    // Toast de synchronisation terminee
    const handleSyncComplete = (e) => {
      const { synced, failed } = e.detail || {};
      if (synced > 0) {
        window.dispatchEvent(new CustomEvent('show-toast', {
          detail: {
            title: 'Synchronisation terminee',
            description: `${synced} element(s) synchronise(s)${failed > 0 ? `, ${failed} en echec` : ''}.`,
          }
        }));
      }
    };

    window.addEventListener('offline-action-blocked', handleOfflineBlocked);
    window.addEventListener('offline-file-queued', handleOfflineQueued);
    window.addEventListener('sync-complete', handleSyncComplete);

    return () => {
      if (cleanupSync) cleanupSync();
      window.removeEventListener('offline-action-blocked', handleOfflineBlocked);
      window.removeEventListener('offline-file-queued', handleOfflineQueued);
      window.removeEventListener('sync-complete', handleSyncComplete);
    };
  }, []);

  return (
    <GlobalErrorBoundary>
    <PreferencesProvider>
      <div className="App">
        <OfflineBanner />
        <BrowserRouter>
          <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/validate-demande-arret" element={<ValidateDemandeArret />} />
          <Route path="/validate-report" element={<ValidateReport />} />
          <Route path="/validate-counter-proposal" element={<ValidateCounterProposal />} />
          <Route path="/validate-improvement-request" element={<ValidateImprovementRequest />} />
          <Route path="/end-maintenance" element={<EndMaintenance />} />
          <Route path="/inscription" element={<Inscription />} />
          <Route path="/qr/:equipmentId" element={<QREquipmentPage />} />
          <Route path="/qr-inventory/:itemId" element={<QRInventoryPage />} />
          <Route path="/training-public/:token" element={<TrainingPublicPage />} />
          {/* Route spéciale pour le Tableau d'affichage - plein écran sans menu */}
          <Route 
            path="/whiteboard" 
            element={
              <ProtectedRoute>
                <WhiteboardPage />
              </ProtectedRoute>
            } 
          />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <GuidedTourProvider>
                  <AINavigationProvider>
                    <AIContextMenuProvider>
                      <GuidedTour />
                      <PWABanner />
                      <MainLayout />
                    </AIContextMenuProvider>
                  </AINavigationProvider>
                </GuidedTourProvider>
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="work-orders" element={<WorkOrders />} />
            <Route path="work-orders/templates" element={<WorkOrderTemplatesPage />} />
            <Route path="assets" element={<Assets />} />
            <Route path="assets/:id" element={<EquipmentDetail />} />
            <Route path="inventory" element={<Inventory />} />
            <Route path="locations" element={<Locations />} />
            <Route path="preventive-maintenance" element={<PreventiveMaintenance />} />
            <Route path="preventive-maintenance/checklists" element={<ChecklistsManagement />} />
            <Route path="reports" element={<Reports />} />
            <Route path="people" element={<People />} />
            <Route path="people/roles" element={<RolesManagement />} />
            <Route path="planning" element={<PlanningHub />} />
            <Route path="planning-mprev" element={<PlanningMPrev />} />
            <Route path="vendors" element={<Vendors />} />
            <Route path="contrats" element={<Contracts />} />
            <Route path="consignations-loto" element={<ConsignationsLOTO />} />
            <Route path="contrats/dashboard" element={<ContractsDashboard />} />
            <Route path="purchase-history" element={<PurchaseHistory />} />
            <Route path="purchase-history-archives-ia" element={<PurchaseHistoryArchivesIA />} />
            <Route path="purchase-requests" element={<PurchaseRequests />} />
            <Route path="purchase-requests/archives" element={<PurchaseRequestsArchives />} />
            <Route path="purchase-requests/:id" element={<PurchaseRequestDetail />} />
            <Route path="import-export" element={<ImportExport />} />
            <Route path="settings" element={<Settings />} />
            <Route path="special-settings" element={<SpecialSettings />} />
            <Route path="updates" element={<Updates />} />
            <Route path="journal" element={<Journal />} />
            <Route path="trash" element={<Trash />} />
            <Route path="meters" element={<Meters />} />
            <Route path="intervention-requests" element={<InterventionRequests />} />
            <Route path="improvement-requests" element={<ImprovementRequests />} />
            <Route path="improvements" element={<Improvements />} />
            <Route path="surveillance-plan" element={<SurveillancePlan />} />
            <Route path="surveillance-rapport" element={<SurveillanceRapport />} />
            <Route path="surveillance-ai-history" element={<SurveillanceAIHistory />} />
            <Route path="surveillance-ai-dashboard" element={<SurveillanceAIDashboard />} />
            <Route path="presqu-accident" element={<PresquAccidentList />} />
            <Route path="presqu-accident-rapport" element={<PresquAccidentRapport />} />
            <Route path="presqu-accident-archives-ia" element={<PresquAccidentArchivesIA />} />
            <Route path="documentations" element={<Documentations />} />
            <Route path="documentations/modeles" element={<FormTemplatesPage />} />
            <Route path="documentations/:poleId" element={<PoleDetails />} />
            <Route path="documentations/:poleId/bon-de-travail" element={<BonDeTravailForm />} />
            <Route path="documentations/:poleId/bon-de-travail/:bonId/view" element={<BonDeTravailView />} />
            <Route path="documentations/:poleId/bon-de-travail/:bonId/edit" element={<BonDeTravailForm />} />
            <Route path="autorisations-particulieres" element={<AutorisationParticuliereView />} />
            <Route path="ssh" element={<SSHTerminal />} />
            <Route path="system-health" element={<SystemHealth />} />
            <Route path="personnalisation" element={<Personnalisation />} />
            <Route path="chat-live" element={<ChatLive />} />
            <Route path="mqtt-pubsub" element={<MQTTPubSub />} />
            <Route path="sensors" element={<Sensors />} />
            <Route path="iot-dashboard" element={<IoTDashboard />} />
            <Route path="service-dashboard" element={<ServiceDashboard />} />
            <Route path="service-dashboard/widgets/new" element={<CustomWidgetEditor />} />
            <Route path="service-dashboard/widgets/:widgetId/edit" element={<CustomWidgetEditor />} />
            <Route path="service-dashboard/team" element={<ServiceTeamView />} />
            <Route path="mqtt-logs" element={<MQTTLogs />} />
            <Route path="weekly-reports" element={<WeeklyReportsPage />} />
            <Route path="team-management" element={<TeamManagementPage />} />
            <Route path="cameras" element={<CamerasPage />} />
            <Route path="mes" element={<MESPage />} />
            <Route path="mes-reports" element={<MESReportsPage />} />
            <Route path="analytics/checklists" element={<AnalyticsChecklistsPage />} />
            <Route path="training" element={<TrainingPage />} />
            <Route path="accident-analysis" element={<AccidentAnalysisPage />} />
            <Route path="accident-analysis/admin" element={<AccidentAnalysisAdmin />} />
            <Route path="accident-analysis/:id" element={<AccidentAnalysisDetail />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <Toaster />
      <GlobalToastListener />
    </div>
    </PreferencesProvider>
    </GlobalErrorBoundary>
  );
}

export default App;
