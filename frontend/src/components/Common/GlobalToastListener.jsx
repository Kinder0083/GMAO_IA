import { useEffect } from 'react';
import { useToast } from '../../hooks/use-toast';

/**
 * Composant invisible qui ecoute les evenements globaux 'show-toast'
 * et les convertit en toasts via le hook useToast.
 * Permet aux services (api.js, offlineSync) de declencher des toasts
 * sans avoir acces au contexte React.
 */
const GlobalToastListener = () => {
  const { toast } = useToast();

  useEffect(() => {
    const handleShowToast = (e) => {
      const { title, description, variant } = e.detail || {};
      toast({
        title: title || 'Notification',
        description: description || '',
        variant: variant || 'default'
      });
    };

    window.addEventListener('show-toast', handleShowToast);
    return () => window.removeEventListener('show-toast', handleShowToast);
  }, [toast]);

  return null;
};

export default GlobalToastListener;
