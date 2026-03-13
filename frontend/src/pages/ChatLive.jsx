import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Paperclip, Camera, Users, X, Lock, Download, FileText, ArrowRightCircle, Mail as MailIcon, AlertTriangle, Eye } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { useToast } from '../hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { usePermissions } from '../hooks/usePermissions';
import api from '../services/api';
import useOnlineStatus from '../hooks/useOnlineStatus';

const ChatLive = () => {
  const { isOnline } = useOnlineStatus();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [selectedRecipients, setSelectedRecipients] = useState([]);
  const [ws, setWs] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [showUserSelector, setShowUserSelector] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const [capturedImage, setCapturedImage] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [messageContextMenu, setMessageContextMenu] = useState(null); // { x, y, message }
  const [showTransferModal, setShowTransferModal] = useState(null); // { type: 'workorder'|'improvement'|'preventive'|'email', attachment }
  const [transferList, setTransferList] = useState([]);
  const [selectedTransferItem, setSelectedTransferItem] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [selectedEmailUsers, setSelectedEmailUsers] = useState([]);
  const [replyingTo, setReplyingTo] = useState(null); // { id, user_name, message }
  // États pour les consignes
  const [showConsigneModal, setShowConsigneModal] = useState(false);
  const [consigneRecipient, setConsigneRecipient] = useState(null);
  const [consigneMessage, setConsigneMessage] = useState('');
  const [sendingConsigne, setSendingConsigne] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  // États pour les consignes générales (par service)
  const [showConsigneGroupModal, setShowConsigneGroupModal] = useState(false);
  const [consigneGroupService, setConsigneGroupService] = useState('');
  const [consigneGroupMessage, setConsigneGroupMessage] = useState('');
  const [sendingConsigneGroup, setSendingConsigneGroup] = useState(false);
  const [servicesList, setServicesList] = useState([]);
  const [consigneGroupResult, setConsigneGroupResult] = useState(null);
  
  const messagesEndRef = useRef(null);
  const messageRefs = useRef({}); // Références pour scroll vers message
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const { toast } = useToast();
  const { canEdit } = usePermissions();
  
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const userId = user.id;

  // Emojis de base pour les réactions
  const basicEmojis = ['👍', '❤️', '😂', '😮', '😢', '😡'];

  // Scroll automatique vers le bas
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Connexion WebSocket
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token || !user?.id) return;

    // Construire l'URL WebSocket depuis REACT_APP_BACKEND_URL
    const backendUrl = process.env.REACT_APP_BACKEND_URL || window.location.origin;
    
    // Remplacer http(s):// par ws(s)://
    let wsUrl = backendUrl
      .replace('https://', 'wss://')
      .replace('http://', 'ws://');
    
    // Utiliser user_id pour la compatibilité proxy
    wsUrl = `${wsUrl}/api/ws/chat?user_id=${user.id}`;
    
    console.log('🔌 Tentative connexion WebSocket:', wsUrl);
    
    const websocket = new WebSocket(wsUrl);

    websocket.onopen = () => {
      console.log('✅ WebSocket connecté');
      setIsConnected(true);
      setWs(websocket);
      
      // Heartbeat toutes les 30 secondes
      const heartbeatInterval = setInterval(() => {
        if (websocket.readyState === WebSocket.OPEN) {
          websocket.send(JSON.stringify({ type: 'heartbeat' }));
        }
      }, 30000);

      websocket.heartbeatInterval = heartbeatInterval;
    };

    websocket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'new_message') {
        setMessages(prev => [...prev, data.message]);
      } else if (data.type === 'message_deleted') {
        setMessages(prev => prev.map(msg => 
          msg.id === data.message_id 
            ? { ...msg, is_deleted: true, message: 'Ce message a été supprimé' }
            : msg
        ));
      } else if (data.type === 'user_status') {
        loadOnlineUsers();
      } else if (data.type === 'reaction_update') {
        // Mettre à jour les réactions en temps réel
        const { message_id, reaction, action } = data;
        
        setMessages(prev => prev.map(msg => {
          if (msg.id !== message_id) return msg;
          
          const reactions = msg.reactions || [];
          
          if (action === 'removed') {
            // Retirer la réaction de l'utilisateur
            return {
              ...msg,
              reactions: reactions.filter(r => r.user_id !== reaction.user_id)
            };
          } else if (action === 'added') {
            // Ajouter la nouvelle réaction
            return {
              ...msg,
              reactions: [...reactions, reaction]
            };
          } else if (action === 'changed') {
            // Remplacer l'ancienne réaction par la nouvelle
            return {
              ...msg,
              reactions: [
                ...reactions.filter(r => r.user_id !== reaction.user_id),
                reaction
              ]
            };
          }
          
          return msg;
        }));
      }
    };

    websocket.onerror = (error) => {
      console.error('❌ Erreur WebSocket:', error);
      console.error('URL tentée:', wsUrl);
      setIsConnected(false);
      // Note: Le mode REST prendra automatiquement le relais si nécessaire
      // Pas besoin d'afficher un toast d'erreur à l'utilisateur
    };

    websocket.onclose = (event) => {
      console.log('🔌 WebSocket déconnecté', event.code, event.reason);
      setIsConnected(false);
      if (websocket.heartbeatInterval) {
        clearInterval(websocket.heartbeatInterval);
      }
    };

    return () => {
      if (websocket.heartbeatInterval) {
        clearInterval(websocket.heartbeatInterval);
      }
      websocket.close();
    };
  }, []);

  // Charger les messages au démarrage
  useEffect(() => {
    loadMessages();
    loadOnlineUsers();
    
    // Marquer comme lu
    api.chat.markAsRead().catch(console.error);
    
    // Polling toutes les 5 secondes si WebSocket déconnecté
    const pollingInterval = setInterval(() => {
      if (!isConnected) {
        loadMessages();
        loadOnlineUsers();
      }
    }, 5000);
    
    return () => clearInterval(pollingInterval);
  }, [isConnected]);

  // Charger tous les utilisateurs pour les consignes
  useEffect(() => {
    const loadAllUsers = async () => {
      try {
        const response = await api.get('/users');
        setAllUsers(response.data || []);
      } catch (error) {
        console.error('Erreur chargement utilisateurs:', error);
      }
    };
    loadAllUsers();
  }, []);

  // Charger la liste des services pour les consignes générales
  useEffect(() => {
    const loadServices = async () => {
      try {
        const response = await api.get('/consignes/services');
        if (response.data && response.data.services) {
          setServicesList(response.data.services);
        }
      } catch (error) {
        console.error('Erreur chargement services:', error);
      }
    };
    loadServices();
  }, []);

  const loadMessages = async () => {
    try {
      const response = await api.chat.getMessages();
      setMessages(response.data.messages || []);
    } catch (error) {
      console.error('Erreur chargement messages:', error);
      toast({
        title: 'Erreur',
        description: 'Impossible de charger les messages',
        variant: 'destructive'
      });
    }
  };

  const loadOnlineUsers = async () => {
    try {
      const response = await api.chat.getOnlineUsers();
      setOnlineUsers(response.data.online_users || []);
    } catch (error) {
      console.error('Erreur chargement utilisateurs:', error);
    }
  };

  // Fonction pour envoyer une consigne
  const sendConsigne = async () => {
    if (!consigneRecipient || !consigneMessage.trim()) {
      toast({
        title: 'Erreur',
        description: 'Veuillez sélectionner un destinataire et écrire un message',
        variant: 'destructive'
      });
      return;
    }

    setSendingConsigne(true);
    try {
      const response = await api.post('/consignes/send', {
        recipient_id: consigneRecipient.id,
        message: consigneMessage.trim()
      });

      if (response.data.success) {
        const statusMsg = response.data.recipient_online 
          ? 'Consigne envoyée et affichée à l\'utilisateur' 
          : 'Consigne envoyée (utilisateur hors ligne - sera affichée à sa connexion)';
        
        toast({
          title: 'Consigne envoyée',
          description: statusMsg + (response.data.mqtt_sent ? ' • MQTT envoyé' : '')
        });

        // Si l'utilisateur est hors ligne, notifier l'expéditeur
        if (!response.data.recipient_online) {
          toast({
            title: '⚠️ Utilisateur hors ligne',
            description: `${consigneRecipient.prenom} ${consigneRecipient.nom} n'est pas connecté. La consigne sera affichée à sa prochaine connexion.`,
            variant: 'warning'
          });
        }

        setShowConsigneModal(false);
        setConsigneRecipient(null);
        setConsigneMessage('');
      }
    } catch (error) {
      console.error('Erreur envoi consigne:', error);
      toast({
        title: 'Erreur',
        description: 'Impossible d\'envoyer la consigne',
        variant: 'destructive'
      });
    } finally {
      setSendingConsigne(false);
    }
  };

  // Fonction pour envoyer une consigne de groupe (par service)
  const sendConsigneGroup = async () => {
    if (!consigneGroupService || !consigneGroupMessage.trim()) {
      toast({
        title: 'Erreur',
        description: 'Veuillez sélectionner un service et écrire un message',
        variant: 'destructive'
      });
      return;
    }

    setSendingConsigneGroup(true);
    setConsigneGroupResult(null);
    
    try {
      const response = await api.post('/consignes/send-group', {
        service: consigneGroupService,
        message: consigneGroupMessage.trim()
      });

      if (response.data.success) {
        setConsigneGroupResult(response.data);
        
        toast({
          title: 'Consigne générale envoyée',
          description: `${response.data.total_sent} utilisateur(s) notifié(s)`
        });
      }
    } catch (error) {
      console.error('Erreur envoi consigne groupe:', error);
      toast({
        title: 'Erreur',
        description: 'Impossible d\'envoyer la consigne générale',
        variant: 'destructive'
      });
    } finally {
      setSendingConsigneGroup(false);
    }
  };

  // Fermer le modal de consigne groupe et réinitialiser
  const closeConsigneGroupModal = () => {
    setShowConsigneGroupModal(false);
    setConsigneGroupService('');
    setConsigneGroupMessage('');
    setConsigneGroupResult(null);
  };

  const sendMessage = async () => {
    if (!newMessage.trim()) return;

    const messageData = {
      message: newMessage.trim(),
      recipient_ids: selectedRecipients.map(r => r.id),
      reply_to_id: replyingTo ? replyingTo.id : null
    };

    // Si WebSocket connecté, l'utiliser
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'message',
        ...messageData
      }));
      setNewMessage('');
      setSelectedRecipients([]);
      setReplyingTo(null);
    } else {
      // Sinon, fallback sur l'API REST
      try {
        const response = await api.chat.createMessage(messageData);
        // Ne pas ajouter manuellement - le polling s'en charge
        setNewMessage('');
        setSelectedRecipients([]);
        setReplyingTo(null);
        // Marquer comme lu immédiatement
        await api.chat.markAsRead();
        // Message envoyé avec succès en mode REST, pas besoin de notifier
      } catch (error) {
        console.error('Erreur envoi message:', error);
        toast({
          title: 'Erreur',
          description: 'Impossible d\'envoyer le message',
          variant: 'destructive'
        });
      }
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Upload de fichiers
  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setUploadingFiles(true);

    try {
      const formData = new FormData();
      formData.append('message', newMessage.trim() || 'Fichier(s) joint(s)');
      formData.append('recipient_ids', JSON.stringify(selectedRecipients.map(r => r.id)));
      
      files.forEach(file => {
        formData.append('files', file);
      });

      const response = await api.post('/chat/messages-with-files', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      // Ne pas ajouter manuellement - le WebSocket/polling s'en charge
      setNewMessage('');
      setSelectedRecipients([]);
      
      // Marquer comme lu immédiatement pour éviter notification de son propre message
      await api.chat.markAsRead();
      
      toast({
        title: 'Fichier(s) envoyé(s)',
        description: `${files.length} fichier(s) partagé(s) avec succès`
      });
    } catch (error) {
      console.error('Erreur upload fichiers:', error);
      toast({
        title: 'Erreur',
        description: 'Impossible d\'envoyer les fichiers',
        variant: 'destructive'
      });
    } finally {
      setUploadingFiles(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Ouvrir la caméra
  const openCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      setCameraStream(stream);
      setShowCameraModal(true);
      
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 100);
    } catch (error) {
      console.error('Erreur accès caméra:', error);
      toast({
        title: 'Erreur',
        description: 'Impossible d\'accéder à la caméra',
        variant: 'destructive'
      });
    }
  };

  // Capturer une photo
  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0);
      
      canvas.toBlob((blob) => {
        setCapturedImage(blob);
      }, 'image/jpeg', 0.9);
    }
  };

  // Envoyer la photo capturée
  const sendCapturedPhoto = async () => {
    if (!capturedImage) return;

    setUploadingFiles(true);

    try {
      const formData = new FormData();
      formData.append('message', newMessage.trim() || 'Photo capturée');
      formData.append('recipient_ids', JSON.stringify(selectedRecipients.map(r => r.id)));
      formData.append('files', capturedImage, `photo-${Date.now()}.jpg`);

      const response = await api.post('/chat/messages-with-files', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      // Ne pas ajouter manuellement - le WebSocket/polling s'en charge
      setNewMessage('');
      setSelectedRecipients([]);
      closeCameraModal();
      
      // Marquer comme lu immédiatement
      await api.chat.markAsRead();
      
      toast({
        title: 'Photo envoyée',
        description: 'La photo a été partagée avec succès'
      });
    } catch (error) {
      console.error('Erreur envoi photo:', error);
      toast({
        title: 'Erreur',
        description: 'Impossible d\'envoyer la photo',
        variant: 'destructive'
      });
    } finally {
      setUploadingFiles(false);
    }
  };

  // Fermer la caméra
  const closeCameraModal = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setCapturedImage(null);
    setShowCameraModal(false);
  };

  // Menu contextuel clic droit
  const handleFileContextMenu = (e, attachment, messageId) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      attachment,
      messageId
    });
  };

  // Fermer les menus contextuels
  useEffect(() => {
    const handleClick = () => {
      setContextMenu(null);
      setMessageContextMenu(null);
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  // Menu contextuel message
  const handleMessageContextMenu = (e, message) => {
    e.preventDefault();
    setMessageContextMenu({
      x: e.clientX,
      y: e.clientY,
      message
    });
  };

  // Ajouter/retirer une réaction
  const toggleReaction = async (messageId, emoji) => {
    console.log('🎯 toggleReaction appelée - Message:', messageId, 'Emoji:', emoji);
    
    try {
      // Mise à jour optimiste de l'UI (immediate feedback)
      const currentMessage = messages.find(m => m.id === messageId);
      if (currentMessage) {
        const reactions = currentMessage.reactions || [];
        const userReaction = reactions.find(r => r.user_id === userId);
        
        // Prédire l'action
        let predictedAction;
        if (userReaction && userReaction.emoji === emoji) {
          predictedAction = 'removed';
        } else {
          predictedAction = userReaction ? 'changed' : 'added';
        }
        
        // Mettre à jour localement pour feedback immédiat
        setMessages(prev => prev.map(msg => {
          if (msg.id !== messageId) return msg;
          
          const newReactions = msg.reactions || [];
          
          if (predictedAction === 'removed') {
            return {
              ...msg,
              reactions: newReactions.filter(r => r.user_id !== userId)
            };
          } else if (predictedAction === 'added') {
            return {
              ...msg,
              reactions: [...newReactions, {
                user_id: userId,
                user_name: user.prenom + ' ' + user.nom,
                emoji: emoji,
                added_at: new Date().toISOString()
              }]
            };
          } else if (predictedAction === 'changed') {
            return {
              ...msg,
              reactions: [
                ...newReactions.filter(r => r.user_id !== userId),
                {
                  user_id: userId,
                  user_name: user.prenom + ' ' + user.nom,
                  emoji: emoji,
                  added_at: new Date().toISOString()
                }
              ]
            };
          }
          
          return msg;
        }));
      }
      
      // Envoyer la requête au serveur
      const response = await api.chat.addReaction(messageId, emoji);
      console.log('✅ Réaction envoyée avec succès:', response.data);
      
      // Le WebSocket mettra à jour l'état pour tous les utilisateurs
      // Pas besoin de recharger manuellement - le broadcast le fera
      
    } catch (error) {
      console.error('❌ Erreur réaction:', error);
      
      // En cas d'erreur, recharger pour obtenir l'état correct
      await loadMessages();
      
      toast({
        title: 'Erreur',
        description: error.response?.data?.detail || 'Impossible d\'ajouter la réaction',
        variant: 'destructive'
      });
    }
  };

  // Supprimer un message
  const deleteMessage = async (messageId) => {
    try {
      await api.chat.deleteMessage(messageId);
      setMessageContextMenu(null);
      
      toast({
        title: 'Supprimé',
        description: 'Message supprimé'
      });
    } catch (error) {
      console.error('Erreur suppression:', error);
      toast({
        title: 'Erreur',
        description: error.response?.data?.detail || 'Impossible de supprimer le message',
        variant: 'destructive'
      });
    }
  };

  // Vérifier si l'utilisateur peut supprimer un message
  const canDeleteMessage = (message) => {
    if (user.role === 'ADMIN') return true;
    
    if (message.user_id === userId) {
      // L'utilisateur peut supprimer son propre message dans les 10 premières secondes
      const deletableUntil = new Date(message.deletable_until);
      return new Date() <= deletableUntil;
    }
    
    return false;
  };

  // Scroller vers un message
  const scrollToMessage = (messageId) => {
    const messageElement = messageRefs.current[messageId];
    if (messageElement) {
      messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Flash animation
      messageElement.classList.add('bg-yellow-100');
      setTimeout(() => {
        messageElement.classList.remove('bg-yellow-100');
      }, 1000);
    }
  };

  // Télécharger un fichier
  const downloadFile = async (attachmentId) => {
    try {
      const token = localStorage.getItem('token');
      const backendUrl = process.env.REACT_APP_BACKEND_URL || '';
      
      // Utiliser fetch avec le header Authorization
      const response = await fetch(`${backendUrl}/api/chat/download/${attachmentId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Erreur de téléchargement');
      }
      
      // Récupérer le nom du fichier depuis le header Content-Disposition
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = 'fichier';
      if (contentDisposition) {
        const matches = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (matches && matches[1]) {
          filename = matches[1].replace(/['"]/g, '');
        }
      }
      
      // Créer un blob et déclencher le téléchargement
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      setContextMenu(null);
    } catch (error) {
      console.error('Erreur téléchargement:', error);
      toast({
        title: 'Erreur',
        description: 'Impossible de télécharger le fichier',
        variant: 'destructive'
      });
    }
  };

  const previewFile = async (attachmentId, mimeType) => {
    try {
      const token = localStorage.getItem('token');
      const backendUrl = process.env.REACT_APP_BACKEND_URL || '';
      
      const response = await fetch(`${backendUrl}/api/chat/download/${attachmentId}?preview=true`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Erreur de prévisualisation');
      }
      
      const blob = await response.blob();
      const typedBlob = new Blob([blob], { type: mimeType || blob.type });
      const url = window.URL.createObjectURL(typedBlob);
      window.open(url, '_blank');
      setTimeout(() => window.URL.revokeObjectURL(url), 120000);
      
      setContextMenu(null);
    } catch (error) {
      console.error('Erreur prévisualisation:', error);
      toast({
        title: 'Erreur',
        description: 'Impossible de prévisualiser le fichier',
        variant: 'destructive'
      });
    }
  };

  const isPreviewable = (mimeType) => {
    if (!mimeType) return false;
    return mimeType.startsWith('image/') || mimeType === 'application/pdf' || 
           mimeType.startsWith('video/') || mimeType.startsWith('text/');
  };

  // Ouvrir modal de transfert
  const openTransferModal = async (type, attachment) => {
    setContextMenu(null);
    
    try {
      let list = [];
      
      if (type === 'workorder') {
        const response = await api.get('/work-orders');
        list = (response.data || []).map(bt => ({
          id: bt._id || bt.id,
          label: (bt.titre || bt.title || 'Sans titre').substring(0, 20) + ((bt.titre || bt.title || '').length > 20 ? '...' : ''),
          fullLabel: bt.titre || bt.title || 'Sans titre'
        }));
      } else if (type === 'improvement') {
        const response = await api.get('/improvements');
        list = (response.data || []).map(am => ({
          id: am._id || am.id,
          label: (am.titre || am.title || 'Sans titre').substring(0, 20) + ((am.titre || am.title || '').length > 20 ? '...' : ''),
          fullLabel: am.titre || am.title || 'Sans titre'
        }));
      } else if (type === 'preventive') {
        const response = await api.get('/preventive-maintenance');
        list = (response.data || []).map(mp => ({
          id: mp._id || mp.id,
          label: (mp.designation || mp.titre || 'Sans titre').substring(0, 20) + ((mp.designation || mp.titre || '').length > 20 ? '...' : ''),
          fullLabel: mp.designation || mp.titre || 'Sans titre'
        }));
      } else if (type === 'nearmiss') {
        const response = await api.get('/presqu-accident/items');
        list = (response.data || []).map(pa => ({
          id: pa.id,
          label: (pa.titre || pa.description || 'Sans titre').substring(0, 20) + ((pa.titre || pa.description || '').length > 20 ? '...' : ''),
          fullLabel: pa.titre || pa.description || 'Sans titre'
        }));
      } else if (type === 'email') {
        const response = await api.get('/users');
        list = (response.data || []).map(u => ({
          id: u.id || u._id,
          label: `${u.prenom || ''} ${u.nom || ''}`.trim() || 'Utilisateur',
          email: u.email
        }));
      }
      
      setTransferList(list);
      setShowTransferModal({ type, attachment });
      setSelectedTransferItem('');
      setSelectedEmailUsers([]);
      setEmailMessage('');
    } catch (error) {
      console.error('Erreur chargement liste:', error);
      toast({
        title: 'Erreur',
        description: `Impossible de charger la liste: ${error.response?.data?.detail || error.message}`,
        variant: 'destructive'
      });
    }
  };

  // Effectuer le transfert
  const executeTransfer = async () => {
    if (!showTransferModal) return;
    
    const { type, attachment } = showTransferModal;
    
    try {
      if (type === 'email') {
        if (selectedEmailUsers.length === 0) {
          toast({
            title: 'Erreur',
            description: 'Sélectionnez au moins un destinataire',
            variant: 'destructive'
          });
          return;
        }
        
        await api.chat.transferByEmail(attachment.id, selectedEmailUsers, emailMessage);
        toast({
          title: 'Envoyé',
          description: `Fichier envoyé par email à ${selectedEmailUsers.length} utilisateur(s)`
        });
      } else {
        if (!selectedTransferItem) {
          toast({
            title: 'Erreur',
            description: 'Sélectionnez un élément',
            variant: 'destructive'
          });
          return;
        }
        
        if (type === 'workorder') {
          await api.chat.transferToWorkOrder(attachment.id, selectedTransferItem);
          toast({
            title: 'Transféré',
            description: 'Fichier ajouté à l\'ordre de travail'
          });
        } else if (type === 'improvement') {
          await api.chat.transferToImprovement(attachment.id, selectedTransferItem);
          toast({
            title: 'Transféré',
            description: 'Fichier ajouté à l\'amélioration'
          });
        } else if (type === 'preventive') {
          await api.chat.transferToPreventive(attachment.id, selectedTransferItem);
          toast({
            title: 'Transféré',
            description: 'Fichier ajouté à la maintenance préventive'
          });
        } else if (type === 'nearmiss') {
          await api.chat.transferToNearMiss(attachment.id, selectedTransferItem);
          toast({
            title: 'Transféré',
            description: 'Fichier ajouté au presqu\'accident'
          });
        }
      }
      
      setShowTransferModal(null);
    } catch (error) {
      console.error('Erreur transfert:', error);
      toast({
        title: 'Erreur',
        description: 'Impossible de transférer le fichier',
        variant: 'destructive'
      });
    }
  };

  const toggleRecipient = (user) => {
    setSelectedRecipients(prev => {
      const exists = prev.find(r => r.id === user.id);
      if (exists) {
        return prev.filter(r => r.id !== user.id);
      } else {
        return [...prev, user];
      }
    });
  };

  const isMessageUnread = (message) => {
    // TODO: Implémenter la logique de message non lu (Phase 8)
    return false;
  };

  // Formater la taille de fichier
  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="flex h-[calc(100vh-120px)] gap-4">
      {!isOnline && (
        <div className="absolute top-0 left-0 right-0 z-50 bg-amber-50 border-b border-amber-200 text-amber-800 px-4 py-3 text-center text-sm" data-testid="chat-offline-warning">
          <div className="flex items-center justify-center gap-2">
            <AlertTriangle size={16} />
            <span>Le chat necessite une connexion internet. Les messages ne peuvent pas etre envoyes en mode hors ligne.</span>
          </div>
        </div>
      )}
      {/* Zone principale du chat */}
      <Card className="flex-1 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">💬 Chat Live</h2>
            <div className="flex items-center gap-2 mt-1">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-orange-500'}`}></div>
              <span className="text-sm text-gray-600">
                {isConnected ? 'Temps réel activé' : 'Mode REST (actualisation auto)'}
              </span>
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowUserSelector(!showUserSelector)}
            >
              <Users className="mr-2 h-4 w-4" />
              Message privé
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowConsigneModal(true)}
              className="border-orange-300 text-orange-700 hover:bg-orange-50"
              data-testid="consigne-button"
            >
              <AlertTriangle className="mr-2 h-4 w-4" />
              Consigne
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowConsigneGroupModal(true)}
              className="border-red-300 text-red-700 hover:bg-red-50"
              data-testid="consigne-group-button"
            >
              <Users className="mr-2 h-4 w-4" />
              Consigne générale
            </Button>
          </div>
        </div>

        {/* Sélection destinataires (messages privés) */}
        {selectedRecipients.length > 0 && (
          <div className="px-4 py-2 bg-gray-50 border-b flex items-center gap-2 flex-wrap">
            <Lock className="h-4 w-4 text-gray-500" />
            <span className="text-sm text-gray-600">À:</span>
            {selectedRecipients.map(recipient => (
              <Badge key={recipient.id} variant="secondary" className="gap-1">
                {recipient.name}
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => toggleRecipient(recipient)}
                />
              </Badge>
            ))}
          </div>
        )}

        {/* Zone des messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((message) => {
            const isOwnMessage = message.user_id === userId;
            const isPrivate = message.is_private;
            
            return (
              <div
                key={message.id}
                ref={(el) => (messageRefs.current[message.id] = el)}
                className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'} transition-colors duration-300`}
              >
                <div className={`max-w-[70%] ${isOwnMessage ? 'items-end' : 'items-start'} flex flex-col`}>
                  {/* Indicateur message privé */}
                  {isPrivate && (
                    <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                      <Lock className="h-3 w-3" />
                      <span>
                        {isOwnMessage 
                          ? `À: ${message.recipient_names.join(', ')}`
                          : 'Message privé'
                        }
                      </span>
                    </div>
                  )}
                  
                  <div
                    className={`rounded-lg p-3 relative ${
                      isOwnMessage
                        ? 'bg-blue-600 text-white'
                        : isPrivate
                        ? 'bg-gray-100 border border-gray-300'
                        : isMessageUnread(message)
                        ? 'bg-blue-50 border border-blue-200 font-semibold'
                        : 'bg-gray-100'
                    }`}
                    onContextMenu={(e) => handleMessageContextMenu(e, message)}
                  >
                    {/* Auteur */}
                    {!isOwnMessage && (
                      <div className="font-semibold text-sm mb-1">
                        {message.user_name} a écrit:
                      </div>
                    )}
                    
                    {/* Citation du message auquel on répond */}
                    {message.reply_to_id && message.reply_to_preview && (
                      <div 
                        className={`mb-2 pl-2 border-l-2 cursor-pointer ${
                          isOwnMessage ? 'border-blue-300' : 'border-gray-400'
                        }`}
                        onClick={() => scrollToMessage(message.reply_to_id)}
                      >
                        <div className={`text-xs italic ${isOwnMessage ? 'text-blue-100' : 'text-gray-600'}`}>
                          {message.reply_to_preview}
                        </div>
                      </div>
                    )}
                    
                    {/* Message texte */}
                    {message.message && (
                      <div className="break-words whitespace-pre-wrap">
                        {message.message}
                      </div>
                    )}
                    
                    {/* Fichiers joints */}
                    {message.attachments && message.attachments.length > 0 && (
                      <div className="mt-2 space-y-2">
                        {message.attachments.length > 0 && !message.message && !isOwnMessage && (
                          <div className="font-semibold text-sm mb-1">
                            {message.user_name} a envoyé:
                          </div>
                        )}
                        {message.attachments.map(attachment => (
                          <div
                            key={attachment.id}
                            className={`flex items-center gap-2 p-2 rounded border cursor-pointer hover:bg-opacity-80 ${
                              isOwnMessage ? 'bg-blue-500 border-blue-400' : 'bg-white border-gray-300'
                            }`}
                            onContextMenu={(e) => handleFileContextMenu(e, attachment, message.id)}
                            onClick={() => isPreviewable(attachment.mime_type) ? previewFile(attachment.id, attachment.mime_type) : downloadFile(attachment.id)}
                          >
                            <FileText className={`h-5 w-5 ${isOwnMessage ? 'text-white' : 'text-gray-600'}`} />
                            <div className="flex-1 min-w-0">
                              <div className={`text-sm font-medium truncate ${isOwnMessage ? 'text-white' : 'text-gray-900'}`}>
                                {attachment.original_filename}
                              </div>
                              <div className={`text-xs ${isOwnMessage ? 'text-blue-100' : 'text-gray-500'}`}>
                                {formatFileSize(attachment.file_size)}
                              </div>
                            </div>
                            {isPreviewable(attachment.mime_type) ? (
                              <Eye className={`h-4 w-4 ${isOwnMessage ? 'text-white' : 'text-gray-500'}`} />
                            ) : (
                              <Download className={`h-4 w-4 ${isOwnMessage ? 'text-white' : 'text-gray-500'}`} />
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {/* Timestamp */}
                    <div className={`text-xs mt-1 ${isOwnMessage ? 'text-blue-100' : 'text-gray-500'}`}>
                      {new Date(message.timestamp).toLocaleTimeString('fr-FR', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </div>

                    {/* Réactions - Superposition style Viber */}
                    {message.reactions && message.reactions.length > 0 && (
                      <div className="absolute -bottom-3 right-0 flex gap-1 flex-row-reverse">
                        {Object.entries(
                          message.reactions.reduce((acc, r) => {
                            acc[r.emoji] = acc[r.emoji] || [];
                            acc[r.emoji].push(r);
                            return acc;
                          }, {})
                        ).map(([emoji, reactions]) => {
                          return (
                            <button
                              key={emoji}
                              className="flex items-center cursor-pointer transition-all hover:scale-125"
                              title={reactions.map(r => r.user_name).join(', ')}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleReaction(message.id, emoji);
                              }}
                            >
                              <span className="text-lg">{emoji}</span>
                              <span className="text-xs font-bold text-gray-700">
                                {reactions.length}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Zone de saisie */}
        <div className="p-4 border-t">
          {/* Zone de réponse */}
          {replyingTo && (
            <div className="mb-2 bg-gray-50 border-l-4 border-blue-500 p-2 rounded flex items-start gap-2">
              <div className="flex-1">
                <div className="text-xs font-semibold text-gray-700">
                  Répondre à {replyingTo.user_name}
                </div>
                <div className="text-xs text-gray-600 italic truncate">
                  {replyingTo.message}
                </div>
              </div>
              <button
                onClick={() => setReplyingTo(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          <div className="flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileUpload}
            />
            <Button 
              variant="outline" 
              size="icon"
              title="Joindre des fichiers"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingFiles}
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Button 
              variant="outline" 
              size="icon"
              title="Prendre une photo"
              onClick={openCamera}
              disabled={uploadingFiles}
            >
              <Camera className="h-4 w-4" />
            </Button>
            <div className="flex-1">
              <Input
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Écrivez votre message..."
                className="resize-none"
              />
            </div>
            <Button onClick={sendMessage} disabled={!newMessage.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      {/* Sidebar utilisateurs en ligne */}
      <Card className="w-80 p-4">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Users className="h-5 w-5" />
          Utilisateurs en ligne ({onlineUsers.length})
        </h3>
        
        {showUserSelector && (
          <p className="text-sm text-gray-600 mb-2">
            Sélectionnez des utilisateurs pour un message privé:
          </p>
        )}
        
        <div className="space-y-2">
          {onlineUsers.map(onlineUser => {
            const isSelected = selectedRecipients.find(r => r.id === onlineUser.id);
            const isSelf = onlineUser.id === userId;
            
            return (
              <div
                key={onlineUser.id}
                className={`p-2 rounded-lg flex items-center gap-2 cursor-pointer transition-colors ${
                  isSelf
                    ? 'bg-blue-50 border border-blue-200'
                    : isSelected
                    ? 'bg-green-50 border border-green-300'
                    : showUserSelector
                    ? 'hover:bg-gray-100 border border-transparent'
                    : 'border border-transparent'
                }`}
                onClick={() => !isSelf && showUserSelector && toggleRecipient(onlineUser)}
              >
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <div className="flex-1">
                  <div className="font-medium text-sm">
                    {onlineUser.name} {isSelf && '(Vous)'}
                  </div>
                  <div className="text-xs text-gray-500">{onlineUser.role}</div>
                </div>
                {isSelected && (
                  <Badge variant="secondary" className="text-xs">
                    Sélectionné
                  </Badge>
                )}
              </div>
            );
          })}
          
          {onlineUsers.length === 0 && (
            <div className="text-center text-gray-500 py-8">
              Aucun utilisateur en ligne
            </div>
          )}
        </div>
      </Card>

      {/* Modal Caméra */}
      <Dialog open={showCameraModal} onOpenChange={(open) => !open && closeCameraModal()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>📷 Capture Photo</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {!capturedImage ? (
              <div>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  className="w-full rounded-lg bg-black"
                  style={{ maxHeight: '400px' }}
                />
                <canvas ref={canvasRef} className="hidden" />
              </div>
            ) : (
              <div>
                <img
                  src={URL.createObjectURL(capturedImage)}
                  alt="Captured"
                  className="w-full rounded-lg"
                  style={{ maxHeight: '400px' }}
                />
              </div>
            )}
          </div>
          
          <DialogFooter>
            {!capturedImage ? (
              <>
                <Button variant="outline" onClick={closeCameraModal}>
                  Annuler
                </Button>
                <Button onClick={capturePhoto}>
                  <Camera className="mr-2 h-4 w-4" />
                  Capturer
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setCapturedImage(null)}>
                  Reprendre
                </Button>
                <Button onClick={sendCapturedPhoto} disabled={uploadingFiles}>
                  <Send className="mr-2 h-4 w-4" />
                  Envoyer
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Transfert */}
      <Dialog open={showTransferModal !== null} onOpenChange={(open) => !open && setShowTransferModal(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              📤 Transférer le fichier
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="text-sm text-gray-600">
              Fichier : <span className="font-medium">{showTransferModal?.attachment?.original_filename}</span>
            </div>
            
            {showTransferModal?.type === 'email' ? (
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium mb-2 block">Destinataires :</label>
                  <div className="max-h-60 overflow-y-auto border rounded-lg p-2 space-y-1">
                    {transferList.map(user => (
                      <label key={user.id} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedEmailUsers.includes(user.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedEmailUsers(prev => [...prev, user.id]);
                            } else {
                              setSelectedEmailUsers(prev => prev.filter(id => id !== user.id));
                            }
                          }}
                          className="rounded"
                        />
                        <span className="text-sm">{user.label}</span>
                        <span className="text-xs text-gray-500">({user.email})</span>
                      </label>
                    ))}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {selectedEmailUsers.length} sélectionné(s)
                  </div>
                </div>
                
                <div>
                  <label className="text-sm font-medium mb-2 block">Message (optionnel) :</label>
                  <textarea
                    value={emailMessage}
                    onChange={(e) => setEmailMessage(e.target.value)}
                    placeholder="Ajoutez un message..."
                    className="w-full border rounded-lg p-2 text-sm"
                    rows={3}
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Sélectionnez {
                    showTransferModal?.type === 'workorder' ? 'un ordre de travail' :
                    showTransferModal?.type === 'improvement' ? 'une amélioration' :
                    showTransferModal?.type === 'nearmiss' ? 'un presqu\'accident' :
                    'une maintenance préventive'
                  } :
                </label>
                <select
                  value={selectedTransferItem}
                  onChange={(e) => setSelectedTransferItem(e.target.value)}
                  className="w-full border rounded-lg p-2"
                >
                  <option value="">-- Sélectionner --</option>
                  {transferList.map(item => (
                    <option key={item.id} value={item.id} title={item.fullLabel}>
                      {item.label}
                    </option>
                  ))}
                </select>
                {transferList.length === 0 && (
                  <div className="text-sm text-gray-500 mt-2">
                    Aucun élément disponible
                  </div>
                )}
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTransferModal(null)}>
              Annuler
            </Button>
            <Button onClick={executeTransfer}>
              <ArrowRightCircle className="mr-2 h-4 w-4" />
              Transférer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Menu contextuel messages */}
      {messageContextMenu && (
        <div
          className="fixed bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50"
          style={{ top: messageContextMenu.y, left: messageContextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full px-4 py-2 text-left hover:bg-gray-100 flex items-center gap-2"
            onClick={(e) => {
              e.stopPropagation();
              setReplyingTo({
                id: messageContextMenu.message.id,
                user_name: messageContextMenu.message.user_name,
                message: messageContextMenu.message.message
              });
              setMessageContextMenu(null);
            }}
          >
            ↩️ Répondre
          </button>

          {/* Ligne de séparation */}
          <div className="border-t border-gray-200 my-1"></div>

          {/* Emojis directement dans le menu */}
          <div className="px-3 py-2">
            <div className="text-xs text-gray-500 mb-1">Réagir :</div>
            <div className="flex gap-1 justify-center">
              {basicEmojis.map(emoji => (
                <button
                  key={emoji}
                  className="text-2xl hover:scale-125 transition-transform p-1 rounded hover:bg-gray-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleReaction(messageContextMenu.message.id, emoji);
                    setMessageContextMenu(null);
                  }}
                  title={`Réagir avec ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
          
          {canDeleteMessage(messageContextMenu.message) && (
            <>
              <div className="border-t border-gray-200 my-1"></div>
              <button
                className="w-full px-4 py-2 text-left hover:bg-gray-100 flex items-center gap-2 text-red-600"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteMessage(messageContextMenu.message.id);
                }}
              >
                <X className="h-4 w-4" />
                Supprimer
              </button>
            </>
          )}
        </div>
      )}

      {/* Emoji picker supprimé - les emojis sont maintenant directement dans le menu contextuel */}

      {/* Menu contextuel fichiers */}
      {contextMenu && (
        <div
          className="fixed bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          {isPreviewable(contextMenu.attachment.mime_type) && (
            <button
              className="w-full px-4 py-2 text-left hover:bg-gray-100 flex items-center gap-2"
              onClick={() => previewFile(contextMenu.attachment.id, contextMenu.attachment.mime_type)}
              data-testid="chat-context-preview"
            >
              <Eye className="h-4 w-4" />
              Prévisualiser
            </button>
          )}
          <button
            className="w-full px-4 py-2 text-left hover:bg-gray-100 flex items-center gap-2"
            onClick={() => downloadFile(contextMenu.attachment.id)}
            data-testid="chat-context-download"
          >
            <Download className="h-4 w-4" />
            Télécharger
          </button>
          
          {canEdit('workOrders') && (
            <button
              className="w-full px-4 py-2 text-left hover:bg-gray-100 flex items-center gap-2"
              onClick={() => openTransferModal('workorder', contextMenu.attachment)}
            >
              <ArrowRightCircle className="h-4 w-4" />
              Transférer dans un OT
            </button>
          )}
          
          {canEdit('improvements') && (
            <button
              className="w-full px-4 py-2 text-left hover:bg-gray-100 flex items-center gap-2"
              onClick={() => openTransferModal('improvement', contextMenu.attachment)}
            >
              <ArrowRightCircle className="h-4 w-4" />
              Transférer dans une amélioration
            </button>
          )}
          
          {canEdit('preventiveMaintenance') && (
            <button
              className="w-full px-4 py-2 text-left hover:bg-gray-100 flex items-center gap-2"
              onClick={() => openTransferModal('preventive', contextMenu.attachment)}
            >
              <ArrowRightCircle className="h-4 w-4" />
              Transférer dans une maintenance
            </button>
          )}
          
          {canEdit('presquaccident') && (
            <button
              className="w-full px-4 py-2 text-left hover:bg-gray-100 flex items-center gap-2"
              onClick={() => openTransferModal('nearmiss', contextMenu.attachment)}
            >
              <ArrowRightCircle className="h-4 w-4" />
              Transférer dans un presqu&apos;accident
            </button>
          )}
          
          <button
            className="w-full px-4 py-2 text-left hover:bg-gray-100 flex items-center gap-2"
            onClick={() => openTransferModal('email', contextMenu.attachment)}
          >
            <MailIcon className="h-4 w-4" />
            Transférer par email
          </button>
        </div>
      )}

      {/* Modal Consigne */}
      <Dialog open={showConsigneModal} onOpenChange={setShowConsigneModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-700">
              <AlertTriangle size={20} />
              Envoyer une consigne
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Destinataire *</label>
              <select
                value={consigneRecipient?.id || ''}
                onChange={(e) => {
                  const selected = allUsers.find(u => u.id === e.target.value);
                  setConsigneRecipient(selected || null);
                }}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                data-testid="consigne-recipient-select"
              >
                <option value="">-- Sélectionner un utilisateur --</option>
                {allUsers
                  .filter(u => u.id !== userId) // Exclure soi-même
                  .map(u => (
                    <option key={u.id} value={u.id}>
                      {u.prenom} {u.nom} ({u.role})
                      {onlineUsers.some(ou => ou.id === u.id) ? ' 🟢' : ' ⚫'}
                    </option>
                  ))
                }
              </select>
              {consigneRecipient && !onlineUsers.some(ou => ou.id === consigneRecipient.id) && (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <AlertTriangle size={12} />
                  Cet utilisateur est hors ligne. La consigne sera affichée à sa prochaine connexion.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Message de la consigne *</label>
              <textarea
                value={consigneMessage}
                onChange={(e) => setConsigneMessage(e.target.value)}
                placeholder="Écrivez votre consigne ici..."
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500 min-h-[120px] resize-none"
                data-testid="consigne-message-input"
              />
            </div>

            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm text-orange-800">
              <p className="font-medium mb-1">📢 Cette consigne sera :</p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>Affichée en popup sur l&apos;écran du destinataire</li>
                <li>Envoyée via MQTT (si configuré pour cet utilisateur)</li>
                <li>Enregistrée dans le journal d&apos;audit</li>
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowConsigneModal(false);
                setConsigneRecipient(null);
                setConsigneMessage('');
              }}
              disabled={sendingConsigne}
            >
              Annuler
            </Button>
            <Button
              onClick={sendConsigne}
              disabled={sendingConsigne || !consigneRecipient || !consigneMessage.trim()}
              className="bg-orange-600 hover:bg-orange-700"
              data-testid="send-consigne-button"
            >
              {sendingConsigne ? 'Envoi en cours...' : 'Envoyer la consigne'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Consigne Générale (par service) */}
      <Dialog open={showConsigneGroupModal} onOpenChange={(open) => !open && closeConsigneGroupModal()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <Users size={20} />
              Consigne générale
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Sélection du service */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Service destinataire *</label>
              <select
                value={consigneGroupService}
                onChange={(e) => setConsigneGroupService(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                data-testid="consigne-group-service-select"
                disabled={sendingConsigneGroup}
              >
                <option value="">-- Sélectionner un service --</option>
                <option value="ALL">📢 Tous les services</option>
                {servicesList.map(service => (
                  <option key={service} value={service}>
                    {service}
                  </option>
                ))}
              </select>
              {consigneGroupService === 'ALL' && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <AlertTriangle size={12} />
                  Cette consigne sera envoyée à TOUS les utilisateurs de l&apos;application.
                </p>
              )}
            </div>

            {/* Message */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Message de la consigne *</label>
              <textarea
                value={consigneGroupMessage}
                onChange={(e) => setConsigneGroupMessage(e.target.value)}
                placeholder="Écrivez votre consigne ici..."
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500 min-h-[120px] resize-none"
                data-testid="consigne-group-message-input"
                disabled={sendingConsigneGroup}
              />
            </div>

            {/* Info box */}
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
              <p className="font-medium mb-1">📢 Cette consigne sera :</p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>Affichée en popup sur l&apos;écran de chaque destinataire</li>
                <li>Envoyée via MQTT (si configuré pour chaque utilisateur)</li>
                <li>Enregistrée dans le journal d&apos;audit</li>
              </ul>
            </div>

            {/* Résultat après envoi */}
            {consigneGroupResult && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
                <p className="font-medium text-green-800 mb-2">✅ Consigne envoyée avec succès</p>
                <div className="grid grid-cols-2 gap-2 text-xs text-green-700">
                  <div>Total envoyés: <span className="font-bold">{consigneGroupResult.total_sent}</span></div>
                  <div>En ligne: <span className="font-bold text-green-600">{consigneGroupResult.online_count}</span></div>
                  <div>Hors ligne: <span className="font-bold text-amber-600">{consigneGroupResult.offline_count}</span></div>
                  <div>MQTT envoyés: <span className="font-bold">{consigneGroupResult.mqtt_sent_count}</span></div>
                </div>
                {consigneGroupResult.recipients && consigneGroupResult.recipients.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-green-600 hover:underline">
                      Voir les détails ({consigneGroupResult.recipients.length} destinataires)
                    </summary>
                    <div className="mt-2 max-h-32 overflow-y-auto">
                      {consigneGroupResult.recipients.map(r => (
                        <div key={r.id} className="text-xs flex items-center gap-2 py-0.5">
                          <span className={`w-2 h-2 rounded-full ${r.online ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                          <span>{r.name}</span>
                          {r.mqtt_sent && <span className="text-blue-600">📡</span>}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={closeConsigneGroupModal}
              disabled={sendingConsigneGroup}
            >
              {consigneGroupResult ? 'Fermer' : 'Annuler'}
            </Button>
            {!consigneGroupResult && (
              <Button
                onClick={sendConsigneGroup}
                disabled={sendingConsigneGroup || !consigneGroupService || !consigneGroupMessage.trim()}
                className="bg-red-600 hover:bg-red-700"
                data-testid="send-consigne-group-button"
              >
                {sendingConsigneGroup ? 'Envoi en cours...' : 'Envoyer à tous'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ChatLive;
