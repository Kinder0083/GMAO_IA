import React, { useState, useEffect } from 'react';
import { 
  Mail, 
  RefreshCw, 
  Save, 
  Eye, 
  EyeOff, 
  Globe, 
  AlertCircle, 
  CheckCircle 
} from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../../hooks/use-toast';
import { formatErrorMessage } from '../../utils/errorFormatter';

const SmtpSettings = () => {
  const [smtpConfig, setSmtpConfig] = useState({
    smtp_host: '',
    smtp_port: 587,
    smtp_user: '',
    smtp_password: '',
    smtp_from_email: '',
    smtp_from_name: 'FSAO Iris',
    smtp_use_tls: true,
    frontend_url: '',
    backend_url: ''
  });
  const [loadingSmtp, setLoadingSmtp] = useState(true);
  const [savingSmtp, setSavingSmtp] = useState(false);
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [showSmtpPassword, setShowSmtpPassword] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadSmtpConfig();
  }, []);

  const loadSmtpConfig = async () => {
    try {
      setLoadingSmtp(true);
      const response = await api.get('/smtp/config');
      setSmtpConfig(response.data);
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      if (user.email) {
        setTestEmail(user.email);
      }
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Impossible de charger la configuration SMTP',
        variant: 'destructive'
      });
    } finally {
      setLoadingSmtp(false);
    }
  };

  const handleSaveSmtpConfig = async () => {
    try {
      setSavingSmtp(true);
      await api.put('/smtp/config', smtpConfig);
      
      toast({
        title: 'Configuration sauvegardée',
        description: 'La configuration SMTP a été mise à jour avec succès',
      });
    } catch (error) {
      toast({
        title: 'Erreur',
        description: formatErrorMessage(error, 'Impossible de sauvegarder la configuration SMTP'),
        variant: 'destructive'
      });
    } finally {
      setSavingSmtp(false);
    }
  };

  const handleTestSmtp = async () => {
    if (!testEmail || !testEmail.includes('@')) {
      toast({
        title: 'Email invalide',
        description: 'Veuillez entrer une adresse email valide',
        variant: 'destructive'
      });
      return;
    }

    try {
      setTestingSmtp(true);
      const response = await api.post('/smtp/test', {
        test_email: testEmail
      });
      
      if (response.data.success) {
        toast({
          title: 'Test réussi',
          description: `Email de test envoyé avec succès à ${testEmail}`,
        });
      } else {
        toast({
          title: 'Test échoué',
          description: response.data.message || 'L\'envoi de l\'email de test a échoué',
          variant: 'destructive'
        });
      }
    } catch (error) {
      toast({
        title: 'Erreur',
        description: formatErrorMessage(error, 'Erreur lors du test SMTP'),
        variant: 'destructive'
      });
    } finally {
      setTestingSmtp(false);
    }
  };

  return (
    <div className="mt-6 bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-gray-600" />
          <h2 className="text-lg font-semibold text-gray-900">Configuration SMTP (Email)</h2>
        </div>
        <p className="text-sm text-gray-600 mt-1">
          Configurer les paramètres d'envoi d'emails pour les notifications et alertes
        </p>
      </div>

      <div className="p-6">
        {loadingSmtp ? (
          <div className="text-center py-8">
            <RefreshCw className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-2" />
            <p className="text-gray-600">Chargement de la configuration SMTP...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Info Box */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <Mail className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-800">
                  <p className="font-semibold mb-1">Configuration recommandée pour Gmail :</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Serveur SMTP : smtp.gmail.com</li>
                    <li>Port : 587 (TLS activé)</li>
                    <li>Utiliser un "Mot de passe d'application" (pas votre mot de passe Gmail principal)</li>
                    <li><a href="https://support.google.com/accounts/answer/185833" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-900">Comment créer un mot de passe d'application Gmail</a></li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Formulaire de configuration */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Serveur SMTP */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Serveur SMTP <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={smtpConfig.smtp_host}
                  onChange={(e) => setSmtpConfig({...smtpConfig, smtp_host: e.target.value})}
                  placeholder="smtp.gmail.com"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Port */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Port SMTP <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={smtpConfig.smtp_port}
                  onChange={(e) => setSmtpConfig({...smtpConfig, smtp_port: parseInt(e.target.value)})}
                  placeholder="587"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Utilisateur / Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nom d'utilisateur / Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={smtpConfig.smtp_user}
                  onChange={(e) => setSmtpConfig({...smtpConfig, smtp_user: e.target.value})}
                  placeholder="votre-email@gmail.com"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Mot de passe */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Mot de passe <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showSmtpPassword ? "text" : "password"}
                    value={smtpConfig.smtp_password}
                    onChange={(e) => setSmtpConfig({...smtpConfig, smtp_password: e.target.value})}
                    placeholder="Mot de passe d'application"
                    className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSmtpPassword(!showSmtpPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  >
                    {showSmtpPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              {/* Email expéditeur */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email expéditeur <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={smtpConfig.smtp_from_email}
                  onChange={(e) => setSmtpConfig({...smtpConfig, smtp_from_email: e.target.value})}
                  placeholder="noreply@votre-entreprise.com"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Nom expéditeur */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nom expéditeur
                </label>
                <input
                  type="text"
                  value={smtpConfig.smtp_from_name}
                  onChange={(e) => setSmtpConfig({...smtpConfig, smtp_from_name: e.target.value})}
                  placeholder="FSAO Iris"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Section Adresses IP / URLs */}
            <div className="mt-6 pt-6 border-t border-gray-200">
              <h3 className="text-md font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Globe className="h-5 w-5 text-gray-600" />
                Configuration des URLs de l'application
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Ces URLs sont utilisées pour les liens dans les emails et la sécurité CORS
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* URL Frontend */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    URL Frontend (Interface utilisateur) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="url"
                    value={smtpConfig.frontend_url}
                    onChange={(e) => setSmtpConfig({...smtpConfig, frontend_url: e.target.value})}
                    placeholder="https://votre-domaine.com"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Exemple : https://date-sort-demo.preview.emergentagent.com
                  </p>
                </div>

                {/* URL Backend */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    URL Backend (API) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="url"
                    value={smtpConfig.backend_url}
                    onChange={(e) => setSmtpConfig({...smtpConfig, backend_url: e.target.value})}
                    placeholder="https://votre-domaine.com"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Exemple : https://date-sort-demo.preview.emergentagent.com
                  </p>
                </div>
              </div>

              <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-amber-800">
                    <p className="font-semibold mb-1">⚠️ Important :</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>Ces URLs doivent correspondre au domaine ou à l'adresse IP de votre serveur</li>
                      <li>Modifiez ces paramètres seulement si vous avez changé de domaine ou d'IP</li>
                      <li>Un redémarrage de l'application peut être nécessaire après modification</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {/* Utiliser TLS */}
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="smtp_use_tls"
                checked={smtpConfig.smtp_use_tls}
                onChange={(e) => setSmtpConfig({...smtpConfig, smtp_use_tls: e.target.checked})}
                className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="smtp_use_tls" className="text-sm font-medium text-gray-700">
                Utiliser TLS/STARTTLS (recommandé)
              </label>
            </div>

            {/* Bouton Sauvegarder */}
            <div className="flex items-center gap-4 pt-4 border-t border-gray-200">
              <button
                onClick={handleSaveSmtpConfig}
                disabled={savingSmtp}
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {savingSmtp ? (
                  <>
                    <RefreshCw className="h-5 w-5 animate-spin" />
                    <span>Sauvegarde...</span>
                  </>
                ) : (
                  <>
                    <Save className="h-5 w-5" />
                    <span>Sauvegarder la configuration</span>
                  </>
                )}
              </button>
            </div>

            {/* Section Test */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mt-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                Tester la configuration
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Envoyez un email de test pour vérifier que la configuration fonctionne correctement
              </p>
              <div className="flex items-end gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Adresse email de test
                  </label>
                  <input
                    type="email"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    placeholder="votre-email@example.com"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
                <button
                  onClick={handleTestSmtp}
                  disabled={testingSmtp || !testEmail}
                  className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {testingSmtp ? (
                    <>
                      <RefreshCw className="h-5 w-5 animate-spin" />
                      <span>Envoi...</span>
                    </>
                  ) : (
                    <>
                      <Mail className="h-5 w-5" />
                      <span>Envoyer un test</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SmtpSettings;
