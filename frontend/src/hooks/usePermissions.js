import { useState, useEffect, useCallback } from 'react';

/**
 * Hook personnalisé pour gérer les permissions de l'utilisateur connecté
 * IMPORTANT : toutes les fonctions retournées sont stabilisées via useCallback
 * pour éviter les re-renders infinis dans les composants qui les utilisent
 * comme dépendances de useEffect/useMemo/useCallback.
 */
export const usePermissions = () => {
  const [permissions, setPermissions] = useState(null);
  const [userRole, setUserRole] = useState(null);

  useEffect(() => {
    // Récupérer les informations de l'utilisateur depuis localStorage
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        setPermissions(user.permissions || {});
        setUserRole(user.role);
      } catch (error) {
        console.error('Erreur lors de la lecture des permissions:', error);
      }
    }
  }, []);

  /**
   * Vérifie si l'utilisateur a une permission spécifique
   * Stabilisé avec useCallback pour éviter les re-renders inutiles
   */
  const hasPermission = useCallback((module, permissionType) => {
    // Les admins ont toujours toutes les permissions
    if (userRole === 'ADMIN') {
      return true;
    }

    if (!permissions || !permissions[module]) {
      return false;
    }

    return permissions[module][permissionType] === true;
  }, [userRole, permissions]);

  /**
   * Vérifie si l'utilisateur peut voir un module
   */
  const canView = useCallback((module) => hasPermission(module, 'view'), [hasPermission]);

  /**
   * Vérifie si l'utilisateur peut modifier un module
   */
  const canEdit = useCallback((module) => hasPermission(module, 'edit'), [hasPermission]);

  /**
   * Vérifie si l'utilisateur peut supprimer dans un module
   */
  const canDelete = useCallback((module) => hasPermission(module, 'delete'), [hasPermission]);

  /**
   * Vérifie si l'utilisateur est admin
   * Stabilisé avec useCallback — ne change que quand userRole change
   */
  const isAdmin = useCallback(() => userRole === 'ADMIN', [userRole]);

  return {
    permissions,
    userRole,
    hasPermission,
    canView,
    canEdit,
    canDelete,
    isAdmin
  };
};
