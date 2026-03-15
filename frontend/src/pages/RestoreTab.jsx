import React, { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { RotateCcw, Upload, AlertTriangle, CheckCircle, Database, FileArchive, FolderOpen, Shield, Wrench } from 'lucide-react';
import { useToast } from '../hooks/use-toast';
import axios from 'axios';
import { getBackendURL } from '../utils/config';
import { formatErrorMessage } from '../utils/errorFormatter';
import { modules } from './importExportModules';
import { usePreferences } from '../contexts/PreferencesContext';

const CHUNK_SIZE = 5 * 1024 * 1024; // 5 Mo par chunk

const RestoreTab = () => {
  const { toast } = useToast();
  const { loadPreferences } = usePreferences();
  const fileInputRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [restoreMode, setRestoreMode] = useState('merge');
  const [restoring, setRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState(null);
  const [confirmFull, setConfirmFull] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadPhase, setUploadPhase] = useState('');
  const [fixingIds, setFixingIds] = useState(false);
  const [fixResult, setFixResult] = useState(null);
  const [diagRunning, setDiagRunning] = useState(false);
  const [diagResult, setDiagResult] = useState(null);

  const handleDiagnostic = async () => {
    try {
      setDiagRunning(true);
      setDiagResult(null);
      const backend_url = getBackendURL();
      const token = localStorage.getItem('token');
      const response = await axios.get(`${backend_url}/api/restore/diagnostic`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDiagResult(response.data);
    } catch (error) {
      toast({
        title: 'Erreur diagnostic',
        description: formatErrorMessage(error, 'Impossible de lancer le diagnostic'),
        variant: 'destructive'
      });
    } finally {
      setDiagRunning(false);
    }
  };

  const handleFixMissingIds = async () => {
    try {
      setFixingIds(true);
      setFixResult(null);
      const backend_url = getBackendURL();
      const token = localStorage.getItem('token');
      const response = await axios.post(`${backend_url}/api/restore/fix-missing-ids`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setFixResult(response.data);
      toast({
        title: 'Correction terminee',
        description: response.data.message
      });
    } catch (error) {
      toast({
        title: 'Erreur',
        description: formatErrorMessage(error, 'Impossible de corriger les donnees'),
        variant: 'destructive'
      });
    } finally {
      setFixingIds(false);
    }
  };

  const handleFileSelect = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.zip')) {
      toast({ title: 'Format invalide', description: 'Veuillez selectionner un fichier ZIP de sauvegarde FSAO', variant: 'destructive' });
      event.target.value = '';
      return;
    }
    setSelectedFile(file);
    setRestoreResult(null);
    setConfirmFull(false);
    setUploadProgress(0);
    setUploadPhase('');
  };

  const handleRestore = async () => {
    if (!selectedFile) return;
    if (restoreMode === 'full' && !confirmFull) {
      setConfirmFull(true);
      return;
    }

    try {
      setRestoring(true);
      setConfirmFull(false);
      setUploadProgress(0);

      const backend_url = getBackendURL();
      const token = localStorage.getItem('token');
      const authHeaders = { Authorization: `Bearer ${token}` };

      const totalChunks = Math.ceil(selectedFile.size / CHUNK_SIZE);

      // Utiliser l'upload chunke pour les gros fichiers (>5 Mo) ou toujours pour eviter les limites Nginx
      if (selectedFile.size > CHUNK_SIZE) {
        // --- Upload chunke ---
        setUploadPhase('Initialisation...');

        // 1. Init
        const initForm = new FormData();
        initForm.append('filename', selectedFile.name);
        initForm.append('filesize', selectedFile.size);
        const initRes = await axios.post(`${backend_url}/api/restore/chunked/init`, initForm, { headers: authHeaders });
        const sessionId = initRes.data.session_id;

        // 2. Upload chunks
        for (let i = 0; i < totalChunks; i++) {
          const start = i * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, selectedFile.size);
          const blob = selectedFile.slice(start, end);

          const chunkForm = new FormData();
          chunkForm.append('session_id', sessionId);
          chunkForm.append('chunk_index', i);
          chunkForm.append('chunk', blob, `chunk_${i}`);

          await axios.post(`${backend_url}/api/restore/chunked/upload`, chunkForm, {
            headers: authHeaders,
            timeout: 60000
          });

          const progress = Math.round(((i + 1) / totalChunks) * 80);
          setUploadProgress(progress);
          setUploadPhase(`Envoi ${i + 1}/${totalChunks} (${Math.round(end / 1024 / 1024)} Mo / ${Math.round(selectedFile.size / 1024 / 1024)} Mo)`);
        }

        // 3. Complete - trigger restore
        setUploadPhase('Restauration en cours...');
        setUploadProgress(85);

        const completeForm = new FormData();
        completeForm.append('session_id', sessionId);
        completeForm.append('total_chunks', totalChunks);
        completeForm.append('mode', restoreMode);

        const response = await axios.post(`${backend_url}/api/restore/chunked/complete`, completeForm, {
          headers: authHeaders,
          timeout: 600000
        });

        setUploadProgress(100);
        setUploadPhase('Termine !');
        setRestoreResult(response.data.stats || response.data);
        toast({ title: 'Restauration terminee', description: response.data.message });

      } else {
        // --- Upload classique pour petits fichiers ---
        setUploadPhase('Envoi du fichier...');
        setUploadProgress(30);

        const formData = new FormData();
        formData.append('file', selectedFile);

        const response = await axios.post(
          `${backend_url}/api/restore/backup`,
          formData,
          {
            params: { mode: restoreMode },
            headers: { ...authHeaders, 'Content-Type': 'multipart/form-data' },
            timeout: 300000,
            onUploadProgress: (e) => {
              if (e.total) setUploadProgress(Math.round((e.loaded / e.total) * 80));
            }
          }
        );

        setUploadProgress(100);
        setUploadPhase('Termine !');
        setRestoreResult(response.data.stats || response.data);
        toast({ title: 'Restauration terminee', description: response.data.message });
      }

      // Recharger les préférences utilisateur pour appliquer les personnalisations restaurées
      try { await loadPreferences(); } catch (e) { /* ignore */ }

      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (error) {
      setUploadPhase('');
      toast({ title: 'Erreur', description: formatErrorMessage(error, 'Impossible de restaurer la sauvegarde'), variant: 'destructive' });
    } finally {
      setRestoring(false);
    }
  };

  const cancelRestore = () => {
    setConfirmFull(false);
  };

  return (
    <>
      <Card data-testid="restore-backup-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RotateCcw size={24} className="text-purple-600" />
            Restaurer une sauvegarde
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-600 space-y-2">
            <p className="font-medium text-gray-900">Comment utiliser cette fonctionnalite :</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Selectionnez un fichier <strong>.zip</strong> genere par les sauvegardes automatiques de FSAO Iris</li>
              <li>Le ZIP doit contenir un fichier <strong>data.xlsx</strong> (donnees) et eventuellement un dossier <strong>uploads/</strong> (fichiers joints)</li>
              <li>Les fichiers volumineux sont envoyes par morceaux pour eviter les limites de taille du serveur</li>
              <li>Choisissez le mode de restauration puis cliquez sur "Restaurer"</li>
            </ul>
          </div>

          {/* Mode de restauration */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-gray-700">Mode de restauration</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button
                type="button"
                data-testid="restore-mode-merge"
                onClick={() => { setRestoreMode('merge'); setConfirmFull(false); }}
                className={`p-4 rounded-lg border-2 text-left transition-all ${restoreMode === 'merge' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Shield size={18} className="text-blue-600" />
                  <span className="font-semibold text-gray-900">Fusionner</span>
                </div>
                <p className="text-xs text-gray-500">Ajoute les nouvelles donnees et met a jour les existantes. Les donnees actuelles sont conservees.</p>
              </button>
              <button
                type="button"
                data-testid="restore-mode-full"
                onClick={() => { setRestoreMode('full'); setConfirmFull(false); }}
                className={`p-4 rounded-lg border-2 text-left transition-all ${restoreMode === 'full' ? 'border-red-500 bg-red-50' : 'border-gray-200 hover:border-gray-300'}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle size={18} className="text-red-600" />
                  <span className="font-semibold text-gray-900">Restauration complete</span>
                </div>
                <p className="text-xs text-gray-500">Vide les collections avant d'importer. Toutes les donnees actuelles seront remplacees par le contenu du backup.</p>
              </button>
            </div>
          </div>

          {/* Selection du fichier */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Fichier de sauvegarde (.zip)</label>
            <div
              onClick={() => !restoring && fileInputRef.current?.click()}
              className={`border-2 border-dashed border-gray-300 rounded-lg p-6 text-center transition-all ${restoring ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-purple-400 hover:bg-purple-50/30'}`}
              data-testid="restore-file-dropzone"
            >
              <FileArchive size={36} className="mx-auto mb-2 text-gray-400" />
              {selectedFile ? (
                <div>
                  <p className="text-sm font-semibold text-purple-700">{selectedFile.name}</p>
                  <p className="text-xs text-gray-500 mt-1">{(selectedFile.size / 1024 / 1024).toFixed(2)} Mo</p>
                  {selectedFile.size > CHUNK_SIZE && (
                    <p className="text-xs text-blue-600 mt-1">Envoi par morceaux ({Math.ceil(selectedFile.size / CHUNK_SIZE)} parties de 5 Mo)</p>
                  )}
                </div>
              ) : (
                <div>
                  <p className="text-sm text-gray-600">Cliquez pour selectionner un fichier ZIP de backup</p>
                  <p className="text-xs text-gray-400 mt-1">backup_gmao_*.zip (aucune limite de taille)</p>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              onChange={handleFileSelect}
              className="hidden"
              data-testid="restore-file-input"
            />
          </div>

          {/* Barre de progression */}
          {restoring && (
            <div className="space-y-2" data-testid="restore-progress">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{uploadPhase}</span>
                <span className="font-semibold text-purple-700">{uploadProgress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300 bg-purple-600"
                  style={{ width: `${uploadProgress}%` }}
                  data-testid="restore-progress-bar"
                />
              </div>
            </div>
          )}

          {/* Avertissement restauration complete */}
          {restoreMode === 'full' && selectedFile && !restoring && (
            <div className="bg-red-50 border border-red-300 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle size={20} className="text-red-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-semibold text-red-800">Attention : Restauration complete</p>
                  <p className="text-red-700 mt-1">Toutes les donnees existantes dans les modules presents dans le backup seront supprimees et remplacees. Cette action est irreversible.</p>
                </div>
              </div>
            </div>
          )}

          {/* Confirmation pour mode full */}
          {confirmFull && (
            <div className="bg-red-100 border-2 border-red-400 rounded-lg p-4 space-y-3">
              <p className="text-sm font-bold text-red-800">Confirmez-vous la restauration complete ? Toutes les donnees actuelles seront ecrasees.</p>
              <div className="flex gap-3">
                <Button
                  onClick={handleRestore}
                  className="bg-red-600 hover:bg-red-700"
                  data-testid="restore-confirm-button"
                >
                  Oui, restaurer
                </Button>
                <Button variant="outline" onClick={cancelRestore} data-testid="restore-cancel-button">
                  Annuler
                </Button>
              </div>
            </div>
          )}

          {/* Bouton restaurer */}
          {!confirmFull && (
            <Button
              data-testid="restore-button"
              onClick={handleRestore}
              disabled={restoring || !selectedFile}
              className={`w-full ${restoreMode === 'full' ? 'bg-red-600 hover:bg-red-700' : 'bg-purple-600 hover:bg-purple-700'}`}
            >
              {restoring ? (
                <>
                  <RotateCcw size={20} className="mr-2 animate-spin" />
                  Restauration en cours...
                </>
              ) : (
                <>
                  <Upload size={20} className="mr-2" />
                  {restoreMode === 'full' ? 'Restaurer (ecraser les donnees)' : 'Restaurer (fusionner)'}
                </>
              )}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Outil de reparation des donnees */}
      <Card data-testid="fix-ids-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench size={24} className="text-orange-600" />
            Reparation des donnees restaurees
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 text-sm text-gray-700">
            <p><strong>Utilisez ce bouton apres avoir restaure un backup provenant d'une autre installation.</strong></p>
            <p className="mt-1">Il corrige automatiquement :</p>
            <ul className="list-disc list-inside mt-1 space-y-0.5">
              <li>Les identifiants manquants</li>
              <li>Les champs obligatoires vides (titre, description, priorite...)</li>
              <li>Les enums mal formees (priorite en minuscule, etc.)</li>
              <li>Les noms de champs alternatifs (anglais/francais)</li>
            </ul>
          </div>
          <Button
            data-testid="fix-missing-ids-button"
            onClick={handleFixMissingIds}
            disabled={fixingIds}
            variant="outline"
            className="border-orange-500 text-orange-700 hover:bg-orange-50"
          >
            {fixingIds ? (
              <>
                <RotateCcw size={18} className="mr-2 animate-spin" />
                Correction en cours...
              </>
            ) : (
              <>
                <Wrench size={18} className="mr-2" />
                Reparer les donnees restaurees
              </>
            )}
          </Button>
          {fixResult && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="font-semibold text-green-800">{fixResult.message}</p>
              {fixResult.details && Object.keys(fixResult.details).length > 0 && (
                <div className="mt-2 text-sm text-green-700 space-y-1">
                  {Object.entries(fixResult.details).map(([col, count]) => (
                    <div key={col} className="flex justify-between">
                      <span>{col}</span>
                      <span className="font-medium">{count} corrige(s)</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="border-t pt-4 mt-4">
            <p className="text-sm font-medium text-gray-700 mb-2">Diagnostic des donnees</p>
            <p className="text-xs text-gray-500 mb-3">Lance un diagnostic complet pour identifier pourquoi certaines donnees n'apparaissent pas.</p>
            <Button
              data-testid="diagnostic-button"
              onClick={handleDiagnostic}
              disabled={diagRunning}
              variant="outline"
              size="sm"
            >
              {diagRunning ? 'Analyse en cours...' : 'Lancer le diagnostic'}
            </Button>
          </div>

          {diagResult && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-4 text-sm max-h-[600px] overflow-y-auto">
              <div>
                <p className="font-semibold text-gray-900">Demandes d'Intervention (DI)</p>
                <p className="text-gray-600">Total: {diagResult.di_counts?.total || 0}, Actives: {diagResult.di_counts?.active || 0}, Supprimees: {diagResult.di_counts?.deleted || 0}</p>
              </div>
              
              {diagResult.intervention_requests_errors?.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded p-3">
                  <p className="font-semibold text-red-800 mb-1">Erreurs de validation DI ({diagResult.intervention_requests_errors.length})</p>
                  {diagResult.intervention_requests_errors.map((err, i) => (
                    <div key={i} className="text-xs text-red-700 mb-1">
                      <span className="font-medium">{err.titre}</span>: {err.error}
                    </div>
                  ))}
                </div>
              )}

              {diagResult.intervention_requests_detail?.length > 0 && (
                <div>
                  <p className="font-semibold text-gray-900 mb-1">Detail des DI ({diagResult.intervention_requests_detail.length} premieres)</p>
                  {diagResult.intervention_requests_detail.map((di, i) => (
                    <details key={i} className="mb-1">
                      <summary className={`cursor-pointer text-xs ${di._pydantic_valid ? 'text-green-700' : 'text-red-700'}`}>
                        {di._pydantic_valid ? 'OK' : 'ERREUR'} - {di.titre || di.title || 'Sans titre'} (id: {(di.id || di._id || '?').substring(0, 20)})
                      </summary>
                      <pre className="text-xs bg-white p-2 rounded mt-1 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(di, null, 2)}</pre>
                    </details>
                  ))}
                </div>
              )}

              <details>
                <summary className="cursor-pointer font-semibold text-gray-900">Collections MongoDB ({Object.keys(diagResult.all_mongodb_collections || {}).length})</summary>
                <div className="mt-1 space-y-0.5">
                  {Object.entries(diagResult.all_mongodb_collections || {}).map(([name, count]) => (
                    <div key={name} className="flex justify-between text-xs">
                      <span className="text-gray-600">{name}</span>
                      <span className={`font-medium ${count > 0 ? 'text-green-700' : 'text-gray-400'}`}>{count}</span>
                    </div>
                  ))}
                </div>
              </details>

              <details>
                <summary className="cursor-pointer font-semibold text-gray-900">Collections sauvegardees ({Object.keys(diagResult.collections_in_export_modules || {}).length})</summary>
                <div className="mt-1 space-y-0.5">
                  {Object.entries(diagResult.collections_in_export_modules || {}).map(([name, count]) => (
                    <div key={name} className="flex justify-between text-xs">
                      <span className="text-gray-600">{name}</span>
                      <span className={`font-medium ${count > 0 ? 'text-green-700' : 'text-gray-400'}`}>{count}</span>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Resultat de la restauration */}
      {restoreResult && (
        <Card data-testid="restore-result-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle size={20} className="text-green-600" />
              Resultat de la restauration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg">
                <Database size={24} className="text-blue-600" />
                <div><p className="text-sm text-gray-600">Total</p><p className="text-2xl font-bold text-blue-600">{restoreResult.total}</p></div>
              </div>
              <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg">
                <CheckCircle size={24} className="text-green-600" />
                <div><p className="text-sm text-gray-600">Inseres</p><p className="text-2xl font-bold text-green-600">{restoreResult.inserted}</p></div>
              </div>
              <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-lg">
                <RotateCcw size={24} className="text-amber-600" />
                <div><p className="text-sm text-gray-600">Mis a jour</p><p className="text-2xl font-bold text-amber-600">{restoreResult.updated}</p></div>
              </div>
              <div className="flex items-center gap-3 p-4 bg-purple-50 rounded-lg">
                <FolderOpen size={24} className="text-purple-600" />
                <div><p className="text-sm text-gray-600">Fichiers</p><p className="text-2xl font-bold text-purple-600">{restoreResult.restored_files || 0}</p></div>
              </div>
            </div>

            {restoreResult.collections_cleared > 0 && (
              <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-800">
                {restoreResult.collections_cleared} collection(s) videe(s) avant import (mode restauration complete)
              </div>
            )}

            {restoreResult.modules && Object.keys(restoreResult.modules).length > 0 && (
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Details par module</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Object.entries(restoreResult.modules).map(([moduleName, moduleStats]) => (
                    <div key={moduleName} className="border rounded-lg p-4">
                      <h4 className="font-medium text-sm mb-2 capitalize">
                        {modules.find(m => m.value === moduleName)?.label || moduleName}
                      </h4>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between"><span className="text-gray-600">Total:</span><span className="font-medium">{moduleStats.total}</span></div>
                        <div className="flex justify-between"><span className="text-green-600">Inseres:</span><span className="font-medium text-green-600">{moduleStats.inserted}</span></div>
                        <div className="flex justify-between"><span className="text-amber-600">Mis a jour:</span><span className="font-medium text-amber-600">{moduleStats.updated}</span></div>
                        {moduleStats.skipped > 0 && (
                          <div className="flex justify-between"><span className="text-red-600">Ignores:</span><span className="font-medium text-red-600">{moduleStats.skipped}</span></div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {restoreResult.errors && restoreResult.errors.length > 0 && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <h3 className="font-semibold text-red-800 mb-2">Erreurs ({restoreResult.errors.length})</h3>
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {restoreResult.errors.slice(0, 10).map((error, idx) => (
                    <p key={idx} className="text-sm text-red-700">{error}</p>
                  ))}
                  {restoreResult.errors.length > 10 && (
                    <p className="text-sm text-red-600 font-medium mt-2">... et {restoreResult.errors.length - 10} autres erreurs</p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
};

export default RestoreTab;
