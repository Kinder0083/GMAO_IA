import { useEffect, useCallback } from 'react';

/**
 * Pile LIFO des gestionnaires Echap.
 * Quand plusieurs modales sont ouvertes, seul le gestionnaire du dessus est appelé.
 * Cela garantit que Echap ferme uniquement la modale la plus au-dessus.
 */
const handlerStack = [];

/** Unique listener global monté sur document */
const globalKeyHandler = (e) => {
  if (e.key !== 'Escape') return;
  if (handlerStack.length === 0) return;
  // Appeler uniquement le gestionnaire de la modale la plus haute (LIFO)
  const topHandler = handlerStack[handlerStack.length - 1];
  topHandler();
};

let listenerCount = 0;

/**
 * Hook : ferme une modale custom (div) quand l'utilisateur appuie sur Echap.
 *
 * Usage :
 *   useEscapeToClose(isOpen, onClose);
 *   useEscapeToClose(isOpen, () => setOpen(false));
 *
 * - Compatible avec les Radix/Shadcn Dialogs (qui gèrent déjà Echap nativement).
 * - Fonctionne correctement avec les modales imbriquées (LIFO stack).
 * - Nettoyage automatique lors du démontage du composant.
 *
 * @param {boolean} isOpen - Modale actuellement ouverte ou non
 * @param {Function} onClose - Callback de fermeture (sans sauvegarde)
 */
const useEscapeToClose = (isOpen, onClose) => {
  // Stabiliser la référence à onClose pour éviter les re-renders inutiles
  const stableOnClose = useCallback(() => {
    if (onClose) onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;

    // Enregistrer le listener global une seule fois
    if (listenerCount === 0) {
      document.addEventListener('keydown', globalKeyHandler);
    }
    listenerCount++;

    // Empiler ce gestionnaire
    handlerStack.push(stableOnClose);

    return () => {
      // Dépiler ce gestionnaire à la fermeture / démontage
      const idx = handlerStack.lastIndexOf(stableOnClose);
      if (idx !== -1) handlerStack.splice(idx, 1);

      listenerCount--;
      if (listenerCount === 0) {
        document.removeEventListener('keydown', globalKeyHandler);
      }
    };
  }, [isOpen, stableOnClose]);
};

export default useEscapeToClose;
