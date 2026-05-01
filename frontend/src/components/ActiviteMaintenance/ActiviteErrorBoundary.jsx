import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * ErrorBoundary local pour eviter qu'une erreur dans le sous-arbre
 * n'efface tout l'ecran. Affiche un fallback avec details + bouton recharger.
 */
class ActiviteErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ActiviteErrorBoundary] Erreur capturée:', error, info);
    this.setState({ info });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="m-4 p-4 border border-red-300 bg-red-50 rounded-lg" data-testid="activite-error-boundary">
          <div className="flex items-start gap-3">
            <AlertTriangle size={24} className="text-red-600 shrink-0" />
            <div className="flex-1">
              <h3 className="text-sm font-bold text-red-800">Une erreur est survenue dans Activité Maintenance</h3>
              <p className="text-xs text-red-700 mt-1">
                {this.state.error?.message || 'Erreur inconnue'}
              </p>
              <button
                type="button"
                onClick={() => {
                  this.setState({ hasError: false, error: null, info: null });
                  window.location.reload();
                }}
                className="mt-3 inline-flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white text-xs rounded hover:bg-red-700"
              >
                <RefreshCw size={12} />
                Recharger la page
              </button>
              {process.env.NODE_ENV !== 'production' && this.state.info?.componentStack && (
                <pre className="mt-2 text-[10px] text-red-600 max-h-32 overflow-y-auto bg-white/60 p-2 rounded">
                  {this.state.info.componentStack}
                </pre>
              )}
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ActiviteErrorBoundary;
