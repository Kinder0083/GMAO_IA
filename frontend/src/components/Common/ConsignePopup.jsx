import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, User, Clock, CheckCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { useToast } from '../../hooks/use-toast';
import api from '../../services/api';

/**
 * Popup globale pour afficher les consignes reçues
 * S'affiche par-dessus toute l'application jusqu'à ce que l'utilisateur clique OK
 */
const ConsignePopup = () => {
  const [consignes, setConsignes] = useState([]);
  const [currentConsigne, setCurrentConsigne] = useState(null);
  const [acknowledging, setAcknowledging] = useState(false);
  const { toast } = useToast();
  
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const userId = user.id;

  // Charger les consignes non lues au démarrage
  const loadPendingConsignes = useCallback(async () => {
    if (!userId) return;
    
    try {
      const response = await api.get('/consignes/pending');
      if (response.data && response.data.length > 0) {
        setConsignes(response.data);
        // Afficher la première consigne non lue
        if (!currentConsigne) {
          setCurrentConsigne(response.data[0]);
        }
      }
    } catch (error) {
      console.error('Erreur chargement consignes:', error);
    }
  }, [userId, currentConsigne]);

  // Écouter les nouvelles consignes via WebSocket
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token || !userId) return;

    // Charger les consignes au démarrage
    loadPendingConsignes();

    // Construire l'URL WebSocket
    const backendUrl = process.env.REACT_APP_BACKEND_URL || window.location.origin;
    let wsUrl = backendUrl
      .replace('https://', 'wss://')
      .replace('http://', 'ws://');
    wsUrl = `${wsUrl}/api/ws/consignes?user_id=${userId}`;

    console.log('🔔 Connexion WebSocket consignes:', wsUrl);
    
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('✅ WebSocket consignes connecté');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'new_consigne') {
          console.log('📩 Nouvelle consigne reçue:', data.consigne);
          setConsignes(prev => [...prev, data.consigne]);
          
          // Si pas de consigne affichée, afficher celle-ci
          if (!currentConsigne) {
            setCurrentConsigne(data.consigne);
          }
          
          // Jouer un son d'alerte
          try {
            const audio = new Audio('/notification.mp3');
            audio.play().catch(() => {
              // Audio autoplay blocked - ignore
            });
          } catch (audioError) {
            console.log('Audio not available:', audioError);
          }
        }
      } catch (error) {
        console.error('Erreur parsing message consigne:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('❌ Erreur WebSocket consignes:', error);
    };

    ws.onclose = () => {
      console.log('🔌 WebSocket consignes déconnecté');
    };

    // Polling de secours toutes les 30 secondes
    const pollInterval = setInterval(loadPendingConsignes, 30000);

    return () => {
      ws.close();
      clearInterval(pollInterval);
    };
  }, [userId, loadPendingConsignes]);

  // Acquitter une consigne (clic sur OK)
  const handleAcknowledge = async () => {
    if (!currentConsigne) return;
    
    setAcknowledging(true);
    try {
      await api.post(`/consignes/${currentConsigne.id}/acknowledge`);
      
      // Retirer la consigne de la liste
      const remaining = consignes.filter(c => c.id !== currentConsigne.id);
      setConsignes(remaining);
      
      // Afficher la prochaine consigne ou fermer
      if (remaining.length > 0) {
        setCurrentConsigne(remaining[0]);
      } else {
        setCurrentConsigne(null);
      }
      
      toast({
        title: 'Consigne acquittée',
        description: 'Le message a été confirmé'
      });
    } catch (error) {
      console.error('Erreur acquittement consigne:', error);
      // En cas d'erreur, retirer quand même la consigne de l'affichage pour éviter le blocage
      const remaining = consignes.filter(c => c.id !== currentConsigne.id);
      setConsignes(remaining);
      if (remaining.length > 0) {
        setCurrentConsigne(remaining[0]);
      } else {
        setCurrentConsigne(null);
      }
      toast({
        title: 'Erreur',
        description: 'Impossible d\'acquitter la consigne. Elle sera reproposée ultérieurement.',
        variant: 'destructive'
      });
    } finally {
      setAcknowledging(false);
    }
  };

  // Ne rien afficher si pas de consigne
  if (!currentConsigne) return null;

  return (
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      data-testid="consigne-popup-overlay"
    >
      <div 
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden animate-in zoom-in-95 duration-200"
        data-testid="consigne-popup"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-500 to-red-500 px-6 py-4">
          <div className="flex items-center gap-3 text-white">
            <AlertTriangle size={28} className="animate-pulse" />
            <div>
              <h2 className="text-xl font-bold">CONSIGNE</h2>
              <p className="text-orange-100 text-sm">
                {consignes.length > 1 ? `${consignes.length} consignes en attente` : 'Message important'}
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Expéditeur */}
          <div className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-200">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
              <User size={20} className="text-blue-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900">
                {currentConsigne.sender_name || 'Expéditeur inconnu'}
              </p>
              <div className="flex items-center gap-1 text-sm text-gray-500">
                <Clock size={14} />
                <span>
                  {new Date(currentConsigne.created_at).toLocaleString('fr-FR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
              </div>
            </div>
          </div>

          {/* Message */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <p className="text-gray-800 whitespace-pre-wrap text-lg leading-relaxed">
              {currentConsigne.message}
            </p>
          </div>

          {/* Bouton OK */}
          <Button
            onClick={handleAcknowledge}
            disabled={acknowledging}
            className="w-full h-14 text-lg font-bold bg-green-600 hover:bg-green-700"
            data-testid="consigne-ok-button"
          >
            {acknowledging ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin">⏳</span>
                Envoi en cours...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <CheckCircle size={24} />
                OK - J&apos;ai lu la consigne
              </span>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ConsignePopup;
