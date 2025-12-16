import React, { useState, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  PieChart, Pie, Cell
} from 'recharts';
import { Package, AlertTriangle, TrendingUp, Clock, Loader2, Cpu, Users, Sun, Calendar, Recycle, XCircle, Filter, Weight, Layers } from 'lucide-react';
import { useDashboardStats, useDowntimeTypes, useMachines } from '../hooks/useQueries';

const COLORS = ['#0ea5e9', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6'];

const timeToMinutes = (time: string) => {
    if (!time) return 0;
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
};

const Dashboard: React.FC = () => {
  // View State
  const [activeTab, setActiveTab] = useState<'products' | 'machines' | 'operators' | 'shifts'>('machines');
  // Initial state empty = Cumulative Mode (All History)
  const [selectedDate, setSelectedDate] = useState('');
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('day');
  
  // Calculate Date Range based on ViewMode
  const { startDate, endDate } = useMemo(() => {
      // If no date selected, return "All Time" range (Cumulative)
      if (!selectedDate) {
          return {
              startDate: '2000-01-01',
              endDate: new Date().toISOString().split('T')[0] // Today
          };
      }

      const end = new Date(selectedDate);
      const start = new Date(selectedDate);
      
      if (viewMode === 'day') {
          // Single day context
      } else if (viewMode === 'week') {
          end.setDate(start.getDate() + 7);
      } else {
          end.setDate(start.getDate() + 30);
      }
      return { 
          startDate: start.toISOString().split('T')[0], 
          endDate: end.toISOString().split('T')[0] 
      };
  }, [selectedDate, viewMode]);

  // Fetch Logic (React Query)
  const { data, isLoading: loading } = useDashboardStats(startDate, endDate);
  
  // --- RENDERING HELPERS ---

  // Transform Server-Side simplified Gantt data into Visual Structure
  const ganttData = useMemo(() => {
      if (!data || !data.isShortPeriod) return [];
      
      // Group flat events by machine+date
      const rowMap: Record<string, any> = {};
      
      (data.machines || []).forEach((e: any) => {
          const key = `${e.machine_id}|${e.date}`;
          if (!rowMap[key]) {
              const dateObj = new Date(e.date);
              const dateStr = `${dateObj.getDate().toString().padStart(2, '0')}/${(dateObj.getMonth()+1).toString().padStart(2, '0')}`;
              
              rowMap[key] = {
                  machineId: e.machine_id,
                  date: e.date,
                  displayCode: `${e.machine_id} (${dateStr})`,
                  events: [],
                  efficiency: 0,
                  totalTime: 0,
                  prodTime: 0
              };
          }
          
          if (!e.start_time || !e.end_time) return;
          const startMin = timeToMinutes(e.start_time);
          const endMin = timeToMinutes(e.end_time);
          let duration = endMin - startMin;
          if (duration < 0) duration += 1440;

          const isDowntime = e.downtime_minutes > 0;
          if (isDowntime) rowMap[key].totalTime += duration; 
          else {
              rowMap[key].totalTime += duration;
              rowMap[key].prodTime += duration;
          }

          rowMap[key].events.push({
              start: startMin,
              duration: duration,
              widthPct: (duration / 1440) * 100,
              startPct: (startMin / 1440) * 100,
              type: isDowntime ? 'downtime' : 'production',
              details: isDowntime 
                ? `Parada: ${e.downtime_desc || 'S/M'} (${duration} min)`
                : `Prod: ${e.qty_ok} pçs`
          });
      });

      return Object.values(rowMap).map((row: any) => ({
          ...row,
          efficiency: row.totalTime > 0 ? (row.prodTime / row.totalTime) * 100 : 0
      })).sort((a: any, b: any) => b.date.localeCompare(a.date) || a.machineId.localeCompare(b.machineId));

  }, [data]);

  const extStats = data?.sectorStats?.extrusion || { producedKg: 0, scrapKg: 0, qualityRate: 100, entriesCount: 0 };
  const tfStats = data?.sectorStats?.thermoforming || { producedUnits: 0, scrapUnits: 0, qualityRate: 100, entriesCount: 0 };

  if (loading) {
    return (
        <div className="flex h-64 items-center justify-center text-slate-500">
            <Loader2 className="animate-spin mr-2" />
            Carregando indicadores...
        </div>
    );
  }

  if (!data) return <div className="p-8 text-center text-slate-500">Falha ao carregar dados.</div>;

  const renderMachinesTab = () => (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 animate-in fade-in overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
            <h3 className="text-lg font-bold text-slate-800">
                {data.isShortPeriod 
                    ? 'Linha do Tempo (Gantt - Detalhado)' 
                    : 'Capacidade Produtiva (Consolidado)'}
            </h3>
            
            {selectedDate && (
                <div className="flex items-center gap-4">
                    <div className="flex bg-slate-100 p-1 rounded-lg">
                        {[
                            { id: 'day', label: 'Dia' },
                            { id: 'week', label: 'Semana' },
                            { id: 'month', label: 'Mês' }
                        ].map(mode => (
                            <button
                                key={mode.id}
                                onClick={() => setViewMode(mode.id as any)}
                                className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                                    viewMode === mode.id 
                                    ? 'bg-white text-brand-600 shadow-sm' 
                                    : 'text-slate-500 hover:text-slate-700'
                                }`}
                            >
                                {mode.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>

        {data.isShortPeriod ? (
            <div className="relative">
                <div className="flex justify-between text-xs text-slate-400 border-b border-slate-200 pb-2 mb-2 pl-28 pr-16">
                    {[0, 4, 8, 12, 16, 20, 24].map(h => <span key={h}>{h}h</span>)}
                </div>
                <div className="space-y-4 max-h-[500px] overflow-y-auto">
                    {ganttData.length === 0 && <div className="text-center py-8 text-slate-400">Sem registros no período.</div>}
                    {ganttData.map((m: any) => (
                        <div key={`${m.machineId}-${m.date}`} className="flex items-center group">
                            <div className="w-28 flex-shrink-0 pr-2 text-right">
                                <p className="font-bold text-xs text-slate-800 font-mono">{m.displayCode}</p>
                            </div>
                            <div className="flex-1 h-8 bg-slate-100 rounded relative overflow-hidden">
                                <div className="absolute inset-0 flex justify-between px-0 opacity-10 pointer-events-none">
                                    {[0, 4, 8, 12, 16, 20, 24].map(h => <div key={h} className="w-px h-full bg-slate-900"></div>)}
                                </div>
                                {m.events?.map((ev: any, idx: number) => (
                                    <div
                                        key={idx}
                                        className={`absolute h-full top-0 border-r border-white/20 transition-all hover:brightness-110 cursor-help ${
                                            ev.type === 'production' ? 'bg-green-500' : 'bg-orange-500'
                                        }`}
                                        style={{ left: `${ev.startPct}%`, width: `${ev.widthPct}%` }}
                                        title={`${ev.details}`}
                                    ></div>
                                ))}
                            </div>
                            <div className="w-16 flex-shrink-0 pl-4 text-right">
                                <div className="text-sm font-bold text-slate-600">{m.efficiency.toFixed(0)}%</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        ) : (
            <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.machines || []} layout="vertical" margin={{ left: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" />
                        <YAxis dataKey="name" type="category" width={80} tick={{fontSize: 12, fontWeight: 'bold'}} />
                        <Tooltip 
                            cursor={{fill: 'transparent'}} 
                            formatter={(value: number) => new Intl.NumberFormat('pt-BR').format(value)}
                        />
                        <Legend />
                        <Bar dataKey="total_qty" name="Produção Total (pçs)" fill="#0ea5e9" barSize={20} radius={[0, 4, 4, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        )}
    </div>
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
            <h2 className="text-2xl font-bold text-slate-800">Painel Geral</h2>
            <p className="text-slate-500">
                {selectedDate 
                    ? `Indicadores do período: ${new Date(startDate).toLocaleDateString()} até ${new Date(endDate).toLocaleDateString()}` 
                    : 'Indicadores Cumulativos (Histórico Completo)'}
            </p>
        </div>
        
        {/* Date Filter Widget */}
        <div className={`flex items-center space-x-2 p-2 rounded-lg border shadow-sm transition-all ${selectedDate ? 'bg-white border-brand-200 ring-2 ring-brand-100' : 'bg-white border-slate-200'}`}>
            <div className={`p-1.5 rounded-md ${selectedDate ? 'bg-brand-100 text-brand-600' : 'bg-slate-100 text-slate-400'}`}>
                {selectedDate ? <Calendar size={18} /> : <Filter size={18} />}
            </div>
            
            <div className="flex flex-col">
                <span className="text-[10px] font-bold text-slate-400 uppercase leading-none mb-0.5">
                    {selectedDate ? 'Filtro Aplicado' : 'Filtro de Data'}
                </span>
                <input 
                    type="date" 
                    value={selectedDate} 
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="bg-transparent text-slate-800 font-bold outline-none text-sm p-0 h-5"
                    title="Selecione uma data para filtrar"
                />
            </div>

            {selectedDate && (
                <button 
                    onClick={() => setSelectedDate('')}
                    className="ml-2 p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                    title="Limpar filtro (Ver Acumulado)"
                >
                    <XCircle size={18} />
                </button>
            )}
        </div>
      </div>

      {/* --- SEÇÃO EXTRUSÃO --- */}
      <div className="space-y-2 animate-in fade-in slide-in-from-left-4">
          <div className="flex items-center space-x-2 border-b border-blue-200 pb-2">
              <div className="bg-blue-100 p-1.5 rounded">
                  <Cpu size={18} className="text-blue-700"/>
              </div>
              <h3 className="text-sm font-bold text-blue-900 uppercase tracking-wide">Setor Extrusão</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-16 h-16 bg-blue-50 rounded-bl-full -mr-8 -mt-8"></div>
                <div className="flex items-center justify-between relative z-10">
                    <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Bobinas (Produção)</p>
                        <p className="text-2xl font-bold text-slate-800">{extStats.producedKg.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} <span className="text-sm font-medium text-slate-400">kg</span></p>
                    </div>
                    <div className="p-2 bg-blue-50 rounded-lg text-blue-600"><Weight size={20} /></div>
                </div>
            </div>
            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden">
                <div className="flex items-center justify-between relative z-10">
                    <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Perda / Retorno</p>
                        <p className="text-2xl font-bold text-slate-800">{extStats.scrapKg.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} <span className="text-sm font-medium text-slate-400">kg</span></p>
                    </div>
                    <div className="p-2 bg-orange-50 rounded-lg text-orange-600"><Recycle size={20} /></div>
                </div>
            </div>
            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden">
                <div className="flex items-center justify-between relative z-10">
                    <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Qualidade (Peso)</p>
                        <p className={`text-2xl font-bold ${extStats.qualityRate < 95 ? 'text-orange-600' : 'text-green-600'}`}>
                            {extStats.qualityRate.toFixed(1)}%
                        </p>
                    </div>
                    <div className="p-2 bg-green-50 rounded-lg text-green-600"><TrendingUp size={20} /></div>
                </div>
            </div>
            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden">
                <div className="flex items-center justify-between relative z-10">
                    <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Apontamentos</p>
                        <p className="text-2xl font-bold text-slate-800">{extStats.entriesCount}</p>
                    </div>
                    <div className="p-2 bg-purple-50 rounded-lg text-purple-600"><Clock size={20} /></div>
                </div>
            </div>
          </div>
      </div>

      {/* --- SEÇÃO TERMOFORMAGEM --- */}
      <div className="space-y-2 animate-in fade-in slide-in-from-right-4">
          <div className="flex items-center space-x-2 border-b border-orange-200 pb-2">
              <div className="bg-orange-100 p-1.5 rounded">
                  <Package size={18} className="text-orange-700"/>
              </div>
              <h3 className="text-sm font-bold text-orange-900 uppercase tracking-wide">Setor Termoformagem</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-16 h-16 bg-orange-50 rounded-bl-full -mr-8 -mt-8"></div>
                <div className="flex items-center justify-between relative z-10">
                    <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Caixas (Produção)</p>
                        <p className="text-2xl font-bold text-slate-800">{tfStats.producedUnits.toLocaleString('pt-BR')} <span className="text-sm font-medium text-slate-400">un</span></p>
                    </div>
                    <div className="p-2 bg-orange-50 rounded-lg text-orange-600"><Layers size={20} /></div>
                </div>
            </div>
            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden">
                <div className="flex items-center justify-between relative z-10">
                    <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Refugo (Peças)</p>
                        <p className="text-2xl font-bold text-slate-800">{tfStats.scrapUnits.toLocaleString('pt-BR')}</p>
                    </div>
                    <div className="p-2 bg-red-50 rounded-lg text-red-600"><AlertTriangle size={20} /></div>
                </div>
            </div>
            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden">
                <div className="flex items-center justify-between relative z-10">
                    <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Qualidade (Qtd)</p>
                        <p className={`text-2xl font-bold ${tfStats.qualityRate < 95 ? 'text-orange-600' : 'text-green-600'}`}>
                            {tfStats.qualityRate.toFixed(1)}%
                        </p>
                    </div>
                    <div className="p-2 bg-green-50 rounded-lg text-green-600"><TrendingUp size={20} /></div>
                </div>
            </div>
            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden">
                <div className="flex items-center justify-between relative z-10">
                    <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Apontamentos</p>
                        <p className="text-2xl font-bold text-slate-800">{tfStats.entriesCount}</p>
                    </div>
                    <div className="p-2 bg-purple-50 rounded-lg text-purple-600"><Clock size={20} /></div>
                </div>
            </div>
          </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 border-b border-slate-200 overflow-x-auto pb-1 mt-4">
        {[
            {id: 'machines', icon: Cpu, label: 'Máquinas'},
            {id: 'products', icon: Package, label: 'Produtos'},
            {id: 'operators', icon: Users, label: 'Operadores'},
            {id: 'shifts', icon: Sun, label: 'Turnos'}
        ].map(tab => (
            <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-3 text-sm font-medium flex items-center space-x-2 transition-all rounded-t-lg whitespace-nowrap ${
                activeTab === tab.id ? 'border border-b-0 border-slate-200 bg-white text-brand-600 shadow-sm translate-y-px' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
            >
                <tab.icon size={16} />
                <span>{tab.label}</span>
            </button>
        ))}
      </div>

      <div className="bg-slate-50 min-h-[300px]">
        {activeTab === 'machines' && renderMachinesTab()}
        
        {activeTab === 'products' && (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 animate-in fade-in h-[400px]">
                <h3 className="text-lg font-bold text-slate-800 mb-6">Top 10 Produtos</h3>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.products || []} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" tick={{fontSize: 12}} interval={0} angle={-45} textAnchor="end" height={80} />
                        <YAxis />
                        <Tooltip />
                        <Legend verticalAlign="top" height={36}/>
                        <Bar dataKey="ok" name="Aprovados" fill="#22c55e" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="defect" name="Refugos" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        )}

        {activeTab === 'operators' && (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 animate-in fade-in h-[400px]">
                <h3 className="text-lg font-bold text-slate-800 mb-6">Ranking de Operadores</h3>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.operators || []} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" />
                        <YAxis dataKey="name" type="category" width={100} tick={{fontSize: 12}} />
                        <Tooltip />
                        <Legend verticalAlign="top" height={36}/>
                        <Bar dataKey="ok" name="Aprovados" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20} />
                        <Bar dataKey="defect" name="Refugos" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={20} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        )}

        {activeTab === 'shifts' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-[400px]">
                    <h3 className="text-lg font-bold text-slate-800 mb-6">Produção por Turno</h3>
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={data.shifts || []}
                                dataKey="ok"
                                nameKey="name"
                                cx="50%"
                                cy="50%"
                                outerRadius={100}
                                fill="#8884d8"
                                label={({name, percent}) => `${name} ${(percent * 100).toFixed(0)}%`}
                            >
                                {(data.shifts || []).map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-[400px] overflow-auto">
                     <h3 className="text-lg font-bold text-slate-800 mb-4">Detalhamento</h3>
                     <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-700">
                            <tr>
                                <th className="px-4 py-2">Turno</th>
                                <th className="px-4 py-2 text-right">Prod.</th>
                                <th className="px-4 py-2 text-right">Ref.</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {(data.shifts || []).map((s, idx) => (
                                <tr key={idx} className="hover:bg-slate-50">
                                    <td className="px-4 py-2 font-medium">{s.name}</td>
                                    <td className="px-4 py-2 text-right text-green-600 font-bold">{s.ok}</td>
                                    <td className="px-4 py-2 text-right text-red-600 font-bold">{s.defect}</td>
                                </tr>
                            ))}
                        </tbody>
                     </table>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;