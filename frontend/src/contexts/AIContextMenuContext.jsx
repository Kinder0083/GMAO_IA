import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { Bot, Info, Sparkles } from 'lucide-react';
import { usePreferences } from './PreferencesContext';
import AIChatWidget from '../components/Common/AIChatWidget';

const AIContextMenuContext = createContext(null);

export const useAIContextMenu = () => {
  const context = useContext(AIContextMenuContext);
  if (!context) {
    throw new Error('useAIContextMenu must be used within AIContextMenuProvider');
  }
  return context;
};

// Types de contexte détectables
const CONTEXT_TYPES = {
  EQUIPMENT: {
    icon: '🔧',
    label: 'Équipement',
    color: 'blue',
    questions: [
      'Quel est l\'historique de maintenance ?',
      'Quels sont les problèmes fréquents ?',
      'Comment optimiser la maintenance ?'
    ]
  },
  WORK_ORDER: {
    icon: '📋',
    label: 'Ordre de travail',
    color: 'green',
    questions: [
      'Comment compléter cette intervention ?',
      'Quelles pièces sont nécessaires ?',
      'Quel est le temps estimé ?'
    ]
  },
  SENSOR: {
    icon: '📡',
    label: 'Capteur IoT',
    color: 'purple',
    questions: [
      'Quelle est la tendance des valeurs ?',
      'Les seuils sont-ils bien configurés ?',
      'Comment interpréter ces données ?'
    ]
  },
  METER: {
    icon: '⏱️',
    label: 'Compteur',
    color: 'orange',
    questions: [
      'Quelle est la consommation moyenne ?',
      'Y a-t-il des anomalies ?',
      'Comment optimiser ?'
    ]
  },
  LOCATION: {
    icon: '📍',
    label: 'Emplacement',
    color: 'teal',
    questions: [
      'Quels équipements sont ici ?',
      'Y a-t-il des interventions en cours ?',
      'Quel est l\'état général ?'
    ]
  },
  INVENTORY: {
    icon: '📦',
    label: 'Inventaire',
    color: 'amber',
    questions: [
      'Quel est le niveau de stock ?',
      'Faut-il commander ?',
      'Historique des consommations ?'
    ]
  },
  USER: {
    icon: '👤',
    label: 'Utilisateur',
    color: 'indigo',
    questions: [
      'Quelles sont ses interventions ?',
      'Quelle est sa charge de travail ?',
      'Ses compétences ?'
    ]
  },
  GENERIC: {
    icon: '💬',
    label: 'Élément',
    color: 'gray',
    questions: [
      'Explique-moi cet élément',
      'Comment l\'utiliser ?',
      'Aide-moi avec ceci'
    ]
  }
};

