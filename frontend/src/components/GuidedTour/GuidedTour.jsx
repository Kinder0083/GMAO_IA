import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useGuidedTour } from '../../contexts/GuidedTourContext';
import { X, ChevronLeft, ChevronRight, SkipForward } from 'lucide-react';

// ========================================================
// Etapes COMMUNES a tous les profils
// ========================================================
const COMMON_INTRO = (serviceName) => ({
  target: 'body',
  title: 'Bienvenue sur FSAO Iris !',
  content: serviceName
    ? `Cette visite est adaptee a votre profil ${serviceName}. Decouvrez les modules essentiels pour votre activite.`
    : 'Cette visite guidee va vous presenter les principales fonctionnalites de l\'application.',
  subContent: 'Cliquez sur "Suivant" pour commencer ou "Passer" pour ignorer.',
  placement: 'center',
  isIntro: true
});

const COMMON_START = [
  {
    target: '[data-testid="sidebar-nav"]',
    title: 'Menu de navigation',
    content: 'Votre menu principal pour acceder a tous les modules. Les sections visibles dependent de vos permissions.',
    placement: 'right'
  },
  {
    target: '[data-testid="dashboard-stats"]',
    title: 'Tableau de bord',
    content: 'Vue d\'ensemble de votre activite : interventions en cours, equipements, alertes et performances.',
    placement: 'bottom'
  },
  {
    target: '[data-testid="notifications-btn"]',
    title: 'Notifications',
    content: 'Restez informe des alertes, nouvelles interventions et messages importants. Le badge rouge indique les notifications non lues.',
    placement: 'bottom'
  },
];

const COMMON_END = [
  {
    target: '[data-testid="sidebar-chat-live"]',
    title: 'Chat en direct',
    content: 'Communiquez avec votre equipe en temps reel. Envoyez des messages et partagez des informations.',
    placement: 'right'
  },
  {
    target: '[data-testid="ai-assistant-button"]',
    title: 'Assistant IA',
    content: 'Votre assistant intelligent pour vous aider au quotidien. Posez des questions, demandez des analyses ou generez des rapports.',
    placement: 'bottom'
  },
];

const COMMON_OUTRO = (serviceName) => ({
  target: 'body',
  title: 'Visite terminee !',
  content: serviceName
    ? `Vous etes pret a utiliser FSAO Iris avec votre profil ${serviceName}.`
    : 'Vous etes maintenant pret a utiliser FSAO Iris.',
  subContent: 'Vous pouvez relancer cette visite a tout moment depuis Parametres > Visite guidee.',
  placement: 'center',
  isOutro: true
});

// ========================================================
// Etapes SPECIFIQUES par profil / service
// ========================================================
const STEPS_MAINTENANCE = [
  {
    target: '[data-testid="sidebar-assets"]',
    title: 'Equipements',
    content: 'Gerez votre parc d\'equipements : consultez les fiches techniques, l\'historique des interventions et l\'etat de chaque machine.',
    placement: 'right'
  },
  {
    target: '[data-testid="sidebar-work-orders"]',
    title: 'Ordres de travail',
    content: 'Consultez les OT qui vous sont assignes, suivez leur avancement et renseignez les temps passes et pieces utilisees.',
    placement: 'right'
  },
  {
    target: '[data-testid="sidebar-preventive-maintenance"]',
    title: 'Maintenance preventive',
    content: 'Planifiez et suivez les operations de maintenance preventive. L\'IA peut generer des plans depuis la documentation constructeur.',
    placement: 'right'
  },
  {
    target: '[data-testid="sidebar-planning"]',
    title: 'Planning',
    content: 'Visualisez votre charge de travail et les interventions planifiees sur un calendrier interactif.',
    placement: 'right'
  },
  {
    target: '[data-testid="sidebar-inventory"]',
    title: 'Inventaire',
    content: 'Gerez le stock de pieces detachees et consommables. Suivez les niveaux de stock et les reservations.',
    placement: 'right'
  },
  {
    target: '[data-testid="sidebar-intervention-requests"]',
    title: 'Demandes d\'intervention',
    content: 'Recevez et traitez les demandes de la production. Transformez-les en ordres de travail en quelques clics.',
    placement: 'right'
  },
];

