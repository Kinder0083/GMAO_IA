import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { 
  BarChart3, TrendingUp, AlertTriangle, CheckCircle2, XCircle, 
  Wrench, FileText, Activity, ShieldAlert, Download, Loader2,
  ClipboardList, ShieldCheck, Bot
} from 'lucide-react';
import { surveillanceAPI } from '../services/api';
import { useToast } from '../hooks/use-toast';
import OfflineDisabled from '../components/Common/OfflineDisabled';
import { 
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend 
} from 'recharts';
import { OTTab, CapteursTab, SurveillanceTab, AutomationsTab } from '../components/IADashboard/IADashboardTabs';

const COLORS = ['#10b981', '#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899'];

// ==================== Tendances Tab (contenu original) ====================
function TendancesTab({ analytics, alerts }) {
  const reportRef = useRef(null);
  const [exporting, setExporting] = useState(false);

  const getSeverityColor = (severity) => {
    switch(severity) {
      case 'critique': return 'border-red-300 bg-red-50';
      case 'warning': return 'border-amber-300 bg-amber-50';
      case 'info': return 'border-blue-300 bg-blue-50';
      default: return 'border-gray-300 bg-gray-50';
    }
  };
  const getSeverityIcon = (severity) => {
    switch(severity) {
      case 'critique': return <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />;
      default: return <CheckCircle2 className="h-4 w-4 text-blue-500 flex-shrink-0" />;
    }
  };

  const exportPDF = async () => {
    setExporting(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(reportRef.current, { scale: 1.5, useCORS: true, backgroundColor: '#ffffff' });
      const pdf = new jsPDF('p', 'mm', 'a4');
      pdf.setFillColor(30, 58, 138);
      pdf.rect(0, 0, 210, 28, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(18);
      pdf.text('Rapport IA - Tendances NC & Conformite', 15, 18);
      pdf.setFontSize(9);
      pdf.text(`Genere le ${new Date().toLocaleDateString('fr-FR')}`, 15, 24);
      const imgData = canvas.toDataURL('image/png');
      const imgWidth = 190;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 10, 32, imgWidth, Math.min(imgHeight, 240));
      pdf.save(`rapport-ia-tendances-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e) {
      console.error(e);
    } finally {
      setExporting(false);
    }
  };

  if (!analytics || analytics.kpis?.total_analyses === 0) {
    return (
      <Card><CardContent className="py-12 text-center">
        <BarChart3 className="h-12 w-12 mx-auto text-gray-300 mb-3" />
        <p className="text-gray-500">Aucune analyse IA disponible</p>
        <p className="text-sm text-gray-400 mt-1">Lancez des analyses depuis le Plan de Surveillance</p>
      </CardContent></Card>
    );
  }

  const kpis = analytics.kpis || {};
  const formattedEvolution = (analytics.evolution_mensuelle || []).map(m => ({ ...m, label: m.mois }));
  const par_resultat = (analytics.par_resultat || []).map(r => ({ label: r.label || r.resultat, value: r.value || r.count, color: r.color || (r.label === 'Conforme' ? '#10b981' : r.label === 'Non conforme' ? '#ef4444' : '#f59e0b') }));
  const par_organisme = analytics.par_organisme || [];
  const par_categorie = analytics.par_categorie || [];
  const tendances_degradation = analytics.tendances_degradation || [];

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <OfflineDisabled message="Export necessite une connexion">
        <Button onClick={exportPDF} disabled={exporting} variant="outline" size="sm" data-testid="export-pdf-btn">
          {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          {exporting ? 'Generation...' : 'Export PDF'}
        </Button>
        </OfflineDisabled>
      </div>

      <div ref={reportRef} className="space-y-6">
        {alerts.length > 0 && (
          <div className="space-y-2" data-testid="smart-alerts">
            {alerts.slice(0, 5).map((alert, i) => (
              <Alert key={i} className={`border ${getSeverityColor(alert.severity)}`}>
                <div className="flex items-start gap-2">
                  {getSeverityIcon(alert.severity)}
                  <AlertDescription className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{alert.title}</span>
                      <Badge variant="outline" className="text-xs">{alert.severity}</Badge>
                    </div>
                    <p className="text-xs mt-0.5 opacity-80">{alert.details}</p>
                  </AlertDescription>
                </div>
              </Alert>
            ))}
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4" data-testid="kpis">
          <Card><CardContent className="p-4 text-center"><FileText className="h-6 w-6 mx-auto text-blue-500 mb-1" /><div className="text-2xl font-bold">{kpis.total_analyses}</div><div className="text-xs text-gray-500">Analyses IA</div></CardContent></Card>
          <Card><CardContent className="p-4 text-center"><BarChart3 className="h-6 w-6 mx-auto text-indigo-500 mb-1" /><div className="text-2xl font-bold">{kpis.total_controles}</div><div className="text-xs text-gray-500">Controles crees</div></CardContent></Card>
          <Card><CardContent className="p-4 text-center"><TrendingUp className="h-6 w-6 mx-auto text-emerald-500 mb-1" /><div className="text-2xl font-bold text-emerald-600">{kpis.taux_conformite}%</div><div className="text-xs text-gray-500">Taux conformite</div></CardContent></Card>
          <Card><CardContent className="p-4 text-center"><ShieldAlert className="h-6 w-6 mx-auto text-red-500 mb-1" /><div className="text-2xl font-bold text-red-600">{kpis.total_non_conformites}</div><div className="text-xs text-gray-500">Non-conformites</div></CardContent></Card>
          <Card><CardContent className="p-4 text-center"><Wrench className="h-6 w-6 mx-auto text-amber-500 mb-1" /><div className="text-2xl font-bold">{kpis.total_work_orders}</div><div className="text-xs text-gray-500">BT curatifs</div></CardContent></Card>
        </div>

        {/* Graphiques */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Evolution mensuelle de la conformite</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={formattedEvolution}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value, name) => {
                    const labels = { conformes: 'Conformes', non_conformes: 'Non conformes', controles: 'Total controles' };
                    return [value, labels[name] || name];
                  }} />
                  <Area type="monotone" dataKey="conformes" stackId="1" stroke="#10b981" fill="#10b981" fillOpacity={0.6} name="conformes" />
                  <Area type="monotone" dataKey="non_conformes" stackId="1" stroke="#ef4444" fill="#ef4444" fillOpacity={0.6} name="non_conformes" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Repartition des resultats</CardTitle></CardHeader>
            <CardContent>
              {par_resultat.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart><Pie data={par_resultat} cx="50%" cy="50%" innerRadius={50} outerRadius={90} dataKey="value" nameKey="label" label={({ label, value }) => `${label}: ${value}`}>
                    {par_resultat.map((entry, i) => <Cell key={i} fill={entry.color || COLORS[i % COLORS.length]} />)}
                  </Pie><Tooltip /><Legend /></PieChart>
                </ResponsiveContainer>
              ) : <div className="flex items-center justify-center h-[250px] text-gray-400 text-sm">Pas de donnees</div>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Analyses par organisme</CardTitle></CardHeader>
            <CardContent>
              {par_organisme.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={par_organisme} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" /><XAxis type="number" tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="organisme" tick={{ fontSize: 11 }} width={100} /><Tooltip />
                    <Bar dataKey="controles" fill="#3b82f6" name="Controles" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="non_conformites" fill="#ef4444" name="Non-conformites" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <div className="flex items-center justify-center h-[250px] text-gray-400 text-sm">Pas de donnees</div>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Conformite par categorie</CardTitle></CardHeader>
            <CardContent>
              {par_categorie.length > 0 ? (
                <div className="space-y-3">
                  {par_categorie.map((cat, i) => {
                    const total = cat.conformes + cat.non_conformes + cat.avec_reserves;
                    const tauxConf = total > 0 ? Math.round(cat.conformes / total * 100) : 0;
                    return (
                      <div key={cat.categorie} className="space-y-1">
                        <div className="flex justify-between text-sm"><span className="font-medium">{cat.categorie}</span><span className={tauxConf >= 80 ? 'text-emerald-600' : tauxConf >= 50 ? 'text-amber-600' : 'text-red-600'}>{tauxConf}% conforme</span></div>
                        <div className="w-full bg-gray-200 rounded-full h-2.5"><div className={`h-2.5 rounded-full transition-all ${tauxConf >= 80 ? 'bg-emerald-500' : tauxConf >= 50 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${tauxConf}%` }} /></div>
                        <div className="flex gap-2 text-xs text-gray-500"><span>{cat.conformes} C</span><span>{cat.non_conformes} NC</span><span>{cat.avec_reserves} AR</span><span className="ml-auto">{cat.analyses} analyse(s)</span></div>
                      </div>
                    );
                  })}
                </div>
              ) : <div className="flex items-center justify-center h-[250px] text-gray-400 text-sm">Pas de donnees</div>}
            </CardContent>
          </Card>
        </div>

        {tendances_degradation?.length > 0 && (
          <Card className="border-red-200" data-testid="degradation-trends">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2 text-red-700"><AlertTriangle className="h-4 w-4" /> Tendances de degradation detectees</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {tendances_degradation.map((t, i) => (
                  <div key={i} className={`flex items-center gap-3 p-3 rounded-lg border ${getSeverityColor(t.severity)}`}>
                    {getSeverityIcon(t.severity)}
                    <div className="flex-1"><span className="font-medium text-sm">{t.message}</span><p className="text-xs mt-0.5 opacity-80">{t.details}</p></div>
                    <Badge variant="outline" className="text-xs">{t.severity}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// ==================== Main Dashboard ====================
function SurveillanceAIDashboard() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [activeTab, setActiveTab] = useState('tendances');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [analyticsData, alertsData] = await Promise.all([
        surveillanceAPI.getAIAnalytics(),
        surveillanceAPI.getAIAlerts()
      ]);
      setAnalytics(analyticsData);
      setAlerts(alertsData.alerts || []);
    } catch (error) {
      toast({ title: 'Erreur', description: 'Impossible de charger les donnees', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadData(); }, [loadData]);

  return (
    <div className="space-y-6" data-testid="ia-dashboard">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Tableau de bord IA</h1>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="tendances" className="flex items-center gap-1.5 text-xs" data-testid="tab-tendances">
            <TrendingUp className="h-3.5 w-3.5" /> Tendances
          </TabsTrigger>
          <TabsTrigger value="ot" className="flex items-center gap-1.5 text-xs" data-testid="tab-ot">
            <Wrench className="h-3.5 w-3.5" /> Ordres de travail
          </TabsTrigger>
          <TabsTrigger value="capteurs" className="flex items-center gap-1.5 text-xs" data-testid="tab-capteurs">
            <Activity className="h-3.5 w-3.5" /> Capteurs
          </TabsTrigger>
          <TabsTrigger value="surveillance" className="flex items-center gap-1.5 text-xs" data-testid="tab-surveillance">
            <ShieldCheck className="h-3.5 w-3.5" /> Surveillance
          </TabsTrigger>
          <TabsTrigger value="automations" className="flex items-center gap-1.5 text-xs" data-testid="tab-automations">
            <Bot className="h-3.5 w-3.5" /> Automatisations
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tendances">
          {loading ? (
            <div className="flex items-center justify-center min-h-[400px] text-gray-500"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Chargement...</div>
          ) : (
            <TendancesTab analytics={analytics} alerts={alerts} />
          )}
        </TabsContent>
        <TabsContent value="ot"><OTTab /></TabsContent>
        <TabsContent value="capteurs"><CapteursTab /></TabsContent>
        <TabsContent value="surveillance"><SurveillanceTab /></TabsContent>
        <TabsContent value="automations"><AutomationsTab /></TabsContent>
      </Tabs>
    </div>
  );
}

export default SurveillanceAIDashboard;
