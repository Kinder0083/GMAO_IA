import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Clock, Users, Filter, BarChart3, Table, Layers } from 'lucide-react';
import { reportsAPI } from '../../services/api';
import { useToast } from '../../hooks/use-toast';

const UserTimeTrackingChart = () => {
  const { toast } = useToast();
  
  // Récupérer l'utilisateur depuis localStorage
  const getCurrentUser = () => {
    try {
      const userData = localStorage.getItem('user');
      return userData ? JSON.parse(userData) : null;
    } catch {
      return null;
    }
  };
  
  const currentUser = getCurrentUser();
  
  // États pour les filtres
  const [period, setPeriod] = useState('weekly');
  const [displayMode, setDisplayMode] = useState('table'); // grouped, stacked, table
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([
    'CHANGEMENT_FORMAT', 'TRAVAUX_PREVENTIFS', 'TRAVAUX_CURATIF', 
    'TRAVAUX_DIVERS', 'FORMATION', 'REGLAGE', 'AMELIORATIONS'
  ]);
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  
  // États pour les données
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [canViewOthers, setCanViewOthers] = useState(false);
  
  // Tooltip
  const [tooltip, setTooltip] = useState({ visible: false, content: null, x: 0, y: 0 });

  // Configuration des catégories
  const categoryConfig = {
    CHANGEMENT_FORMAT: { label: 'Changement de Format', color: '#3b82f6' },
    TRAVAUX_PREVENTIFS: { label: 'Travaux Préventifs', color: '#10b981' },
    TRAVAUX_CURATIF: { label: 'Travaux Curatifs', color: '#ef4444' },
    TRAVAUX_DIVERS: { label: 'Travaux Divers', color: '#f59e0b' },
    FORMATION: { label: 'Formation', color: '#8b5cf6' },
    REGLAGE: { label: 'Réglage', color: '#06b6d4' },
    AMELIORATIONS: { label: 'Améliorations', color: '#ec4899' }
  };

  // Configuration des périodes
  const periodOptions = [
    { value: 'daily', label: 'Quotidien' },
    { value: 'weekly', label: 'Hebdomadaire' },
    { value: 'monthly', label: 'Mensuel' },
    { value: 'yearly', label: 'Annuel' },
    { value: 'custom', label: 'Personnalisé' }
  ];

  // Configuration des modes d'affichage
  const displayModes = [
    { value: 'grouped', label: 'Barres groupées', icon: BarChart3 },
    { value: 'stacked', label: 'Barres empilées', icon: Layers },
    { value: 'table', label: 'Tableau', icon: Table }
  ];

  // Charger les données
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
      
      if (period === 'custom' && customStartDate && customEndDate) {
        params.start_date = customStartDate;
        params.end_date = customEndDate;
      }
      
      const response = await reportsAPI.getUserTimeTracking(params);
      setChartData(response.data);
      setAllUsers(response.data.allUsers || []);
      setCanViewOthers(response.data.canViewOthers || false);
      
      // Initialiser les utilisateurs sélectionnés si vide
      if (selectedUsers.length === 0 && response.data.users) {
        setSelectedUsers(Object.keys(response.data.users));
      }
    } catch (error) {
      console.error('Erreur chargement données:', error);
      toast({
        title: 'Erreur',
        description: 'Impossible de charger les données de pointage',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }, [period, selectedUsers, selectedCategories, customStartDate, customEndDate, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Formater le temps en heures:minutes
  const formatTime = (hours) => {
    if (!hours || hours === 0) return '0h';
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return m > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${h}h`;
  };

  // Calculer le maximum pour l'échelle
  const getMaxValue = () => {
    if (!chartData || !chartData.users) return 10;
    let max = 0;
    
    Object.values(chartData.users).forEach(userData => {
      chartData.timeLabels.forEach((_, timeIdx) => {
        if (displayMode === 'stacked') {
          // Pour empilé, on additionne toutes les catégories
          let total = 0;
          selectedCategories.forEach(cat => {
            total += userData.data[cat]?.[timeIdx] || 0;
          });
          if (total > max) max = total;
        } else {
          // Pour groupé, on prend le max individuel
          selectedCategories.forEach(cat => {
            const val = userData.data[cat]?.[timeIdx] || 0;
            if (val > max) max = val;
          });
        }
      });
    });
    
    return max === 0 ? 10 : Math.ceil(max);
  };

  // Toggle catégorie
  const toggleCategory = (category) => {
    setSelectedCategories(prev => 
      prev.includes(category) 
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  // Toggle utilisateur
  const toggleUser = (userId) => {
    setSelectedUsers(prev => 
      prev.includes(userId)
        ? prev.filter(u => u !== userId)
        : [...prev, userId]
    );
  };

  const maxValue = getMaxValue();

  // Générer les graduations Y
  const getYAxisLabels = () => {
    const labels = [];
    const step = maxValue <= 5 ? 1 : Math.ceil(maxValue / 5);
    for (let i = maxValue; i >= 0; i -= step) {
      labels.push(i);
    }
    if (labels[labels.length - 1] !== 0) labels.push(0);
    return labels;
  };

  const yAxisLabels = getYAxisLabels();

  // Rendu du graphique en barres groupées
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
                    <div
                      key={`${userId}-${cat}`}
                      className="w-2 cursor-pointer hover:opacity-80 transition-opacity"
                      style={{
                        height: `${heightPercent}%`,
                        backgroundColor: categoryConfig[cat]?.color || '#gray',
                        minHeight: value > 0 ? '2px' : '0px'
                      }}
                      onMouseEnter={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setTooltip({
                          visible: true,
                          content: {
                            user: userData.user.name,
                            category: categoryConfig[cat]?.label || cat,
                            time: formatTime(value)
                          },
                          x: rect.left + rect.width / 2,
                          y: rect.top - 60
                        });
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

  // Rendu du graphique en barres empilées
  const renderStackedBars = () => {
    if (!chartData?.users || !chartData?.timeLabels) return null;
    
    const users = Object.entries(chartData.users).filter(([id]) => selectedUsers.includes(id));
    
    return (
      <div className="flex items-end justify-start gap-4 overflow-x-auto" style={{ height: '256px' }}>
        {chartData.timeLabels.map((label, timeIdx) => (
          <div key={timeIdx} className="flex flex-col items-center min-w-[100px]">
            <div className="flex items-end justify-center gap-1" style={{ height: '256px' }}>
              {users.map(([userId, userData]) => {
                // Calculer le total pour ce temps
                let runningHeight = 0;
                
                return (
                  <div key={userId} className="relative w-6" style={{ height: '256px' }}>
                    {selectedCategories.map(cat => {
                      const value = userData.data[cat]?.[timeIdx] || 0;
                      const heightPercent = maxValue > 0 ? (value / maxValue) * 100 : 0;
                      const bottomOffset = runningHeight;
                      runningHeight += heightPercent;
                      
                      return (
                        <div
                          key={cat}
                          className="absolute w-full cursor-pointer hover:opacity-80"
                          style={{
                            height: `${heightPercent}%`,
                            bottom: `${bottomOffset}%`,
                            backgroundColor: categoryConfig[cat]?.color || '#gray'
                          }}
                          onMouseEnter={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setTooltip({
                              visible: true,
                              content: {
                                user: userData.user.name,
                                category: categoryConfig[cat]?.label || cat,
                                time: formatTime(value)
                              },
                              x: rect.left + rect.width / 2,
                              y: rect.top - 60
                            });
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

  // Rendu du tableau
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
              // Filtrer les catégories ayant au moins un pointage pour cet utilisateur
              const catsWithData = selectedCategories.filter(cat => {
                const total = userData.data[cat]?.reduce((sum, val) => sum + val, 0) || 0;
                return total > 0;
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
                        <div 
                          className="w-3 h-3 rounded" 
                          style={{ backgroundColor: categoryConfig[cat]?.color }}
                        />
                        <span>{categoryConfig[cat]?.label || cat}</span>
                      </div>
                    </td>
                    {userData.data[cat]?.map((val, idx) => (
                      <td key={idx} className="text-center py-2 px-2">
                        {val > 0 ? formatTime(val) : '-'}
                      </td>
                    ))}
                    <td className="text-center py-2 px-3 font-semibold bg-gray-50">
                      {formatTime(total)}
                    </td>
                  </tr>
                );
              });
            })}
          </tbody>
        </table>
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
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Pointage horaire du personnel
          </CardTitle>
          
          {/* Filtres */}
          <div className="flex flex-wrap gap-4 items-end">
            {/* Période */}
            <div className="space-y-1">
              <Label className="text-xs">Période</Label>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {periodOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Dates personnalisées */}
            {period === 'custom' && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">Du</Label>
                  <Input 
                    type="date" 
                    value={customStartDate} 
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="w-[140px]"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Au</Label>
                  <Input 
                    type="date" 
                    value={customEndDate} 
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="w-[140px]"
                  />
                </div>
              </>
            )}
            
            {/* Mode d'affichage */}
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
            
            {/* Filtre utilisateurs */}
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
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-6 text-xs"
                        onClick={() => setSelectedUsers(allUsers.map(u => u.id))}
                      >
                        Tous
                      </Button>
                    </div>
                    {allUsers.map(u => (
                      <div key={u.id} className="flex items-center gap-2">
                        <Checkbox 
                          id={`user-${u.id}`}
                          checked={selectedUsers.includes(u.id)}
                          onCheckedChange={() => toggleUser(u.id)}
                        />
                        <Label htmlFor={`user-${u.id}`} className="text-sm cursor-pointer">
                          {u.name}
                        </Label>
                      </div>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            )}
            
            {/* Filtre catégories */}
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
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-6 text-xs"
                      onClick={() => setSelectedCategories(Object.keys(categoryConfig))}
                    >
                      Toutes
                    </Button>
                  </div>
                  {Object.entries(categoryConfig).map(([key, config]) => (
                    <div key={key} className="flex items-center gap-2">
                      <Checkbox 
                        id={`cat-${key}`}
                        checked={selectedCategories.includes(key)}
                        onCheckedChange={() => toggleCategory(key)}
                      />
                      <div 
                        className="w-3 h-3 rounded" 
                        style={{ backgroundColor: config.color }}
                      />
                      <Label htmlFor={`cat-${key}`} className="text-sm cursor-pointer">
                        {config.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {/* Légende des catégories */}
        <div className="flex flex-wrap gap-3 mb-4 justify-center">
          {selectedCategories.map(cat => (
            <div key={cat} className="flex items-center gap-1.5 text-sm">
              <div 
                className="w-3 h-3 rounded" 
                style={{ backgroundColor: categoryConfig[cat]?.color }}
              />
              <span className="text-gray-700">{categoryConfig[cat]?.label}</span>
            </div>
          ))}
        </div>
        
        {/* Légende des utilisateurs si plusieurs */}
        {selectedUsers.length > 1 && chartData?.users && (
          <div className="flex flex-wrap gap-3 mb-4 justify-center border-t pt-3">
            {Object.entries(chartData.users)
              .filter(([id]) => selectedUsers.includes(id))
              .map(([id, userData]) => (
                <span key={id} className="text-sm font-medium text-gray-600">
                  {userData.user.name}
                </span>
              ))}
          </div>
        )}
        
        {/* Zone du graphique/tableau */}
        <div className="relative bg-gray-50 rounded-lg p-4">
          {displayMode === 'table' ? (
            renderTable()
          ) : (
            <div className="flex">
              {/* Échelle Y */}
              <div className="flex flex-col justify-between pr-3 text-xs text-gray-500" style={{ height: '256px' }}>
                {yAxisLabels.map((val, idx) => (
                  <span key={idx} className="text-right min-w-[40px]">{formatTime(val)}</span>
                ))}
              </div>
              
              {/* Zone des barres */}
              <div className="flex-1 relative">
                {/* Lignes de grille */}
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
        
        {/* Période affichée */}
        {chartData && (
          <p className="text-xs text-gray-500 text-center mt-3">
            Période: {chartData.startDate} au {chartData.endDate}
          </p>
        )}
        
        {/* Tooltip */}
        {tooltip.visible && tooltip.content && (
          <div 
            className="fixed z-[9999] pointer-events-none"
            style={{ left: tooltip.x, top: tooltip.y, transform: 'translateX(-50%)' }}
          >
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
