import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { HardDrive, ExternalLink, Save, CheckCircle2, XCircle, Eye, EyeOff, Info, Copy, Check } from 'lucide-react';
import api from '../services/api';
import { useToast } from '../hooks/use-toast';

const GoogleDriveConfigTab = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [copied, setCopied] = useState(false);
  const [config, setConfig] = useState({
    configured: false,
    client_id_preview: '',
    client_secret_set: false,
    redirect_uri: '',
  });
  const [form, setForm] = useState({
    google_client_id: '',
    google_client_secret: '',
    google_drive_redirect_uri: '',
  });

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const res = await api.get('/backup/drive/config');
      setConfig(res.data);
      if (res.data.redirect_uri) {
        setForm(f => ({ ...f, google_drive_redirect_uri: res.data.redirect_uri }));
      } else {
        const defaultUri = `${window.location.origin}/api/backup/drive/callback`;
        setForm(f => ({ ...f, google_drive_redirect_uri: defaultUri }));
      }
    } catch {
      const defaultUri = `${window.location.origin}/api/backup/drive/callback`;
      setForm(f => ({ ...f, google_drive_redirect_uri: defaultUri }));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!form.google_client_id || !form.google_client_secret || !form.google_drive_redirect_uri) {
      toast({ title: 'Champs requis', description: 'Veuillez remplir les 3 champs', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await api.post('/backup/drive/config', form);
      toast({ title: 'Configuration sauvegardee', description: 'Vous pouvez maintenant connecter Google Drive depuis l\'onglet Sauvegardes.' });
      await loadConfig();
      setForm(f => ({ ...f, google_client_id: '', google_client_secret: '' }));
    } catch (err) {
      toast({ title: 'Erreur', description: err.response?.data?.detail || 'Erreur de sauvegarde', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleCopyUri = () => {
    navigator.clipboard.writeText(form.google_drive_redirect_uri);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) return <div className="text-center py-8 text-gray-500">Chargement...</div>;

  return (
    <div className="space-y-6">
      {/* Status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            Statut Google Drive
          </CardTitle>
        </CardHeader>
        <CardContent>
          {config.configured ? (
            <div className="flex items-center gap-2 text-green-700 bg-green-50 p-3 rounded-lg" data-testid="drive-status-ok">
              <CheckCircle2 className="h-5 w-5" />
              <div>
                <p className="font-medium">Google Drive est configure</p>
                <p className="text-sm text-green-600">Client ID : {config.client_id_preview}</p>
                <p className="text-sm text-green-600">URI de redirection : {config.redirect_uri}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-amber-700 bg-amber-50 p-3 rounded-lg" data-testid="drive-status-missing">
              <XCircle className="h-5 w-5" />
              <div>
                <p className="font-medium">Google Drive n'est pas configure</p>
                <p className="text-sm text-amber-600">Suivez le tutoriel ci-dessous pour configurer l'acces.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tutoriel */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Info className="h-5 w-5 text-blue-600" />
            Comment configurer Google Drive
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ol className="list-decimal list-inside space-y-3 text-sm text-gray-700">
            <li>
              Rendez-vous sur la{' '}
              <a
                href="https://console.cloud.google.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline font-medium inline-flex items-center gap-1"
                data-testid="google-console-link"
              >
                Google Cloud Console <ExternalLink className="h-3 w-3" />
              </a>
            </li>
            <li>Creez un projet ou selectionnez un projet existant</li>
            <li>
              Allez dans <strong>APIs & Services &rarr; Bibliotheque</strong> et activez <strong>Google Drive API</strong>
            </li>
            <li>
              Allez dans <strong>APIs & Services &rarr; Identifiants &rarr; Creer des identifiants &rarr; ID client OAuth 2.0</strong>
            </li>
            <li>
              Selectionnez le type <strong>Application Web</strong>
            </li>
            <li>
              Dans <strong>URI de redirection autorises</strong>, ajoutez l'URI ci-dessous :
              <div className="mt-1 flex items-center gap-2">
                <code className="bg-gray-100 px-3 py-1.5 rounded text-xs font-mono flex-1 break-all">
                  {form.google_drive_redirect_uri}
                </code>
                <Button variant="outline" size="sm" onClick={handleCopyUri} data-testid="copy-uri-btn">
                  {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </li>
            <li>
              Copiez le <strong>Client ID</strong> et le <strong>Client Secret</strong> generes, puis collez-les dans le formulaire ci-dessous
            </li>
          </ol>
        </CardContent>
      </Card>

      {/* Formulaire */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Save className="h-5 w-5 text-gray-700" />
            Identifiants Google Drive
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="client_id">Client ID</Label>
            <Input
              id="client_id"
              placeholder="123456789-xxxxxxxx.apps.googleusercontent.com"
              value={form.google_client_id}
              onChange={e => setForm(f => ({ ...f, google_client_id: e.target.value }))}
              data-testid="drive-client-id"
            />
            {config.client_id_set && !form.google_client_id && (
              <p className="text-xs text-gray-500">Deja configure : {config.client_id_preview} - Laissez vide pour ne pas modifier</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="client_secret">Client Secret</Label>
            <div className="relative">
              <Input
                id="client_secret"
                type={showSecret ? 'text' : 'password'}
                placeholder="GOCSPX-xxxxxxxxxxxxxxxxxxxxxxx"
                value={form.google_client_secret}
                onChange={e => setForm(f => ({ ...f, google_client_secret: e.target.value }))}
                data-testid="drive-client-secret"
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {config.client_secret_set && !form.google_client_secret && (
              <p className="text-xs text-gray-500">Deja configure - Laissez vide pour ne pas modifier</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="redirect_uri">URI de redirection</Label>
            <Input
              id="redirect_uri"
              placeholder="http://votre-ip/api/backup/drive/callback"
              value={form.google_drive_redirect_uri}
              onChange={e => setForm(f => ({ ...f, google_drive_redirect_uri: e.target.value }))}
              data-testid="drive-redirect-uri"
            />
            <p className="text-xs text-gray-500">
              Doit correspondre exactement a l'URI de redirection configuree dans Google Cloud Console.
            </p>
          </div>

          <Button
            onClick={handleSave}
            disabled={saving || (!form.google_client_id && !form.google_client_secret && config.configured)}
            className="w-full sm:w-auto"
            data-testid="save-drive-config-btn"
          >
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Sauvegarde en cours...' : 'Sauvegarder la configuration'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default GoogleDriveConfigTab;