// Fonction pour extraire le contexte enrichi d'un élément
const extractRichContext = (target) => {
  const context = {
    type: 'GENERIC',
    data: {},
    path: window.location.pathname,
    pageTitle: document.querySelector('h1, .page-title')?.textContent?.trim() || '',
    sectionTitle: '',
    elementInfo: ''
  };

  // Récupérer la section
  const section = target.closest('section, .section, [data-section]');
  if (section) {
    context.sectionTitle = section.querySelector('h2, h3, .section-title')?.textContent?.trim() || '';
  }

  // Détecter le type de contexte via data-ai-context
  const contextElement = target.closest('[data-ai-context]');
  if (contextElement) {
    try {
      const aiContext = JSON.parse(contextElement.dataset.aiContext);
      context.type = aiContext.type || 'GENERIC';
      context.data = { ...context.data, ...aiContext };
    } catch (e) {
      // Si ce n'est pas du JSON, utiliser comme texte simple
      context.data.info = contextElement.dataset.aiContext;
    }
  }

  // Détecter via data-ai-type (alternative plus simple)
  const typeElement = target.closest('[data-ai-type]');
  if (typeElement) {
    context.type = typeElement.dataset.aiType;
    
    // Récupérer les données associées
    if (typeElement.dataset.aiId) context.data.id = typeElement.dataset.aiId;
    if (typeElement.dataset.aiName) context.data.name = typeElement.dataset.aiName;
    if (typeElement.dataset.aiStatus) context.data.status = typeElement.dataset.aiStatus;
    if (typeElement.dataset.aiExtra) {
      try {
        context.data.extra = JSON.parse(typeElement.dataset.aiExtra);
      } catch (e) {
        context.data.extra = typeElement.dataset.aiExtra;
      }
    }
  }

  // Fallback: détecter via structure DOM classique
  if (context.type === 'GENERIC') {
    // Détecter équipement
    const equipmentCard = target.closest('[data-equipment-id], .equipment-card');
    if (equipmentCard) {
      context.type = 'EQUIPMENT';
      context.data.id = equipmentCard.dataset.equipmentId;
      context.data.name = equipmentCard.querySelector('[data-name], .item-name, h3, .card-title')?.textContent?.trim();
      context.data.status = equipmentCard.querySelector('[data-status]')?.dataset?.status;
    }

    // Détecter ordre de travail
    const woRow = target.closest('[data-workorder-id], .workorder-row, tr[data-wo-id]');
    if (woRow) {
      context.type = 'WORK_ORDER';
      context.data.id = woRow.dataset.workorderId || woRow.dataset.woId;
      context.data.name = woRow.querySelector('[data-title], .wo-title, td:nth-child(3)')?.textContent?.trim();
      context.data.status = woRow.querySelector('[data-status]')?.dataset?.status;
      context.data.priority = woRow.querySelector('[data-priority]')?.dataset?.priority;
    }

    // Détecter capteur
    const sensorCard = target.closest('[data-sensor-id], .sensor-card');
    if (sensorCard) {
      context.type = 'SENSOR';
      context.data.id = sensorCard.dataset.sensorId;
      context.data.name = sensorCard.querySelector('[data-name], h3')?.textContent?.trim();
      context.data.value = sensorCard.querySelector('[data-value], .sensor-value')?.textContent?.trim();
      context.data.type = sensorCard.dataset.sensorType;
    }

    // Détecter compteur
    const meterCard = target.closest('[data-meter-id], .meter-card');
    if (meterCard) {
      context.type = 'METER';
      context.data.id = meterCard.dataset.meterId;
      context.data.name = meterCard.querySelector('[data-name], h3')?.textContent?.trim();
    }

    // Détecter emplacement
    const locationItem = target.closest('[data-location-id], .location-item');
    if (locationItem) {
      context.type = 'LOCATION';
      context.data.id = locationItem.dataset.locationId;
      context.data.name = locationItem.querySelector('[data-name], .location-name')?.textContent?.trim();
    }
  }

  // Récupérer info générique si pas encore trouvé
  if (!context.data.name) {
    const row = target.closest('tr, [data-row], .card, [data-item]');
    if (row) {
      context.data.name = row.querySelector('[data-name], .item-name, h3, h4, .title')?.textContent?.trim();
      context.data.id = row.dataset?.id || row.dataset?.itemId;
    }
  }

  return context;
};

// Formater le contexte pour l'IA
const formatContextForAI = (context) => {
  const parts = [];
  
  parts.push(`Page: ${context.path}`);
  if (context.pageTitle) parts.push(`Titre: ${context.pageTitle}`);
  if (context.sectionTitle) parts.push(`Section: ${context.sectionTitle}`);
  
  const typeInfo = CONTEXT_TYPES[context.type] || CONTEXT_TYPES.GENERIC;
  parts.push(`Type d'élément: ${typeInfo.label}`);
  
  if (context.data.name) parts.push(`Nom: ${context.data.name}`);
  if (context.data.id) parts.push(`ID: ${context.data.id}`);
  if (context.data.status) parts.push(`Statut: ${context.data.status}`);
  if (context.data.value) parts.push(`Valeur: ${context.data.value}`);
  if (context.data.priority) parts.push(`Priorité: ${context.data.priority}`);
  if (context.data.extra) parts.push(`Info: ${JSON.stringify(context.data.extra)}`);
  
  return parts.join(' | ');
};

