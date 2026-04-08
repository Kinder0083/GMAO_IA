import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Save, RotateCcw, Settings, Database } from 'lucide-react';
import { useToast } from '../hooks/use-toast';
import ImportExportTab from './ImportExportTab';
import BackupTab from './BackupTab';
import RestoreTab from './RestoreTab';
import GoogleDriveConfigTab from './GoogleDriveConfigTab';
import MongoDBBackupTab from './MongoDBBackupTab';

const ImportExport = () => {
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState('import-export');

  useEffect(() => {
    if (searchParams.get('drive_connected') === 'true') {
      setActiveTab('backup');
      toast({ title: 'Google Drive connecte avec succes' });
    }
    if (searchParams.get('drive_error')) {
      setActiveTab('configuration');
      toast({ title: 'Erreur connexion Google Drive', description: decodeURIComponent(searchParams.get('drive_error')), variant: 'destructive' });
    }
  }, [searchParams, toast]);

  const tabs = [
    { id: 'import-export', label: 'Import / Export', icon: Download },
    { id: 'backup', label: 'Sauvegardes Automatiques', icon: Save },
    { id: 'restore', label: 'Restauration', icon: RotateCcw },
    { id: 'mongodb', label: 'MongoDB Natif', icon: Database },
    { id: 'configuration', label: 'Configuration', icon: Settings },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Import / Export</h1>
        <p className="text-gray-600 mt-1">Sauvegardez et restaurez vos donnees</p>
      </div>

      {/* Onglets */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit flex-wrap" data-testid="import-export-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
            data-testid={`tab-${tab.id}`}
          >
            <tab.icon size={16} className="inline mr-2" />{tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'import-export' && <ImportExportTab />}
      {activeTab === 'backup' && <BackupTab />}
      {activeTab === 'restore' && <RestoreTab />}
      {activeTab === 'mongodb' && <MongoDBBackupTab />}
      {activeTab === 'configuration' && <GoogleDriveConfigTab />}
    </div>
  );
};

export default ImportExport;
