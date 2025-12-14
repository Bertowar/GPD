import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  fetchEntriesByDate, fetchEntries, deleteEntry, fetchProducts, fetchOperators, fetchDowntimeTypes, fetchMachines, fetchSectors, formatError
} from '../services/storage';
import { ProductionEntry, Product, Operator, DowntimeType, Machine, Sector } from '../types';
import { Trash2, Edit, Calendar, Loader2, AlertCircle, X, Eye, Clock, Cpu, Users, Package, Timer, Bookmark, Filter, XCircle, SortAsc, SortDesc, Weight } from 'lucide-react';

// --- Helpers ---
const calculateDurationMinutes = (start?: string, end?: string) => {
    if (!start || !end) return 0;
    const [h1, m1] = start.split(':').map(Number);
    const [h2, m2] = end.split(':').map(Number);
    let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
    if (diff < 0) diff += 1440; // Passou da meia-noite
    return diff;
};

const formatMinutesToHours = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}m`;
};

// Helper to rank shifts
const getShiftRank = (shift?: string) => {
    if (!shift) return 4;
    const s = shift.toLowerCase().trim();
    if (s === 'manhã' || s.includes('manhã') || s.includes('morning')) return 1;
    if (s === 'tarde' || s.includes('tarde') || s.includes('afternoon')) return 2;
    if (s === 'noite' || s.includes('noite') || s.includes('night')) return 3;
    return 4;
};

// --- Interfaces ---
interface GroupedEntry {
    key: string;
    machineId: string;
    operatorId: number;
    date: string;
    shift: string; // Captured from entries
    totalProdMinutes: number;
    totalStopMinutes: number;
    totalOk: number;
    totalDefect: number;
    totalRefile: number; // NEW: Specific Refile tracking
    totalProcessWeight: number; // (Qtd * Peso Médio/Ficha) -> Peso Teórico do Produto Acabado
    totalBobbinWeight: number;  // (Soma dos apontamentos de peso da bobina) -> Entrada Real
    entries: ProductionEntry[];
    hasDrafts: boolean; 
}

// --- Modal Component for Deletion Confirmation ---
interface DeleteModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: React.ReactNode;
    isDeleting: boolean;
}

const DeleteConfirmationModal: React.FC<DeleteModalProps> = ({ isOpen, onClose, onConfirm, title, message, isDeleting }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden scale-100 transform transition-all">
                <div className="p-6">
                    <div className="flex items-center space-x-3 text-red-600 mb-4">
                        <div className="p-3 bg-red-100 rounded-full">
                            <Trash2 size={24} />
                        </div>
                        <h3 className="text-xl font-bold">{title}</h3>
                    </div>
                    <div className="text-slate-600 mb-6">
                        {message}
                    </div>
                    <div className="flex justify-end space-x-3">
                        <button 
                            onClick={onClose}
                            disabled={isDeleting}
                            className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 font-medium transition-colors"
                        >
                            Cancelar
                        </button>
                        <button 
                            onClick={onConfirm}
                            disabled={isDeleting}
                            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium shadow-md flex items-center transition-colors disabled:opacity-70"
                        >
                            {isDeleting ? <Loader2 className="animate-spin mr-2" size={18} /> : null}
                            {isDeleting ? 'Excluindo...' : 'Sim, Excluir'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- Details Modal for Grouped Entries ---
interface DetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    group: GroupedEntry | null;
    products: Product[];
    downtimeTypes: DowntimeType[];
    onEdit: (entry: ProductionEntry) => void;
    onDelete: (entry: ProductionEntry) => void;
}

const DetailsModal: React.FC<DetailsModalProps> = ({ isOpen, onClose, group, products, downtimeTypes, onEdit, onDelete }) => {
    if (!isOpen || !group) return null;

    // Helper for date formatting in modal
    const formatDateBr = (dateStr: string) => {
        const [y, m, d] = dateStr.split('-');
        return `${d}/${m}/${y}`;
    };

    return (
        <div className="fixed inset-0 z-[9990] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800">Detalhes do Apontamento</h3>
                        <p className="text-sm text-slate-500">
                            Máquina: <b>{group.machineId}</b> • Data: {formatDateBr(group.date)} • Turno: {group.shift || 'N/A'}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-500"><X size={20} /></button>
                </div>
                
                <div className="overflow-y-auto p-0">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-700 font-semibold border-b">
                            <tr>
                                <th className="px-6 py-3">Horário</th>
                                <th className="px-6 py-3">Tipo</th>
                                <th className="px-6 py-3">Descrição (Prod/Parada)</th>
                                <th className="px-6 py-3 text-center">Bobina (Kg)</th>
                                <th className="px-6 py-3 text-center">Qtd Prod.</th>
                                <th className="px-6 py-3 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {group.entries.map(e => {
                                const isDowntime = e.downtimeMinutes > 0;
                                const isDraft = e.metaData?.is_draft === true;
                                const refile = e.metaData?.extrusion?.refile || 0;
                                const bobbinWeight = e.metaData?.bobbin_weight ? Number(e.metaData.bobbin_weight) : 0;
                                
                                // Calculate Process Weight for individual entry (Theoretical)
                                const product = products.find(p => p.codigo === e.productCode);
                                const unitWeight = e.metaData?.measuredWeight || product?.pesoLiquido || 0;
                                const processWeight = !isDowntime ? (unitWeight * e.qtyOK) : 0;

                                return (
                                    <tr key={e.id} className="hover:bg-slate-50">
                                        <td className="px-6 py-3 font-mono text-slate-600">
                                            {e.startTime} - {e.endTime || '...'}
                                        </td>
                                        <td className="px-6 py-3">
                                            {isDraft && (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-slate-200 text-slate-600 mr-2 border border-slate-300">
                                                    RASCUNHO
                                                </span>
                                            )}
                                            {isDowntime ? (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800">
                                                    <Timer size={12} className="mr-1"/> Parada
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                                    <Package size={12} className="mr-1"/> Produção
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-3">
                                            {isDowntime ? (
                                                <span className="text-slate-700">{downtimeTypes.find(dt => dt.id === e.downtimeTypeId)?.description || e.downtimeTypeId}</span>
                                            ) : (
                                                <div className="flex flex-col">
                                                    <span className="font-medium text-slate-800">{product?.produto}</span>
                                                    <span className="text-xs text-slate-500 truncate w-48">{e.observations}</span>
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-3 text-center">
                                            {!isDowntime && bobbinWeight > 0 ? (
                                                <span className="font-mono font-bold text-blue-600">{bobbinWeight.toFixed(2)}</span>
                                            ) : '-'}
                                        </td>
                                        <td className="px-6 py-3 text-center">
                                            {isDowntime ? (
                                                <span className="font-bold text-orange-700">{e.downtimeMinutes > 0 ? `${e.downtimeMinutes} min` : 'Aberta'}</span>
                                            ) : (
                                                <div className="flex flex-col items-center">
                                                    <span className="text-xs font-bold text-green-700">
                                                        OK: {e.qtyOK}
                                                    </span>
                                                    {processWeight > 0 && (
                                                        <span className="text-[10px] text-slate-400" title="Peso Teórico">
                                                            (Teór: {processWeight.toFixed(1)}kg)
                                                        </span>
                                                    )}
                                                    {refile > 0 ? (
                                                        <span className="text-xs font-bold text-red-600 mt-1">Refile: {refile}</span>
                                                    ) : (
                                                        e.qtyDefect > 0 && <span className="text-xs font-bold text-red-600 mt-1">Ref: {e.qtyDefect}</span>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-3 text-right">
                                            <div className="flex justify-end gap-2">
                                                <button onClick={() => { onClose(); onEdit(e); }} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"><Edit size={16} /></button>
                                                <button onClick={() => { onDelete(e); }} className="p-1.5 text-red-600 hover:bg-red-50 rounded"><Trash2 size={16} /></button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                
                <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center text-sm">
                    <div className="font-medium text-slate-500">Total de registros: {group.entries.length}</div>
                    <div className="flex gap-6 font-bold text-slate-700">
                        <span className="text-blue-700 flex items-center"><Weight size={14} className="mr-1"/> Total Bobinas: {group.totalBobbinWeight.toFixed(1)}kg</span>
                        <span>Tempo Prod: {formatMinutesToHours(group.totalProdMinutes)}</span>
                        <span className={group.totalStopMinutes > 0 ? 'text-orange-600' : ''}>Tempo Parado: {formatMinutesToHours(group.totalStopMinutes)}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};


const ProductionList: React.FC = () => {
  const navigate = useNavigate();
  const today = new Date().toISOString().split('T')[0];

  // Data States
  const [entries, setEntries] = useState<ProductionEntry[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [downtimeTypes, setDowntimeTypes] = useState<DowntimeType[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  
  // Filter States - Initialized from Session Storage for Persistence
  const [date, setDate] = useState(() => sessionStorage.getItem('pplast_filter_date') || ''); 
  const [selectedSector, setSelectedSector] = useState(() => sessionStorage.getItem('pplast_filter_sector') || '');
  const [selectedMachine, setSelectedMachine] = useState(() => sessionStorage.getItem('pplast_filter_machine') || '');
  const [selectedOperator, setSelectedOperator] = useState(() => sessionStorage.getItem('pplast_filter_operator') || '');
  
  // Save filters to Session Storage whenever they change
  useEffect(() => {
      sessionStorage.setItem('pplast_filter_date', date);
      sessionStorage.setItem('pplast_filter_sector', selectedSector);
      sessionStorage.setItem('pplast_filter_machine', selectedMachine);
      sessionStorage.setItem('pplast_filter_operator', selectedOperator);
  }, [date, selectedSector, selectedMachine, selectedOperator]);

  // Sort State
  const [dateSort, setDateSort] = useState<'ASC' | 'DESC'>('DESC'); 

  // Grouping State
  const [groupedEntries, setGroupedEntries] = useState<GroupedEntry[]>([]);
  
  // Modal States
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<GroupedEntry | null>(null);

  // Filters & Loading
  const [loading, setLoading] = useState(false);
  
  // Delete States
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load Initial Data
  useEffect(() => {
    refreshAllData();
  }, [date]); // Recarrega se a data mudar (inclusive para vazio)

  // Derived filtered machine list for dropdown
  const availableMachines = useMemo(() => {
      if (!selectedSector) return machines;
      return machines.filter(m => m.sector === selectedSector);
  }, [machines, selectedSector]);

  // Derived filtered operator list for dropdown
  const availableOperators = useMemo(() => {
      if (!selectedSector) return operators;
      return operators.filter(o => !o.sector || o.sector === selectedSector);
  }, [operators, selectedSector]);

  const activeSectors = useMemo(() => {
      if (entries.length === 0) return sectors;
      const usedSectorNames = new Set<string>();
      entries.forEach(entry => {
          const machine = machines.find(m => m.code === entry.machineId);
          if (machine && machine.sector) {
              usedSectorNames.add(machine.sector);
          }
      });
      const filtered = sectors.filter(s => usedSectorNames.has(s.name));
      return filtered.length > 0 ? filtered : sectors;
  }, [entries, machines, sectors]);

  // Grouping Logic
  useMemo(() => {
    const groups: Record<string, GroupedEntry> = {};
    
    // Apply filters first
    const filteredEntries = entries.filter(entry => {
        if (selectedMachine && entry.machineId !== selectedMachine) return false;
        if (selectedOperator && entry.operatorId.toString() !== selectedOperator) return false;
        
        if (selectedSector) {
             const m = machines.find(mac => mac.code === entry.machineId);
             if (!m || m.sector !== selectedSector) return false;
        }
        return true;
    });

    filteredEntries.forEach(entry => {
        const key = `${entry.date}-${entry.machineId}-${entry.operatorId}`;
        const isDraft = entry.metaData?.is_draft === true;

        if (!groups[key]) {
            groups[key] = {
                key,
                date: entry.date,
                machineId: entry.machineId,
                operatorId: entry.operatorId,
                shift: entry.shift || '',
                totalProdMinutes: 0,
                totalStopMinutes: 0,
                totalOk: 0,
                totalDefect: 0,
                totalRefile: 0, 
                totalProcessWeight: 0, 
                totalBobbinWeight: 0,
                entries: [],
                hasDrafts: false
            };
        }
        
        groups[key].entries.push(entry);
        if (!groups[key].shift && entry.shift) groups[key].shift = entry.shift;
        
        if (isDraft) groups[key].hasDrafts = true;
        
        if (entry.downtimeMinutes > 0) {
            groups[key].totalStopMinutes += entry.downtimeMinutes;
        } else {
            const duration = calculateDurationMinutes(entry.startTime, entry.endTime);
            groups[key].totalProdMinutes += duration;
            groups[key].totalOk += entry.qtyOK;
            groups[key].totalDefect += entry.qtyDefect;
            const refileVal = entry.metaData?.extrusion?.refile || 0;
            groups[key].totalRefile += refileVal;
            
            // --- WEIGHT CALCULATIONS ---
            
            // 1. Process Weight (Theoretical based on Output)
            // Priority: Measured Weight in Form > Product Spec Weight
            const product = products.find(p => p.codigo === entry.productCode);
            const unitWeight = entry.metaData?.measuredWeight || product?.pesoLiquido || 0;
            const entryTotalWeight = unitWeight * entry.qtyOK;
            groups[key].totalProcessWeight += entryTotalWeight;

            // 2. Bobbin Weight (Actual Input based on Entries)
            // Extracted from form input 'bobbin_weight'
            // SAFE PARSING to prevent NaN crashes
            let entryBobbinWeight = 0;
            if (entry.metaData?.bobbin_weight) {
                const val = entry.metaData.bobbin_weight;
                if (typeof val === 'number' && !isNaN(val)) {
                    entryBobbinWeight = val;
                } else if (typeof val === 'string') {
                    // Try parsing localized or standard
                    const parsed = parseFloat(val.replace(',', '.'));
                    if (!isNaN(parsed)) entryBobbinWeight = parsed;
                }
            }
            groups[key].totalBobbinWeight += entryBobbinWeight;
        }
    });

    setGroupedEntries(Object.values(groups).sort((a,b) => {
        const dateCompare = a.date.localeCompare(b.date);
        if (dateCompare !== 0) {
            return dateSort === 'ASC' ? dateCompare : -dateCompare;
        }
        const shiftRankA = getShiftRank(a.shift);
        const shiftRankB = getShiftRank(b.shift);
        if (shiftRankA !== shiftRankB) return shiftRankA - shiftRankB;
        return a.machineId.localeCompare(b.machineId);
    }));
  }, [entries, selectedMachine, selectedOperator, selectedSector, machines, products, dateSort]);


  const refreshAllData = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
        let eData: ProductionEntry[] = [];
        
        // --- LOGICA DE CARREGAMENTO INTELIGENTE ---
        // Se a data estiver vazia, carrega TUDO (fetchEntries)
        // Se a data estiver preenchida, carrega filtrado (fetchEntriesByDate)
        if (date) {
            eData = await fetchEntriesByDate(date);
        } else {
            eData = await fetchEntries();
        }

        const [pData, oData, dtData, mData, sData] = await Promise.all([
            fetchProducts(),
            fetchOperators(),
            fetchDowntimeTypes(),
            fetchMachines(),
            fetchSectors()
        ]);
        setEntries(eData);
        setProducts(pData);
        setOperators(oData);
        setDowntimeTypes(dtData);
        setMachines(mData);
        setSectors(sData);
        
        if (selectedGroup) {
             setDetailsModalOpen(false);
             setSelectedGroup(null);
        }

    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleDeleteError = (e: any) => {
    console.error(`Erro ao deletar:`, e);
    setErrorMessage("Erro ao excluir apontamento: " + formatError(e));
    setTimeout(() => setErrorMessage(null), 10000);
  };

  const handleEditEntry = (entry: ProductionEntry) => {
    navigate('/entry', { state: { editEntry: entry } });
  };

  const handleViewDetails = (group: GroupedEntry) => {
      setSelectedGroup(group);
      setDetailsModalOpen(true);
  };

  const openDeleteModal = (item: any) => {
    setItemToDelete(item);
    setDeleteModalOpen(true);
    setErrorMessage(null);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    setIsDeleting(true);
    
    try {
        await deleteEntry(itemToDelete.id);
        await refreshAllData();
        setDeleteModalOpen(false);
        setItemToDelete(null);
    } catch (e: any) {
        handleDeleteError(e);
        setDeleteModalOpen(false);
    } finally {
        setIsDeleting(false);
    }
  };

  const clearFilters = () => {
      setSelectedSector('');
      setSelectedMachine('');
      setSelectedOperator('');
      sessionStorage.removeItem('pplast_filter_sector');
      sessionStorage.removeItem('pplast_filter_machine');
      sessionStorage.removeItem('pplast_filter_operator');
  };

  const toggleSort = () => {
      setDateSort(prev => prev === 'ASC' ? 'DESC' : 'ASC');
  };

  return (
    <div className="space-y-6">
      <DeleteConfirmationModal 
        isOpen={deleteModalOpen} 
        onClose={() => setDeleteModalOpen(false)} 
        onConfirm={confirmDelete} 
        isDeleting={isDeleting}
        title="Confirmar Exclusão"
        message="Tem certeza que deseja apagar este item?"
      />

      <DetailsModal 
        isOpen={detailsModalOpen}
        onClose={() => setDetailsModalOpen(false)}
        group={selectedGroup}
        products={products}
        downtimeTypes={downtimeTypes}
        onEdit={(entry) => { setDetailsModalOpen(false); handleEditEntry(entry); }}
        onDelete={(entry) => openDeleteModal(entry)}
      />

      <div className="flex justify-between items-center">
        <div>
            <h2 className="text-2xl font-bold text-slate-800">Apontamentos de Produção</h2>
            <p className="text-slate-500">
                {date 
                    ? `Registros do dia ${new Date(date).toLocaleDateString()}` 
                    : 'Histórico Completo de Registros'}
            </p>
        </div>
        {loading && <Loader2 className="animate-spin text-brand-600" />}
      </div>

      {errorMessage && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-start animate-in fade-in slide-in-from-top-2">
            <AlertCircle className="mr-2 flex-shrink-0 mt-0.5" size={18} />
            <div>
                <p className="font-bold">Erro na operação</p>
                <p className="text-sm">{errorMessage}</p>
            </div>
            <button onClick={() => setErrorMessage(null)} className="ml-auto text-red-500 hover:text-red-700"><X size={18} /></button>
        </div>
      )}

      {/* FILTER BAR */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col lg:flex-row gap-4 items-start lg:items-center">
          
          {/* Date Picker & Sort */}
          <div className="flex items-end gap-2">
              <div className="flex flex-col space-y-1">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                        {date ? 'Filtro de Data' : 'Histórico Completo'}
                    </span>
                    <div className={`relative bg-white border border-slate-300 rounded-lg h-[40px] w-40 flex items-center overflow-hidden hover:border-brand-400 transition-colors focus-within:ring-2 focus-within:ring-brand-200 ${!date ? 'border-dashed' : ''}`}>
                        <input 
                            type="date" 
                            className={`w-full h-full pl-3 pr-8 outline-none font-bold border-none bg-transparent text-sm z-10 relative cursor-pointer ${!date ? 'text-slate-400' : 'text-slate-800'}`} 
                            value={date} 
                            onChange={(e) => setDate(e.target.value)} 
                            max={today}
                            style={{ colorScheme: 'light' }}
                        />
                        <div 
                            className="absolute right-0 top-0 bottom-0 w-10 flex items-center justify-center z-0 pointer-events-none text-slate-400"
                        >
                            {date ? null : <Calendar size={16} />}
                        </div>
                        {date && (
                            <button 
                                onClick={() => setDate('')}
                                className="absolute right-0 top-0 bottom-0 w-10 flex items-center justify-center z-20 text-slate-400 hover:text-red-500"
                                title="Limpar data (Ver tudo)"
                            >
                                <XCircle size={16} />
                            </button>
                        )}
                    </div>
              </div>
              
              <button 
                onClick={toggleSort}
                className="h-[40px] px-3 bg-white border border-slate-300 rounded-lg text-slate-500 hover:text-brand-600 hover:border-brand-300 flex items-center justify-center transition-all"
                title={`Ordenar Data: ${dateSort === 'ASC' ? 'Mais Antigo' : 'Mais Recente'}`}
              >
                  {dateSort === 'ASC' ? <SortAsc size={20} /> : <SortDesc size={20} />}
              </button>
          </div>

          <div className="h-8 w-px bg-slate-200 hidden lg:block mx-2"></div>

          {/* Filters Row */}
          <div className="flex flex-wrap gap-3 flex-1">
                
                {/* Sector Filter */}
                <div className="flex flex-col space-y-1 w-full sm:w-auto">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Setor</span>
                    <select 
                        className="h-[40px] px-3 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:ring-2 focus:ring-brand-500 outline-none"
                        value={selectedSector}
                        onChange={e => {
                            setSelectedSector(e.target.value);
                            setSelectedMachine('');
                            setSelectedOperator('');
                        }}
                    >
                        <option value="">Todos</option>
                        {activeSectors.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                        {activeSectors.length === 0 && (
                            <>
                                <option value="Extrusão">Extrusão</option>
                                <option value="Termoformagem">Termoformagem</option>
                            </>
                        )}
                    </select>
                </div>

                {/* Machine Filter */}
                <div className="flex flex-col space-y-1 w-full sm:w-auto">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Máquina</span>
                    <select 
                        className="h-[40px] px-3 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:ring-2 focus:ring-brand-500 outline-none min-w-[140px]"
                        value={selectedMachine}
                        onChange={e => setSelectedMachine(e.target.value)}
                    >
                        <option value="">Todas</option>
                        {availableMachines.map(m => <option key={m.code} value={m.code}>{m.name}</option>)}
                    </select>
                </div>

                {/* Operator Filter */}
                <div className="flex flex-col space-y-1 w-full sm:w-auto">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Operador</span>
                    <select 
                        className="h-[40px] px-3 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:ring-2 focus:ring-brand-500 outline-none min-w-[140px]"
                        value={selectedOperator}
                        onChange={e => setSelectedOperator(e.target.value)}
                    >
                        <option value="">Todos</option>
                        {availableOperators.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                </div>

                {/* Clear Button */}
                {(selectedSector || selectedMachine || selectedOperator) && (
                    <div className="flex flex-col justify-end pb-[1px]">
                        <button 
                            onClick={clearFilters}
                            className="h-[40px] px-3 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 flex items-center font-bold text-xs transition-colors"
                            title="Limpar Filtros"
                        >
                            <XCircle size={16} className="mr-1.5" /> Limpar
                        </button>
                    </div>
                )}
          </div>
      </div>

      <div className="overflow-x-auto relative min-h-[500px]">
        <div className="border rounded-lg shadow-sm overflow-hidden">
            <table className="w-full text-left text-sm bg-white">
                <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                    <th className="px-6 py-3 font-semibold text-slate-700">Turno / Data</th>
                    <th className="px-6 py-3 font-semibold text-slate-700">Máquina</th>
                    <th className="px-6 py-3 font-semibold text-slate-700">Operador</th>
                    <th className="px-6 py-3 font-semibold text-slate-700">Tempo Prod.</th>
                    <th className="px-6 py-3 font-semibold text-slate-700">Tempo Parado</th>
                    <th className="px-6 py-3 font-semibold text-center">Produção</th>
                    <th className="px-6 py-3 text-right font-semibold text-slate-700">Ações</th>
                </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                {groupedEntries.length === 0 ? (
                    <tr><td colSpan={7} className="p-12 text-center text-slate-400 bg-white">
                        <Filter size={48} className="mx-auto mb-4 opacity-20" />
                        Nenhum registro encontrado para os filtros selecionados.
                    </td></tr>
                ) : groupedEntries.map(g => {
                    const [y, m, d] = g.date.split('-');
                    const displayDate = `${d}/${m}/${y}`;

                    return (
                        <tr key={g.key} className={`transition-colors ${g.hasDrafts ? 'bg-yellow-50 hover:bg-yellow-100' : 'hover:bg-slate-50'}`}>
                            <td className="px-6 py-4">
                                <div className="flex flex-col">
                                    <span className={`font-bold text-sm ${g.shift ? 'text-brand-700' : 'text-slate-500'}`}>
                                        {g.shift || 'Indefinido'}
                                    </span>
                                    <span className="text-xs text-slate-400 font-mono">
                                        {displayDate}
                                    </span>
                                </div>
                            </td>
                            <td className="px-6 py-4">
                                <div className="flex items-center">
                                    <Cpu size={16} className="mr-2 text-slate-400" />
                                    <span className="font-bold text-slate-800">{g.machineId}</span>
                                    {g.hasDrafts && (
                                        <span className="ml-2 px-1.5 py-0.5 bg-yellow-200 text-yellow-800 text-[10px] font-bold rounded flex items-center" title="Contém rascunhos pendentes">
                                            <Bookmark size={10} className="mr-1" />
                                            Rascunho
                                        </span>
                                    )}
                                </div>
                            </td>
                            <td className="px-6 py-4">
                                <div className="flex items-center">
                                    <Users size={16} className="mr-2 text-slate-400" />
                                    <span>{operators.find(o => o.id === g.operatorId)?.name || `ID ${g.operatorId}`}</span>
                                </div>
                            </td>
                            <td className="px-6 py-4">
                                <span className="font-mono text-green-700 bg-green-50 px-2 py-1 rounded">
                                    {formatMinutesToHours(g.totalProdMinutes)}
                                </span>
                            </td>
                            <td className="px-6 py-4">
                                <span className={`font-mono px-2 py-1 rounded ${g.totalStopMinutes > 0 ? 'text-orange-700 bg-orange-50' : 'text-slate-400'}`}>
                                    {g.totalStopMinutes > 0 ? formatMinutesToHours(g.totalStopMinutes) : '-'}
                                </span>
                            </td>
                            <td className="px-6 py-4 text-center">
                                <div className="flex flex-col items-center">
                                    <span className="font-bold text-slate-800">
                                        {g.totalOk}
                                    </span>
                                    
                                    {/* Primary Info: Bobbin Weight (Input Material) */}
                                    {g.totalBobbinWeight > 0 && (
                                        <span className="text-xs font-bold text-blue-600 mt-0.5" title="Peso Total das Bobinas (Entrada)">
                                            Bob: {g.totalBobbinWeight.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}kg
                                        </span>
                                    )}

                                    {/* Secondary Info: Theoretical Process Weight (Comparison) */}
                                    {g.totalProcessWeight > 0 && (
                                        <span className="text-[10px] text-slate-400 font-medium mt-0.5" title="Peso Teórico (Qtd * Peso Médio/Ficha)">
                                            Teór: {g.totalProcessWeight.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}kg
                                        </span>
                                    )}

                                    {/* Defect / Refile Info */}
                                    {g.totalRefile > 0 ? (
                                        <span className="text-xs text-red-500 font-medium mt-1">{g.totalRefile} Refile</span>
                                    ) : (
                                        g.totalDefect > 0 && <span className="text-xs text-red-500 font-medium mt-1">{g.totalDefect} Refugo</span>
                                    )}
                                </div>
                            </td>
                            <td className="px-6 py-4 text-right">
                                <button 
                                    onClick={() => handleViewDetails(g)}
                                    className="inline-flex items-center px-3 py-1.5 bg-brand-50 text-brand-700 rounded-lg hover:bg-brand-100 transition-colors text-xs font-bold uppercase tracking-wider"
                                >
                                    <Eye size={14} className="mr-1" /> Detalhes
                                </button>
                            </td>
                        </tr>
                    );
                })}
                </tbody>
            </table>
        </div>
      </div>
    </div>
  );
};

export default ProductionList;