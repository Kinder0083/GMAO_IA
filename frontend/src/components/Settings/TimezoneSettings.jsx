import React, { useState, useEffect, useMemo } from 'react';
import { 
  Clock, 
  Server, 
  RefreshCw, 
  Save, 
  Globe, 
  AlertCircle, 
  CheckCircle, 
  Search,
  Sun,
  Snowflake,
  Calendar
} from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../../hooks/use-toast';
import { formatErrorMessage } from '../../utils/errorFormatter';

const TimezoneSettings = () => {
  const [timezoneConfig, setTimezoneConfig] = useState({
    timezone_offset: 1,
    timezone_name: 'Europe/Paris',
    ntp_server: 'pool.ntp.org'
  });
  const [loadingTimezone, setLoadingTimezone] = useState(true);
  const [savingTimezone, setSavingTimezone] = useState(false);
  const [testingNtp, setTestingNtp] = useState(false);
  const [ntpTestResult, setNtpTestResult] = useState(null);
  const [availableTimezones, setAvailableTimezones] = useState([]);
  const [availableNtpServers, setAvailableNtpServers] = useState([]);
  const [customNtpServer, setCustomNtpServer] = useState('');
  const [timezoneSearchQuery, setTimezoneSearchQuery] = useState('');
  const [currentServerTime, setCurrentServerTime] = useState(null);
  const { toast } = useToast();

  useEffect(() => {
    loadTimezoneConfig();
  }, []);

  // Actualiser l'heure du serveur toutes les 30 secondes
  useEffect(() => {
    if (!currentServerTime) return;
    
    const interval = setInterval(async () => {
      try {
        const timeResponse = await api.timezone.getCurrentTime();
        setCurrentServerTime(timeResponse.data);
      } catch (error) {
        // Silencieux
      }
    }, 30000);
    
    return () => clearInterval(interval);
  }, [currentServerTime]);

  const loadTimezoneConfig = async () => {
    try {
      setLoadingTimezone(true);
      
      const configResponse = await api.timezone.getConfig();
      setTimezoneConfig(configResponse.data);
      
      const timezonesResponse = await api.timezone.getTimezones();
      setAvailableTimezones(timezonesResponse.data);
      
      const ntpServersResponse = await api.timezone.getNtpServers();
      setAvailableNtpServers(ntpServersResponse.data);
      
      const timeResponse = await api.timezone.getCurrentTime();
      setCurrentServerTime(timeResponse.data);
      
    } catch (error) {
      console.error('Erreur chargement config timezone:', error);
    } finally {
      setLoadingTimezone(false);
    }
  };

  const handleSaveTimezoneConfig = async () => {
    try {
      setSavingTimezone(true);
      
      // On envoie le nom IANA — l'offset est désormais calculé côté serveur (DST-aware)
      await api.timezone.updateConfig({
        timezone_name: timezoneConfig.timezone_name,
        ntp_server: timezoneConfig.ntp_server,
      });
      
      toast({
        title: 'Configuration sauvegardée',
        description: 'Le fuseau horaire a été mis à jour. Le passage heure d\'été/hiver sera automatique.'
      });
      
      // Recharger pour récupérer l'offset à jour
      const configResponse = await api.timezone.getConfig();
      setTimezoneConfig(configResponse.data);
      const timeResponse = await api.timezone.getCurrentTime();
      setCurrentServerTime(timeResponse.data);
      
    } catch (error) {
      toast({
        title: 'Erreur',
        description: formatErrorMessage(error, 'Impossible de sauvegarder la configuration'),
        variant: 'destructive'
      });
    } finally {
      setSavingTimezone(false);
    }
  };

  const handleTestNtp = async (serverToTest) => {
    const server = serverToTest || customNtpServer || timezoneConfig.ntp_server;
    
    if (!server || !server.trim()) {
      toast({
        title: 'Erreur',
        description: 'Veuillez spécifier un serveur NTP à tester',
        variant: 'destructive'
      });
      return;
    }

    try {
      setTestingNtp(true);
      setNtpTestResult(null);
      
      const response = await api.timezone.testNtp(server.trim());
      setNtpTestResult(response.data);
      
      if (response.data.success) {
        toast({
          title: 'Test réussi',
          description: `Connexion au serveur ${server} réussie`
        });
      } else {
        toast({
          title: 'Test échoué',
          description: response.data.message,
          variant: 'destructive'
        });
      }
    } catch (error) {
      toast({
        title: 'Erreur',
        description: formatErrorMessage(error, 'Erreur lors du test NTP'),
        variant: 'destructive'
      });
    } finally {
      setTestingNtp(false);
    }
  };

  const handleSelectTimezone = (tz) => {
    setTimezoneConfig({
      ...timezoneConfig,
      timezone_offset: tz.current_offset ?? tz.offset,
      timezone_name: tz.iana || tz.name,
    });
  };

  const handleSelectNtpServer = (server) => {
    setTimezoneConfig({
      ...timezoneConfig,
      ntp_server: server
    });
    setCustomNtpServer('');
  };

  const handleSetCustomNtpServer = () => {
    if (customNtpServer.trim()) {
      setTimezoneConfig({
        ...timezoneConfig,
        ntp_server: customNtpServer.trim()
      });
    }
  };

  // Filtrer + grouper par région
  const filteredAndGrouped = useMemo(() => {
    const query = timezoneSearchQuery.toLowerCase();
    const filtered = availableTimezones.filter(tz => {
      if (!query) return true;
      return (tz.name || '').toLowerCase().includes(query)
          || (tz.iana || '').toLowerCase().includes(query)
          || (tz.cities || '').toLowerCase().includes(query)
          || (tz.region || '').toLowerCase().includes(query);
    });
    const groups = {};
    for (const tz of filtered) {
      const region = tz.region || 'Autres';
      if (!groups[region]) groups[region] = [];
      groups[region].push(tz);
    }
    return groups;
  }, [availableTimezones, timezoneSearchQuery]);

  // Format helper pour offset (gère les .5)
  const fmtOffset = (off) => {
    if (off === null || off === undefined) return '';
    const sign = off >= 0 ? '+' : '-';
    const abs = Math.abs(off);
    const hours = Math.floor(abs);
    const minutes = Math.round((abs - hours) * 60);
    return minutes === 0 ? `GMT${sign}${hours}` : `GMT${sign}${hours}:${String(minutes).padStart(2, '0')}`;
  };

  // Format date/heure prochaine transition
  const fmtTransition = (iso, transitionOffset) => {
    if (!iso) return null;
    try {
      const d = new Date(iso);
      // Affiche dans le fuseau local actuel (avant transition)
      return d.toLocaleString('fr-FR', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="mt-6 bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="border-b border-gray-200 px-6 py-4 bg-gradient-to-r from-teal-600 to-cyan-600">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-white" />
          <h2 className="text-lg font-semibold text-white">Fuseau Horaire et Synchronisation NTP</h2>
        </div>
        <p className="text-sm text-teal-100 mt-1">
          Configurer le fuseau horaire de l'application. Le passage heure d'été/hiver est automatique.
        </p>
      </div>

      <div className="p-6">
        {loadingTimezone ? (
          <div className="text-center py-8">
            <RefreshCw className="h-8 w-8 animate-spin text-teal-600 mx-auto mb-2" />
            <p className="text-gray-600">Chargement de la configuration...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Indicateur de l'heure actuelle du serveur */}
            {currentServerTime && (
              <div className="bg-teal-50 border border-teal-200 rounded-lg p-4" data-testid="current-server-time-card">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <div className="bg-teal-100 p-2 rounded-full">
                      <Clock className="h-5 w-5 text-teal-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-teal-800">Heure actuelle du serveur</p>
                      <p className="text-2xl font-mono font-bold text-teal-700" data-testid="current-server-time">
                        {currentServerTime.formatted_local}
                      </p>
                      <p className="text-xs text-teal-600 mt-1">
                        {currentServerTime.timezone_name} ({fmtOffset(currentServerTime.timezone_offset)})
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">Heure UTC</p>
                    <p className="text-sm font-mono text-gray-600">{currentServerTime.formatted_utc}</p>
                  </div>
                </div>

                {/* Badge DST + prochaine transition */}
                <div className="mt-3 pt-3 border-t border-teal-200 flex items-center flex-wrap gap-3">
                  {currentServerTime.is_dst ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold border border-amber-300"
                      data-testid="dst-active-badge">
                      <Sun className="h-3.5 w-3.5" /> Heure d'été en cours
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-semibold border border-blue-300"
                      data-testid="dst-inactive-badge">
                      <Snowflake className="h-3.5 w-3.5" /> Heure d'hiver en cours
                    </span>
                  )}
                  {currentServerTime.next_transition && (
                    <span className="inline-flex items-center gap-1.5 text-xs text-teal-700" data-testid="next-transition-info">
                      <Calendar className="h-3.5 w-3.5" />
                      Prochain changement : {fmtTransition(currentServerTime.next_transition)}
                      <span className="ml-1 text-teal-600">
                        → {fmtOffset(currentServerTime.next_transition_offset)}
                        {currentServerTime.next_is_dst_after !== null && (
                          currentServerTime.next_is_dst_after ? ' (heure d\'été)' : ' (heure d\'hiver)'
                        )}
                      </span>
                    </span>
                  )}
                  {!currentServerTime.next_transition && (
                    <span className="text-xs text-gray-500" data-testid="no-dst-info">
                      Ce fuseau n'observe pas de changement d'heure
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Bandeau d'information sur la gestion auto */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-start gap-2">
              <CheckCircle className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-emerald-800">
                <span className="font-semibold">Gestion automatique du changement d'heure :</span> sélectionnez simplement votre fuseau (ex: Europe/Paris). Le passage heure d'été ↔ hiver se fait sans aucune intervention de votre part.
              </p>
            </div>

            {/* Sélection du fuseau horaire */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Fuseau horaire <span className="text-red-500">*</span>
              </label>
              
              {/* Barre de recherche */}
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={timezoneSearchQuery}
                  onChange={(e) => setTimezoneSearchQuery(e.target.value)}
                  placeholder="Rechercher par ville, région ou nom IANA (ex: Paris, Sydney, Asia)..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  data-testid="timezone-search-input"
                />
              </div>
              
              {/* Liste groupée par région */}
              <div className="max-h-72 overflow-y-auto border border-gray-200 rounded-lg" data-testid="timezone-list">
                {Object.keys(filteredAndGrouped).length === 0 && (
                  <p className="px-4 py-3 text-sm text-gray-500">Aucun fuseau ne correspond à la recherche.</p>
                )}
                {Object.entries(filteredAndGrouped).map(([region, list]) => (
                  <div key={region}>
                    <div className="bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-600 uppercase tracking-wider sticky top-0 border-b border-gray-200">
                      {region}
                    </div>
                    {list.map((tz, index) => {
                      const selected = timezoneConfig.timezone_name === (tz.iana || tz.name);
                      return (
                        <button
                          key={`${region}-${index}`}
                          onClick={() => handleSelectTimezone(tz)}
                          className={`w-full px-4 py-2.5 text-left hover:bg-teal-50 border-b border-gray-100 transition-colors ${
                            selected ? 'bg-teal-100 border-l-4 border-l-teal-500' : ''
                          }`}
                          data-testid={`timezone-option-${tz.iana || tz.name}`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-gray-800">{tz.iana || tz.name}</span>
                                {tz.is_dst && (
                                  <Sun className="h-3.5 w-3.5 text-amber-500" title="Heure d'été en cours" />
                                )}
                              </div>
                              <p className="text-xs text-gray-500 mt-0.5 truncate">{tz.cities}</p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className={`text-xs font-mono px-2 py-0.5 rounded ${tz.is_dst ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-700'}`}>
                                {fmtOffset(tz.current_offset ?? tz.offset)}
                              </span>
                              {selected && <CheckCircle className="h-5 w-5 text-teal-600" />}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
              
              <p className="text-xs text-gray-500 mt-2">
                Fuseau sélectionné : <span className="font-semibold">{timezoneConfig.timezone_name}</span>
                {' '}(<span className="font-mono">{fmtOffset(timezoneConfig.timezone_offset)}</span> actuellement)
              </p>
            </div>

            {/* Configuration du serveur NTP */}
            <div className="pt-6 border-t border-gray-200">
              <h3 className="text-md font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Server className="h-5 w-5 text-gray-600" />
                Serveur NTP (Network Time Protocol)
              </h3>
              
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-blue-800">
                    <p className="font-semibold mb-1">À propos de NTP :</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>NTP permet de synchroniser l'heure du serveur avec une source de temps fiable</li>
                      <li>Important pour l'horodatage précis des capteurs MQTT</li>
                      <li>Utilisez un serveur proche géographiquement pour de meilleurs résultats</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Sélection du serveur NTP prédéfini */}
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Serveurs NTP populaires
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-4">
                {availableNtpServers.map((ntp, index) => (
                  <button
                    key={index}
                    onClick={() => handleSelectNtpServer(ntp.server)}
                    className={`px-4 py-3 text-left rounded-lg border transition-colors ${
                      timezoneConfig.ntp_server === ntp.server 
                        ? 'bg-teal-100 border-teal-500' 
                        : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-mono text-sm font-semibold text-gray-800">{ntp.server}</span>
                        <p className="text-xs text-gray-500">{ntp.description}</p>
                      </div>
                      {timezoneConfig.ntp_server === ntp.server && (
                        <CheckCircle className="h-4 w-4 text-teal-600 flex-shrink-0" />
                      )}
                    </div>
                  </button>
                ))}
              </div>

              {/* Serveur NTP personnalisé */}
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Serveur NTP personnalisé
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customNtpServer}
                    onChange={(e) => setCustomNtpServer(e.target.value)}
                    placeholder="ntp.votre-serveur.com"
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent font-mono"
                  />
                  <button
                    onClick={handleSetCustomNtpServer}
                    disabled={!customNtpServer.trim()}
                    className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    Utiliser
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Serveur actuel : <span className="font-mono font-semibold">{timezoneConfig.ntp_server}</span>
                </p>
              </div>

              {/* Bouton Test NTP */}
              <div className="mt-4 flex items-center gap-4">
                <button
                  onClick={() => handleTestNtp(timezoneConfig.ntp_server)}
                  disabled={testingNtp}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {testingNtp ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Test en cours...</span>
                    </>
                  ) : (
                    <>
                      <Globe className="h-4 w-4" />
                      <span>Tester la connexion</span>
                    </>
                  )}
                </button>
                
                {/* Résultat du test */}
                {ntpTestResult && (
                  <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                    ntpTestResult.success 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {ntpTestResult.success ? (
                      <>
                        <CheckCircle className="h-4 w-4" />
                        <span className="text-sm">
                          Connexion OK - Décalage : {ntpTestResult.offset_ms?.toFixed(1)}ms
                        </span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-4 w-4" />
                        <span className="text-sm">{ntpTestResult.message}</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Bouton Sauvegarder */}
            <div className="flex items-center gap-4 pt-6 border-t border-gray-200">
              <button
                onClick={handleSaveTimezoneConfig}
                disabled={savingTimezone}
                className="flex items-center gap-2 px-6 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                data-testid="save-timezone-config-btn"
              >
                {savingTimezone ? (
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
              
              <p className="text-sm text-gray-500">
                Cette configuration sera appliquée à toute l'application, y compris l'horodatage des capteurs MQTT.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TimezoneSettings;
