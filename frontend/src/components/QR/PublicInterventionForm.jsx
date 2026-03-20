import React, { useState, useRef } from 'react';
import { Camera, Paperclip, X, ChevronLeft, Loader2, CheckCircle2, AlertTriangle, Eye, Send, Upload } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const PRIORITIES = [
  { value: 'AUCUNE', label: 'Normale', color: 'bg-gray-100 text-gray-700 border-gray-200' },
  { value: 'BASSE', label: 'Basse', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { value: 'MOYENNE', label: 'Moyenne', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  { value: 'HAUTE', label: 'Haute', color: 'bg-orange-50 text-orange-700 border-orange-200' },
  { value: 'URGENTE', label: 'Urgente', color: 'bg-red-50 text-red-700 border-red-200' },
];

const PublicInterventionForm = ({ equipment, onClose }) => {
  const [step, setStep] = useState('form'); // form | sending | success | error
  const [form, setForm] = useState({
    demandeur_nom: '',
    titre: '',
    description: '',
    priorite: 'AUCUNE',
  });
  const [photos, setPhotos] = useState([]);
  const [previewImg, setPreviewImg] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const cameraRef = useRef(null);
  const fileRef = useRef(null);

  const handlePhoto = (e) => {
    const files = Array.from(e.target.files || []);
    const valid = files.filter(f => f.size <= 25 * 1024 * 1024);
    const newPhotos = valid.map(f => ({
      file: f,
      name: f.name,
      preview: URL.createObjectURL(f),
    }));
    setPhotos(prev => [...prev, ...newPhotos]);
    e.target.value = '';
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length === 0) return;
    const valid = files.filter(f => f.size <= 25 * 1024 * 1024);
    const newPhotos = valid.map(f => ({
      file: f,
      name: f.name,
      preview: URL.createObjectURL(f),
    }));
    setPhotos(prev => [...prev, ...newPhotos]);
  };

  const removePhoto = (idx) => {
    URL.revokeObjectURL(photos[idx].preview);
    setPhotos(prev => prev.filter((_, i) => i !== idx));
  };

  // Compress image on client side before upload (for mobile compatibility)
  const compressImage = (file, maxSize = 1200, quality = 0.8) => {
    return new Promise((resolve) => {
      // If not an image, return as-is
      if (!file.type.startsWith('image/')) {
        resolve(file);
        return;
      }
      
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      img.onload = () => {
        let { width, height } = img;
        
        // Resize if larger than maxSize
        if (Math.max(width, height) > maxSize) {
          if (width > height) {
            height = Math.round(height * (maxSize / width));
            width = maxSize;
          } else {
            width = Math.round(width * (maxSize / height));
            height = maxSize;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob(
          (blob) => {
            if (blob) {
              const compressed = new File([blob], file.name || 'photo.jpg', { type: 'image/jpeg' });
              resolve(compressed);
            } else {
              resolve(file);
            }
          },
          'image/jpeg',
          quality
        );
      };
      
      img.onerror = () => resolve(file);
      img.src = URL.createObjectURL(file);
    });
  };

  const handleSubmit = async () => {
    if (!form.titre.trim()) return setErrorMsg('Le titre est obligatoire');
    if (!form.description.trim()) return setErrorMsg('La description est obligatoire');
    setErrorMsg('');
    setStep('sending');

    try {
      // 1. Create the intervention request
      const res = await fetch(`${API_URL}/api/qr/public/intervention-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titre: form.titre.trim(),
          description: form.description.trim(),
          priorite: form.priorite,
          equipment_id: equipment.id,
          demandeur_nom: form.demandeur_nom.trim() || 'Anonyme',
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Erreur serveur');
      }

      const result = await res.json();
      const requestId = result.id;

      // 2. Upload photos (compressed for mobile compatibility)
      let uploadErrors = 0;
      for (const photo of photos) {
        try {
          const compressed = await compressImage(photo.file);
          const fd = new FormData();
          fd.append('file', compressed);
          const uploadRes = await fetch(`${API_URL}/api/qr/public/intervention-request/${requestId}/attachments`, {
            method: 'POST',
            body: fd,
          });
          if (!uploadRes.ok) {
            console.warn('[QR] Photo upload failed:', uploadRes.status);
            uploadErrors++;
          }
        } catch (e) {
          console.warn('[QR] Photo upload error:', e);
          uploadErrors++;
        }
      }

      setStep('success');
    } catch (err) {
      setErrorMsg(err.message || 'Une erreur est survenue');
      setStep('error');
    }
  };

  // Success screen
  if (step === 'success') {
    return (
      <div className="space-y-6 text-center py-8" data-testid="public-di-success">
        <div className="w-20 h-20 mx-auto rounded-full bg-emerald-100 flex items-center justify-center">
          <CheckCircle2 size={40} className="text-emerald-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Demande envoyee</h2>
          <p className="text-sm text-gray-500 mt-2">
            Votre demande d'intervention a ete transmise avec succes. L'equipe de maintenance sera informee.
          </p>
        </div>
        <button
          onClick={onClose}
          className="w-full py-3.5 rounded-xl bg-emerald-600 text-white font-semibold text-base active:bg-emerald-700 transition-colors"
          data-testid="public-di-back-btn"
        >
          Retour a la fiche equipement
        </button>
      </div>
    );
  }

  // Error screen
  if (step === 'error') {
    return (
      <div className="space-y-6 text-center py-8" data-testid="public-di-error">
        <div className="w-20 h-20 mx-auto rounded-full bg-red-100 flex items-center justify-center">
          <AlertTriangle size={40} className="text-red-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Erreur</h2>
          <p className="text-sm text-gray-500 mt-2">{errorMsg}</p>
        </div>
        <div className="space-y-3">
          <button
            onClick={() => setStep('form')}
            className="w-full py-3.5 rounded-xl bg-blue-600 text-white font-semibold text-base active:bg-blue-700"
          >
            Reessayer
          </button>
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl border border-gray-300 text-gray-700 font-medium text-sm active:bg-gray-50"
          >
            Annuler
          </button>
        </div>
      </div>
    );
  }

  // Sending screen
  if (step === 'sending') {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4" data-testid="public-di-sending">
        <Loader2 size={40} className="animate-spin text-blue-600" />
        <p className="text-sm text-gray-600 font-medium">Envoi en cours...</p>
        {photos.length > 0 && (
          <p className="text-xs text-gray-400">Upload de {photos.length} photo(s)...</p>
        )}
      </div>
    );
  }

  // Form
  return (
    <div className="space-y-5" data-testid="public-di-form">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onClose}
          className="p-2 -ml-2 rounded-lg active:bg-gray-100 transition-colors"
          data-testid="public-di-close-btn"
        >
          <ChevronLeft size={22} className="text-gray-600" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-gray-900">Nouvelle demande</h2>
          <p className="text-xs text-gray-500 truncate">
            {equipment.nom}
            {equipment.emplacement ? ` — ${equipment.emplacement}` : ''}
          </p>
        </div>
      </div>

      {/* Equipment info bar */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
          <AlertTriangle size={18} className="text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-blue-900 truncate">{equipment.nom}</p>
          <p className="text-xs text-blue-600">Equipement pre-selectionne</p>
        </div>
      </div>

      {/* Form fields */}
      <div className="space-y-4">
        {/* Name */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Votre nom</label>
          <input
            type="text"
            data-testid="public-di-name"
            value={form.demandeur_nom}
            onChange={e => setForm(f => ({ ...f, demandeur_nom: e.target.value }))}
            placeholder="Prenom Nom"
            className="w-full px-4 py-3 rounded-xl border border-gray-300 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white placeholder-gray-400"
            autoComplete="name"
          />
        </div>

        {/* Title */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            Titre de la demande <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            data-testid="public-di-titre"
            value={form.titre}
            onChange={e => setForm(f => ({ ...f, titre: e.target.value }))}
            placeholder="Ex: Fuite d'huile sur le verin"
            className="w-full px-4 py-3 rounded-xl border border-gray-300 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white placeholder-gray-400"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            Description <span className="text-red-500">*</span>
          </label>
          <textarea
            data-testid="public-di-description"
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Decrivez le probleme constate..."
            rows={4}
            className="w-full px-4 py-3 rounded-xl border border-gray-300 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white placeholder-gray-400 resize-none"
          />
        </div>

        {/* Priority */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Priorite</label>
          <div className="grid grid-cols-3 gap-2" data-testid="public-di-priority">
            {PRIORITIES.filter(p => ['AUCUNE', 'MOYENNE', 'HAUTE', 'URGENTE'].includes(p.value)).map(p => (
              <button
                key={p.value}
                type="button"
                onClick={() => setForm(f => ({ ...f, priorite: p.value }))}
                className={`py-2.5 px-3 rounded-xl border text-sm font-medium transition-all ${
                  form.priorite === p.value
                    ? `${p.color} ring-2 ring-offset-1 ${p.value === 'URGENTE' ? 'ring-red-400' : p.value === 'HAUTE' ? 'ring-orange-400' : p.value === 'MOYENNE' ? 'ring-amber-400' : 'ring-gray-400'}`
                    : 'bg-white border-gray-200 text-gray-500'
                }`}
                data-testid={`public-di-prio-${p.value}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Photos */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Photos</label>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={handlePhoto} className="hidden" />
          <input ref={fileRef} type="file" accept="image/*" multiple onChange={handlePhoto} className="hidden" />

          {/* Zone de drag & drop */}
          <div
            data-testid="public-di-drop-zone"
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className={`relative rounded-xl border-2 border-dashed transition-colors duration-200 ${
              isDragging
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 bg-white'
            }`}
          >
            {isDragging && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-xl bg-blue-50/90">
                <Upload size={32} className="text-blue-500 mb-2" />
                <p className="text-sm font-medium text-blue-600">Deposez vos photos ici</p>
              </div>
            )}
            <div className="p-3">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => cameraRef.current?.click()}
                  className="flex flex-col items-center justify-center py-4 rounded-xl border-2 border-dashed border-blue-300 bg-blue-50 active:bg-blue-100 transition-colors"
                  data-testid="public-di-camera-btn"
                >
                  <Camera size={28} className="text-blue-600 mb-1" />
                  <span className="text-sm font-medium text-blue-700">Prendre photo</span>
                </button>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex flex-col items-center justify-center py-4 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 active:bg-gray-100 transition-colors"
                  data-testid="public-di-file-btn"
                >
                  <Paperclip size={28} className="text-gray-500 mb-1" />
                  <span className="text-sm font-medium text-gray-600">Galerie</span>
                </button>
              </div>
              <p className="text-xs text-gray-400 text-center mt-2">
                Glissez-deposez vos photos ici ou utilisez les boutons
              </p>
            </div>
          </div>

          {/* Photo thumbnails */}
          {photos.length > 0 && (
            <div className="grid grid-cols-3 gap-2 mt-3" data-testid="public-di-photos">
              {photos.map((photo, idx) => (
                <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border border-gray-200 bg-gray-100">
                  <img src={photo.preview} alt={photo.name} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setPreviewImg(photo.preview)}
                    className="absolute inset-0 bg-black/0 active:bg-black/30 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => removePhoto(idx)}
                    className="absolute top-1 right-1 p-1 bg-black/60 rounded-full active:bg-black/80"
                    data-testid={`public-di-remove-photo-${idx}`}
                  >
                    <X size={14} className="text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Error */}
      {errorMsg && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700" data-testid="public-di-form-error">
          {errorMsg}
        </div>
      )}

      {/* Submit */}
      <button
        type="button"
        onClick={handleSubmit}
        className="w-full py-4 rounded-xl bg-blue-600 text-white font-semibold text-base flex items-center justify-center gap-2 active:bg-blue-700 transition-colors shadow-lg shadow-blue-600/25"
        data-testid="public-di-submit-btn"
      >
        <Send size={20} />
        Envoyer la demande
      </button>

      {/* Fullscreen preview */}
      {previewImg && (
        <div
          className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setPreviewImg(null)}
        >
          <button
            className="absolute top-4 right-4 p-2 bg-white/20 rounded-full active:bg-white/40"
            onClick={() => setPreviewImg(null)}
          >
            <X size={24} className="text-white" />
          </button>
          <img
            src={previewImg}
            alt="Preview"
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
};

export default PublicInterventionForm;