const STEPS_PRODUCTION = [
  {
    target: '[data-testid="sidebar-mes"]',
    title: 'M.E.S (Suivi de production)',
    content: 'Suivez votre production en temps reel : OF en cours, arrets, TRS et indicateurs de performance.',
    placement: 'right'
  },
  {
    target: '[data-testid="sidebar-planning"]',
    title: 'Planning',
    content: 'Consultez le planning de production et les interventions de maintenance prevues sur vos lignes.',
    placement: 'right'
  },
  {
    target: '[data-testid="sidebar-work-orders"]',
    title: 'Ordres de travail',
    content: 'Suivez les interventions de maintenance sur vos equipements et leur impact sur la production.',
    placement: 'right'
  },
  {
    target: '[data-testid="sidebar-intervention-requests"]',
    title: 'Demandes d\'intervention',
    content: 'Signalez rapidement un probleme sur un equipement. Votre demande sera traitee par l\'equipe maintenance.',
    placement: 'right'
  },
  {
    target: '[data-testid="sidebar-meters"]',
    title: 'Compteurs',
    content: 'Relevez et suivez les compteurs de vos machines (heures, cycles, consommations).',
    placement: 'right'
  },
  {
    target: '[data-testid="sidebar-presqu-accident"]',
    title: 'Presqu\'accidents',
    content: 'Declarez les presqu\'accidents pour ameliorer la securite. L\'IA detecte automatiquement les incidents similaires passes.',
    placement: 'right'
  },
];

const STEPS_QHSE = [
  {
    target: '[data-testid="sidebar-presqu-accident"]',
    title: 'Presqu\'accidents',
    content: 'Gerez les declarations avec le formulaire enrichi (7 sections). L\'IA analyse les causes racines (5 Pourquoi + Ishikawa) et detecte les incidents similaires.',
    placement: 'right'
  },
  {
    target: '[data-testid="sidebar-presqu-accident-rapport"]',
    title: 'Rapport Presqu\'accidents',
    content: 'Tableaux de bord et statistiques. Utilisez l\'analyse IA des tendances et generez des rapports QHSE pour vos reunions.',
    placement: 'right'
  },
  {
    target: '[data-testid="sidebar-analytics-checklists"]',
    title: 'Analytics Checklists',
    content: 'Suivez les non-conformites. L\'IA detecte les patterns recurrents et cree des OT curatifs en 1 clic.',
    placement: 'right'
  },
  {
    target: '[data-testid="sidebar-surveillance-plan"]',
    title: 'Plan de Surveillance',
    content: 'Gerez les controles reglementaires periodiques (MMRI, incendie, electrique...) avec generation automatique des echeances.',
    placement: 'right'
  },
  {
    target: '[data-testid="sidebar-documentations"]',
    title: 'Documentations',
    content: 'Centralisez vos documents QHSE : procedures, fiches de securite, plans de prevention, rapports d\'audit.',
    placement: 'right'
  },
  {
    target: '[data-testid="sidebar-contrats"]',
    title: 'Contrats',
    content: 'Suivez les contrats de maintenance, les echeances et les renouvellements.',
    placement: 'right'
  },
];

const STEPS_LOGISTIQUE = [
  {
    target: '[data-testid="sidebar-inventory"]',
    title: 'Inventaire',
    content: 'Gerez le stock de pieces et consommables. Suivez les niveaux, les seuils d\'alerte et les mouvements.',
    placement: 'right'
  },
  {
    target: '[data-testid="sidebar-purchase-requests"]',
    title: 'Demandes d\'achat',
    content: 'Creez et suivez les demandes d\'achat. Validez les devis et gerez les approvisionnements.',
    placement: 'right'
  },
  {
    target: '[data-testid="sidebar-vendors"]',
    title: 'Fournisseurs',
    content: 'Gerez votre base fournisseurs : coordonnees, contrats, historique des commandes et evaluations.',
    placement: 'right'
  },
  {
    target: '[data-testid="sidebar-assets"]',
    title: 'Equipements',
    content: 'Consultez les fiches equipements pour verifier les references de pieces de rechange.',
    placement: 'right'
  },
  {
    target: '[data-testid="sidebar-purchase-history"]',
    title: 'Historique Achat',
    content: 'Retrouvez l\'historique complet de vos achats et commandes passees.',
    placement: 'right'
  },
];

