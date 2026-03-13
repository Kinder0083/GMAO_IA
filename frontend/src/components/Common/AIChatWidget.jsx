import React, { useState, useEffect, useRef, useContext } from 'react';
import { X, Send, Bot, User, Loader2, Trash2, Minimize2, Maximize2, Sparkles, Mic, MicOff, Volume2, VolumeX, WifiOff } from 'lucide-react';
import { Button } from '../ui/button';
import { usePreferences } from '../../contexts/PreferencesContext';
import { useToast } from '../../hooks/use-toast';
import api from '../../services/api';
import GuidedHighlight from './GuidedHighlight';
import { AINavigationContext } from '../../contexts/AINavigationContext';
import { executeCommand } from './adriaCommandHandlers';
import useAdriaVoice from './useAdriaVoice';
import useOnlineStatus from '../../hooks/useOnlineStatus';

const QUICK_ACTIONS = [
  { id: 'creer-ot', label: 'Créer un OT', icon: '📋' },
  { id: 'creer-equipement', label: 'Ajouter équipement', icon: '🔧' },
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'capteurs', label: 'Capteurs IoT', icon: '📡' },
];

const ACTION_COMMAND_REGEX = /\[\[(CREATE_OT|MODIFY_OT|CLOSE_OT|ADD_TIME_OT|COMMENT_OT|SEARCH|CONFIGURE_AUTOMATION|CREATE_WIDGET):(\{[\s\S]*?\})\]\]/g;
const GUIDE_REGEX = /\[\[GUIDE_START:([^\]]+)\]\]\s*(\{[\s\S]*?\})\s*\[\[GUIDE_END\]\]/g;
const AUTO_TEXT_REGEX = /\[\[CONFIGURE_AUTOMATION:([^\]]+)\]\]/g;
const NAV_COMMAND_REGEX = /\[\[(NAVIGATE|ACTION|GUIDE|SPOTLIGHT|PULSE|TRAIL|TOOLTIP|CELEBRATE):([^\]]+)\]\]/g;

const ROUTE_MAP = {
  'dashboard': 'dashboard', 'work-orders': 'ordres-de-travail', 'assets': 'equipements',
  'locations': 'emplacements', 'inventory': 'inventaire', 'preventive-maintenance': 'maintenance-preventive',
  'sensors': 'capteurs', 'meters': 'compteurs', 'reports': 'rapports',
  'settings': 'parametres', 'personnalisation': 'personnalisation'
};

const GUIDANCE_STEPS = {
  'creer-ot': [
    { route: '/work-orders', message: 'Bienvenue dans le module Ordres de Travail' },
    { highlight: 'button:has-text("Créer"), button:has-text("+ Créer")', message: 'Cliquez sur ce bouton pour créer un nouvel ordre de travail', showHand: true },
    { message: 'Remplissez le formulaire avec les informations de l\'intervention' }
  ],
  'creer-equipement': [
    { route: '/assets', message: 'Bienvenue dans le module Équipements' },
    { highlight: 'button:has-text("Ajouter"), button:has-text("+ Ajouter")', message: 'Cliquez ici pour ajouter un nouvel équipement', showHand: true },
    { message: 'Remplissez les informations de l\'équipement (nom, type, emplacement...)' }
  ]
};

