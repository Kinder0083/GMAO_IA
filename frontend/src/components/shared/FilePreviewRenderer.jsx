import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, FileText, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../ui/button';

/**
 * Détecte le type de fichier à partir du MIME type et/ou de l'extension du nom.
 * @returns 'docx' | 'xlsx' | 'csv' | null
 */
const detectFileType = (mimeType = '', filename = '') => {
  const ext = filename.split('.').pop()?.toLowerCase();
  const mime = mimeType.toLowerCase();

  if (
    mime.includes('wordprocessingml') ||
    mime.includes('msword') ||
    ext === 'docx' ||
    ext === 'doc'
  ) return 'docx';

  if (
    mime.includes('spreadsheetml') ||
    mime.includes('ms-excel') ||
    mime.includes('vnd.ms-excel') ||
    ext === 'xlsx' ||
    ext === 'xls' ||
    ext === 'ods'
  ) return 'xlsx';

  if (ext === 'csv' || mime === 'text/csv') return 'csv';

  return null;
};

/* ------------------------------------------------------------------ */
/* Rendu HTML d'une feuille XLSX avec navigation entre onglets         */
/* ------------------------------------------------------------------ */
const XlsxRenderer = ({ arrayBuffer }) => {
  const [sheets, setSheets] = useState([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const [sheetHtml, setSheetHtml] = useState('');
  const [loading, setLoading] = useState(true);
  const workbookRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      // Import dynamique : xlsx n'est chargé qu'ici
      const XLSX = await import('xlsx');
      const wb = XLSX.read(arrayBuffer, { type: 'array' });
      workbookRef.current = { XLSX, wb };
      if (!cancelled) {
        setSheets(wb.SheetNames);
        const html = XLSX.utils.sheet_to_html(wb.Sheets[wb.SheetNames[0]], { editable: false });
        setSheetHtml(html);
        setLoading(false);
      }
    };
    load().catch(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [arrayBuffer]);

  const switchSheet = useCallback((idx) => {
    if (!workbookRef.current) return;
    const { XLSX, wb } = workbookRef.current;
    const html = XLSX.utils.sheet_to_html(wb.Sheets[wb.SheetNames[idx]], { editable: false });
    setSheetHtml(html);
    setActiveSheet(idx);
  }, []);

  if (loading) return <LoadingSpinner label="Chargement du tableur…" />;

  return (
    <div className="flex flex-col h-full w-full bg-white rounded-lg overflow-hidden">
      {/* Onglets des feuilles */}
      {sheets.length > 1 && (
        <div className="flex gap-1 px-4 pt-3 pb-0 border-b overflow-x-auto shrink-0">
          {sheets.map((name, i) => (
            <button
              key={name}
              onClick={() => switchSheet(i)}
              className={`px-3 py-1.5 text-xs font-medium rounded-t-md border border-b-0 transition-colors whitespace-nowrap ${
                i === activeSheet
                  ? 'bg-white text-blue-700 border-blue-300'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200 border-gray-200'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      )}
      {/* Tableau */}
      <div className="flex-1 overflow-auto p-3 text-sm">
        <div
          className="xlsx-preview"
          dangerouslySetInnerHTML={{ __html: sheetHtml }}
        />
      </div>
      {/* Styles inline pour le tableau généré par SheetJS */}
      <style>{`
        .xlsx-preview table { border-collapse: collapse; width: 100%; font-size: 12px; }
        .xlsx-preview td, .xlsx-preview th {
          border: 1px solid #e2e8f0;
          padding: 4px 8px;
          white-space: nowrap;
          max-width: 240px;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .xlsx-preview tr:first-child td, .xlsx-preview th {
          background: #f8fafc;
          font-weight: 600;
          position: sticky;
          top: 0;
        }
        .xlsx-preview tr:hover td { background: #f0f9ff; }
      `}</style>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Rendu HTML d'un document Word via Mammoth                           */
/* ------------------------------------------------------------------ */
const DocxRenderer = ({ arrayBuffer }) => {
  const [html, setHtml] = useState('');
  const [warnings, setWarnings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        // Import dynamique : mammoth n'est chargé qu'ici
        const mammoth = await import('mammoth/mammoth.browser.min');
        const result = await mammoth.convertToHtml({ arrayBuffer });
        if (!cancelled) {
          setHtml(result.value);
          setWarnings(result.messages?.filter(m => m.type === 'warning') || []);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError('Impossible de lire ce document Word.');
          setLoading(false);
        }
      }
    };
    load();
    return () => { cancelled = true; };
  }, [arrayBuffer]);

  if (loading) return <LoadingSpinner label="Conversion du document Word…" />;
  if (error) return <ErrorBlock message={error} />;

  return (
    <div className="flex flex-col h-full w-full bg-white rounded-lg overflow-auto">
      {warnings.length > 0 && (
        <div className="mx-4 mt-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-700 flex items-center gap-2">
          <AlertTriangle size={13} />
          {warnings.length} élément(s) n'ont pas pu être convertis fidèlement.
        </div>
      )}
      {/* Contenu Word rendu en HTML */}
      <div
        className="docx-preview flex-1 p-6 overflow-auto prose prose-sm max-w-none"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <style>{`
        .docx-preview h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: .5rem; }
        .docx-preview h2 { font-size: 1.25rem; font-weight: 600; margin-bottom: .4rem; }
        .docx-preview h3 { font-size: 1.1rem; font-weight: 600; margin-bottom: .3rem; }
        .docx-preview p  { margin-bottom: .5rem; line-height: 1.6; }
        .docx-preview ul, .docx-preview ol { padding-left: 1.5rem; margin-bottom: .5rem; }
        .docx-preview li { margin-bottom: .2rem; }
        .docx-preview table { border-collapse: collapse; width: 100%; margin-bottom: 1rem; }
        .docx-preview td, .docx-preview th { border: 1px solid #e2e8f0; padding: 6px 10px; }
        .docx-preview th { background: #f8fafc; font-weight: 600; }
        .docx-preview img { max-width: 100%; height: auto; border-radius: 4px; }
        .docx-preview strong { font-weight: 700; }
        .docx-preview em { font-style: italic; }
      `}</style>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Composants utilitaires                                               */
/* ------------------------------------------------------------------ */
const LoadingSpinner = ({ label }) => (
  <div className="flex flex-col items-center justify-center h-full w-full gap-3 text-gray-500">
    <Loader2 size={36} className="animate-spin text-blue-500" />
    <p className="text-sm">{label}</p>
  </div>
);

const ErrorBlock = ({ message }) => (
  <div className="flex flex-col items-center justify-center h-full w-full gap-3 text-red-500">
    <AlertTriangle size={36} />
    <p className="text-sm">{message}</p>
  </div>
);

/* ------------------------------------------------------------------ */
/* Composant principal : FilePreviewRenderer                           */
/* ------------------------------------------------------------------ */
/**
 * Rendu intelligent d'un fichier selon son type.
 *
 * Les bibliothèques Mammoth (docx) et SheetJS (xlsx/csv) sont chargées
 * uniquement si l'utilisateur ouvre un fichier nécessitant leur usage.
 *
 * @param {string}  url        URL du fichier (blob URL ou HTTP avec token)
 * @param {string}  filename   Nom du fichier (pour détecter l'extension)
 * @param {string}  mimeType   MIME type (optionnel, renforce la détection)
 * @param {string}  [className] Classes CSS supplémentaires pour le conteneur
 */
const FilePreviewRenderer = ({ url, filename = '', mimeType = '', className = '' }) => {
  const [state, setState] = useState({ status: 'loading', arrayBuffer: null, error: null });
  const fileType = detectFileType(mimeType, filename);

  useEffect(() => {
    if (!url || !fileType) {
      setState({ status: 'unsupported', arrayBuffer: null, error: null });
      return;
    }

    let cancelled = false;
    setState({ status: 'loading', arrayBuffer: null, error: null });

    // XHR au lieu de fetch() pour éviter tout conflit avec
    // l'API Response (clonage Service Worker, corps déjà consommé, etc.)
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = () => {
      if (cancelled) return;
      if (xhr.status >= 200 && xhr.status < 300) {
        setState({ status: 'ready', arrayBuffer: xhr.response, error: null });
      } else {
        setState({ status: 'error', arrayBuffer: null, error: `HTTP ${xhr.status} — URL : ${url}` });
      }
    };
    xhr.onerror = () => {
      if (!cancelled) setState({ status: 'error', arrayBuffer: null, error: 'Erreur réseau lors du chargement' });
    };
    xhr.send();

    return () => {
      cancelled = true;
      xhr.abort();
    };
  }, [url, fileType]);

  const containerClass = `h-full w-full overflow-hidden ${className}`;

  if (state.status === 'loading') {
    return (
      <div className={containerClass}>
        <LoadingSpinner label="Chargement du fichier…" />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className={containerClass}>
        <ErrorBlock message={`Impossible de charger le fichier : ${state.error}`} />
      </div>
    );
  }

  if (state.status === 'unsupported' || !fileType) {
    return (
      <div className={`flex flex-col items-center justify-center h-full w-full gap-3 text-gray-400 ${className}`}>
        <FileText size={40} className="text-gray-300" />
        <p className="text-sm text-gray-500">Aperçu non disponible pour ce type de fichier</p>
        <p className="text-xs text-gray-400">{filename}</p>
      </div>
    );
  }

  if (fileType === 'docx') {
    return (
      <div className={containerClass}>
        <DocxRenderer arrayBuffer={state.arrayBuffer} />
      </div>
    );
  }

  if (fileType === 'xlsx' || fileType === 'csv') {
    return (
      <div className={containerClass}>
        <XlsxRenderer arrayBuffer={state.arrayBuffer} />
      </div>
    );
  }

  return null;
};

export { detectFileType };
export default FilePreviewRenderer;
