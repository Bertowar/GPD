import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
    fetchMachines, fetchOperators, fetchProducts, fetchDowntimeTypes, fetchWorkShifts, 
    getLastMachineEntry, registerProductionEntry, fetchSectors, formatError, fetchEntriesByDate, deleteEntry 
} from '../services/storage';
import { Machine, Operator, Product, DowntimeType, WorkShift, ProductionEntry } from '../types';
import { Save, Calendar, Copy, CheckCircle2, AlertCircle, Clock, Plus, Trash2, X, ChevronRight, ChevronDown, ChevronUp, Loader2, Zap, History, Package, Timer, Edit2, RotateCcw, Layers, RefreshCw, CopyPlus, Weight, Activity } from 'lucide-react';
import { ProductSelect } from '../components/ProductSelect';

// FIX: UUID Generator compatível com Postgres (v4 standard)
const safeUUID = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
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
        isLongStop: boolean; // NEW: Parada Longa (Turno Completo)
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

    // UI State
    const [expandedMachines, setExpandedMachines] = useState<Record<string, boolean>>({});

    // Data History State
    const [dailyEntries, setDailyEntries] = useState<ProductionEntry[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);

    // THE BATCH STATE
    const [batchItems, setBatchItems] = useState<BatchItem[]>([]);

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
            // Reset expanded state when sector changes
            setExpandedMachines({});
        }
    }, [selectedDate, selectedSector, machines]);

    // NEW: Auto-associate Operator when History loads
    // Se o histórico do dia carregar e tivermos linhas sem operador, tentamos preencher
    useEffect(() => {
        if (dailyEntries.length > 0 && batchItems.length > 0) {
            setBatchItems(prevItems => {
                let hasChanges = false;
                const newItems = prevItems.map(item => {
                    // Só tenta preencher se estiver vazio e não for salvo
                    if (!item.operatorId && (item.status === 'PENDING' || item.status === 'ERROR')) {
                        const historyOp = getOperatorFromHistory(item.machineCode, item.shift);
                        if (historyOp) {
                            hasChanges = true;
                            return { ...item, operatorId: historyOp };
                        }
                    }
                    return item;
                });
                return hasChanges ? newItems : prevItems;
            });
        }
    }, [dailyEntries]);

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

    // Helper: Find operator based on TODAY'S HISTORY for that machine/shift
    const getOperatorFromHistory = (machineCode: string, shiftName: string) => {
        // Encontra qualquer apontamento feito nesta máquina e turno HOJE que tenha operador válido
        const foundEntry = dailyEntries.find(e => 
            e.machineId === machineCode && 
            e.shift === shiftName && 
            e.operatorId && 
            e.operatorId !== 99999 // Ignora operador de sistema/parada longa
        );
        return foundEntry ? foundEntry.operatorId.toString() : '';
    };

    const initializeBatch = () => {
        const targetMachines = machines.filter(m => m.sector === selectedSector);
        const fixedShifts = ['Manhã', 'Tarde'];
        const newBatch: BatchItem[] = [];

        targetMachines.forEach(m => {
            fixedShifts.forEach(shiftName => {
                // Tenta pegar do histórico (pode estar vazio se history ainda não carregou, o useEffect acima corrige isso depois)
                const histOp = getOperatorFromHistory(m.code, shiftName);
                
                newBatch.push({
                    machineCode: m.code,
                    machineName: m.name,
                    machineSector: m.sector || '',
                    status: 'PENDING',
                    operatorId: histOp, // Pre-fill from history
                    shift: shiftName, 
                    productCode: '',
                    qtyOK: '',
                    bobbinWeight: '',
                    cycleTime: '',
                    downtimes: [{ id: safeUUID(), start: '', end: '', reasonId: '', obs: '', isLongStop: false }]
                });
            });
        });

        setBatchItems(newBatch);
    };

    // --- ACCORDION LOGIC ---
    const toggleMachine = (machineCode: string) => {
        setExpandedMachines(prev => ({
            ...prev,
            [machineCode]: !prev[machineCode]
        }));
    };

    // --- LOGIC: Duplicate Row for Multiple Entries ---
    const duplicateRow = (index: number) => {
        const source = batchItems[index];
        const newItem: BatchItem = {
            ...source,
            status: 'PENDING',
            errorMsg: undefined,
            editingId: undefined, // IMPORTANT: Clear ID to prevent overwrite
            // Copy Context
            operatorId: source.operatorId,
            shift: source.shift,
            // Reset Values (Fresh Start)
            productCode: source.productCode, 
            cycleTime: source.cycleTime,
            qtyOK: '', // Clear Qty
            bobbinWeight: '', // Clear Weight
            // Fresh Downtimes
            downtimes: [{ id: safeUUID(), start: '', end: '', reasonId: '', obs: '', isLongStop: false }]
        };

        const newBatch = [...batchItems];
        // Insert immediately after the current row
        newBatch.splice(index + 1, 0, newItem);
        setBatchItems(newBatch);
    };

    const handlePreFill = () => {
        setConfirmModal({
            isOpen: true,
            title: 'Clonar Anterior',
            message: 'Isso irá buscar o último registro de cada máquina. Continuar?',
            type: 'info',
            onConfirm: async () => {
                const updatedBatch = [...batchItems];
                
                for (let i = 0; i < updatedBatch.length; i++) {
                    const item = updatedBatch[i];
                    if (item.status === 'SAVED' || item.status === 'EDITING') continue;
                    
                    try {
                        const lastEntry = await getLastMachineEntry(item.machineCode, 'production');
                        if (lastEntry) {
                            updatedBatch[i].operatorId = lastEntry.operatorId.toString();
                            updatedBatch[i].productCode = lastEntry.productCode ? lastEntry.productCode.toString() : '';
                            if (lastEntry.metaData?.cycle_time) {
                                updatedBatch[i].cycleTime = lastEntry.metaData.cycle_time;
                            }
                        }
                    } catch (e) { console.error(e); }
                }
                
                setBatchItems(updatedBatch);
                setConfirmModal(prev => ({ ...prev, isOpen: false }));
            }
        });
    };

    const updateItem = (index: number, field: keyof BatchItem, value: any) => {
        const newBatch = [...batchItems];
        const item = newBatch[index];
        (item as any)[field] = value;

        // RULE: Auto-associate operator when Shift changes based on HISTORY
        if (field === 'shift') {
            const historyOp = getOperatorFromHistory(item.machineCode, value);
            if (historyOp) {
                item.operatorId = historyOp;
            } else {
                // Se não tem no histórico, limpa para forçar o usuário a escolher
                item.operatorId = ''; 
            }
        }

        if (item.status === 'ERROR' || item.status === 'SAVED') {
            item.status = 'PENDING';
        }
        setBatchItems(newBatch);
    };

    const handleEditEntry = (index: number, entry: ProductionEntry) => {
        const newBatch = [...batchItems];
        const item = newBatch[index];
        item.status = 'EDITING';
        item.editingId = entry.id; // Store ID to update later
        item.operatorId = entry.operatorId.toString();
        item.shift = entry.shift || item.shift; 
        
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
                obs: entry.observations || '',
                isLongStop: entry.metaData?.long_stop === true
            }];
        } else {
            item.productCode = entry.productCode ? entry.productCode.toString() : '';
            item.qtyOK = entry.qtyOK.toString();
            item.bobbinWeight = entry.metaData?.bobbin_weight ? entry.metaData.bobbin_weight.toString().replace('.', ',') : '';
            item.cycleTime = entry.metaData?.cycle_time ? entry.metaData.cycle_time.toString() : '';
            item.downtimes = [{ id: safeUUID(), start: '', end: '', reasonId: '', obs: '', isLongStop: false }];
        }
        setBatchItems(newBatch);
        // Ensure section is expanded when editing
        setExpandedMachines(prev => ({...prev, [item.machineCode]: true}));
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
            
            // RULE: If operator is empty when adding downtime, try to fill it based on HISTORY
            if (!item.operatorId && item.shift) {
                const historyOp = getOperatorFromHistory(item.machineCode, item.shift);
                if (historyOp) item.operatorId = historyOp;
            }

            const newId = safeUUID();
            item.downtimes = [...item.downtimes, {
                id: newId,
                start: '', end: '', reasonId: '', obs: '', isLongStop: false
            }];
            newBatch[index] = item;
            
            // Foco no novo input de horário após render (com ID específico)
            setTimeout(() => {
                const newInput = document.getElementById(`dt-start-${index}-${item.downtimes.length - 1}`);
                if (newInput) newInput.focus();
            }, 50);

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

    const updateDowntime = (itemIndex: number, dtIndex: number, field: string, value: any) => {
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

    // UX: Tab on last reason select creates new row
    const handleDowntimeKeyDown = (e: React.KeyboardEvent, itemIndex: number, dtIndex: number, isLast: boolean) => {
        if (e.key === 'Tab' && !e.shiftKey && isLast) {
            e.preventDefault();
            addDowntime(itemIndex);
        }
    };

    const handleTimeChange = (index: number, dtIndex: number, field: 'start' | 'end', rawValue: string) => {
        let v = rawValue.replace(/[^\d:]/g, '').slice(0, 5); 
        if (!v.includes(':') && v.length > 2) {
             v = v.slice(0,2) + ':' + v.slice(2);
        }
        updateDowntime(index, dtIndex, field, v);
    };

    const handleTimeBlur = (index: number, dtIndex: number, field: 'start' | 'end', value: string) => {
        if (!value) return;
        let clean = value.replace(/[^\d:]/g, '');
        if (clean.indexOf(':') === -1) {
            if (clean.length === 1) clean = '0' + clean + ':00';
            else if (clean.length === 2) clean = clean + ':00';
            else if (clean.length === 3) clean = clean.slice(0,2) + ':' + clean.slice(2) + '0';
            else if (clean.length === 4) clean = clean.slice(0,2) + ':' + clean.slice(2);
        } else {
            let [h, m] = clean.split(':');
            if (!h) h = '00';
            if (h.length === 1) h = '0' + h;
            if (!m) m = '00';
            if (m.length === 1) m = '0' + m;
            clean = `${h}:${m}`;
        }
        const [hh, mm] = clean.split(':');
        if (parseInt(hh) > 23) clean = '23:' + mm;
        if (parseInt(mm) > 59) clean = hh + ':59';
        updateDowntime(index, dtIndex, field, clean);
    };

    const safeParseFloat = (val: string | number | undefined): number | null => {
        if (val === undefined || val === null || val === '') return null;
        if (typeof val === 'number') return val;
        const clean = val.toString().replace(',', '.');
        const num = parseFloat(clean);
        return isNaN(num) ? null : num;
    };

    const timeToMinutes = (time: string) => {
        if (!time) return 0;
        const [h, m] = time.split(':').map(Number);
        return h * 60 + m;
    };

    const getEntryDuration = (start?: string, end?: string) => {
        if (!start || !end) return 0;
        const [h1, m1] = start.split(':').map(Number);
        const [h2, m2] = end.split(':').map(Number);
        let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
        if (diff < 0) diff += 1440;
        return diff;
    };

    const handleSaveRow = async (index: number) => {
        const item = batchItems[index];
        const isEditing = item.status === 'EDITING' && !!item.editingId;
        
        // --- VALIDAÇÃO ---
        if (!item.shift) { alert("Preencha o Turno."); return; }

        // Identifica se há uma parada longa válida
        const validDowntimes = item.downtimes.filter(dt => (dt.start && dt.reasonId) || (dt.isLongStop && dt.reasonId));
        const hasLongStop = validDowntimes.some(dt => dt.isLongStop);
        const hasProduction = !!item.productCode;

        // Operador é obrigatório APENAS se NÃO for parada longa
        if (!item.operatorId && !hasLongStop) { 
            alert("Preencha o Operador."); 
            return; 
        }

        if (validDowntimes.length === 0 && !hasProduction) { 
            alert("Preencha dados de produção OU adicione uma Parada válida."); 
            return; 
        }

        // Validate Overlap only for regular stops
        const timedDowntimes = validDowntimes.filter(dt => !dt.isLongStop);
        if (timedDowntimes.length > 1) {
            const ranges = timedDowntimes.map(dt => ({
                start: timeToMinutes(dt.start),
                end: timeToMinutes(dt.end || dt.start)
            }));
            for (let i = 0; i < ranges.length; i++) {
                for (let j = i + 1; j < ranges.length; j++) {
                    const r1 = ranges[i];
                    const r2 = ranges[j];
                    if (r1.start < r2.end && r1.end > r2.start) {
                        alert(`Atenção: Existe sobreposição de horários nas paradas. Verifique.`);
                        return; 
                    }
                }
            }
        }

        const newBatch = [...batchItems];
        newBatch[index].status = 'SAVING';
        setBatchItems(newBatch);

        try {
            // FIX: BUSCA DE TURNO CORRIGIDA (Prioriza Setor Específico)
            // 1. Tenta achar turno com mesmo NOME e mesmo SETOR da máquina
            let selectedShift = shifts.find(s => s.name === item.shift && s.sector === item.machineSector);
            
            // 2. Se não achar, tenta achar turno GLOBAL (sector = null)
            if (!selectedShift) {
                selectedShift = shifts.find(s => s.name === item.shift && !s.sector);
            }

            // 3. Fallback: Pega qualquer um com o nome (comportamento antigo, para evitar erro total)
            if (!selectedShift) {
                selectedShift = shifts.find(s => s.name === item.shift);
            }

            // Default shift times if not found
            const shiftStart = selectedShift ? selectedShift.startTime : '06:00';
            const shiftEnd = selectedShift ? selectedShift.endTime : '14:00';

            // Determine final operator ID (Use 99999 for Long Stops if empty)
            const finalOperatorId = item.operatorId ? Number(item.operatorId) : 99999;

            // Loop to save all parts (Downtime + Production)
            if (validDowntimes.length > 0) {
                let loopIndex = 0;
                for (const dt of validDowntimes) {
                    let finalStart = dt.start;
                    let finalEnd = dt.end;
                    let duration = 0;

                    if (dt.isLongStop) {
                        // For Long Stop, use Shift Limits
                        finalStart = shiftStart;
                        finalEnd = shiftEnd;
                        // Calculate total duration
                        const [h1, m1] = finalStart.split(':').map(Number);
                        const [h2, m2] = finalEnd.split(':').map(Number);
                        duration = (h2 * 60 + m2) - (h1 * 60 + m1);
                        if (duration < 0) duration += 1440;
                    } else {
                        const [h1, m1] = dt.start.split(':').map(Number);
                        const [h2, m2] = (dt.end || dt.start).split(':').map(Number);
                        duration = (h2 * 60 + m2) - (h1 * 60 + m1);
                        if (duration < 0) duration = 0;
                    }

                    // GENERATE ID LOGIC:
                    // If Editing, reuse ID. If New, generate NEW ID.
                    const entryId = (isEditing && !hasProduction && loopIndex === 0) ? item.editingId! : safeUUID();
                    
                    const dtEntry: ProductionEntry = {
                        id: entryId,
                        date: selectedDate,
                        machineId: item.machineCode,
                        operatorId: finalOperatorId, 
                        shift: item.shift,
                        startTime: finalStart,
                        endTime: finalEnd,
                        qtyOK: 0,
                        qtyDefect: 0,
                        downtimeMinutes: duration,
                        downtimeTypeId: dt.reasonId,
                        observations: dt.obs,
                        metaData: { is_batch: true, long_stop: dt.isLongStop },
                        createdAt: Date.now() + loopIndex
                    };
                    
                    await registerProductionEntry(dtEntry, isEditing && !hasProduction && loopIndex === 0);
                    loopIndex++;
                }
            }

            if (hasProduction) {
                let validBobbinWeight: number | null = null;
                if (item.bobbinWeight) {
                    const parsed = parseFloat(item.bobbinWeight.replace(',', '.'));
                    validBobbinWeight = isNaN(parsed) ? null : parsed;
                    if (validBobbinWeight === null || validBobbinWeight <= 0) {
                        throw new Error("O Peso da Bobina deve ser válido.");
                    }
                } else if (item.machineSector === 'Extrusão') {
                    throw new Error("Para Extrusão, informe o Peso da Bobina (Kg).");
                }

                // If editing and no downtimes were saved previously in this loop, use existing ID. Else new ID.
                const prodEntryId = (isEditing && !validDowntimes.length) ? item.editingId! : safeUUID();

                const prodEntry: ProductionEntry = {
                    id: prodEntryId,
                    date: selectedDate,
                    machineId: item.machineCode,
                    operatorId: finalOperatorId,
                    shift: item.shift,
                    productCode: Number(item.productCode),
                    startTime: shiftStart, 
                    endTime: shiftEnd,
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
                await registerProductionEntry(prodEntry, isEditing && !validDowntimes.length);
            }

            const successBatch = [...batchItems]; 
            successBatch[index] = {
                ...successBatch[index],
                status: 'SAVED',
                errorMsg: undefined,
                editingId: undefined, // Reset editing ID so next save is a new entry unless explicitly edited again
                qtyOK: '',
                bobbinWeight: '', 
                downtimes: [{ id: safeUUID(), start: '', end: '', reasonId: '', obs: '', isLongStop: false }]
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

            {/* FIXED HEADER - MARGENS NEGATIVAS PARA "COLAR" NO TOPO E COBRIR O PADDING DO LAYOUT */}
            <div className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm -mx-4 -mt-4 md:-mx-8 md:-mt-8 px-4 md:px-8 pt-4 pb-3">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
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

            <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
                {/* LOOP THROUGH MACHINES (Grouping Header) */}
                {machines.filter(m => m.sector === selectedSector).map((machine) => {
                    // Filter batch items belonging to this machine
                    const machineItems = batchItems
                        .map((item, originalIndex) => ({ item, originalIndex }))
                        .filter(x => x.item.machineCode === machine.code);

                    if (machineItems.length === 0) return null;

                    // Calculate Daily Totals for Header
                    const machineDailyEntries = dailyEntries.filter(e => e.machineId === machine.code);
                    const totalDailyKg = machineDailyEntries.reduce((acc, curr) => acc + (curr.metaData?.bobbin_weight ? Number(curr.metaData.bobbin_weight) : 0), 0);
                    const totalDailyQty = machineDailyEntries.reduce((acc, curr) => acc + (curr.qtyOK || 0), 0);
                    
                    // Time Calculation Logic (Available vs Downtime vs Effective)
                    let totalMinutes = 0;
                    let totalDowntime = 0;

                    machineDailyEntries.forEach(e => {
                        const duration = getEntryDuration(e.startTime, e.endTime);
                        totalMinutes += duration;
                        totalDowntime += (e.downtimeMinutes || 0);
                    });

                    const effectiveMinutes = totalMinutes - totalDowntime;

                    const isExpanded = expandedMachines[machine.code];

                    return (
                        <div key={machine.code} className="bg-white rounded-xl border border-slate-300 shadow-sm overflow-hidden transition-all duration-300">
                            {/* MACHINE HEADER - CLICKABLE ACCORDION */}
                            <div 
                                onClick={() => toggleMachine(machine.code)}
                                className={`px-4 py-3 bg-slate-50 border-b flex items-center cursor-pointer hover:bg-slate-100 transition-colors ${isExpanded ? 'border-slate-200' : 'border-transparent'}`}
                            >
                                {/* LEFT: ICON + NAME */}
                                <div className="flex items-center gap-3 w-1/3">
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-slate-700 font-black text-xs border border-slate-300 transition-transform ${isExpanded ? 'bg-slate-300' : 'bg-white'}`}>
                                        {isExpanded ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}
                                    </div>
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-bold text-slate-800 uppercase">{machine.name}</span>
                                            <span className="text-[10px] bg-slate-200 px-1.5 rounded text-slate-600 font-mono font-bold">{machine.code}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* CENTER: TIME METRICS */}
                                <div className="flex-1 flex justify-center">
                                    {totalMinutes > 0 && (
                                        <div className="hidden md:flex items-center gap-2 text-xs">
                                            <div className="flex items-center text-slate-600 font-bold bg-slate-100 px-1.5 py-0.5 rounded" title="Tempo Total (Turnos)">
                                                <Clock size={12} className="mr-1"/> {totalMinutes}m
                                            </div>
                                            <span className="text-slate-300 font-bold">-</span>
                                            <div className={`flex items-center font-bold px-1.5 py-0.5 rounded ${totalDowntime > 0 ? 'text-red-700 bg-red-50' : 'text-slate-400 bg-slate-50'}`} title="Tempo Parado">
                                                {totalDowntime}m
                                            </div>
                                            <span className="text-slate-300 font-bold">=</span>
                                            <div className="flex items-center text-green-700 font-bold bg-green-50 px-1.5 py-0.5 rounded border border-green-200" title="Tempo Efetivo (Trabalhado)">
                                                <Activity size={12} className="mr-1"/> {effectiveMinutes}m
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* RIGHT: PRODUCTION STATS */}
                                <div className="flex items-center justify-end gap-2 w-1/3">
                                    {totalDailyKg > 0 && (
                                        <div className="hidden sm:flex items-center gap-1.5 bg-blue-50 px-2 py-1 rounded border border-blue-100">
                                            <Weight size={14} className="text-blue-600"/>
                                            <span className="text-xs font-bold text-blue-800">{totalDailyKg.toFixed(1)} Kg</span>
                                        </div>
                                    )}
                                    {totalDailyQty > 0 && (
                                        <div className="hidden sm:flex items-center gap-1.5 bg-green-50 px-2 py-1 rounded border border-green-100">
                                            <Package size={14} className="text-green-600"/>
                                            <span className="text-xs font-bold text-green-800">{totalDailyQty} {selectedSector === 'Extrusão' ? 'bob' : 'cx'}</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* ROWS FOR THIS MACHINE (COLLAPSIBLE CONTENT) */}
                            {isExpanded && (
                                <div className="divide-y divide-slate-200 animate-in slide-in-from-top-2 duration-200">
                                    {machineItems.map(({ item, originalIndex }) => {
                                        const isExtrusion = item.machineSector === 'Extrusão';
                                        const isEditing = item.status === 'EDITING';
                                        const tabEntries = machineDailyEntries
                                            .filter(e => e.shift === item.shift)
                                            .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));

                                        return (
                                            <div key={`${item.shift}-${originalIndex}`} className="flex flex-col xl:flex-row bg-white relative group">
                                                {/* LEFT: INPUTS */}
                                                <div className="flex-1 p-4 space-y-4">
                                                    <div className="grid grid-cols-2 md:grid-cols-12 gap-3 items-end">
                                                        
                                                        {/* 1. TURNO */}
                                                        <div className="col-span-1 md:col-span-1">
                                                            <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Turno</label>
                                                            {isEditing ? (
                                                                <select className="w-full h-9 px-1 text-sm border border-yellow-400 bg-yellow-50 rounded font-bold text-slate-800" value={item.shift} onChange={e => updateItem(originalIndex, 'shift', e.target.value)}>
                                                                    {relevantShifts.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                                                                </select>
                                                            ) : (
                                                                <div className={`w-full h-9 flex items-center justify-center px-1 rounded text-sm font-bold border ${item.shift === 'Manhã' ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-orange-50 text-orange-700 border-orange-100'}`}>
                                                                    {item.shift === 'Manhã' ? 'M' : item.shift === 'Tarde' ? 'T' : item.shift.slice(0,3)}
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* 2. OPERADOR */}
                                                        <div className="col-span-1 md:col-span-3">
                                                            <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Operador</label>
                                                            <select className="w-full h-9 px-2 text-sm border rounded bg-white" value={item.operatorId} onChange={e => updateItem(originalIndex, 'operatorId', e.target.value)} disabled={item.status === 'SAVED'}>
                                                                <option value="">Selecione...</option>
                                                                {operators.filter(op => !op.sector || op.sector === selectedSector).map(op => <option key={op.id} value={op.id}>{op.name}</option>)}
                                                            </select>
                                                        </div>

                                                        {/* 3. CICLOS */}
                                                        <div className="col-span-1 md:col-span-1">
                                                            <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Cicl</label>
                                                            <input 
                                                                type="text" 
                                                                className="w-full h-9 px-1 text-sm border rounded text-center font-mono" 
                                                                placeholder="0" 
                                                                value={item.cycleTime} 
                                                                onChange={e => updateItem(originalIndex, 'cycleTime', e.target.value)} 
                                                                disabled={item.status === 'SAVED'} 
                                                            />
                                                        </div>

                                                        {/* 4. PRODUTO (Focusable) */}
                                                        <div className="col-span-1 md:col-span-4">
                                                            <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Produto</label>
                                                            <ProductSelect 
                                                                products={products} 
                                                                value={item.productCode ? Number(item.productCode) : null} 
                                                                onChange={val => updateItem(originalIndex, 'productCode', val ? val.toString() : '')} 
                                                                onConfirm={() => {
                                                                    // Focus Weight Input when product is confirmed
                                                                    const weightInput = document.getElementById(`weight-${originalIndex}`);
                                                                    if (weightInput) weightInput.focus();
                                                                }}
                                                                hideLabel={true} 
                                                                className="h-9 py-1.5 text-sm" 
                                                                disabled={item.status === 'SAVED'} 
                                                            />
                                                        </div>

                                                        {/* 5. PESO */}
                                                        <div className="col-span-1 md:col-span-2">
                                                            <label className="text-[10px] font-bold text-blue-600 uppercase block mb-1">Peso (Kg)</label>
                                                            <input 
                                                                id={`weight-${originalIndex}`} // ID for focus
                                                                type="text" 
                                                                inputMode="decimal" 
                                                                className="w-full h-9 px-2 text-sm border rounded font-bold text-blue-700 text-center focus:ring-2 focus:ring-blue-300 outline-none" 
                                                                placeholder="0.0" 
                                                                value={item.bobbinWeight} 
                                                                onChange={e => updateItem(originalIndex, 'bobbinWeight', e.target.value)} 
                                                                disabled={item.status === 'SAVED'} 
                                                            />
                                                        </div>

                                                        {/* 6. QTD */}
                                                        <div className="col-span-1 md:col-span-1">
                                                            <label className="text-[10px] font-bold text-green-600 uppercase block mb-1">{isExtrusion ? 'Bob' : 'CX'}</label>
                                                            <input type="number" className="w-full h-9 px-1 text-sm border rounded font-bold text-green-700 text-center" placeholder="0" value={item.qtyOK} onChange={e => updateItem(originalIndex, 'qtyOK', e.target.value)} disabled={item.status === 'SAVED'} />
                                                        </div>
                                                    </div>

                                                    {/* HISTORY SECTION */}
                                                    <div className="pt-2 border-t border-slate-100 mt-2">
                                                        <div className="flex items-center gap-2 mb-2 text-slate-400 text-[10px] uppercase font-bold">
                                                            <History size={12}/> Lançamentos do dia ({item.shift})
                                                        </div>
                                                        
                                                        <div className="bg-slate-50/50 rounded-lg border border-slate-200 p-0 min-h-[40px] max-h-[150px] overflow-y-auto">
                                                            {tabEntries.length === 0 ? (
                                                                <div className="text-center py-4 text-slate-300 text-[10px] italic">Vazio</div>
                                                            ) : (
                                                                <div className="divide-y divide-slate-100">
                                                                    {tabEntries.map(entry => {
                                                                        const fmtTime = (t: string | undefined) => t && t.length >= 5 ? t.slice(0, 5) : (t || '--:--');
                                                                        
                                                                        return (
                                                                        <div key={entry.id} className="text-xs p-2 flex items-center gap-2 hover:bg-slate-50 border-b border-slate-100 last:border-0">
                                                                            <span className="font-mono text-[10px] min-w-[80px] text-center bg-slate-100 rounded text-slate-500 px-1 border border-slate-200">
                                                                                {fmtTime(entry.startTime)} - {fmtTime(entry.endTime)}
                                                                            </span>
                                                                            
                                                                            <span className="font-bold text-[10px] w-20 truncate text-slate-700" title={operators.find(o => o.id === entry.operatorId)?.name}>
                                                                                {operators.find(o => o.id === entry.operatorId)?.name.split(' ')[0]}
                                                                            </span>
                                                                            
                                                                            <div className="flex-1 flex items-center gap-2 overflow-hidden">
                                                                                {entry.downtimeMinutes > 0 ? (
                                                                                    <>
                                                                                        <span className="text-orange-700 font-bold bg-orange-50 px-1 rounded whitespace-nowrap border border-orange-100">
                                                                                            Parada {entry.downtimeMinutes}m
                                                                                        </span>
                                                                                        <span className="truncate text-slate-600 font-medium text-[10px]" title={downtimeTypes.find(dt => dt.id === entry.downtimeTypeId)?.description}>
                                                                                            {downtimeTypes.find(dt => dt.id === entry.downtimeTypeId)?.description || entry.downtimeTypeId}
                                                                                        </span>
                                                                                    </>
                                                                                ) : (
                                                                                    <>
                                                                                        <span className="truncate font-medium text-slate-700 flex-1">
                                                                                            {products.find(p => p.codigo === entry.productCode)?.produto || `Prod ${entry.productCode}`}
                                                                                        </span>
                                                                                        
                                                                                        {/* Ciclagem Visibility Fix */}
                                                                                        {entry.metaData?.cycle_time && (
                                                                                            <span className="text-slate-500 font-mono text-[10px] bg-slate-100 px-1.5 rounded flex items-center" title={`Ciclos: ${entry.metaData.cycle_time}`}>
                                                                                                <Clock size={10} className="mr-1"/> {entry.metaData.cycle_time}
                                                                                            </span>
                                                                                        )}
                                                                                        
                                                                                        {entry.metaData?.bobbin_weight && (
                                                                                            <span className="text-blue-700 font-bold bg-blue-50 px-1.5 rounded whitespace-nowrap border border-blue-100">
                                                                                                {entry.metaData.bobbin_weight.toString().replace('.', ',')} Kg
                                                                                            </span>
                                                                                        )}

                                                                                        {entry.qtyOK > 0 && (
                                                                                            <span className="text-green-700 font-bold bg-green-50 px-1.5 rounded whitespace-nowrap border border-green-100">
                                                                                                {entry.qtyOK} cx
                                                                                            </span>
                                                                                        )}
                                                                                    </>
                                                                                )}
                                                                            </div>

                                                                            <div className="flex gap-1 pl-1">
                                                                                <button onClick={(e) => {e.preventDefault(); handleEditEntry(originalIndex, entry)}} className="p-1 hover:bg-blue-50 text-blue-400 hover:text-blue-600 rounded"><Edit2 size={12}/></button>
                                                                                <button onClick={(e) => handleDeleteEntry(e, entry)} className="p-1 hover:bg-red-50 text-red-400 hover:text-red-600 rounded"><Trash2 size={12}/></button>
                                                                            </div>
                                                                        </div>
                                                                    )})}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* RIGHT: DOWNTIMES */}
                                                <div className="w-full xl:w-80 border-t xl:border-t-0 xl:border-l border-slate-100 xl:pl-4 p-4 flex flex-col bg-slate-50/30">
                                                    <div className="flex-1">
                                                        <div className="flex justify-between items-center mb-3">
                                                            <label className="text-xs font-bold text-orange-600 uppercase flex items-center"><Timer size={14} className="mr-1"/> Paradas</label>
                                                            <button onClick={() => addDowntime(originalIndex)} className="text-[10px] px-2 py-1 rounded border flex items-center font-bold bg-white text-orange-700 hover:bg-orange-50" disabled={item.status === 'SAVED'}><Plus size={12} className="mr-1"/> Add</button>
                                                        </div>
                                                        <div className="space-y-2 max-h-[150px] overflow-y-auto pr-1">
                                                            {item.downtimes.map((dt, dtIdx) => (
                                                                <div key={dt.id} className="flex gap-1 items-center bg-white p-1.5 rounded border border-orange-100 shadow-sm">
                                                                    {/* CHECKBOX PARADA LONGA */}
                                                                    <div className="mr-1" title="Parada Longa (Turno Completo)">
                                                                        <input 
                                                                            type="checkbox" 
                                                                            checked={dt.isLongStop} 
                                                                            onChange={e => updateDowntime(originalIndex, dtIdx, 'isLongStop', e.target.checked)}
                                                                            className="w-3 h-3 text-orange-600 rounded focus:ring-orange-500 cursor-pointer"
                                                                            disabled={item.status === 'SAVED'}
                                                                        />
                                                                    </div>

                                                                    {dt.isLongStop ? (
                                                                        <div className="flex-1 text-[10px] font-bold text-orange-700 text-center bg-orange-50 rounded py-1 border border-orange-100">
                                                                            TURNO COMPLETO
                                                                        </div>
                                                                    ) : (
                                                                        <>
                                                                            <input 
                                                                                id={`dt-start-${originalIndex}-${dtIdx}`} // ID for focus
                                                                                type="text" 
                                                                                maxLength={5} 
                                                                                placeholder="00:00" 
                                                                                className="w-10 text-[10px] border rounded px-0.5 py-1 text-center font-mono" 
                                                                                value={dt.start} 
                                                                                onChange={e => handleTimeChange(originalIndex, dtIdx, 'start', e.target.value)} 
                                                                                onBlur={e => handleTimeBlur(originalIndex, dtIdx, 'start', e.target.value)}
                                                                                disabled={item.status === 'SAVED'} 
                                                                            />
                                                                            <span className="text-slate-300 text-[10px]">-</span>
                                                                            <input 
                                                                                type="text" 
                                                                                maxLength={5} 
                                                                                placeholder="00:00" 
                                                                                className="w-10 text-[10px] border rounded px-0.5 py-1 text-center font-mono" 
                                                                                value={dt.end} 
                                                                                onChange={e => handleTimeChange(originalIndex, dtIdx, 'end', e.target.value)}
                                                                                onBlur={e => handleTimeBlur(originalIndex, dtIdx, 'end', e.target.value)}
                                                                                disabled={item.status === 'SAVED'} 
                                                                            />
                                                                        </>
                                                                    )}
                                                                    
                                                                    <select 
                                                                        className="flex-1 w-16 text-[10px] border rounded px-1 py-1 truncate" 
                                                                        value={dt.reasonId} 
                                                                        onChange={e => updateDowntime(originalIndex, dtIdx, 'reasonId', e.target.value)} 
                                                                        disabled={item.status === 'SAVED'}
                                                                        onKeyDown={(e) => handleDowntimeKeyDown(e, originalIndex, dtIdx, dtIdx === item.downtimes.length - 1)}
                                                                    >
                                                                        <option value="">Motivo...</option>
                                                                        {downtimeTypes.map(d => <option key={d.id} value={d.id}>{d.id} - {d.description}</option>)}
                                                                    </select>
                                                                    <button onClick={() => removeDowntime(originalIndex, dtIdx)} className="text-slate-400 hover:text-red-500" disabled={item.status === 'SAVED'}><X size={12}/></button>
                                                                </div>
                                                            ))}
                                                            {item.downtimes.length === 0 && <div className="text-[10px] text-slate-300 text-center py-2 italic">Sem paradas</div>}
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="pt-3 border-t border-slate-200 mt-2 flex flex-col gap-2">
                                                        {item.errorMsg && <span className="text-xs text-red-600 bg-red-50 p-2 rounded">{item.errorMsg}</span>}
                                                        
                                                        <div className="flex gap-2">
                                                            <button 
                                                                onClick={() => duplicateRow(originalIndex)} 
                                                                disabled={item.status === 'SAVING'}
                                                                className="flex-1 py-2 bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 rounded-lg font-bold text-xs flex items-center justify-center transition-all"
                                                                title="Criar nova linha copiando Turno e Operador"
                                                            >
                                                                <CopyPlus size={14} className="mr-1.5"/> Novo
                                                            </button>
                                                            <button 
                                                                onClick={() => handleSaveRow(originalIndex)} 
                                                                disabled={item.status === 'SAVING' || item.status === 'SAVED'} 
                                                                className={`flex-[2] py-2 rounded-lg font-bold text-sm flex items-center justify-center shadow-sm transition-all ${item.status === 'SAVED' ? 'bg-green-600 text-white' : 'bg-slate-800 text-white hover:bg-slate-900 active:scale-95'}`}
                                                            >
                                                                {item.status === 'SAVING' ? <Loader2 className="animate-spin mr-2" size={14}/> : <Save className="mr-2" size={14}/>}
                                                                {item.status === 'SAVED' ? 'Salvo!' : 'Salvar'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default BatchEntryPage;