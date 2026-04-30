import React from 'react';
import { Settings } from 'lucide-react';
import {
  UserPasswordReset,
  SecuritySettings,
  TailscaleSettings,
  SmtpSettings,
  MqttSettings,
  LlmKeysSettings,
  TimezoneSettings,
  DataResetSettings,
  QRActionsAdmin
} from '../components/Settings';
import FormAIModelSettings from '../components/Settings/FormAIModelSettings';
import TrashSettings from '../components/Settings/TrashSettings';
import AccidentAISettings from '../components/Settings/AccidentAISettings';
import ImageCompressionSettings from '../components/Settings/ImageCompressionSettings';
import DataIntegritySettings from '../components/Settings/DataIntegritySettings';

/**
 * Page de paramètres spéciaux / système
 * 
 * Cette page regroupe toutes les configurations système :
 * - Gestion des mots de passe utilisateurs
 * - Paramètres de sécurité (déconnexion automatique)
 * - Configuration Tailscale (IP)
 * - Configuration SMTP (emails)
 * - Configuration MQTT (IoT)
 * - Clés API LLM (IA)
 * - Fuseau horaire et NTP
 * 
 * Refactorisé le 31/01/2026 pour une meilleure maintenabilité.
 */
const SpecialSettings = () => {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Settings className="h-8 w-8 text-gray-700" />
            <h1 className="text-3xl font-bold text-gray-900">Paramètres système</h1>
          </div>
          <p className="text-gray-600">
            Configuration avancée de l'application FSAO Iris
          </p>
        </div>

        {/* Sections de configuration */}
        <div className="space-y-6">
          {/* Gestion des mots de passe */}
          <UserPasswordReset />

          {/* Paramètres de sécurité */}
          <SecuritySettings />

          {/* Configuration Tailscale */}
          <TailscaleSettings />

          {/* Configuration SMTP */}
          <SmtpSettings />

          {/* Configuration MQTT */}
          <MqttSettings />

          {/* Clés API LLM */}
          <LlmKeysSettings />

          {/* Modèle IA pour Formulaires */}
          <FormAIModelSettings />

          {/* Fuseau horaire et NTP */}
          <TimezoneSettings />

          {/* Réinitialisation des données */}
          <DataResetSettings />

          {/* Actions QR Code — Équipements */}
          <QRActionsAdmin />

          {/* Corbeille — Delai de retention */}
          <TrashSettings />

          {/* Analyse d'Accidents — Modele IA */}
          <AccidentAISettings />

          {/* Compression des images */}
          <ImageCompressionSettings />

          {/* Cohérence des données — scan & réparation */}
          <DataIntegritySettings />
        </div>
      </div>
    </div>
  );
};

export default SpecialSettings;