const AIChatWidget = ({ isOpen, onClose, initialContext = null, initialQuestion = null }) => {
  const { preferences } = usePreferences();
  const { toast } = useToast();
  const { isOnline } = useOnlineStatus();
  const navigationContext = useContext(AINavigationContext);
  const executeAction = navigationContext?.executeAction;
  const navigateTo = navigationContext?.navigateTo;
  const startGuidance = navigationContext?.startGuidance;

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [minimized, setMinimized] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(true);
  const [hasProcessedInitialQuestion, setHasProcessedInitialQuestion] = useState(false);
  const [activeGuide, setActiveGuide] = useState(null);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const aiName = preferences?.ai_assistant_name || 'Adria';
  const aiGender = preferences?.ai_assistant_gender || 'female';

  // Hook vocal
  const handleTranscription = async (transcription) => {
    const userMessage = { role: 'user', content: `🎤 ${transcription}`, timestamp: new Date().toISOString(), isVoice: true };
    setMessages(prev => [...prev, userMessage]);
    setShowQuickActions(false);
    await sendMessageToAI(transcription);
  };
  const voice = useAdriaVoice({ toast, onTranscription: handleTranscription });

  // Scroll auto
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  // Focus input
  useEffect(() => { if (isOpen && inputRef.current && !minimized) setTimeout(() => inputRef.current?.focus(), 100); }, [isOpen, minimized]);
  // Message de bienvenue
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      const greeting = aiGender === 'female'
        ? `Bonjour ! Je suis ${aiName}, votre assistante FSAO. Comment puis-je vous aider aujourd'hui ?`
        : `Bonjour ! Je suis ${aiName}, votre assistant FSAO. Comment puis-je vous aider aujourd'hui ?`;
      setMessages([{ role: 'assistant', content: greeting, timestamp: new Date().toISOString() }]);
      setHasProcessedInitialQuestion(false);
    }
  }, [isOpen, aiName, aiGender]);
  // Question initiale (menu contextuel)
  useEffect(() => {
    if (isOpen && initialQuestion && !hasProcessedInitialQuestion && messages.length > 0 && !loading) {
      setHasProcessedInitialQuestion(true);
      setShowQuickActions(false);
      setMessages(prev => [...prev, { role: 'user', content: initialQuestion, timestamp: new Date().toISOString() }]);
      sendMessageToAI(initialQuestion);
    }
  }, [isOpen, initialQuestion, hasProcessedInitialQuestion, messages.length, loading]);
  useEffect(() => { if (!isOpen) setHasProcessedInitialQuestion(false); }, [isOpen]);

  // ==================== Exécution des commandes IA ====================
  const executeAutoAction = async (actionType, actionData) => {
    try {
      const result = await executeCommand(actionType, actionData);
      if (result.toastTitle) toast({ title: result.toastTitle, description: result.toastDesc });
      if (result.message) {
        setMessages(prev => [...prev, {
          role: 'assistant', content: result.message,
          timestamp: new Date().toISOString(), isSystemAction: true
        }]);
      }
    } catch (error) {
      console.error('Erreur action automatique:', error);
      toast({ title: 'Erreur', description: `Impossible d'exécuter l'action: ${error.message}`, variant: 'destructive' });
      setMessages(prev => [...prev, {
        role: 'assistant', content: `Désolé, une erreur est survenue : ${error.response?.data?.detail || error.message}`,
        timestamp: new Date().toISOString(), isSystemAction: true
      }]);
    }
  };

  // ==================== Parsing des commandes dans la réponse IA ====================
  const parseAndExecuteCommands = (responseText) => {
    // Guides pas à pas
    let guideMatch = GUIDE_REGEX.exec(responseText);
    GUIDE_REGEX.lastIndex = 0;
    if (guideMatch) {
      try {
        const guideData = JSON.parse(guideMatch[2]);
        setActiveGuide({ name: guideMatch[1], title: guideData.title || 'Guide interactif', steps: guideData.steps || [] });
        toast({ title: 'Guide démarré', description: guideData.title || 'Suivez les étapes en surbrillance' });
      } catch (e) { console.error('Erreur parsing guide:', e); }
    }

    // Actions automatiques (CREATE_OT, MODIFY_OT, CLOSE_OT, etc.)
    let actionMatch;
    const actionRegex = new RegExp(ACTION_COMMAND_REGEX.source, 'g');
    while ((actionMatch = actionRegex.exec(responseText)) !== null) {
      try {
        executeAutoAction(actionMatch[1], JSON.parse(actionMatch[2]));
      } catch (e) { console.error('Erreur parsing action:', e); }
    }

    // Automation texte libre
    const autoRegex = new RegExp(AUTO_TEXT_REGEX.source, 'g');
    let autoTextMatch;
    while ((autoTextMatch = autoRegex.exec(responseText)) !== null) {
      const msg = autoTextMatch[1].trim();
      if (!msg.startsWith('{')) executeAutoAction('CONFIGURE_AUTOMATION', { message: msg });
    }

    // Commandes de navigation
    const navRegex = new RegExp(NAV_COMMAND_REGEX.source, 'g');
    let match;
    const commands = [];
    while ((match = navRegex.exec(responseText)) !== null) {
      commands.push({ type: match[1], action: match[2] });
    }

    // Nettoyer le texte affiché
    let cleanText = responseText
      .replace(GUIDE_REGEX, '').replace(ACTION_COMMAND_REGEX, '')
      .replace(AUTO_TEXT_REGEX, '').replace(NAV_COMMAND_REGEX, '').trim();

    if (commands.length > 0) {
      setTimeout(() => executeNavCommands(commands), 1000);
    }
    return cleanText;
  };

  const executeNavCommands = (commands) => {
    commands.forEach(cmd => {
      if (cmd.type === 'NAVIGATE' && navigateTo) {
        navigateTo(ROUTE_MAP[cmd.action] || cmd.action);
        toast({ title: 'Navigation', description: `Je vous emmène vers ${cmd.action.replace('-', ' ')}...` });
      } else if (cmd.type === 'ACTION' && executeAction) {
        executeAction(cmd.action);
      } else if (cmd.type === 'GUIDE' && startGuidance) {
        if (startGuidance(cmd.action)) onClose();
      } else if (cmd.type === 'SPOTLIGHT' && navigationContext?.showSpotlight) {
        navigationContext.showSpotlight(cmd.action);
      } else if (cmd.type === 'PULSE' && navigationContext?.addPulseEffect) {
        navigationContext.addPulseEffect(cmd.action);
      } else if (cmd.type === 'TRAIL' && navigationContext?.showTrail) {
        const [s, e] = cmd.action.split(':');
        if (s && e) navigationContext.showTrail(s, e);
      } else if (cmd.type === 'TOOLTIP' && navigationContext?.showCustomTooltip) {
        const [sel, ...parts] = cmd.action.split(':');
        if (sel && parts.length) navigationContext.showCustomTooltip(sel, parts.join(':'));
      } else if (cmd.type === 'CELEBRATE' && navigationContext?.celebrate) {
        navigationContext.celebrate();
      }
    });
  };

  // ==================== Envoi de message ====================
  const sendMessageToAI = async (messageContent) => {
    setLoading(true);
    try {
      const context = initialContext || `Page actuelle: ${window.location.pathname}`;
      const response = await api.ai.chat({ message: messageContent, session_id: sessionId, context });
      const cleanResponse = parseAndExecuteCommands(response.data.response);
      setMessages(prev => [...prev, { role: 'assistant', content: cleanResponse, timestamp: new Date().toISOString() }]);
      setSessionId(response.data.session_id);
      if (voice.isTTSEnabled && cleanResponse) voice.speakText(cleanResponse);
    } catch (error) {
      console.error('Erreur chat IA:', error);
      setMessages(prev => [...prev, {
        role: 'assistant', content: `Désolé, je rencontre des difficultés techniques. ${error.response?.data?.detail || 'Veuillez réessayer.'}`,
        timestamp: new Date().toISOString(), error: true
      }]);
      toast({ title: 'Erreur', description: 'Impossible de contacter l\'assistant IA', variant: 'destructive' });
    } finally { setLoading(false); }
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    setShowQuickActions(false);
    setMessages(prev => [...prev, { role: 'user', content: input.trim(), timestamp: new Date().toISOString() }]);
    const msg = input.trim();
    setInput('');
    await sendMessageToAI(msg);
  };

  const handleQuickAction = async (actionId) => {
    setShowQuickActions(false);
    const action = QUICK_ACTIONS.find(a => a.id === actionId);
    if (!action) return;
    setMessages(prev => [...prev, { role: 'user', content: `${action.icon} ${action.label}`, timestamp: new Date().toISOString(), isQuickAction: true }]);
    if (executeAction) {
      try {
        await executeAction(actionId);
        setMessages(prev => [...prev, { role: 'assistant', content: `Je vous ai dirigé vers "${action.label}". Que puis-je faire d'autre ?`, timestamp: new Date().toISOString() }]);
      } catch {
        setMessages(prev => [...prev, { role: 'assistant', content: `Je n'ai pas pu naviguer vers "${action.label}".`, timestamp: new Date().toISOString() }]);
      }
    } else {
      setMessages(prev => [...prev, { role: 'assistant', content: `Pour accéder à "${action.label}", utilisez le menu latéral.`, timestamp: new Date().toISOString() }]);
    }
  };

  const handleClearHistory = async () => {
    if (sessionId) { try { await api.ai.clearHistory(sessionId); } catch {} }
    setMessages([]); setSessionId(null); setShowQuickActions(true);
    toast({ title: 'Historique effacé', description: 'La conversation a été réinitialisée' });
  };

  if (!isOpen) return null;

  return (
    <div className={`fixed bottom-4 right-4 transition-all duration-300 ${minimized ? 'w-64' : 'w-96'}`} style={{ zIndex: 9999 }} data-testid="adria-chat-widget">
      <div className="bg-white rounded-lg shadow-2xl border border-gray-200 overflow-hidden flex flex-col"
           style={{ maxHeight: minimized ? '48px' : '600px', height: minimized ? '48px' : '550px' }}>

        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-purple-700 text-white p-3 flex items-center justify-between" data-testid="adria-header">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center"><Bot size={20} /></div>
            <div>
              <h3 className="font-semibold text-sm">{aiName}</h3>
              {!minimized && <p className="text-xs text-purple-200">{aiGender === 'female' ? 'Assistante' : 'Assistant'} FSAO</p>}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {!isOnline && <div className="p-1.5 text-red-200" title="Hors ligne"><WifiOff size={14} /></div>}
            <button onClick={handleClearHistory} className="p-1.5 hover:bg-white/20 rounded transition-colors" title="Effacer l'historique" data-testid="adria-clear-btn"><Trash2 size={16} /></button>
            <button onClick={() => setMinimized(!minimized)} className="p-1.5 hover:bg-white/20 rounded transition-colors" data-testid="adria-minimize-btn">
              {minimized ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
            </button>
            <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded transition-colors" title="Fermer" data-testid="adria-close-btn"><X size={16} /></button>
          </div>
        </div>

        {!minimized && (
          <>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50" style={{ maxHeight: '350px' }} data-testid="adria-messages">
              {showQuickActions && messages.length <= 1 && (
                <div className="mb-4">
                  <p className="text-xs text-gray-500 mb-2 flex items-center gap-1"><Sparkles size={12} />Actions rapides</p>
                  <div className="flex flex-wrap gap-2">
                    {QUICK_ACTIONS.map(action => (
                      <button key={action.id} onClick={() => handleQuickAction(action.id)} data-testid={`quick-action-${action.id}`}
                        className="flex items-center gap-1 px-3 py-1.5 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-full text-xs font-medium transition-colors">
                        <span>{action.icon}</span><span>{action.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, index) => (
                <div key={index} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-purple-600 text-white'}`}>
                    {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                  </div>
                  <div className={`max-w-[75%] rounded-lg px-3 py-2 ${
                    msg.role === 'user' ? (msg.isQuickAction ? 'bg-purple-500 text-white' : 'bg-blue-600 text-white')
                      : msg.error ? 'bg-red-100 text-red-800 border border-red-200' : 'bg-white text-gray-800 border border-gray-200'
                  }`}>
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    <p className={`text-xs mt-1 ${msg.role === 'user' ? 'text-blue-200' : 'text-gray-400'}`}>
                      {new Date(msg.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex gap-2">
                  <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center"><Bot size={16} className="text-white" /></div>
                  <div className="bg-white rounded-lg px-4 py-2 border border-gray-200">
                    <div className="flex items-center gap-2 text-gray-500"><Loader2 size={16} className="animate-spin" /><span className="text-sm">{aiName} réfléchit...</span></div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-3 border-t border-gray-200 bg-white">
              <div className="flex items-center justify-between mb-2 px-1">
                <button onClick={() => voice.setIsTTSEnabled(!voice.isTTSEnabled)} data-testid="adria-tts-toggle"
                  className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full transition-colors ${voice.isTTSEnabled ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500'}`}>
                  {voice.isTTSEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
                  <span>{voice.isTTSEnabled ? 'Voix ON' : 'Voix OFF'}</span>
                </button>
                {voice.isPlayingAudio && (
                  <button onClick={voice.stopAudio} className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-red-100 text-red-700" data-testid="adria-stop-audio">
                    <VolumeX size={14} /><span>Arrêter</span>
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <Button onClick={voice.isRecording ? voice.stopRecording : voice.startRecording} disabled={loading}
                  variant={voice.isRecording ? 'destructive' : 'outline'} className={`px-3 ${voice.isRecording ? 'animate-pulse bg-red-500 hover:bg-red-600' : ''}`}
                  data-testid="adria-mic-btn">
                  {voice.isRecording ? <MicOff size={18} /> : <Mic size={18} />}
                </Button>
                <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder={voice.isRecording ? 'Enregistrement en cours...' : `Posez votre question à ${aiName}...`}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                  rows={1} disabled={loading || voice.isRecording} data-testid="adria-input" />
                <Button onClick={handleSend} disabled={!input.trim() || loading || voice.isRecording}
                  className="bg-purple-600 hover:bg-purple-700 px-3" data-testid="adria-send-btn">
                  {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                </Button>
              </div>
              {voice.isRecording && (
                <div className="mt-2 flex items-center justify-center gap-2 text-red-600 text-sm">
                  <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                  <span>Parlez maintenant... Cliquez sur le micro pour terminer</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {activeGuide && (
        <GuidedHighlight guide={activeGuide}
          onComplete={() => { setActiveGuide(null); toast({ title: 'Guide terminé !', description: 'Vous avez complété toutes les étapes.' }); setMessages(prev => [...prev, { role: 'assistant', content: 'Bravo ! Guide terminé.', timestamp: new Date().toISOString() }]); }}
          onCancel={() => { setActiveGuide(null); toast({ title: 'Guide annulé' }); }}
          onStepChange={(step) => console.log('Étape du guide:', step)} />
      )}
    </div>
  );
};

export default AIChatWidget;