const STEPS_DIRECTION = [
  {
    target: '[data-testid="sidebar-service-dashboard"]',
    title: 'Dashboard Service',
    content: 'Tableaux de bord personnalisables par service. Creez des widgets sur mesure pour suivre vos KPIs.',
    placement: 'right'
  },
  {
    target: '[data-testid="sidebar-reports"]',
    title: 'Rapports',
    content: 'Generez des rapports d\'activite detailles pour piloter les operations et prendre les bonnes decisions.',
    placement: 'right'
  },
  {
    target: '[data-testid="sidebar-team-management"]',
    title: 'Gestion d\'equipe',
    content: 'Gerez les equipes, les responsables de service, les absences et le suivi du temps.',
    placement: 'right'
  },
  {
    target: '[data-testid="sidebar-people"]',
    title: 'Utilisateurs',
    content: 'Administrez les comptes utilisateurs, les roles et les permissions d\'acces aux modules.',
    placement: 'right'
  },
  {
    target: '[data-testid="sidebar-presqu-accident-rapport"]',
    title: 'Rapport Presqu\'accidents',
    content: 'Suivez les indicateurs securite. L\'IA genere des rapports QHSE prets pour vos reunions de direction.',
    placement: 'right'
  },
  {
    target: '[data-testid="sidebar-weekly-reports"]',
    title: 'Rapports Hebdomadaires',
    content: 'Consultez et envoyez les rapports d\'activite hebdomadaires a vos equipes.',
    placement: 'right'
  },
];

// Visite GENERIQUE (pas de service defini)
const STEPS_GENERIC = [
  {
    target: '[data-testid="sidebar-assets"]',
    title: 'Equipements',
    content: 'Gerez votre parc d\'equipements : fiches techniques, historique des interventions et etat de chaque machine.',
    placement: 'right'
  },
  {
    target: '[data-testid="sidebar-work-orders"]',
    title: 'Ordres de travail',
    content: 'Creez et suivez les interventions de maintenance. Assignez des techniciens et suivez l\'avancement.',
    placement: 'right'
  },
  {
    target: '[data-testid="sidebar-planning"]',
    title: 'Planning',
    content: 'Visualisez le calendrier des interventions planifiees et la charge de travail de votre equipe.',
    placement: 'right'
  },
  {
    target: '[data-testid="sidebar-presqu-accident"]',
    title: 'Presqu\'accidents',
    content: 'Declarez et suivez les presqu\'accidents. L\'IA vous aide avec l\'analyse des causes racines et la detection d\'incidents similaires.',
    placement: 'right'
  },
  {
    target: '[data-testid="sidebar-reports"]',
    title: 'Rapports',
    content: 'Generez des rapports d\'activite et consultez les statistiques de performance.',
    placement: 'right'
  },
];

// ========================================================
// Mapping service -> etapes
// ========================================================
const SERVICE_STEPS_MAP = {
  'Maintenance': { steps: STEPS_MAINTENANCE, label: 'Maintenance' },
  'MAINTENANCE': { steps: STEPS_MAINTENANCE, label: 'Maintenance' },
  'Production': { steps: STEPS_PRODUCTION, label: 'Production' },
  'PRODUCTION': { steps: STEPS_PRODUCTION, label: 'Production' },
  'QHSE': { steps: STEPS_QHSE, label: 'QHSE' },
  'Qualite': { steps: STEPS_QHSE, label: 'QHSE' },
  'Logistique': { steps: STEPS_LOGISTIQUE, label: 'Logistique' },
  'LOGISTIQUE': { steps: STEPS_LOGISTIQUE, label: 'Logistique' },
  'ADV': { steps: STEPS_LOGISTIQUE, label: 'ADV / Logistique' },
  'Direction': { steps: STEPS_DIRECTION, label: 'Direction' },
  'DIRECTION': { steps: STEPS_DIRECTION, label: 'Direction' },
};

function buildTourSteps(userService, userRole) {
  const isAdmin = userRole === 'ADMIN';
  const config = SERVICE_STEPS_MAP[userService];
  const serviceName = config?.label || null;

  // Admin sans service specifique -> visite Direction
  let profileSteps;
  if (config) {
    profileSteps = config.steps;
  } else if (isAdmin) {
    profileSteps = STEPS_DIRECTION;
  } else {
    profileSteps = STEPS_GENERIC;
  }

  const finalLabel = serviceName || (isAdmin ? 'Administrateur' : null);

  return [
    COMMON_INTRO(finalLabel),
    ...COMMON_START,
    ...profileSteps,
    ...COMMON_END,
    COMMON_OUTRO(finalLabel),
  ];
}

