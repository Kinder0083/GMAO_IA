import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, FileText, Film, File, Loader2 } from 'lucide-react';

const AttachmentGallery = ({ attachments, downloadFunction, itemId }) => {
  const [thumbUrls, setThumbUrls] = useState({});
  const [lightbox, setLightbox] = useState({ open: false, index: 0 });
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const urlsRef = useRef({});
  const mountedRef = useRef(true);

  const getMime = (att) => att.mime_type || att.type || '';

  // Cleanup only on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      Object.values(urlsRef.current).forEach(u => {
        if (u && u !== 'loading') URL.revokeObjectURL(u);
      });
      urlsRef.current = {};
    };
  }, []);

  // Load image thumbnails
  useEffect(() => {
    if (!downloadFunction || !attachments?.length) return;
    attachments.forEach(async (att) => {
      const mime = getMime(att);
      if (mime.startsWith('image/') && !urlsRef.current[att.id]) {
        try {
          urlsRef.current[att.id] = 'loading';
          const res = await downloadFunction(itemId, att.id);
          if (!mountedRef.current) return;
          const blob = new Blob([res.data || res], { type: mime });
          const url = URL.createObjectURL(blob);
          urlsRef.current[att.id] = url;
          setThumbUrls(prev => ({ ...prev, [att.id]: url }));
        } catch (e) {
          urlsRef.current[att.id] = null;
        }
      }
    });
  }, [attachments, downloadFunction, itemId]);

  const openLightbox = useCallback(async (index) => {
    setLightbox({ open: true, index });
    setLightboxUrl(null);
    const att = attachments[index];
    if (!att) return;

    // Reuse cached thumbnail if available
    if (urlsRef.current[att.id] && urlsRef.current[att.id] !== 'loading') {
      setLightboxUrl(urlsRef.current[att.id]);
      return;
    }
    try {
      setLoading(true);
      const res = await downloadFunction(itemId, att.id);
      const blob = new Blob([res.data || res], { type: getMime(att) });
      const url = URL.createObjectURL(blob);
      urlsRef.current[att.id] = url;
      setThumbUrls(prev => ({ ...prev, [att.id]: url }));
      setLightboxUrl(url);
    } catch (e) {
      console.error('Lightbox load error:', e);
    } finally {
      setLoading(false);
    }
  }, [attachments, downloadFunction, itemId]);

  const closeLightbox = () => {
    setLightbox({ open: false, index: 0 });
    setLightboxUrl(null);
  };

  const navigate = useCallback((dir) => {
    const newIndex = (lightbox.index + dir + attachments.length) % attachments.length;
    openLightbox(newIndex);
  }, [lightbox.index, attachments.length, openLightbox]);

  // Keyboard navigation
  useEffect(() => {
    if (!lightbox.open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') navigate(-1);
      if (e.key === 'ArrowRight') navigate(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox.open, navigate]);

  if (!attachments?.length) return null;

  const renderThumb = (att) => {
    const mime = getMime(att);
    if (mime.startsWith('image/') && thumbUrls[att.id]) {
      return <img src={thumbUrls[att.id]} alt="" className="w-full h-full object-cover" />;
    }
    if (mime.startsWith('image/')) {
      return (
        <div className="flex items-center justify-center h-full bg-blue-50">
          <Loader2 size={18} className="animate-spin text-blue-400" />
        </div>
      );
    }
    if (mime === 'application/pdf') {
      return (
        <div className="flex flex-col items-center justify-center h-full bg-red-50">
          <FileText className="text-red-500" size={22} />
          <span className="text-[10px] text-red-600 mt-0.5 font-semibold">PDF</span>
        </div>
      );
    }
    if (mime.startsWith('video/')) {
      return (
        <div className="flex flex-col items-center justify-center h-full bg-purple-50">
          <Film className="text-purple-500" size={22} />
          <span className="text-[10px] text-purple-600 mt-0.5 font-semibold">Video</span>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gray-50">
        <File className="text-gray-400" size={22} />
        <span className="text-[10px] text-gray-500 mt-0.5 font-semibold truncate max-w-full px-1">
          {(att.original_filename || att.filename || '').split('.').pop()?.toUpperCase()}
        </span>
      </div>
    );
  };

  const renderLightboxContent = () => {
    const att = attachments[lightbox.index];
    if (!att) return null;
    const mime = getMime(att);

    if (loading) {
      return <Loader2 size={40} className="animate-spin text-white" />;
    }
    if (!lightboxUrl) return null;

    if (mime.startsWith('image/')) {
      return <img src={lightboxUrl} alt={att.original_filename} className="max-h-[80vh] max-w-[90vw] object-contain rounded" />;
    }
    if (mime === 'application/pdf') {
      return <iframe src={lightboxUrl} className="w-[90vw] h-[80vh] bg-white rounded" title={att.original_filename} />;
    }
    if (mime.startsWith('video/')) {
      return <video src={lightboxUrl} controls autoPlay className="max-h-[80vh] max-w-[90vw] rounded" />;
    }
    if (mime.startsWith('text/')) {
      return <iframe src={lightboxUrl} className="w-[80vw] h-[70vh] bg-white rounded font-mono" title={att.original_filename} />;
    }
    return (
      <div className="text-center text-white">
        <File size={48} className="mx-auto mb-4 opacity-60" />
        <p className="text-lg">{att.original_filename || att.filename}</p>
        <p className="text-sm opacity-50 mt-2">Apercu non disponible pour ce type de fichier</p>
      </div>
    );
  };

  return (
    <>
      <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2 mb-3" data-testid="gallery-thumbnails">
        {attachments.map((att, i) => (
          <button
            key={att.id}
            onClick={() => openLightbox(i)}
            className="aspect-square rounded-lg overflow-hidden border-2 border-gray-200 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group relative"
            title={att.original_filename || att.filename}
            data-testid={`gallery-thumb-${att.id}`}
          >
            {renderThumb(att)}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
              <div className="bg-black/40 rounded-full p-1">
                <ChevronRight size={14} className="text-white" />
              </div>
            </div>
          </button>
        ))}
      </div>

      {lightbox.open && createPortal(
        <div
          className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center"
          onClick={(e) => { if (e.target === e.currentTarget) closeLightbox(); }}
          data-testid="lightbox-overlay"
        >
          <button
            onClick={closeLightbox}
            className="absolute top-4 right-4 text-white/80 hover:text-white z-10 p-2 rounded-full hover:bg-white/10 transition-colors"
            data-testid="lightbox-close"
          >
            <X size={28} />
          </button>

          <div className="absolute top-5 left-1/2 -translate-x-1/2 text-white/80 text-sm font-medium bg-black/40 px-3 py-1 rounded-full">
            {lightbox.index + 1} / {attachments.length}
          </div>

          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 text-white/70 text-sm max-w-md truncate bg-black/40 px-3 py-1 rounded-full">
            {attachments[lightbox.index]?.original_filename || attachments[lightbox.index]?.filename}
          </div>

          {attachments.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); navigate(-1); }}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-white/70 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors"
                data-testid="lightbox-prev"
              >
                <ChevronLeft size={36} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); navigate(1); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/70 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors"
                data-testid="lightbox-next"
              >
                <ChevronRight size={36} />
              </button>
            </>
          )}

          <div className="flex items-center justify-center">
            {renderLightboxContent()}
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default AttachmentGallery;