export const AIContextMenuProvider = ({ children }) => {
  const { preferences } = usePreferences();
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [selectedContext, setSelectedContext] = useState(null);
  const [richContext, setRichContext] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [initialQuestion, setInitialQuestion] = useState(null);

  const aiName = preferences?.ai_assistant_name || 'Adria';

  // Gestionnaire de clic droit
  const handleContextMenu = useCallback((e) => {
    // Ignorer si on est sur la page Chat Live ou SSH Terminal - laisser le menu contextuel natif
    if (window.location.pathname.includes('chat-live') || window.location.pathname.includes('chat') || window.location.pathname.includes('ssh')) {
      return; // Ne pas intercepter le clic droit sur Chat Live et SSH Terminal
    }
    
    // Ignorer si c'est sur un input, textarea ou élément éditable
    const target = e.target;
    const isEditable = target.tagName === 'INPUT' || 
                       target.tagName === 'TEXTAREA' || 
                       target.isContentEditable ||
                       target.closest('input, textarea, [contenteditable="true"]');
    
    if (isEditable) return;
    
    // Ignorer si on est dans un composant de chat (au cas où)
    const isChatComponent = target.closest('[data-chat-message], .chat-message, .message-container, [data-no-ai-menu]');
    if (isChatComponent) return;

    // Ignorer si on est dans l'explorateur de documents (menu contextuel dédié)
    const isDocExplorer = target.closest('[data-explorer-bg], [data-testid^="explorer-item-"], [data-testid="explorer-view"]');
    if (isDocExplorer) return;

    e.preventDefault();
    
    // Extraire le contexte enrichi
    const context = extractRichContext(target);
    setRichContext(context);
    
    // Formater pour l'IA
    const formattedContext = formatContextForAI(context);
    setSelectedContext(formattedContext);
    
    // Positionner le menu
    const menuWidth = 300;
    const menuHeight = 350;
    const x = Math.min(e.clientX, window.innerWidth - menuWidth - 10);
    const y = Math.min(e.clientY, window.innerHeight - menuHeight - 10);
    
    setMenuPosition({ x, y });
    setMenuVisible(true);
  }, []);

  // Fermer le menu au clic ailleurs (mais pas si on clique dans le menu)
  useEffect(() => {
    const handleClick = (e) => {
      // Ne pas fermer si le clic vient du menu lui-même
      const menu = document.querySelector('[data-ai-context-menu]');
      if (menu && menu.contains(e.target)) {
        return;
      }
      setMenuVisible(false);
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setMenuVisible(false);
    };
    
    if (menuVisible) {
      // Ajouter un délai pour éviter la fermeture immédiate
      const timer = setTimeout(() => {
        document.addEventListener('click', handleClick);
        document.addEventListener('keydown', handleKeyDown);
      }, 100);
      
      return () => {
        clearTimeout(timer);
        document.removeEventListener('click', handleClick);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
    
    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuVisible]);

  // Attacher le gestionnaire de clic droit au document
  useEffect(() => {
    document.addEventListener('contextmenu', handleContextMenu);
    return () => document.removeEventListener('contextmenu', handleContextMenu);
  }, [handleContextMenu]);

  const openChatWithContext = (question = null) => {
    setMenuVisible(false);
    setInitialQuestion(question);
    setChatOpen(true);
  };

  const openChat = (context = null) => {
    if (context) setSelectedContext(context);
    setInitialQuestion(null);
    setChatOpen(true);
  };

  const closeChat = () => {
    setChatOpen(false);
    setSelectedContext(null);
    setRichContext(null);
    setInitialQuestion(null);
  };

  const contextTypeInfo = richContext ? (CONTEXT_TYPES[richContext.type] || CONTEXT_TYPES.GENERIC) : CONTEXT_TYPES.GENERIC;

  return (
    <AIContextMenuContext.Provider value={{ openChat, openChatWithContext, closeChat, chatOpen }}>
      {children}
      
      {/* Menu contextuel enrichi */}
      {menuVisible && richContext && (
        <div
          data-ai-context-menu="true"
          className="fixed z-[9999] bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden"
          style={{
            left: menuPosition.x,
            top: menuPosition.y,
            width: '300px'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header avec type détecté */}
          <div className={`bg-gradient-to-r from-purple-600 to-purple-700 text-white p-3`}>
            <div className="flex items-center gap-2">
              <span className="text-xl">{contextTypeInfo.icon}</span>
              <div className="flex-1">
                <p className="font-semibold text-sm">Discuter avec {aiName}</p>
                <p className="text-xs text-purple-200">
                  {richContext.data.name || contextTypeInfo.label}
                </p>
              </div>
              <Bot size={24} className="text-purple-200" />
            </div>
          </div>
          
          {/* Contexte détecté */}
          {(richContext.data.name || richContext.data.status) && (
            <div className="px-3 py-2 bg-purple-50 border-b border-purple-100">
              <div className="flex items-center gap-2 text-xs text-purple-700">
                <Info size={12} />
                <span className="font-medium">Contexte détecté:</span>
              </div>
              <div className="mt-1 text-xs text-purple-600 space-y-0.5">
                {richContext.data.name && <p>• {richContext.data.name}</p>}
                {richContext.data.status && <p>• Statut: {richContext.data.status}</p>}
                {richContext.data.value && <p>• Valeur: {richContext.data.value}</p>}
              </div>
            </div>
          )}
          
          {/* Questions suggérées */}
          <div className="p-2">
            <p className="text-xs text-gray-500 px-2 mb-2 flex items-center gap-1">
              <Sparkles size={12} />
              Questions suggérées
            </p>
            {contextTypeInfo.questions.map((question, idx) => (
              <button
                key={idx}
                onClick={() => openChatWithContext(question)}
                className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-purple-50 hover:text-purple-700 rounded-lg transition-colors"
              >
                {question}
              </button>
            ))}
          </div>
          
          {/* Bouton principal */}
          <div className="p-2 border-t border-gray-100">
            <button
              onClick={() => openChatWithContext()}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors font-medium text-sm"
            >
              <Bot size={18} />
              Poser une autre question
            </button>
          </div>
        </div>
      )}

      {/* Widget de chat */}
      <AIChatWidget 
        isOpen={chatOpen} 
        onClose={closeChat}
        initialContext={selectedContext}
        initialQuestion={initialQuestion}
      />
    </AIContextMenuContext.Provider>
  );
};

export default AIContextMenuProvider;