// Composant Tooltip personnalisé
const TourTooltip = ({ step, currentIndex, totalSteps, onNext, onPrev, onSkip, onClose, targetRect }) => {
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    const calculatePosition = () => {
      const isMobile = window.innerWidth < 640;
      const tooltipWidth = isMobile ? Math.min(400, window.innerWidth - 32) : 400;
      const tooltipHeight = 200;
      const margin = 16;

      if (!targetRect || step.placement === 'center') {
        setPosition({
          top: window.innerHeight / 2 - 150,
          left: (window.innerWidth - tooltipWidth) / 2
        });
        return;
      }

      let top = 0;
      let left = 0;

      if (isMobile) {
        // Sur mobile, toujours centrer horizontalement et positionner en bas de la cible
        top = targetRect.bottom + margin;
        left = (window.innerWidth - tooltipWidth) / 2;
        // Si pas assez de place en bas, mettre au-dessus
        if (top + tooltipHeight > window.innerHeight - margin) {
          top = targetRect.top - tooltipHeight - margin;
        }
        // Fallback: centrer verticalement
        if (top < margin) {
          top = window.innerHeight / 2 - tooltipHeight / 2;
        }
      } else {
        switch (step.placement) {
          case 'right':
            top = targetRect.top + targetRect.height / 2 - tooltipHeight / 2;
            left = targetRect.right + margin;
            break;
          case 'left':
            top = targetRect.top + targetRect.height / 2 - tooltipHeight / 2;
            left = targetRect.left - tooltipWidth - margin;
            break;
          case 'bottom':
            top = targetRect.bottom + margin;
            left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
            break;
          case 'bottom-end':
            top = targetRect.bottom + margin;
            left = targetRect.right - tooltipWidth;
            break;
          case 'top':
            top = targetRect.top - tooltipHeight - margin;
            left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
            break;
          default:
            top = targetRect.bottom + margin;
            left = targetRect.left;
        }
      }

      // Ajuster si le tooltip sort de l'écran
      if (left < margin) left = margin;
      if (left + tooltipWidth > window.innerWidth - margin) {
        left = window.innerWidth - tooltipWidth - margin;
      }
      if (top < margin) top = margin;
      if (top + tooltipHeight > window.innerHeight - margin) {
        top = window.innerHeight - tooltipHeight - margin;
      }

      setPosition({ top, left });
    };

    calculatePosition();
    window.addEventListener('resize', calculatePosition);
    return () => window.removeEventListener('resize', calculatePosition);
  }, [targetRect, step.placement]);

  const isFirst = currentIndex === 0;
  const isLast = currentIndex === totalSteps - 1;

  return (
    <div
      className="fixed z-[10001] bg-white rounded-xl shadow-2xl border border-gray-200 max-w-[400px] w-[calc(100vw-2rem)] animate-fadeIn"
      style={{ top: position.top, left: position.left }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4 border-b border-gray-100">
        <h3 className="text-base sm:text-lg font-semibold text-gray-800">{step.title}</h3>
        <button
          onClick={onClose}
          onTouchEnd={(e) => { e.preventDefault(); onClose(); }}
          className="p-1 hover:bg-gray-100 rounded-full transition-colors"
        >
          <X size={18} className="text-gray-500" />
        </button>
      </div>

      {/* Content */}
      <div className="px-4 sm:px-5 py-3 sm:py-4">
        <p className="text-gray-600 text-sm leading-relaxed">{step.content}</p>
        {step.subContent && (
          <p className="text-gray-500 text-xs mt-3 italic">{step.subContent}</p>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4 bg-gray-50 rounded-b-xl border-t border-gray-100">
        {/* Progress */}
        <div className="flex items-center gap-2">
          <span className="text-xs sm:text-sm text-gray-500">
            {currentIndex + 1} / {totalSteps}
          </span>
          <div className="hidden sm:flex gap-1">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full transition-colors ${
                  i === currentIndex ? 'bg-blue-600' : i < currentIndex ? 'bg-blue-300' : 'bg-gray-300'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-1 sm:gap-2">
          {!isFirst && !step.isIntro && (
            <button
              onClick={onPrev}
              onTouchEnd={(e) => { e.preventDefault(); onPrev(); }}
              className="flex items-center gap-1 px-2 sm:px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors text-sm"
            >
              <ChevronLeft size={16} />
              <span className="hidden sm:inline">Précédent</span>
            </button>
          )}

          {!isLast && (
            <button
              onClick={onSkip}
              onTouchEnd={(e) => { e.preventDefault(); onSkip(); }}
              className="px-2 sm:px-3 py-2 text-gray-500 hover:text-gray-700 text-sm"
            >
              Passer
            </button>
          )}

          <button
            onClick={isLast ? onClose : onNext}
            onTouchEnd={(e) => { e.preventDefault(); (isLast ? onClose : onNext)(); }}
            className="flex items-center gap-1 px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            {isLast ? 'Terminer' : 'Suivant'}
            {!isLast && <ChevronRight size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
};

// Composant Overlay avec spotlight
const TourOverlay = ({ targetRect, onClick }) => {
  if (!targetRect) {
    return (
      <div 
        className="fixed inset-0 bg-black/50 z-[10000] transition-opacity pointer-events-auto"
        onClick={onClick}
        onTouchEnd={(e) => { e.preventDefault(); onClick(); }}
      />
    );
  }

  const padding = 8;
  const spotlightRect = {
    top: targetRect.top - padding,
    left: targetRect.left - padding,
    width: targetRect.width + padding * 2,
    height: targetRect.height + padding * 2
  };

  return (
    <div className="fixed inset-0 z-[10000] pointer-events-none">
      {/* Top */}
      <div 
        className="absolute bg-black/50 left-0 right-0 top-0 pointer-events-auto"
        style={{ height: Math.max(0, spotlightRect.top) }}
      />
      {/* Bottom */}
      <div 
        className="absolute bg-black/50 left-0 right-0 bottom-0 pointer-events-auto"
        style={{ top: spotlightRect.top + spotlightRect.height }}
      />
      {/* Left */}
      <div 
        className="absolute bg-black/50 pointer-events-auto"
        style={{ 
          top: spotlightRect.top, 
          left: 0, 
          width: Math.max(0, spotlightRect.left),
          height: spotlightRect.height
        }}
      />
      {/* Right */}
      <div 
        className="absolute bg-black/50 pointer-events-auto"
        style={{ 
          top: spotlightRect.top, 
          left: spotlightRect.left + spotlightRect.width,
          right: 0,
          height: spotlightRect.height
        }}
      />
      {/* Spotlight border */}
      <div 
        className="absolute border-2 border-blue-400 rounded-lg pointer-events-none"
        style={{ 
          top: spotlightRect.top, 
          left: spotlightRect.left,
          width: spotlightRect.width,
          height: spotlightRect.height,
          boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)'
        }}
      />
    </div>
  );
};

const GuidedTour = () => {
  const { 
    isRunning, 
    stepIndex, 
    stopTour, 
    completeTour, 
    setStepIndex 
  } = useGuidedTour();

  const [targetRect, setTargetRect] = useState(null);

  // Recuperer le profil utilisateur pour personnaliser la visite
  const tourSteps = useMemo(() => {
    try {
      const userData = JSON.parse(localStorage.getItem('user') || '{}');
      const service = userData.service || null;
      const role = userData.role || null;
      return buildTourSteps(service, role);
    } catch {
      return buildTourSteps(null, null);
    }
  }, []);

  const currentStep = tourSteps[stepIndex];

  // Trouver l'élément cible et calculer sa position
  const updateTargetRect = useCallback(() => {
    if (!currentStep || currentStep.placement === 'center') {
      setTargetRect(null);
      return;
    }

    const element = document.querySelector(currentStep.target);
    if (element) {
      const rect = element.getBoundingClientRect();
      setTargetRect({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        right: rect.right,
        bottom: rect.bottom
      });
      
      // Scroll vers l'élément si nécessaire
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      setTargetRect(null);
    }
  }, [currentStep]);

  useEffect(() => {
    if (isRunning) {
      // Petit délai pour laisser le temps au DOM de se mettre à jour
      const timer = setTimeout(updateTargetRect, 100);
      window.addEventListener('resize', updateTargetRect);
      window.addEventListener('scroll', updateTargetRect);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('resize', updateTargetRect);
        window.removeEventListener('scroll', updateTargetRect);
      };
    }
  }, [isRunning, stepIndex, updateTargetRect]);

  const handleNext = () => {
    if (stepIndex < tourSteps.length - 1) {
      setStepIndex(stepIndex + 1);
    }
  };

  const handlePrev = () => {
    if (stepIndex > 0) {
      setStepIndex(stepIndex - 1);
    }
  };

  const handleSkip = () => {
    completeTour();
  };

  const handleClose = () => {
    completeTour();
  };

  if (!isRunning || !currentStep) {
    return null;
  }

  return createPortal(
    <>
      <TourOverlay targetRect={targetRect} onClick={() => {}} />
      <TourTooltip
        step={currentStep}
        currentIndex={stepIndex}
        totalSteps={tourSteps.length}
        targetRect={targetRect}
        onNext={handleNext}
        onPrev={handlePrev}
        onSkip={handleSkip}
        onClose={handleClose}
      />
      {/* CSS pour l'animation */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
      `}</style>
    </>,
    document.body
  );
};

export default GuidedTour;
