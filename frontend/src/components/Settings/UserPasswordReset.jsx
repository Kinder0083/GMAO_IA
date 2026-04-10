import React, { useState, useEffect } from 'react';
import { 
  UsersIcon, 
  Key, 
  RefreshCw, 
  Eye, 
  EyeOff, 
  AlertTriangle,
  CheckCircle,
  Clock
} from 'lucide-react';
import { usersAPI } from '../../services/api';
import { useToast } from '../../hooks/use-toast';
import { useConfirmDialog } from '../../components/ui/confirm-dialog';
import { formatErrorMessage } from '../../utils/errorFormatter';

const UserPasswordReset = () => {
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(null);
  const [tempPassword, setTempPassword] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const response = await usersAPI.getActive();
      setUsers(response.data);
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Impossible de charger la liste des utilisateurs',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (userId, userName) => {
    confirm({
      title: 'Réinitialiser le mot de passe',
      description: `Êtes-vous sûr de vouloir réinitialiser le mot de passe de ${userName} ?\n\nUn nouveau mot de passe temporaire sera généré.`,
      confirmText: 'Réinitialiser',
      cancelText: 'Annuler',
      variant: 'default',
      onConfirm: async () => {
        try {
          setResetting(userId);
          const response = await usersAPI.resetPasswordByAdmin(userId);
          
          setTempPassword({
            userId,
            userName,
            password: response.data.tempPassword
          });

          toast({
            title: 'Mot de passe réinitialisé',
            description: `Un nouveau mot de passe temporaire a été généré pour ${userName}`,
          });

          loadUsers();
        } catch (error) {
          toast({
            title: 'Erreur',
            description: formatErrorMessage(error, 'Impossible de réinitialiser le mot de passe'),
            variant: 'destructive'
          });
        } finally {
          setResetting(null);
        }
      }
    });
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copié',
      description: 'Mot de passe copié dans le presse-papiers',
    });
  };

  return (
    <>
      <ConfirmDialog />
      
      {/* Popup de mot de passe temporaire */}
      {tempPassword && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-green-100 p-3 rounded-full">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Mot de passe réinitialisé</h3>
                <p className="text-sm text-gray-600">{tempPassword.userName}</p>
              </div>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
              <div className="flex items-start gap-2 mb-3">
                <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-yellow-800">
                  <p className="font-semibold mb-1">Important :</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Ce mot de passe ne sera affiché qu'UNE SEULE FOIS</li>
                    <li>Notez-le et communiquez-le à l'utilisateur de manière sécurisée</li>
                    <li>L'utilisateur devra le changer à sa prochaine connexion</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="bg-gray-100 rounded-lg p-4 mb-4">
              <label className="text-xs font-medium text-gray-500 mb-2 block">Nouveau mot de passe temporaire</label>
              <div className="flex items-center gap-2">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={tempPassword.password}
                  readOnly
                  className="flex-1 bg-white border rounded px-3 py-2 font-mono text-lg"
                />
                <button
                  onClick={() => setShowPassword(!showPassword)}
                  className="p-2 hover:bg-gray-200 rounded"
                  title={showPassword ? 'Masquer' : 'Afficher'}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
                <button
                  onClick={() => copyToClipboard(tempPassword.password)}
                  className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium"
                >
                  Copier
                </button>
              </div>
            </div>

            <button
              onClick={() => {
                setTempPassword(null);
                setShowPassword(false);
              }}
              className="w-full py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
            >
              J'ai noté ce mot de passe
            </button>
          </div>
        </div>
      )}

      {/* Section Gestion des utilisateurs */}
      <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
        <div className="flex items-center gap-3 mb-6">
          <UsersIcon className="h-6 w-6 text-blue-600" />
          <div>
            <h2 className="text-xl font-semibold">Gestion des mots de passe</h2>
            <p className="text-sm text-gray-600">Réinitialisez les mots de passe des utilisateurs en cas de perte</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-gray-400 mr-2" />
            <span className="text-gray-500">Chargement des utilisateurs...</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Utilisateur</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Email</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Rôle</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Statut</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr key={user.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <div className="font-medium">{user.prenom} {user.nom}</div>
                    </td>
                    <td className="py-3 px-4 text-gray-600">{user.email}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        user.role === 'ADMIN' ? 'bg-red-100 text-red-700' :
                        user.role === 'TECHNICIEN' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {user.firstLogin ? (
                        <span className="flex items-center gap-1 text-orange-600 text-sm">
                          <Clock className="h-4 w-4" />
                          Mot de passe temporaire
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-green-600 text-sm">
                          <CheckCircle className="h-4 w-4" />
                          Actif
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleResetPassword(user.id, `${user.prenom} ${user.nom}`)}
                        disabled={resetting === user.id}
                        className="inline-flex items-center gap-2 px-3 py-1.5 bg-orange-100 text-orange-700 rounded hover:bg-orange-200 transition-colors disabled:opacity-50"
                      >
                        {resetting === user.id ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <Key className="h-4 w-4" />
                        )}
                        Réinitialiser
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
};

export default UserPasswordReset;
