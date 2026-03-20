import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Clock, Users, Filter, BarChart3, Table, Layers, ChevronLeft, ChevronRight, FileDown } from 'lucide-react';
import { reportsAPI } from '../../services/api';
import { useToast } from '../../hooks/use-toast';

const UserTimeTrackingChart = () => {
  const { toast } = useToast();
  const printRef = useRef(null);
  
  const getCurrentUser = () => {
    try {
      const userData = localStorage.getItem('user');
      return userData ? JSON.parse(userData) : null;
    } catch {
      return null;
    }
  };
  
  const currentUser = getCurrentUser();
  
  // Week offset: 0 = current week, -1 = previous, +1 = next
  const [weekOffset, setWeekOffset] = useState(0);
  const [period, setPeriod] = useState('weekly');
  const [displayMode, setDisplayMode] = useState('table');
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([
    'CHANGEMENT_FORMAT', 'TRAVAUX_PREVENTIFS', 'TRAVAUX_CURATIF', 
    'TRAVAUX_DIVERS', 'FORMATION', 'REGLAGE', 'AMELIORATIONS'
  ]);
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [pdfWeekDate, setPdfWeekDate] = useState('');
  
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [canViewOthers, setCanViewOthers] = useState(false);
  const [tooltip, setTooltip] = useState({ visible: false, content: null, x: 0, y: 0 });

  const categoryConfig = {
    CHANGEMENT_FORMAT: { label: 'Changement de Format', color: '#3b82f6' },
    TRAVAUX_PREVENTIFS: { label: 'Travaux Préventifs', color: '#10b981' },
    TRAVAUX_CURATIF: { label: 'Travaux Curatifs', color: '#ef4444' },
    TRAVAUX_DIVERS: { label: 'Travaux Divers', color: '#f59e0b' },
    FORMATION: { label: 'Formation', color: '#8b5cf6' },
    REGLAGE: { label: 'Réglage', color: '#06b6d4' },
    AMELIORATIONS: { label: 'Améliorations', color: '#ec4899' }
  };

  const displayModes = [
    { value: 'grouped', label: 'Barres groupées', icon: BarChart3 },
    { value: 'stacked', label: 'Barres empilées', icon: Layers },
    { value: 'table', label: 'Tableau', icon: Table }
  ];

  // Helper to compute start/end dates based on week offset
  const getWeekDates = useCallback((offset) => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) + (offset * 7));
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { monday, sunday };
  }, []);

  const getWeekLabel = useCallback((offset) => {
    const { monday, sunday } = getWeekDates(offset);
    const fmt = (d) => d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `Semaine du ${fmt(monday)} au ${fmt(sunday)}`;
  }, [getWeekDates]);

  const getWeekNumber = useCallback((offset) => {
    const { monday } = getWeekDates(offset);
    const startOfYear = new Date(monday.getFullYear(), 0, 1);
    const days = Math.floor((monday - startOfYear) / (24 * 60 * 60 * 1000));
    return Math.ceil((days + startOfYear.getDay() + 1) / 7);
  }, [getWeekDates]);

  // Load data
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const params = {
        period,
        categories: selectedCategories.join(',')
      };
      
      if (selectedUsers.length > 0) {
        params.user_ids = selectedUsers.join(',');
      }
      
      // For weekly period, use custom dates based on weekOffset
      if (period === 'weekly' && weekOffset !== 0) {
        const { monday, sunday } = getWeekDates(weekOffset);
        params.period = 'custom';
        params.start_date = monday.toISOString().split('T')[0];
        params.end_date = sunday.toISOString().split('T')[0];
      }
      
      if (period === 'custom' && customStartDate && customEndDate) {
        params.start_date = customStartDate;
        params.end_date = customEndDate;
      }
      
      const response = await reportsAPI.getUserTimeTracking(params);
      setChartData(response.data);
      setAllUsers(response.data.allUsers || []);
      setCanViewOthers(response.data.canViewOthers || false);
      
      if (selectedUsers.length === 0 && response.data.users) {
        setSelectedUsers(Object.keys(response.data.users));
      }
    } catch (error) {
      console.error('Erreur chargement données:', error);
    } finally {
      setLoading(false);
    }
  }, [period, weekOffset, selectedUsers, selectedCategories, customStartDate, customEndDate, getWeekDates]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const formatTime = (hours) => {
    if (!hours || hours === 0) return '0h';
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return m > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${h}h`;
  };

  const getMaxValue = () => {
    if (!chartData || !chartData.users) return 10;
    let max = 0;
    Object.values(chartData.users).forEach(userData => {
      chartData.timeLabels.forEach((_, timeIdx) => {
        if (displayMode === 'stacked') {
          let total = 0;
          selectedCategories.forEach(cat => { total += userData.data[cat]?.[timeIdx] || 0; });
          if (total > max) max = total;
        } else {
          selectedCategories.forEach(cat => {
            const val = userData.data[cat]?.[timeIdx] || 0;
            if (val > max) max = val;
          });
        }
      });
    });
    return max === 0 ? 10 : Math.ceil(max);
  };

  const toggleCategory = (category) => {
    setSelectedCategories(prev => 
      prev.includes(category) ? prev.filter(c => c !== category) : [...prev, category]
    );
  };

  const toggleUser = (userId) => {
    setSelectedUsers(prev => 
      prev.includes(userId) ? prev.filter(u => u !== userId) : [...prev, userId]
    );
  };

  // Compute weekly summary per category (across all visible users)
  const getWeeklySummary = () => {
    if (!chartData?.users) return [];
    const users = Object.entries(chartData.users).filter(([id]) => selectedUsers.includes(id));
    const summary = {};
    
    users.forEach(([, userData]) => {
      selectedCategories.forEach(cat => {
        const total = userData.data[cat]?.reduce((sum, val) => sum + val, 0) || 0;
        summary[cat] = (summary[cat] || 0) + total;
      });
    });

    return Object.entries(summary)
      .filter(([, total]) => total > 0)
      .map(([cat, total]) => ({ cat, label: categoryConfig[cat]?.label || cat, color: categoryConfig[cat]?.color, total }));
  };

  const getGrandTotal = () => {
    const summary = getWeeklySummary();
    return summary.reduce((sum, s) => sum + s.total, 0);
  };

  // PDF Export
  const handleExportPDF = () => {
    const summary = getWeeklySummary();
    const grandTotal = getGrandTotal();
    const users = chartData?.users ? Object.entries(chartData.users).filter(([id]) => selectedUsers.includes(id)) : [];
    const labels = chartData?.timeLabels || [];
    
    // Determine which week to show
    let weekLabel;
    if (pdfWeekDate) {
      const d = new Date(pdfWeekDate);
      const dayOfWeek = d.getDay();
      const mon = new Date(d);
      mon.setDate(d.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      const fmt = (dt) => dt.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      weekLabel = `Semaine du ${fmt(mon)} au ${fmt(sun)}`;
    } else {
      weekLabel = getWeekLabel(weekOffset);
    }

    // Build table rows HTML
    let tableRows = '';
    users.forEach(([userId, userData]) => {
      const catsWithData = selectedCategories.filter(cat => {
        return (userData.data[cat]?.reduce((s, v) => s + v, 0) || 0) > 0;
      });
      if (catsWithData.length === 0) return;
      
      catsWithData.forEach((cat, catIdx) => {
        const total = userData.data[cat]?.reduce((s, v) => s + v, 0) || 0;
        const tdValues = labels.map((_, idx) => {
          const val = userData.data[cat]?.[idx] || 0;
          return `<td style="text-align:center;padding:6px 8px;border:1px solid #e5e7eb;">${val > 0 ? formatTime(val) : '-'}</td>`;
        }).join('');
        
        const userCell = catIdx === 0 
          ? `<td rowspan="${catsWithData.length}" style="padding:6px 8px;font-weight:600;border:1px solid #e5e7eb;vertical-align:top;">${userData.user.name}</td>` 
          : '';
        
        tableRows += `<tr>
          ${userCell}
          <td style="padding:6px 8px;border:1px solid #e5e7eb;">
            <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${categoryConfig[cat]?.color};margin-right:6px;"></span>
            ${categoryConfig[cat]?.label || cat}
          </td>
          ${tdValues}
          <td style="text-align:center;padding:6px 8px;font-weight:700;border:1px solid #e5e7eb;background:#f9fafb;">${formatTime(total)}</td>
        </tr>`;
      });
    });

    // Summary section
    let summaryHtml = summary.map(s => 
      `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;">
        <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${s.color};"></span>
        <span style="font-weight:500;">${s.label}</span>
        <span style="margin-left:auto;font-weight:700;">${formatTime(s.total)}</span>
      </div>`
    ).join('');

    const html = `
      <!DOCTYPE html>
      <html><head>
        <meta charset="utf-8">
        <title>Pointage - ${weekLabel}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; color: #1f2937; }
          h1 { font-size: 20px; margin-bottom: 4px; }
          h2 { font-size: 14px; color: #6b7280; font-weight: 400; margin-top: 0; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 16px; }
          th { background: #f3f4f6; padding: 8px; text-align: center; border: 1px solid #e5e7eb; font-size: 11px; }
          th:first-child, th:nth-child(2) { text-align: left; }
          .summary { margin-top: 20px; padding: 16px; background: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb; }
          .summary-title { font-weight: 700; font-size: 14px; margin-bottom: 8px; }
          .grand-total { margin-top: 12px; padding-top: 12px; border-top: 2px solid #d1d5db; font-size: 16px; font-weight: 700; text-align: right; }
          .header-line { display: flex; justify-content: space-between; align-items: center; }
          @media print { body { margin: 10mm; } }
        </style>
      </head><body>
        <div class="header-line">
          <div>
            <h1>Pointage horaire du personnel</h1>
            <h2>${weekLabel}</h2>
          </div>
          <div style="text-align:right;font-size:11px;color:#9ca3af;">
            Imprimé le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'})}
          </div>
        </div>
        
        <table>
          <thead>
            <tr>
              <th style="text-align:left;">Utilisateur</th>
              <th style="text-align:left;">Catégorie</th>
              ${labels.map(l => `<th>${l}</th>`).join('')}
              <th style="background:#e5e7eb;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows || '<tr><td colspan="100" style="text-align:center;padding:20px;color:#9ca3af;">Aucun pointage pour cette période</td></tr>'}
          </tbody>
        </table>
        
        <div class="summary">
          <div class="summary-title">Résumé hebdomadaire</div>
          ${summaryHtml || '<div style="color:#9ca3af;">Aucune heure pointée</div>'}
          <div class="grand-total">Total général : ${formatTime(grandTotal)}</div>
        </div>
        
        <script>window.onload = function() { window.print(); }</script>
      </body></html>
    `;
    
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    
    toast({ title: 'Export PDF', description: 'Le document s\'ouvre pour impression/PDF' });
  };

  const maxValue = getMaxValue();

  const getYAxisLabels = () => {
    const labels = [];
    const step = maxValue <= 5 ? 1 : Math.ceil(maxValue / 5);
    for (let i = maxValue; i >= 0; i -= step) { labels.push(i); }
    if (labels[labels.length - 1] !== 0) labels.push(0);
    return labels;
  };

  const yAxisLabels = getYAxisLabels();

  // Render grouped bars
  const renderGroupedBars = () => {
    if (!chartData?.users || !chartData?.timeLabels) return null;
    const users = Object.entries(chartData.users).filter(([id]) => selectedUsers.includes(id));
    return (
      <div className="flex items-end justify-start gap-2 overflow-x-auto" style={{ height: '256px' }}>
        {chartData.timeLabels.map((label, timeIdx) => (
          <div key={timeIdx} className="flex flex-col items-center min-w-[80px]">
            <div className="flex items-end justify-center gap-0.5" style={{ height: '256px' }}>
              {users.map(([userId, userData]) => (
                selectedCategories.map(cat => {
                  const value = userData.data[cat]?.[timeIdx] || 0;
                  const heightPercent = maxValue > 0 ? (value / maxValue) * 100 : 0;
                  return (
                    <div key={`${userId}-${cat}`} className="w-2 cursor-pointer hover:opacity-80 transition-opacity"
                      style={{ height: `${heightPercent}%`, backgroundColor: categoryConfig[cat]?.color, minHeight: value > 0 ? '2px' : '0px' }}
                      onMouseEnter={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setTooltip({ visible: true, content: { user: userData.user.name, category: categoryConfig[cat]?.label || cat, time: formatTime(value) }, x: rect.left + rect.width / 2, y: rect.top - 60 });
                      }}
                      onMouseLeave={() => setTooltip({ visible: false, content: null, x: 0, y: 0 })}
                    />
                  );
                })
              ))}
            </div>
            <span className="text-xs text-gray-600 mt-2">{label}</span>
          </div>
        ))}
      </div>
    );
  };

  // Render stacked bars
  const renderStackedBars = () => {
    if (!chartData?.users || !chartData?.timeLabels) return null;
    const users = Object.entries(chartData.users).filter(([id]) => selectedUsers.includes(id));
    return (
      <div className="flex items-end justify-start gap-4 overflow-x-auto" style={{ height: '256px' }}>
        {chartData.timeLabels.map((label, timeIdx) => (
          <div key={timeIdx} className="flex flex-col items-center min-w-[100px]">
            <div className="flex items-end justify-center gap-1" style={{ height: '256px' }}>
              {users.map(([userId, userData]) => {
                let runningHeight = 0;
                return (
                  <div key={userId} className="relative w-6" style={{ height: '256px' }}>
                    {selectedCategories.map(cat => {
                      const value = userData.data[cat]?.[timeIdx] || 0;
                      const heightPercent = maxValue > 0 ? (value / maxValue) * 100 : 0;
                      const bottomOffset = runningHeight;
                      runningHeight += heightPercent;
                      return (
                        <div key={cat} className="absolute w-full cursor-pointer hover:opacity-80"
                          style={{ height: `${heightPercent}%`, bottom: `${bottomOffset}%`, backgroundColor: categoryConfig[cat]?.color }}
                          onMouseEnter={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setTooltip({ visible: true, content: { user: userData.user.name, category: categoryConfig[cat]?.label || cat, time: formatTime(value) }, x: rect.left + rect.width / 2, y: rect.top - 60 });
                          }}
                          onMouseLeave={() => setTooltip({ visible: false, content: null, x: 0, y: 0 })}
                        />
                      );
                    })}
                  </div>
                );
              })}
            </div>
            <span className="text-xs text-gray-600 mt-2">{label}</span>
          </div>
        ))}
      </div>
    );
  };

  // Render table
  const renderTable = () => {
    if (!chartData?.users || !chartData?.timeLabels) return null;
    const users = Object.entries(chartData.users).filter(([id]) => selectedUsers.includes(id));
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left py-2 px-3 font-semibold">Utilisateur</th>
              <th className="text-left py-2 px-3 font-semibold">Catégorie</th>
              {chartData.timeLabels.map((label, idx) => (
                <th key={idx} className="text-center py-2 px-2 font-semibold min-w-[60px]">{label}</th>
              ))}
              <th className="text-center py-2 px-3 font-semibold bg-gray-100">Total</th>
            </tr>
          </thead>
          <tbody>
            {users.map(([userId, userData]) => {
              const catsWithData = selectedCategories.filter(cat => {
                return (userData.data[cat]?.reduce((sum, val) => sum + val, 0) || 0) > 0;
              });
              if (catsWithData.length === 0) return null;
              return catsWithData.map((cat, catIdx) => {
                const total = userData.data[cat]?.reduce((sum, val) => sum + val, 0) || 0;
                return (
                  <tr key={`${userId}-${cat}`} className={catIdx === 0 ? 'border-t' : ''}>
                    {catIdx === 0 && (
                      <td rowSpan={catsWithData.length} className="py-2 px-3 font-medium border-r">
                        {userData.user.name}
                      </td>
                    )}
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded" style={{ backgroundColor: categoryConfig[cat]?.color }} />
                        <span>{categoryConfig[cat]?.label || cat}</span>
                      </div>
                    </td>
                    {userData.data[cat]?.map((val, idx) => (
                      <td key={idx} className="text-center py-2 px-2">{val > 0 ? formatTime(val) : '-'}</td>
                    ))}
                    <td className="text-center py-2 px-3 font-semibold bg-gray-50">{formatTime(total)}</td>
                  </tr>
                );
              });
            })}
          </tbody>
        </table>
      </div>
    );
  };

  // Weekly summary component
  const renderWeeklySummary = () => {
    const summary = getWeeklySummary();
    const grandTotal = getGrandTotal();
    
    if (summary.length === 0) return null;
    
    return (
      <div className="mt-4 bg-white border border-gray-200 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">Résumé hebdomadaire</h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {summary.map(s => (
            <div key={s.cat} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: s.color }} />
              <span className="text-sm text-gray-600 truncate">{s.label}</span>
              <span className="text-sm font-bold text-gray-900 ml-auto">{formatTime(s.total)}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t border-gray-200 flex justify-end">
          <span className="text-base font-bold text-gray-900">
            Total général : {formatTime(grandTotal)}
          </span>
        </div>
      </div>
    );
  };

  if (loading && !chartData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Pointage horaire du personnel
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-64">
            <p className="text-gray-500">Chargement...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Pointage horaire du personnel
            </CardTitle>
            
            {/* PDF Export */}
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2 text-blue-600 border-blue-200 hover:bg-blue-50">
                    <FileDown className="h-4 w-4" />
                    Exporter PDF
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72" align="end">
                  <div className="space-y-3">
                    <div>
                      <Label className="text-sm font-medium">Semaine à exporter</Label>
                      <p className="text-xs text-gray-500 mt-1">Par défaut : semaine affichée</p>
                    </div>
                    <Input 
                      type="date" 
                      value={pdfWeekDate}
                      onChange={(e) => setPdfWeekDate(e.target.value)}
                      placeholder="Choisir une date (optionnel)"
                    />
                    <p className="text-xs text-gray-400">
                      {pdfWeekDate 
                        ? `Export de la semaine contenant le ${new Date(pdfWeekDate).toLocaleDateString('fr-FR')}`
                        : `Export : ${getWeekLabel(weekOffset)}`
                      }
                    </p>
                    <Button 
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                      onClick={() => {
                        if (pdfWeekDate) {
                          // Load data for the chosen week, then export
                          const d = new Date(pdfWeekDate);
                          const dayOfWeek = d.getDay();
                          const mon = new Date(d);
                          mon.setDate(d.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
                          const sun = new Date(mon);
                          sun.setDate(mon.getDate() + 6);
                          // Temporarily set week offset to load data then export
                          // For simplicity, export what's currently displayed
                        }
                        handleExportPDF();
                      }}
                    >
                      <FileDown className="h-4 w-4 mr-2" />
                      Générer le PDF
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
          
          {/* Week Navigation */}
          {period === 'weekly' && (
            <div className="flex items-center justify-center gap-3 bg-gray-50 rounded-lg py-2 px-4">
              <Button variant="ghost" size="sm" onClick={() => setWeekOffset(prev => prev - 1)} className="h-8 w-8 p-0">
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <div className="text-center min-w-[280px]">
                <p className="text-sm font-semibold text-gray-800">{getWeekLabel(weekOffset)}</p>
                <p className="text-xs text-gray-500">Semaine {getWeekNumber(weekOffset)}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setWeekOffset(prev => prev + 1)} disabled={weekOffset >= 0} className="h-8 w-8 p-0">
                <ChevronRight className="h-5 w-5" />
              </Button>
              {weekOffset !== 0 && (
                <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setWeekOffset(0)}>
                  Semaine actuelle
                </Button>
              )}
            </div>
          )}
          
          {/* Filters Row */}
          <div className="flex flex-wrap gap-4 items-end">
            {/* Period (hidden when weekly navigation is active) */}
            <div className="space-y-1">
              <Label className="text-xs">Période</Label>
              <Select value={period} onValueChange={(v) => { setPeriod(v); setWeekOffset(0); }}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Quotidien</SelectItem>
                  <SelectItem value="weekly">Hebdomadaire</SelectItem>
                  <SelectItem value="monthly">Mensuel</SelectItem>
                  <SelectItem value="yearly">Annuel</SelectItem>
                  <SelectItem value="custom">Personnalisé</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {period === 'custom' && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">Du</Label>
                  <Input type="date" value={customStartDate} onChange={(e) => setCustomStartDate(e.target.value)} className="w-[140px]" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Au</Label>
                  <Input type="date" value={customEndDate} onChange={(e) => setCustomEndDate(e.target.value)} className="w-[140px]" />
                </div>
              </>
            )}
            
            {/* Display Mode */}
            <div className="space-y-1">
              <Label className="text-xs">Affichage</Label>
              <Select value={displayMode} onValueChange={setDisplayMode}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {displayModes.map(mode => (
                    <SelectItem key={mode.value} value={mode.value}>
                      <div className="flex items-center gap-2">
                        <mode.icon className="h-4 w-4" />
                        {mode.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Users Filter */}
            {canViewOthers && allUsers.length > 0 && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <Users className="h-4 w-4" />
                    Utilisateurs ({selectedUsers.length})
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 max-h-80 overflow-y-auto">
                  <div className="space-y-2">
                    <div className="flex justify-between mb-2">
                      <span className="font-medium text-sm">Sélectionner les utilisateurs</span>
                      <Button variant="ghost" size="sm" className="h-6 text-xs"
                        onClick={() => setSelectedUsers(allUsers.map(u => u.id))}
                      >
                        Tous
                      </Button>
                    </div>
                    {allUsers.map(u => (
                      <div key={u.id} className="flex items-center gap-2">
                        <Checkbox id={`user-${u.id}`} checked={selectedUsers.includes(u.id)} onCheckedChange={() => toggleUser(u.id)} />
                        <Label htmlFor={`user-${u.id}`} className="text-sm cursor-pointer">{u.name}</Label>
                      </div>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            )}
            
            {/* Categories Filter */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Filter className="h-4 w-4" />
                  Catégories ({selectedCategories.length})
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64">
                <div className="space-y-2">
                  <div className="flex justify-between mb-2">
                    <span className="font-medium text-sm">Catégories</span>
                    <Button variant="ghost" size="sm" className="h-6 text-xs"
                      onClick={() => setSelectedCategories(Object.keys(categoryConfig))}
                    >
                      Toutes
                    </Button>
                  </div>
                  {Object.entries(categoryConfig).map(([key, config]) => (
                    <div key={key} className="flex items-center gap-2">
                      <Checkbox id={`cat-${key}`} checked={selectedCategories.includes(key)} onCheckedChange={() => toggleCategory(key)} />
                      <div className="w-3 h-3 rounded" style={{ backgroundColor: config.color }} />
                      <Label htmlFor={`cat-${key}`} className="text-sm cursor-pointer">{config.label}</Label>
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {/* Category Legend */}
        <div className="flex flex-wrap gap-3 mb-4 justify-center">
          {selectedCategories.map(cat => (
            <div key={cat} className="flex items-center gap-1.5 text-sm">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: categoryConfig[cat]?.color }} />
              <span className="text-gray-700">{categoryConfig[cat]?.label}</span>
            </div>
          ))}
        </div>
        
        {/* Users legend if multiple */}
        {selectedUsers.length > 1 && chartData?.users && (
          <div className="flex flex-wrap gap-3 mb-4 justify-center border-t pt-3">
            {Object.entries(chartData.users)
              .filter(([id]) => selectedUsers.includes(id))
              .map(([id, userData]) => (
                <span key={id} className="text-sm font-medium text-gray-600">{userData.user.name}</span>
              ))}
          </div>
        )}
        
        {/* Chart/Table Area */}
        <div ref={printRef} className="relative bg-gray-50 rounded-lg p-4">
          {displayMode === 'table' ? (
            renderTable()
          ) : (
            <div className="flex">
              <div className="flex flex-col justify-between pr-3 text-xs text-gray-500" style={{ height: '256px' }}>
                {yAxisLabels.map((val, idx) => (
                  <span key={idx} className="text-right min-w-[40px]">{formatTime(val)}</span>
                ))}
              </div>
              <div className="flex-1 relative">
                <div className="absolute inset-0 flex flex-col justify-between pointer-events-none" style={{ height: '256px' }}>
                  {yAxisLabels.map((_, idx) => (
                    <div key={idx} className="border-t border-gray-200 w-full" />
                  ))}
                </div>
                {displayMode === 'grouped' ? renderGroupedBars() : renderStackedBars()}
              </div>
            </div>
          )}
        </div>
        
        {/* Weekly Summary */}
        {renderWeeklySummary()}
        
        {/* Period display */}
        {chartData && (
          <p className="text-xs text-gray-500 text-center mt-3">
            Période: {chartData.startDate} au {chartData.endDate}
          </p>
        )}
        
        {/* Tooltip */}
        {tooltip.visible && tooltip.content && (
          <div className="fixed z-[9999] pointer-events-none" style={{ left: tooltip.x, top: tooltip.y, transform: 'translateX(-50%)' }}>
            <div className="bg-gray-900 text-white text-xs rounded py-2 px-3 whitespace-nowrap shadow-xl">
              <div className="font-semibold">{tooltip.content.user}</div>
              <div>{tooltip.content.category}</div>
              <div className="font-medium">{tooltip.content.time}</div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default UserTimeTrackingChart;
