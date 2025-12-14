import React, { useState, useEffect, useMemo } from 'react';
import { 
    fetchMachines, fetchOperators, fetchProducts, fetchDowntimeTypes, fetchWorkShifts, 
    getLastMachineEntry, registerProductionEntry, fetchSectors, formatError, fetchEntriesByDate, deleteEntry 
} from '../services/storage';
import { Machine, Operator, Product, DowntimeType, WorkShift, ProductionEntry } from '../types';
import { Save, Calendar, Copy, CheckCircle2, AlertCircle, Clock, Plus, Trash2, X, ChevronRight, ChevronLeft, Loader2, Zap, History, Package, Timer, Edit2, RotateCcw, Layers, RefreshCw } from 'lucide-react';
import { ProductSelect } from '../components/ProductSelect';

// Safe ID Generator for Preview Environments
const safeUUID = () => {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

interface BatchItem {
    machineCode: string;
    machineName: string;
    machineSector: string;
    status: 'PENDING' | 'SAVING' | 'SAVED' | 'ERROR' | 'EDITING';
    errorMsg?: string;
    editingId?: string; 
    operatorId: string;
    shift: string;
    productCode: string;
    qtyOK: string;
    bobbinWeight: string; 
    cycleTime: string; 
    downtimes: {
        id: string; 
        start: string;
        end: string;
        reasonId: string;
        obs: string;
    }[];
}

const BatchEntryPage: React.FC = () => {
    // Master Data
    const [machines, setMachines] = useState<Machine[]>([]);
    const [operators, setOperators] = useState<Operator[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [downtimeTypes, setDowntimeTypes] = useState<DowntimeType[]>([]);
    const [shifts, setShifts] = useState<WorkShift[]>([]);
    const [loadingMaster, setLoadingMaster] = useState(true);

    // Filter / Control State
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedSector, setSelectedSector] = useState('Extrusão');
    const [sectorsList, setSectorsList] = useState<string[]>([]);

    // Data History State
    const [dailyEntries, setDailyEntries] = useState<ProductionEntry[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);

    // THE BATCH STATE
    const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
    const [activeHistoryTabs, setActiveHistoryTabs] = useState<Record<string, string>>({});

    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        type: 'danger' | 'info';
        onConfirm: () => void;
    }>({ isOpen: false, title: '', message: '', type: 'info', onConfirm: () => {} });

    // --- INIT ---
    useEffect(() => {
        loadMasterData();
    }, []);

    // Refresh batch when Date or Sector changes
    useEffect(() => {
        if (!loadingMaster) {
            initializeBatch();
            loadHistory();
        }
    }, [selectedDate, selectedSector, machines]);

    const loadMasterData = async () => {
        setLoadingMaster(true);
        try {
            const [m, o, p, dt, s, sec] = await Promise.all([
                fetchMachines(),
                fetchOperators(),
                fetchProducts(),
                fetchDowntimeTypes(),
                fetchWorkShifts(),
                fetchSectors()
            ]);
            setMachines(m);
            setOperators(o);
            setProducts(p);
            setDowntimeTypes(dt);
            setShifts(s);
            setSectorsList(sec.map(x => x.name));
            if (sec.length > 0) setSelectedSector(sec[0].name);
        } catch (e) {
            console.error("Failed to load master data", e);
        } finally {
            setLoadingMaster(false);
        }
    };

    const loadHistory = async () => {
        setLoadingHistory(true);
        try {
            const entries = await fetchEntriesByDate(selectedDate);
            setDailyEntries(entries);
        } catch (e) {
            console.error("Error loading history", e);
        } finally {
            setLoadingHistory(false);
        }
    };

    const initializeBatch = () => {
        const targetMachines = machines.filter(m => m.sector === selectedSector);
        const firstRelevantShift = shifts.find(s => !s.sector || s.sector === selectedSector)?.name || '';

        const newBatch: BatchItem[] = targetMachines.map(m => ({
            machineCode: m.code,
            machineName: m.name,
            machineSector: m.sector || '',
            status: 'PENDING',
            operatorId: '',
            shift: '',
            productCode: '',
            qtyOK: '',
            bobbinWeight: '',
            cycleTime: '',
            downtimes: []
        }));

        setBatchItems(newBatch);
        const initialTabs: Record<string, string> = {};
        targetMachines.forEach(m => initialTabs[m.code] = firstRelevantShift);
        setActiveHistoryTabs(initialTabs);
    };

    const handlePreFill = () => {
        setConfirmModal({
            isOpen: true,
            title: 'Clonar Anterior',
            message: 'Isso irá buscar o último registro de cada máquina. Continuar?',
            type: 'info',
            onConfirm: async () => {
                const updatedBatch = [...batchItems];
                await Promise.all(updatedBatch.map(async (item, idx) => {
                    if (item.status === 'SAVED' || item.status === 'EDITING') return;
                    try {
                        const lastEntry = await getLastMachineEntry(item.machineCode, 'production');
                        if (lastEntry) {
                            updatedBatch[idx].operatorId = lastEntry.operatorId.toString();
                            updatedBatch[idx].productCode = lastEntry.productCode ? lastEntry.productCode.toString() : '';
                            if (lastEntry.metaData?.cycle_time) {
                                updatedBatch[idx].cycleTime = lastEntry.metaData.cycle_time;
                            }
                        }
                    } catch (e) { console.error(e); }
                }));
                setBatchItems(updatedBatch);
                setConfirmModal(prev => ({ ...prev, isOpen: false }));
            }
        });
    };

    const updateItem = (index: number, field: keyof BatchItem, value: any) => {
        const newBatch = [...batchItems];
        (newBatch[index] as any)[field] = value;
        if (newBatch[index].status === 'ERROR' || newBatch[index].status === 'SAVED') {
            newBatch[index].status = 'PENDING';
        }
        setBatchItems(newBatch);
    };

    const handleCancelEdit = (index: number) => {
        const newBatch = [...batchItems];
        newBatch[index] = {
            ...newBatch[index],
            status: 'PENDING',
            editingId: undefined,
            qtyOK: '',
            bobbinWeight: '',
            downtimes: []
        };
        setBatchItems(newBatch);
    };

    const handleResetRow = (index: number) => {
        const newBatch = [...batchItems];
        newBatch[index] = {
            ...newBatch[index],
            status: 'PENDING',
            qtyOK: '',
            bobbinWeight: '',
            downtimes: []
        };
        setBatchItems(newBatch);
    };

    const handleEditEntry = (index: number, entry: ProductionEntry) => {
        const newBatch = [...batchItems];
        const item = newBatch[index];
        item.status = 'EDITING';
        item.editingId = entry.id;
        item.operatorId = entry.operatorId.toString();
        item.shift = entry.shift || '';
        
        if (entry.downtimeMinutes > 0) {
            item.productCode = '';
            item.qtyOK = '';
            item.bobbinWeight = '';
            item.cycleTime = '';
            item.downtimes = [{
                id: safeUUID(),
                start: entry.startTime || '',
                end: entry.endTime || '',
                reasonId: entry.downtimeTypeId || '',
                obs: entry.observations || ''
            }];
        } else {
            item.productCode = entry.productCode ? entry.productCode.toString() : '';
            item.qtyOK = entry.qtyOK.toString();
            item.bobbinWeight = entry.metaData?.bobbin_weight ? entry.metaData.bobbin_weight.toString().replace('.', ',') : '';
            item.cycleTime = entry.metaData?.cycle_time ? entry.metaData.cycle_time.toString() : '';
            item.downtimes = [];
        }
        setBatchItems(newBatch);
    };

    const handleDeleteEntry = (e: React.MouseEvent, entry: ProductionEntry) => {
        e.preventDefault();
        e.stopPropagation(); 
        setConfirmModal({
            isOpen: true,
            title: 'Excluir Registro',
            message: 'Tem certeza que deseja excluir este registro?',
            type: 'danger',
            onConfirm: async () => {
                try {
                    setDailyEntries(prev => prev.filter(e => e.id !== entry.id));
                    await deleteEntry(entry.id);
                    await loadHistory(); 
                } catch (err) {
                    console.error("Erro ao excluir", err);
                    loadHistory();
                }
                setConfirmModal(prev => ({ ...prev, isOpen: false }));
            }
        });
    };

    const addDowntime = (index: number) => {
        setBatchItems(prev => {
            const newBatch = [...prev];
            const item = { ...newBatch[index] };
            item.downtimes = [...item.downtimes, {
                id: safeUUID(),
                start: '', end: '', reasonId: '', obs: ''
            }];
            newBatch[index] = item;
            return newBatch;
        });
    };

    const removeDowntime = (itemIndex: number, dtIndex: number) => {
        setBatchItems(prev => {
            const newBatch = [...prev];
            const item = { ...newBatch[itemIndex] };
            const newDowntimes = [...item.downtimes];
            newDowntimes.splice(dtIndex, 1);
            item.downtimes = newDowntimes;
            newBatch[itemIndex] = item;
            return newBatch;
        });
    };

    const updateDowntime = (itemIndex: number, dtIndex: number, field: string, value: string) => {
        setBatchItems(prev => {
            const newBatch = [...prev];
            const item = { ...newBatch[itemIndex] };
            const newDowntimes = [...item.downtimes];
            newDowntimes[dtIndex] = { ...newDowntimes[dtIndex], [field]: value };
            item.downtimes = newDowntimes;
            newBatch[itemIndex] = item;
            return newBatch;
        });
    };

    const handleTimeBlur = (index: number, dtIndex: number, field: 'start' | 'end', value: string) => {
        if (!value) return;
        let final = value;
        if (!value.includes(':')) {
            if (value.length <= 2) final = `${value.padStart(2, '0')}:00`;
            else if (value.length === 3) final = `0${value[0]}:${value.slice(1)}`;
            else if (value.length === 4) final = `${value.slice(0,2)}:${value.slice(2)}`;
        } else {
            const parts = value.split(':');
            const h = parts[0].padStart(2, '0');
            const m = (parts[1] || '00').padEnd(2, '0');
            final = `${h}:${m}`;
        }
        updateDowntime(index, dtIndex, field, final);
    };

    const handleTimeChange = (index: number, dtIndex: number, field: 'start' | 'end', rawValue: string) => {
        let v = rawValue.replace(/[^\d:]/g, '').slice(0, 5); 
        if (!v.includes(':') && v.length > 2) {
             v = v.slice(0,2) + ':' + v.slice(2);
        }
        updateDowntime(index, dtIndex, field, v);
    };

    const handleTabChange = (machineCode: string, shiftName: string) => {
        setActiveHistoryTabs(prev => ({ ...prev, [machineCode]: shiftName }));
    };

    const safeParseFloat = (val: string): number | null => {
        if (!val) return null;
        const clean = val.toString().replace(',', '.');
        const num = parseFloat(clean);
        return isNaN(num) ? null : num;
    };

    const handleSaveRow = async (index: number) => {
        const item = batchItems[index];
        const isEditing = item.status === 'EDITING' && !!item.editingId;
        
        if (!item.operatorId || !item.shift) { alert("Preencha Operador e Turno."); return; }
        if (item.downtimes.length === 0 && !item.productCode) { alert("Selecione o Produto ou adicione uma Parada."); return; }

        const newBatch = [...batchItems];
        newBatch[index].status = 'SAVING';
        setBatchItems(newBatch);

        try {
            const selectedShift = shifts.find(s => s.name === item.shift);
            const startTime = selectedShift ? selectedShift.startTime : '00:00';
            const endTime = selectedShift ? selectedShift.endTime : '23:59';

            let validBobbinWeight: number | null = null;
            if (item.bobbinWeight) {
                validBobbinWeight = safeParseFloat(item.bobbinWeight);
                if (validBobbinWeight === null || validBobbinWeight <= 0) {
                    throw new Error("O Peso da Bobina deve ser válido.");
                }
            } else if (item.downtimes.length === 0 && item.machineSector === 'Extrusão') {
                throw new Error("Informe o Peso da Bobina (Kg).");
            }

            if (item.downtimes.length > 0) {
                for (const dt of item.downtimes) {
                    if (dt.start && dt.reasonId) {
                        const [h1, m1] = dt.start.split(':').map(Number);
                        const [h2, m2] = (dt.end || dt.start).split(':').map(Number);
                        let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
                        if (diff < 0) diff = 0;

                        const dtEntry: ProductionEntry = {
                            id: isEditing ? item.editingId! : safeUUID(),
                            date: selectedDate,
                            machineId: item.machineCode,
                            operatorId: Number(item.operatorId),
                            shift: item.shift,
                            startTime: dt.start,
                            endTime: dt.end,
                            qtyOK: 0,
                            qtyDefect: 0,
                            downtimeMinutes: diff,
                            downtimeTypeId: dt.reasonId,
                            observations: dt.obs,
                            metaData: { is_batch: true },
                            createdAt: Date.now() + 1
                        };
                        await registerProductionEntry(dtEntry, isEditing);
                    }
                }
            } else {
                const prodEntry: ProductionEntry = {
                    id: isEditing ? item.editingId! : safeUUID(),
                    date: selectedDate,
                    machineId: item.machineCode,
                    operatorId: Number(item.operatorId),
                    shift: item.shift,
                    productCode: Number(item.productCode),
                    startTime: startTime, 
                    endTime: endTime,
                    qtyOK: Number(item.qtyOK) || 0, 
                    qtyDefect: 0,
                    downtimeMinutes: 0,
                    observations: 'Apontamento em Lote',
                    metaData: {
                        is_batch: true,
                        bobbin_weight: validBobbinWeight,
                        cycle_time: item.cycleTime
                    },
                    createdAt: Date.now()
                };
                await registerProductionEntry(prodEntry, isEditing);
            }

            const successBatch = [...batchItems]; 
            successBatch[index] = {
                ...successBatch[index],
                status: 'SAVED',
                errorMsg: undefined,
                editingId: undefined,
                qtyOK: '',
                bobbinWeight: '',
                downtimes: []
            };
            setBatchItems(successBatch);
            loadHistory();

        } catch (e: any) {
            const errorBatch = [...batchItems];
            errorBatch[index].status = 'ERROR';
            errorBatch[index].errorMsg = formatError(e);
            setBatchItems(errorBatch);
        }
    };

    if (loadingMaster) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-brand-600" /></div>;

    const relevantShifts = shifts.filter(s => !s.sector || s.sector === selectedSector);

    return (
        <div className="min-h-screen bg-slate-100 pb-20 relative animate-in fade-in">
            {confirmModal.isOpen && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6">
                        <h3 className="text-xl font-bold mb-2">{confirmModal.title}</h3>
                        <p className="mb-4">{confirmModal.message}</p>
                        <div className="flex justify-end gap-3">
                            <button onClick={() => setConfirmModal({...confirmModal, isOpen: false})} className="px-4 py-2 border rounded">Cancelar</button>
                            <button onClick={confirmModal.onConfirm} className="px-4 py-2 bg-red-600 text-white rounded">Confirmar</button>
                        </div>
                    </div>
                </div>
            )}

            <div className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-3">
                        <div className="bg-brand-100 p-2 rounded-lg text-brand-700">
                            <Zap size={20} />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-slate-800 leading-tight">Digitação Rápida</h1>
                            <p className="text-xs text-slate-500">Lançamento em massa por dia</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                        <div className="flex items-center gap-2">
                            <input 
                                type="date" 
                                value={selectedDate} 
                                onChange={e => setSelectedDate(e.target.value)}
                                className="bg-transparent font-bold text-slate-700 text-sm outline-none border-none"
                            />
                        </div>
                        <div className="w-px h-6 bg-slate-300"></div>
                        <select 
                            value={selectedSector} 
                            onChange={e => setSelectedSector(e.target.value)}
                            className="bg-transparent font-bold text-sm text-slate-700 outline-none cursor-pointer"
                        >
                            {sectorsList.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>

                    <div className="flex gap-2">
                        <button 
                            onClick={handlePreFill}
                            className="flex items-center px-3 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-bold transition-colors border border-blue-200"
                        >
                            <Copy size={14} className="mr-1.5" /> Clonar Anterior
                        </button>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
                {batchItems.map((item, index) => {
                    const currentTab = activeHistoryTabs[item.machineCode] || relevantShifts[0]?.name || '';
                    const isExtrusion = item.machineSector === 'Extrusão';
                    
                    const tabEntries = dailyEntries
                        .filter(e => e.machineId === item.machineCode && e.shift === currentTab)
                        .sort((a, b) => {
                            const isProdA = !a.downtimeMinutes;
                            const isProdB = !b.downtimeMinutes;
                            if (isProdA && !isProdB) return -1;
                            if (!isProdA && isProdB) return 1;
                            return (a.startTime || '').localeCompare(b.startTime || '');
                        });

                    return (
                        <div key={item.machineCode} className={`bg-white rounded-xl border shadow-sm ${item.status === 'EDITING' ? 'border-yellow-400 ring-2 ring-yellow-100' : 'border-slate-200'}`}>
                            <div className="px-4 py-2 border-b border-slate-100 bg-slate-50/80 rounded-t-xl flex justify-between items-center">
                                <div className="flex items-center gap-3">
                                    <span className="text-lg font-black text-slate-700">{item.machineCode}</span>
                                    <span className="text-xs text-slate-400 font-bold uppercase hidden sm:inline-block">{item.machineName}</span>
                                    {item.status === 'EDITING' && <span className="text-xs bg-yellow-100 text-yellow-800 px-2 rounded">EDITANDO</span>}
                                </div>
                                <div className="flex items-center gap-3">
                                    {item.status === 'SAVED' && <div className="text-green-600 text-xs font-bold flex items-center"><CheckCircle2 size={14} className="mr-1"/> Salvo</div>}
                                    {item.status === 'ERROR' && <div className="text-red-600 text-xs font-bold flex items-center"><AlertCircle size={14} className="mr-1"/> Erro</div>}
                                </div>
                            </div>

                            <div className="p-4">
                                <div className="flex flex-col xl:flex-row gap-6">
                                    <div className="flex-1 space-y-6">
                                        <div className="grid grid-cols-2 md:grid-cols-12 gap-3 items-start">
                                            <div className="col-span-2 md:col-span-3">
                                                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Operador</label>
                                                <select className="w-full h-9 px-2 text-sm border rounded bg-white" value={item.operatorId} onChange={e => updateItem(index, 'operatorId', e.target.value)} disabled={item.status === 'SAVED'}>
                                                    <option value="">Selecione...</option>
                                                    {operators.filter(op => !op.sector || op.sector === selectedSector).map(op => <option key={op.id} value={op.id}>{op.name}</option>)}
                                                </select>
                                            </div>
                                            <div className="col-span-1 md:col-span-2">
                                                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Turno</label>
                                                <select className="w-full h-9 px-2 text-sm border rounded bg-white" value={item.shift} onChange={e => updateItem(index, 'shift', e.target.value)} disabled={item.status === 'SAVED'}>
                                                    <option value="">Selecione...</option>
                                                    {relevantShifts.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                                                </select>
                                            </div>
                                            <div className="col-span-1 md:col-span-7">
                                                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Produto</label>
                                                <ProductSelect products={products} value={item.productCode ? Number(item.productCode) : null} onChange={val => updateItem(index, 'productCode', val ? val.toString() : '')} hideLabel={true} className="h-9 py-1.5 text-sm" disabled={item.status === 'SAVED'} />
                                            </div>
                                            <div className="col-span-1 md:col-span-4">
                                                <label className="text-[10px] font-bold text-blue-600 uppercase block mb-1">Peso (Kg)</label>
                                                <input type="text" inputMode="decimal" className="w-full h-9 px-2 text-sm border rounded font-bold text-blue-700" placeholder="0,00" value={item.bobbinWeight} onChange={e => updateItem(index, 'bobbinWeight', e.target.value)} disabled={item.status === 'SAVED'} />
                                            </div>
                                            <div className="col-span-1 md:col-span-4">
                                                <label className="text-[10px] font-bold text-green-600 uppercase block mb-1">{isExtrusion ? 'Nº Bobinas' : 'Qtd (Pçs)'}</label>
                                                <input type="number" className="w-full h-9 px-2 text-sm border rounded font-bold text-green-700" placeholder="0" value={item.qtyOK} onChange={e => updateItem(index, 'qtyOK', e.target.value)} disabled={item.status === 'SAVED'} />
                                            </div>
                                        </div>

                                        <div className="pt-2 border-t border-slate-100">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center text-slate-400 text-xs uppercase font-bold"><History size={14} className="mr-1.5"/> Lançamentos do dia</div>
                                                <div className="flex bg-slate-100 p-0.5 rounded-lg">
                                                    {relevantShifts.map(s => {
                                                        const count = dailyEntries.filter(e => e.machineId === item.machineCode && e.shift === s.name).length;
                                                        return (
                                                            <button key={s.name} onClick={() => handleTabChange(item.machineCode, s.name)} className={`px-3 py-1 text-[10px] font-bold rounded-md ${currentTab === s.name ? 'bg-white shadow-sm' : 'text-slate-400'}`}>
                                                                {s.name} {count > 0 && `(${count})`}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            <div className="bg-slate-50/50 rounded-lg border border-slate-200 p-0 min-h-[120px] max-h-[250px] overflow-y-auto">
                                                {tabEntries.length === 0 ? (
                                                    <div className="text-center py-8 text-slate-300 text-xs italic">Sem lançamentos no turno {currentTab}</div>
                                                ) : (
                                                    <div className="divide-y divide-slate-100">
                                                        {tabEntries.map(entry => (
                                                            <div key={entry.id} className="text-xs p-2 flex items-center gap-2 hover:bg-slate-50">
                                                                <span className="font-mono text-[10px] w-[60px] text-center bg-slate-100 rounded">{entry.startTime}</span>
                                                                <span className="font-bold w-16 truncate">{operators.find(o => o.id === entry.operatorId)?.name.split(' ')[0]}</span>
                                                                <div className="flex-1 truncate">{!entry.downtimeMinutes ? `Prod ${entry.productCode}` : `Parada ${entry.downtimeMinutes}m`}</div>
                                                                <div className="flex gap-2">
                                                                    <button onClick={(e) => {e.preventDefault(); handleEditEntry(index, entry)}} className="text-blue-400 hover:text-blue-600"><Edit2 size={12}/></button>
                                                                    <button onClick={(e) => handleDeleteEntry(e, entry)} className="text-red-400 hover:text-red-600"><Trash2 size={12}/></button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="w-full xl:w-96 border-t xl:border-t-0 xl:border-l border-slate-100 xl:pl-6 flex flex-col gap-4">
                                        <div className="flex-1">
                                            <div className="flex justify-between items-center mb-3">
                                                <label className="text-xs font-bold text-orange-600 uppercase flex items-center"><Timer size={14} className="mr-1"/> Paradas</label>
                                                <button onClick={() => addDowntime(index)} className="text-[10px] px-2 py-1 rounded border flex items-center font-bold bg-orange-50 text-orange-700 hover:bg-orange-100" disabled={item.status === 'SAVED'}><Plus size={12} className="mr-1"/> Add</button>
                                            </div>
                                            <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
                                                {item.downtimes.map((dt, dtIdx) => (
                                                    <div key={dt.id} className="flex gap-1 items-center bg-white p-1.5 rounded border border-orange-100 shadow-sm">
                                                        <input type="text" maxLength={5} placeholder="HH:MM" className="w-12 text-[10px] border rounded px-1 py-1 text-center" value={dt.start} onChange={e => handleTimeChange(index, dtIdx, 'start', e.target.value)} onBlur={e => handleTimeBlur(index, dtIdx, 'start', e.target.value)} disabled={item.status === 'SAVED'} />
                                                        <span className="text-slate-300">-</span>
                                                        <input type="text" maxLength={5} placeholder="HH:MM" className="w-12 text-[10px] border rounded px-1 py-1 text-center" value={dt.end} onChange={e => handleTimeChange(index, dtIdx, 'end', e.target.value)} onBlur={e => handleTimeBlur(index, dtIdx, 'end', e.target.value)} disabled={item.status === 'SAVED'} />
                                                        <select className="flex-1 w-20 text-[10px] border rounded px-1 py-1 truncate" value={dt.reasonId} onChange={e => updateDowntime(index, dtIdx, 'reasonId', e.target.value)} disabled={item.status === 'SAVED'}>
                                                            <option value="">Motivo...</option>
                                                            {downtimeTypes.map(d => <option key={d.id} value={d.id}>{d.description}</option>)}
                                                        </select>
                                                        <button onClick={() => removeDowntime(index, dtIdx)} className="text-slate-400 hover:text-red-500" disabled={item.status === 'SAVED'}><X size={12}/></button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="pt-4 border-t border-slate-100 flex flex-col gap-2">
                                            {item.errorMsg && <span className="text-xs text-red-600 bg-red-50 p-2 rounded">{item.errorMsg}</span>}
                                            <button onClick={() => handleSaveRow(index)} disabled={item.status === 'SAVING' || item.status === 'SAVED'} className={`w-full py-3 rounded-lg font-bold text-sm flex items-center justify-center shadow-sm ${item.status === 'SAVED' ? 'bg-green-100 text-green-700' : 'bg-slate-800 text-white hover:bg-slate-900'}`}>
                                                {item.status === 'SAVING' ? <Loader2 className="animate-spin mr-2" size={16}/> : <Save className="mr-2" size={16}/>}
                                                {item.status === 'SAVED' ? 'Registrado' : item.status === 'EDITING' ? 'Atualizar' : 'Salvar Linha'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default BatchEntryPage;