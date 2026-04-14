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
   */
  const hasPermission = useCallback((module, permissionType) => {
    if (userRole === 'ADMIN') return true;
    if (!permissions || !permissions[module]) return false;
    return permissions[module][permissionType] === true;
  }, [userRole, permissions]);

  const canView = useCallback((module) => hasPermission(module, 'view'), [hasPermission]);
  const canEdit = useCallback((module) => hasPermission(module, 'edit'), [hasPermission]);
  const canDelete = useCallback((module) => hasPermission(module, 'delete'), [hasPermission]);

  /**
   * Vérifie si l'utilisateur est administrateur global
   */
  const isAdmin = useCallback(() => userRole === 'ADMIN', [userRole]);

  /**
   * Vérifie si l'utilisateur a des droits administrateur sur un module spécifique.
   * Retourne true si :
   *  - l'utilisateur est administrateur global, OU
   *  - l'utilisateur a le droit "edit" activé sur ce module
   * Cela permet aux utilisateurs avec permissions spécifiques d'avoir
   * les mêmes droits qu'un admin sur la page concernée.
   */
  const isAdminForModule = useCallback((module) => {
    if (userRole === 'ADMIN') return true;
    if (!module || !permissions || !permissions[module]) return false;
    return permissions[module].edit === true;
  }, [userRole, permissions]);

  return {
    permissions,
    userRole,
    hasPermission,
    canView,
    canEdit,
    canDelete,
    isAdmin,
    isAdminForModule,
  };
};
