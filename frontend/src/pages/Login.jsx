import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { PasswordInput } from '../components/ui/password-input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { useToast } from '../hooks/use-toast';
import { authAPI } from '../services/api';
import ForgotPasswordDialog from '../components/Common/ForgotPasswordDialog';
import axios from 'axios';
import { BACKEND_URL } from '../utils/config';
import { formatErrorMessage } from '../utils/errorFormatter';

const Login = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [version, setVersion] = useState('');

  useEffect(() => {
    // Récupérer la version depuis l'API (sans authentification pour la page de login)
    const fetchVersion = async () => {
      try {
        // Récupérer la version depuis le backend
        const response = await axios.get(`${BACKEND_URL}/api/version`, { timeout: 3000 });
        if (response.data && response.data.version) {
          setVersion(response.data.version);
        }
      } catch (error) {
        // En cas d'erreur, ne pas afficher de version
        setVersion('');
      }
    };
    fetchVersion();
  }, []);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await authAPI.login(formData);
      const { access_token, user } = response.data;
      
      localStorage.setItem('token', access_token);
      localStorage.setItem('user', JSON.stringify(user));
      
      toast({
        title: 'Connexion réussie',
        description: `Bienvenue ${user?.prenom || ''} ${user?.nom || ''}`.trim()
      });
      
      // Récupérer les préférences utilisateur pour la page d'accueil
      try {
        const prefsResponse = await axios.get(`${BACKEND_URL}/api/user-preferences`, {
          headers: { Authorization: `Bearer ${access_token}` }
        });
        
        const defaultHomePage = prefsResponse.data?.default_home_page || '/dashboard';
        navigate(defaultHomePage);
      } catch (prefsError) {
        // Si erreur de récupération des préférences, aller au dashboard par défaut
        console.error('Erreur récupération préférences:', prefsError);
        navigate('/dashboard');
      }
    } catch (error) {
      toast({
        title: 'Erreur',
        description: formatErrorMessage(error, 'Email ou mot de passe incorrect'),
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-blue-50">
      <div className="w-full max-w-md p-6">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-6">
            <img 
              src="/logo-iris.png" 
              alt="FSAO Iris" 
              className="w-60 h-60 object-contain"
            />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">FSAO Iris</h1>
          <p className="text-gray-600 mb-6">Fonctionnement des Services Assistée par Ordinateur</p>
          <p className="text-sm text-gray-500 mb-1">Concepteur: Grèg</p>
          {version && <p className="text-sm text-gray-500 mb-6">Version {version}</p>}
        </div>

        <Card className="shadow-xl border-0">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold text-center">Connexion</CardTitle>
            <CardDescription className="text-center">
              Entrez vos identifiants pour accéder à votre compte
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="votre.email@exemple.com"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Mot de passe</Label>
                <PasswordInput
                  id="password"
                  name="password"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={handleChange}
                  required
                  className="h-11"
                />
              </div>

              <Button
                type="submit"
                className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-medium"
                disabled={loading}
              >
                {loading ? 'Connexion...' : 'Se connecter'}
              </Button>
            </form>
            
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => setShowForgotPassword(true)}
                className="text-sm text-blue-600 hover:text-blue-700 underline"
              >
                Mot de passe oublié ?
              </button>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-gray-500 mt-6">
          © 2025 FSAO Iris - Tous droits réservés
        </p>
      </div>
      
      <ForgotPasswordDialog
        open={showForgotPassword}
        onClose={() => setShowForgotPassword(false)}
      />
    </div>
  );
};

export default Login;