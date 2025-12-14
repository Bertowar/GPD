import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  useProducts, useMachines, useOperators, useDowntimeTypes, 
  useSectors, useWorkShifts, useMachineStatuses, 
  useRegisterEntry, useCustomFields, useProductionOrders, useLastMachineEntry,
  useMachineEntries
} from '../hooks/useQueries';
import { ProductionEntry } from '../types';
import { Input, Textarea } from '../components/Input';
import { ProductSelect } from '../components/ProductSelect';
import { DynamicFields } from '../components/DynamicFields';
import { Save, AlertCircle, Loader2, ArrowLeft, Clock, Cpu, Square, Timer, X, Package, Plus, CheckCircle, List, Weight, Scale } from 'lucide-react';
import { formatError, checkTimeOverlap, determineCurrentShift } from '../services/storage';

export const EntryForm: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const editEntry = (location.state as any)?.editEntry as ProductionEntry | undefined;
  
  // Queries
  const { data: products = [] } = useProducts();
  const { data: machines = [] } = useMachines();
  const { data: operators = [] } = useOperators();
  const { data: downtimeTypes = [] } = useDowntimeTypes();
  const { data: shifts = [] } = useWorkShifts();
  const { data: machineStatuses = {} } = useMachineStatuses();
  const { data: customFields = [] } = useCustomFields();
  const { data: productionOrders = [] } = useProductionOrders();

  // Mutation
  const { mutateAsync: saveEntryMutation, isPending: isSubmitting } = useRegisterEntry();

  // Sectors
  const displayedSectors = ['Extrusão', 'Termoformagem'];

  // Current Date Helper
  const today = new Date().toISOString().split('T')[0];

  // Form State
  const [date, setDate] = useState(today);
  const [machineId, setMachineId] = useState('');
  const [operatorId, setOperatorId] = useState<number | ''>('');
  const [shift, setShift] = useState('');
  
  const [productCode, setProductCode] = useState<number | null>(null);
  const [selectedOpId, setSelectedOpId] = useState('');

  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  
  // New Layout Fields
  const [cycleTime, setCycleTime] = useState('');
  const [measuredWeight, setMeasuredWeight] = useState(''); // Peso Médio
  const [bobbinWeight, setBobbinWeight] = useState(''); // Peso da Bobina (Input Único)
  const [qtyOK, setQtyOK] = useState(''); // Quantidade Produzida

  const [downtimeTypeId, setDowntimeTypeId] = useState('');
  const [observations, setObservations] = useState('');
  const [isDraft, setIsDraft] = useState(false);
  
  const [customValues, setCustomValues] = useState<Record<string, any>>({});

  const [isDowntime, setIsDowntime] = useState(false);
  const [isLongStop, setIsLongStop] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null); // Feedback visual para salvamento rápido

  // Hook para buscar o último apontamento (GLOBAL da máquina, filtrado pelo contexto da aba)
  const { data: lastEntry } = useLastMachineEntry(machineId, isDowntime);

  // Hook para buscar o histórico do dia da máquina (usado para lista de paradas)
  const { data: dailyEntries = [] } = useMachineEntries(machineId, date);

  // Filtra apenas paradas para a lista de histórico em modo Parada
  const dailyDowntimes = useMemo(() => {
      return dailyEntries.filter(e => e.downtimeMinutes > 0);
  }, [dailyEntries]);

  // Lógica de formatação do último registro para exibição
  const lastEntryDisplay = useMemo(() => {
      if (!lastEntry) return null;
      
      // 1. Data
      const [y, m, d] = lastEntry.date.split('-');
      const dateStr = `${d}/${m}`;

      // 2. Turno Simplificado
      let shiftStr = lastEntry.shift || '-';
      const sLower = shiftStr.toLowerCase();
      if (sLower.includes('manh')) shiftStr = 'Manhã';
      else if (sLower.includes('tarde')) shiftStr = 'Tarde';
      else if (sLower.includes('noite')) shiftStr = 'Noite';

      // 3. Operador (Primeiro nome)
      const opName = operators.find(o => o.id === lastEntry.operatorId)?.name.split(' ')[0] || 'Op.';

      // 4. Detalhes (Prod ou Parada)
      if (lastEntry.downtimeMinutes > 0) {
          // Parada: Tempo - Motivo
          const reason = downtimeTypes.find(dt => dt.id === lastEntry.downtimeTypeId)?.description || 'Parada';
          // Limita tamanho do motivo
          const shortReason = reason.length > 25 ? reason.substring(0, 25) + '...' : reason;
          return {
              text: `Último: ${dateStr} • ${shiftStr} • ${opName} • ${lastEntry.downtimeMinutes} min - ${shortReason}`,
              style: "text-red-800 bg-red-100 border border-red-200"
          };
      } else {
          // Produção: Qtd - Produto
          const prodName = products.find(p => p.codigo === lastEntry.productCode)?.produto || 'Prod.';
          // Limita tamanho do produto
          const shortProd = prodName.length > 25 ? prodName.substring(0, 25) + '...' : prodName;
          return {
              text: `Último: ${dateStr} • ${shiftStr} • ${opName} • ${lastEntry.qtyOK} pçs - ${shortProd}`,
              style: "text-green-800 bg-green-100 border border-green-200"
          };
      }
  }, [lastEntry, operators, products, downtimeTypes]);

  const selectedMachine = machines.find(m => m.code === machineId);
  const isExtrusion = useMemo(() => selectedMachine?.sector === 'Extrusão', [selectedMachine]);

  const isOperatorExempt = useMemo(() => {
      if (!isDowntime) return false;
      if (isLongStop) return true;
      const type = downtimeTypes.find(dt => dt.id === downtimeTypeId);
      return type?.exemptFromOperator || false;
  }, [isDowntime, isLongStop, downtimeTypeId, downtimeTypes]);

  const availableShifts = useMemo(() => {
    if (!selectedMachine) return [];
    const relevantShifts = shifts.filter(s => !s.sector || s.sector === selectedMachine.sector);
    const seen = new Set();
    return relevantShifts.filter(s => {
        if (seen.has(s.name)) return false;
        seen.add(s.name);
        return true;
    });
  }, [shifts, selectedMachine]);

  const filteredOperators = useMemo(() => {
    if (!selectedMachine) return [];
    const validShiftIds = shifts
        .filter(s => s.name === shift)
        .filter(s => !s.sector || s.sector === selectedMachine.sector)
        .map(s => s.id);

    return operators.filter(op => {
        if (operatorId && op.id === operatorId) return true;
        if (!op.active) return false;
        const sectorMatch = !op.sector || op.sector === selectedMachine.sector;
        const shiftMatch = !shift || !op.defaultShift || validShiftIds.includes(op.defaultShift);
        return sectorMatch && shiftMatch;
    });
  }, [operators, selectedMachine, shift, shifts, operatorId]);

  const filteredProducts = useMemo(() => {
    if (!machineId || !selectedMachine) return [];
    return products.filter(p => {
        const allowedMachines = p.compatibleMachines || [];
        if (allowedMachines.length > 0) return allowedMachines.includes(machineId);
        if (selectedMachine.sector === 'Extrusão') return p.type === 'INTERMEDIATE';
        if (selectedMachine.sector === 'Termoformagem') return p.type === 'FINISHED'; 
        return true;
    });
  }, [products, machineId, selectedMachine]);

  const filteredDowntimeTypes = useMemo(() => {
      if (!selectedMachine) return downtimeTypes;
      return downtimeTypes.filter(dt => {
          if (!dt.sector) return true;
          return dt.sector === selectedMachine.sector;
      });
  }, [downtimeTypes, selectedMachine]);

  const availableOps = useMemo(() => {
      if (!machineId) return [];
      return productionOrders.filter(op => {
          if (op.status !== 'PLANNED' && op.status !== 'IN_PROGRESS') return false;
          if (op.machineId && op.machineId !== machineId) return false;
          return true;
      });
  }, [productionOrders, machineId]);

  const filteredCustomFields = useMemo(() => {
      return customFields.filter(f => f.key !== 'peso_produto');
  }, [customFields]);

  const handleOpChange = (opId: string) => {
      setSelectedOpId(opId);
      const op = productionOrders.find(o => o.id === opId);
      if (op && op.productCode) setProductCode(op.productCode);
      else setProductCode(null);
  };

  useEffect(() => {
    if (productCode && machineId) {
        const isValid = filteredProducts.some(p => p.codigo === productCode);
        if (editEntry && editEntry.productCode === productCode && editEntry.machineId === machineId) {
            return;
        }
        if (!isValid && !selectedOpId) setProductCode(null);
    }
  }, [machineId, filteredProducts, productCode, selectedOpId, editEntry]);

  useEffect(() => {
    if (editEntry) {
        setDate(editEntry.date);
        setMachineId(editEntry.machineId);
        setOperatorId(editEntry.operatorId);
        setShift(editEntry.shift || '');
        setProductCode(editEntry.productCode || null);
        setSelectedOpId(editEntry.productionOrderId || '');
        setStartTime(editEntry.startTime || '');
        setEndTime(editEntry.endTime || '');
        
        // Load Fields
        setQtyOK(editEntry.qtyOK > 0 ? editEntry.qtyOK.toString() : '');
        
        setObservations(editEntry.observations);
        setIsDraft(editEntry.metaData?.is_draft === true);
        if (editEntry.downtimeMinutes > 0) {
            setIsDowntime(true);
            setDowntimeTypeId(editEntry.downtimeTypeId || '');
            setIsLongStop(editEntry.metaData?.long_stop === true);
        }
        
        const weight = editEntry.metaData?.measuredWeight || editEntry.metaData?.peso_produto || '';
        setMeasuredWeight(weight.toString());
        setCycleTime(editEntry.metaData?.cycle_time || '');
        setBobbinWeight(editEntry.metaData?.bobbin_weight || '');

        setCustomValues(editEntry.metaData || {});
    }
  }, [editEntry]); 

  useEffect(() => {
      if (!machineId && !editEntry) {
          setOperatorId('');
          setProductCode(null);
          setSelectedOpId('');
          setStartTime('');
          setEndTime('');
          setMeasuredWeight('');
          setCycleTime('');
          setBobbinWeight('');
          setQtyOK('');
          setDowntimeTypeId('');
          setObservations('');
          setIsDowntime(false);
          setIsLongStop(false);
          setIsDraft(false);
          setErrorMsg(null);
          setShift('');
      }
  }, [machineId, editEntry]);

  const handleShiftChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newShiftName = e.target.value;
      setShift(newShiftName);
      const targetShift = availableShifts.find(s => s.name === newShiftName);
      if (targetShift && !startTime && !endTime) {
          setStartTime(targetShift.startTime);
          setEndTime(targetShift.endTime);
      }
  };

  const calculateDuration = () => {
    if (!startTime || !endTime) return 0;
    const [h1, m1] = startTime.split(':').map(Number);
    const [h2, m2] = endTime.split(':').map(Number);
    let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
    if (diff < 0) diff += 1440; 
    return diff;
  };

  const closeModal = () => {
      if (editEntry) navigate(-1);
      else setMachineId('');
  };

  const processFormSubmit = async (shouldClose: boolean) => {
    setErrorMsg(null);
    setSuccessMsg(null);

    if (date > today && !isDraft) throw new Error("Data futura permitida apenas em modo Rascunho.");
    if (!machineId) throw new Error("Selecione a máquina.");
    
    // Validar Horários (Exceto Parada Longa que não tem fim)
    if (!startTime) throw new Error("Defina horário inicial.");
    if (!isLongStop && !endTime) throw new Error("Defina horário final.");

    // --- CÁLCULO AUTOMÁTICO DE TURNO PARA PARADAS ---
    // Se estiver em modo parada e o turno não foi preenchido, calcula.
    let finalShift = shift;
    if (isDowntime && !finalShift && startTime) {
        finalShift = await determineCurrentShift(startTime);
    }
    
    // Se ainda assim não tiver turno e não for parada (onde calculamos), exige.
    // Mas se for parada e o cálculo falhou (raro, retorna 'Turno Único'), ok.
    if (!isDowntime && !finalShift) throw new Error("Selecione o turno (ou preencha horários para cálculo automático).");

    const duration = isLongStop ? 0 : calculateDuration();
    const qOK = parseFloat(qtyOK) || 0;

    if (isDowntime) {
        if (!downtimeTypeId) throw new Error("Selecione o motivo da parada.");
        // Operador é opcional em parada se isOperatorExempt for true OU isLongStop
        if (!isOperatorExempt && !operatorId && !isLongStop) {
             throw new Error("Selecione o operador.");
        }
    } else {
        if (!productCode) throw new Error("Selecione o produto.");
        if (!operatorId) throw new Error("Selecione o operador.");
        if (qOK <= 0 && !isDraft) throw new Error("Informe a quantidade produzida.");
    }

    // Check overlaps (Skip validation for Long Stop end time undefined)
    if (!isLongStop) {
        const hasOverlap = await checkTimeOverlap(machineId, date, startTime, endTime, isDowntime, editEntry?.id);
        if (hasOverlap) {
            const typeLabel = isDowntime ? 'de parada' : 'de produção';
            throw new Error(`Conflito de horário: Já existe um apontamento ${typeLabel} para esta máquina neste intervalo.`);
        }
    }

    const metaPayload: any = { 
        ...customValues,
        measuredWeight: measuredWeight ? Number(measuredWeight.replace(',', '.')) : null,
        bobbin_weight: bobbinWeight ? Number(bobbinWeight.replace(',', '.')) : null,
        cycle_time: cycleTime,
        was_draft: editEntry?.metaData?.is_draft === true,
        long_stop: isDowntime ? isLongStop : false,
        is_draft: isDraft 
    };

    // Safe UUID generation
    const genId = () => {
        try { return crypto.randomUUID(); } 
        catch (e) { return Math.random().toString(36).substring(2) + Date.now().toString(36); }
    };

    const entry: ProductionEntry = {
        id: editEntry?.id || genId(),
        date,
        machineId,
        operatorId: operatorId ? Number(operatorId) : 99999, // Fallback if exempt
        shift: finalShift,
        productCode: isDowntime ? undefined : productCode || undefined,
        startTime,
        endTime: isLongStop ? undefined : endTime, // Send undefined if Long Stop
        qtyOK: isDowntime ? 0 : qOK,
        qtyDefect: 0, 
        downtimeMinutes: isDowntime ? duration : 0,
        downtimeTypeId: isDowntime ? downtimeTypeId : undefined,
        observations,
        metaData: metaPayload,
        productionOrderId: !isDowntime ? selectedOpId || undefined : undefined,
        createdAt: editEntry?.createdAt || Date.now()
    };

    await saveEntryMutation({ entry, isEdit: !!editEntry });
    
    if (shouldClose) {
        if (editEntry) navigate('/list');
        else closeModal();
    } else {
        // "Save and Add More" Logic
        setSuccessMsg(isLongStop ? "Máquina parada (Modo Longo) registrada!" : "Parada registrada! Pronto para a próxima.");
        setTimeout(() => setSuccessMsg(null), 3000);
        
        if (isLongStop) {
            // Se for parada longa, fecha o modal, pois a máquina fica "inativa"
            closeModal();
        } else {
            // Prepare next entry
            setStartTime(endTime); // Next starts when this ended
            setEndTime(''); // Clear end
            setDowntimeTypeId(''); // Clear reason
            setObservations('');
            // Keep Date, Machine, Operator, Shift context
        }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
        await processFormSubmit(true); // Save and Close
    } catch (err: any) {
        setErrorMsg(formatError(err) || "Erro ao salvar.");
    }
  };

  const handleSaveAndContinue = async () => {
      try {
          await processFormSubmit(false); // Save and Stay
      } catch (err: any) {
          setErrorMsg(formatError(err) || "Erro ao salvar.");
      }
  };

  return (
    <div className="max-w-7xl mx-auto pb-20 animate-in fade-in">
        
        {/* HEADER */}
        <div className="flex items-center justify-between mb-6">
            <div>
                <button onClick={() => navigate(-1)} className="text-slate-500 hover:text-slate-700 flex items-center mb-2 text-sm font-bold">
                    <ArrowLeft size={16} className="mr-1" /> Voltar ao Painel
                </button>
                <h2 className="text-2xl font-bold text-slate-800">Apontamento de Produção</h2>
                <p className="text-slate-500">Selecione o posto de trabalho para abrir o formulário.</p>
            </div>
        </div>
            
        {displayedSectors.map(sector => {
            const sectorMachines = machines.filter(m => m.sector === sector);
            if (sectorMachines.length === 0) return null;

            return (
                <div key={sector} className="mb-8 bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <div className="flex items-center mb-4 border-b border-slate-100 pb-2">
                        <h3 className="text-lg font-bold text-slate-700 uppercase tracking-wide flex items-center">
                            {sector === 'Extrusão' ? <Cpu className="mr-2 text-blue-500"/> : <Square className="mr-2 text-orange-500"/>}
                            {sector}
                        </h3>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {sectorMachines.map(m => {
                            const statusData = machineStatuses[m.code];
                            const status = statusData?.status || 'idle';
                            
                            // DEFAULT (INACTIVE/IDLE): Grey
                            let cardClass = "bg-slate-100 border-slate-200 text-slate-400 hover:border-slate-300 hover:bg-slate-50 shadow-sm";
                            let textClass = "text-slate-500";
                            let subTextClass = "text-slate-400";
                            let indicatorClass = "bg-slate-300 border-white";
                            let displayLabel = "INATIVA";

                            if (status === 'running') {
                                cardClass = "bg-green-600 border-green-600 hover:bg-green-700 hover:border-green-800 shadow-md shadow-green-200 text-white";
                                textClass = "text-white";
                                subTextClass = "text-green-100";
                                indicatorClass = "bg-green-300 animate-pulse border-white/50";
                                const prod = statusData?.productCode ? products.find(p => p.codigo === statusData.productCode) : null;
                                displayLabel = prod ? prod.produto : 'Em Produção';
                            } else if (status === 'stopped') {
                                cardClass = "bg-red-600 border-red-600 hover:bg-red-700 hover:border-red-800 shadow-md shadow-red-200 text-white";
                                textClass = "text-white";
                                subTextClass = "text-red-100";
                                indicatorClass = "bg-red-300 border-white/50";
                                displayLabel = "EM PARADA";
                            }

                            return (
                                <button
                                    key={m.code}
                                    onClick={() => setMachineId(m.code)}
                                    className={`flex flex-col items-start p-4 rounded-xl border-2 transition-all duration-200 group relative overflow-hidden h-28 transform hover:-translate-y-1 ${cardClass}`}
                                >
                                    <div className="flex justify-between w-full mb-auto">
                                        <span className={`font-bold text-xl tracking-tight ${textClass}`}>{m.code}</span>
                                        <div className={`w-3 h-3 rounded-full border-2 ${indicatorClass}`}></div>
                                    </div>
                                    <span className={`text-sm font-bold truncate w-full text-left uppercase tracking-wide ${subTextClass}`}>
                                        {displayLabel}
                                    </span>
                                </button>
                            )
                        })}
                    </div>
                </div>
            )
        })}

        {/* --- MODAL FORM --- */}
        {machineId && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[95vh] overflow-hidden flex flex-col scale-100">
                    
                    {/* Modal Header */}
                    <div className="flex flex-col md:flex-row items-center justify-between p-4 border-b border-slate-100 bg-slate-50 shrink-0 gap-4">
                        <div className="flex flex-col w-full md:w-auto">
                            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wide">
                                {editEntry ? 'Editar Apontamento' : 'Novo Apontamento'}
                            </h3>
                            <div className="flex flex-col">
                                <span className="text-5xl font-black text-slate-800 tracking-tighter">{machineId}</span>
                                <span className={`text-xs font-bold uppercase tracking-wider ${isExtrusion ? 'text-blue-600' : 'text-orange-600'}`}>{selectedMachine?.sector}</span>
                            </div>
                        </div>

                        {/* CENTER TABS */}
                        <div className="flex-1 flex justify-center w-full md:w-auto">
                            <div className="flex bg-slate-200 p-1 rounded-xl shadow-inner w-full max-w-md">
                                <button type="button" onClick={() => setIsDowntime(false)} className={`flex-1 flex items-center justify-center py-3 px-4 rounded-lg text-lg font-extrabold transition-all duration-300 uppercase tracking-wider ${!isDowntime ? 'bg-green-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}>
                                    <Package size={20} className="mr-2" /> PRODUÇÃO
                                </button>
                                <button type="button" onClick={() => setIsDowntime(true)} className={`flex-1 flex items-center justify-center py-3 px-4 rounded-lg text-lg font-extrabold transition-all duration-300 uppercase tracking-wider ${isDowntime ? 'bg-red-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}>
                                    <Timer size={20} className="mr-2" /> PARADAS
                                </button>
                            </div>
                        </div>

                        <button onClick={closeModal} className="absolute top-4 right-4 md:static p-2 hover:bg-slate-200 rounded-full text-slate-500 transition-colors"><X size={28} /></button>
                    </div>

                    {/* Modal Body */}
                    <div className="overflow-y-auto p-6 bg-white flex-1">
                        {errorMsg && (
                            <div className="bg-red-50 text-red-700 p-4 rounded-lg mb-6 flex items-center border border-red-200 shadow-sm sticky top-0 z-10">
                                <AlertCircle size={20} className="mr-3 flex-shrink-0" />
                                <span className="font-bold">{errorMsg}</span>
                            </div>
                        )}
                        {successMsg && (
                            <div className="bg-green-50 text-green-700 p-4 rounded-lg mb-6 flex items-center border border-green-200 shadow-sm sticky top-0 z-10">
                                <CheckCircle size={20} className="mr-3 flex-shrink-0" />
                                <span className="font-bold">{successMsg}</span>
                            </div>
                        )}

                        <form id="entry-form" onSubmit={handleSubmit} className="space-y-6">
                            
                            {/* --- CONDITIONAL HEADER LAYOUT --- */}
                            
                            {isDowntime ? (
                                <>
                                    {/* --- LAYOUT DE PARADA (COMPACTO / LINHA ÚNICA) --- */}
                                    <div className="p-4 bg-orange-50 rounded-xl border border-orange-200 shadow-sm">
                                        <div className="flex items-center justify-between gap-2 mb-2 text-orange-800 border-b border-orange-200 pb-1">
                                            <div className="flex items-center gap-2 w-1/3">
                                                <Timer size={16}/> <h3 className="font-bold text-sm uppercase">Registro de Parada Rápida</h3>
                                            </div>
                                            
                                            {/* CENTRALIZED LAST ENTRY */}
                                            <div className="flex-1 flex justify-center">
                                                {lastEntryDisplay && (
                                                    <div className={`text-sm font-bold px-3 py-1 rounded shadow-sm text-center ${lastEntryDisplay.style}`}>
                                                        {lastEntryDisplay.text}
                                                    </div>
                                                )}
                                            </div>
                                            
                                            <div className="w-1/3"></div> {/* Spacer */}
                                        </div>

                                        <div className="flex flex-col md:flex-row gap-3 items-end">
                                            {/* 1. Data */}
                                            <div className="w-full md:w-32">
                                                <label className="text-[10px] font-bold text-orange-800 mb-1 block uppercase">Data</label>
                                                <input type="date" value={date} onChange={e => setDate(e.target.value)} required max={isDraft ? undefined : today} className="w-full px-2 py-1.5 bg-white border border-orange-300 rounded text-sm font-bold text-slate-700 focus:ring-2 focus:ring-orange-200 outline-none" />
                                            </div>

                                            {/* 2. Início */}
                                            <div className="w-full md:w-24">
                                                <label className="text-[10px] font-bold text-orange-800 mb-1 block uppercase">Início</label>
                                                <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} required className="w-full px-2 py-1.5 bg-white border border-orange-300 rounded text-sm font-bold text-slate-700 focus:ring-2 focus:ring-orange-200 outline-none text-center" />
                                            </div>

                                            {/* 3. Fim (Reduzido) - OCULTO SE PARADA LONGA */}
                                            {!isLongStop && (
                                                <div className="w-full md:w-24">
                                                    <label className="text-[10px] font-bold text-orange-800 mb-1 block uppercase">Fim</label>
                                                    <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} required className="w-full px-2 py-1.5 bg-white border border-orange-300 rounded text-sm font-bold text-slate-700 focus:ring-2 focus:ring-orange-200 outline-none text-center" />
                                                </div>
                                            )}

                                            {/* 4. Duração (Badge) - OCULTO SE PARADA LONGA (Indeterminado) */}
                                            {!isLongStop && (
                                                <div className="mb-1.5 px-2">
                                                    <span className="text-xs font-bold text-orange-700 bg-orange-200/50 px-2 py-1 rounded whitespace-nowrap block text-center min-w-[70px]">
                                                        {calculateDuration()} min
                                                    </span>
                                                </div>
                                            )}

                                            {/* 5. Motivo (Expandido) */}
                                            <div className="flex-1 w-full">
                                                <label className="text-[10px] font-bold text-orange-800 mb-1 block uppercase">Motivo da Parada *</label>
                                                <select className="w-full px-3 py-1.5 bg-white border border-orange-300 rounded text-sm font-medium text-slate-700 focus:ring-2 focus:ring-orange-200 outline-none h-[34px]" value={downtimeTypeId} onChange={e => setDowntimeTypeId(e.target.value)} required>
                                                    <option value="">Selecione...</option>
                                                    {filteredDowntimeTypes.map(dt => <option key={dt.id} value={dt.id}>{dt.description}</option>)}
                                                </select>
                                            </div>

                                            {/* 6. Ação Rápida (Adicionar Mais) - DESABILITADO SE PARADA LONGA */}
                                            <div className="mb-[1px]">
                                                <button 
                                                    type="button" 
                                                    onClick={handleSaveAndContinue}
                                                    disabled={isSubmitting || isLongStop}
                                                    className={`h-[34px] px-3 text-white rounded font-bold text-xs shadow-sm flex items-center justify-center whitespace-nowrap transition-all active:scale-95 ${isLongStop ? 'bg-slate-300 cursor-not-allowed opacity-50' : 'bg-orange-600 hover:bg-orange-700'}`}
                                                    title={isLongStop ? "Salvar e Novo indisponível para Parada Longa" : "Salvar e lançar próxima parada"}
                                                >
                                                    {isSubmitting ? <Loader2 className="animate-spin" size={16}/> : <Plus size={16} className="mr-1.5"/>}
                                                    Salvar e Novo
                                                </button>
                                            </div>
                                        </div>
                                        
                                        {/* Linha Extra: Checkbox Longa e Obs Opcional */}
                                        <div className="flex items-center gap-4 mt-3 pt-2 border-t border-orange-200/50">
                                            <div className="flex items-center">
                                                <input type="checkbox" id="longStop" checked={isLongStop} onChange={e => setIsLongStop(e.target.checked)} className="w-4 h-4 text-orange-600 rounded focus:ring-orange-500" />
                                                <label htmlFor="longStop" className="ml-2 text-xs font-bold text-orange-800 cursor-pointer">Parada Longa (Mantém Inativa)</label>
                                            </div>
                                            <div className="flex-1">
                                                <input 
                                                    type="text" 
                                                    placeholder="Observação rápida (opcional)..." 
                                                    value={observations} 
                                                    onChange={e => setObservations(e.target.value)}
                                                    className="w-full bg-white/50 border-b border-orange-200 text-xs px-2 py-1 outline-none focus:border-orange-400 placeholder:text-orange-300 text-orange-900"
                                                />
                                            </div>
                                            {/* Operador - OCULTO SE PARADA LONGA */}
                                            {!isLongStop && (
                                                <div className="w-48">
                                                    <select className="w-full bg-transparent text-xs font-bold text-orange-800 border-none outline-none text-right cursor-pointer" value={operatorId} onChange={e => setOperatorId(Number(e.target.value))} required={!isOperatorExempt && !isLongStop}>
                                                        <option value="">{isOperatorExempt ? 'Op. Isento' : 'Selecionar Operador'}</option>
                                                        {filteredOperators.map(op => <option key={op.id} value={op.id}>{op.name}</option>)}
                                                    </select>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* --- LISTA DE HISTÓRICO DO DIA (APENAS PARADAS) --- */}
                                    <div className="mt-6 border border-slate-200 rounded-xl overflow-hidden animate-in fade-in">
                                        <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex justify-between items-center">
                                            <h4 className="text-xs font-bold text-slate-500 uppercase flex items-center">
                                                <List size={14} className="mr-1.5"/> Histórico de Paradas do Dia ({new Date(date).toLocaleDateString()})
                                            </h4>
                                            <span className="text-[10px] bg-slate-200 px-2 py-0.5 rounded text-slate-600 font-bold">{dailyDowntimes.length} registros</span>
                                        </div>
                                        <div className="max-h-60 overflow-y-auto bg-white">
                                            <table className="w-full text-left text-xs">
                                                <thead className="bg-slate-50 text-slate-500 font-semibold sticky top-0">
                                                    <tr>
                                                        <th className="px-4 py-2 w-24">Início</th>
                                                        <th className="px-4 py-2 w-24">Fim</th>
                                                        <th className="px-4 py-2 w-20 text-center">Dur.</th>
                                                        <th className="px-4 py-2">Motivo</th>
                                                        <th className="px-4 py-2">Obs</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {dailyDowntimes.length === 0 ? (
                                                        <tr>
                                                            <td colSpan={5} className="px-4 py-8 text-center text-slate-400 italic">
                                                                Nenhuma parada registrada hoje.
                                                            </td>
                                                        </tr>
                                                    ) : (
                                                        dailyDowntimes.map(entry => (
                                                            <tr key={entry.id} className="hover:bg-orange-50 transition-colors">
                                                                <td className="px-4 py-2 font-mono text-slate-600">{entry.startTime}</td>
                                                                <td className="px-4 py-2 font-mono text-slate-600">{entry.endTime || '-'}</td>
                                                                <td className="px-4 py-2 text-center font-bold text-orange-700 bg-orange-50">{entry.downtimeMinutes > 0 ? `${entry.downtimeMinutes} min` : 'Aberta'}</td>
                                                                <td className="px-4 py-2 text-slate-700 font-medium">
                                                                    {downtimeTypes.find(dt => dt.id === entry.downtimeTypeId)?.description || entry.downtimeTypeId}
                                                                </td>
                                                                <td className="px-4 py-2 text-slate-500 italic truncate max-w-[150px]">{entry.observations || '-'}</td>
                                                            </tr>
                                                        ))
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                // --- LAYOUT DE PRODUÇÃO (PADRÃO / COMPLETO) ---
                                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                                    <div className="flex items-center justify-between gap-2 mb-3 text-slate-700 border-b border-slate-200 pb-1">
                                        <div className="flex items-center gap-2 w-1/4">
                                            <Clock size={16} className="text-brand-600"/> <h3 className="font-bold text-sm uppercase">Dados Gerais</h3>
                                        </div>
                                        {/* CENTRALIZED LAST ENTRY */}
                                        <div className="flex-1 flex justify-center">
                                            {lastEntryDisplay && (
                                                <div className={`text-sm font-bold px-3 py-1 rounded shadow-sm text-center ${lastEntryDisplay.style}`}>
                                                    {lastEntryDisplay.text}
                                                </div>
                                            )}
                                        </div>
                                        <div className="w-1/4"></div>
                                    </div>

                                    <div className="grid grid-cols-12 gap-3 items-end">
                                        <div className="col-span-3 lg:col-span-2">
                                            <Input label="Data" type="date" value={date} onChange={e => setDate(e.target.value)} required max={isDraft ? undefined : today} className="h-9 text-sm" />
                                        </div>
                                        <div className="col-span-3 lg:col-span-3">
                                            <label className="text-xs font-bold text-slate-700 mb-1 block">Turno *</label>
                                            <select className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg outline-none h-9 text-sm font-medium" value={shift} onChange={handleShiftChange} required>
                                                <option value="">Selecione...</option>
                                                {availableShifts.map(s => <option key={s.id} value={s.name}>{s.name} ({s.startTime}-{s.endTime})</option>)}
                                            </select>
                                        </div>
                                        <div className="col-span-2 lg:col-span-2">
                                            <Input label="Início" type="time" value={startTime} onChange={e => setStartTime(e.target.value)} required className="h-9 text-sm" />
                                        </div>
                                        <div className="col-span-4 lg:col-span-5 flex items-end gap-2">
                                            <div className="flex-1">
                                                <Input label="Fim" type="time" value={endTime} onChange={e => setEndTime(e.target.value)} required className="h-9 text-sm" />
                                            </div>
                                            <div className="mb-1">
                                                <span className="text-xs font-bold text-slate-500 bg-slate-200 px-3 py-1.5 rounded-lg border border-slate-300 shadow-sm flex items-center h-9 whitespace-nowrap">
                                                    <Timer size={12} className="mr-1.5" /> Duração: {calculateDuration()} min
                                                </span>
                                            </div>
                                        </div>
                                        
                                        {availableOps.length > 0 && (
                                            <div className="col-span-12 mt-1">
                                                <label className="text-xs font-bold text-slate-700 mb-1 flex items-center">
                                                    Vincular OP <span className="text-[10px] font-normal text-slate-400 ml-2">(Opcional)</span>
                                                </label>
                                                <select className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg outline-none h-9 text-sm" value={selectedOpId} onChange={e => handleOpChange(e.target.value)}>
                                                    <option value="">- Produção Avulsa -</option>
                                                    {availableOps.map(op => <option key={op.id} value={op.id}>{op.id} - {op.product?.produto}</option>)}
                                                </select>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {!isDowntime && (
                                <div className="space-y-4 animate-in fade-in">
                                    
                                    {/* --- SECTION 2: LINHA DE PROCESSO UNIFICADA (PRODUÇÃO) --- */}
                                    <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
                                        <div className="grid grid-cols-12 gap-4 items-end">
                                            <div className="col-span-12 md:col-span-3">
                                                <label className="text-xs font-bold text-slate-700 mb-1 block">Operador *</label>
                                                <select className="w-full px-2 py-2 bg-white border border-slate-300 rounded-lg outline-none text-sm" value={operatorId} onChange={e => setOperatorId(Number(e.target.value))} required>
                                                    <option value="">Selecione...</option>
                                                    {filteredOperators.map(op => <option key={op.id} value={op.id}>{op.name}</option>)}
                                                </select>
                                            </div>
                                            <div className="col-span-12 md:col-span-7">
                                                <ProductSelect products={filteredProducts} value={productCode} onChange={setProductCode} />
                                            </div>
                                            <div className="col-span-12 md:col-span-2">
                                                <Input 
                                                    label="Ciclagem" 
                                                    placeholder="0,00" 
                                                    value={cycleTime} 
                                                    onChange={e => setCycleTime(e.target.value)} 
                                                    className="font-bold text-center border-blue-200 focus:ring-blue-200"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* --- SECTION 3: DADOS DE PRODUÇÃO (NOVO CONTAINER) --- */}
                                    <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
                                        <h4 className="text-sm font-bold text-slate-700 mb-4 flex items-center border-b border-slate-200 pb-2">
                                            <Package size={16} className="mr-2 text-brand-600"/> Dados de Produção
                                        </h4>
                                        
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                            {/* 1. Peso da Bobina */}
                                            <div className="flex flex-col">
                                                <label className="text-sm font-bold text-blue-800 mb-1 flex items-center">
                                                    <Weight size={16} className="mr-1.5"/> Peso da Bobina (Kg)
                                                </label>
                                                <input 
                                                    type="number" 
                                                    step="0.01"
                                                    value={bobbinWeight} 
                                                    onChange={e => setBobbinWeight(e.target.value)} 
                                                    className="text-xl font-bold p-3 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-blue-900 bg-white"
                                                    placeholder="0.00"
                                                />
                                            </div>

                                            {/* 2. Quantidade Produzida */}
                                            <div className="flex flex-col">
                                                <label className="text-sm font-bold text-green-800 mb-1 flex items-center">
                                                    <Package size={16} className="mr-1.5"/> Produção (Caixas/Pçs)
                                                </label>
                                                <input 
                                                    type="number" 
                                                    value={qtyOK} 
                                                    onChange={e => setQtyOK(e.target.value)} 
                                                    className="text-xl font-bold p-3 border border-green-200 rounded-lg focus:ring-2 focus:ring-green-500 outline-none text-green-900 bg-white"
                                                    placeholder="0"
                                                />
                                            </div>

                                            {/* 3. Peso Médio (Opcional) */}
                                            <div className="flex flex-col">
                                                <label className="text-sm font-semibold text-slate-600 mb-1 flex items-center">
                                                    <Scale size={16} className="mr-1.5"/> Peso Médio (Kg) <span className="text-[10px] ml-1 opacity-60">(Opcional)</span>
                                                </label>
                                                <input 
                                                    type="number" 
                                                    step="0.001"
                                                    value={measuredWeight} 
                                                    onChange={e => setMeasuredWeight(e.target.value)} 
                                                    className="text-lg p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-400 outline-none text-slate-700 bg-white"
                                                    placeholder="0.000"
                                                />
                                            </div>
                                        </div>

                                        {/* Campos Extras Dinâmicos (Se houver) */}
                                        <div className="mt-4">
                                            <DynamicFields fields={filteredCustomFields} values={customValues} onChange={(k, v) => setCustomValues({...customValues, [k]: v})} section='production' />
                                        </div>
                                    </div>
                                    
                                    {/* Obs e Footer para Produção */}
                                    <div>
                                        <Textarea label="Observações Gerais" value={observations} onChange={e => setObservations(e.target.value)} placeholder="Detalhes adicionais..." rows={2} />
                                    </div>
                                </div>
                            )}

                            {isDowntime && (
                                <div className="animate-in fade-in mt-2">
                                    <DynamicFields fields={filteredCustomFields} values={customValues} onChange={(k, v) => setCustomValues({...customValues, [k]: v})} section='process' />
                                </div>
                            )}

                            {/* --- FOOTER: AÇÕES GERAIS --- */}
                            <div className="flex flex-col md:flex-row gap-4 pt-4 border-t border-slate-100">
                                <div className="flex items-center">
                                    <input type="checkbox" id="isDraft" checked={isDraft} onChange={e => setIsDraft(e.target.checked)} className="w-5 h-5 text-yellow-500 rounded focus:ring-yellow-400" />
                                    <label htmlFor="isDraft" className="ml-2 font-bold text-slate-600 cursor-pointer">Salvar como Rascunho</label>
                                </div>
                                <div className="flex-1 flex justify-end gap-3">
                                    <button type="button" onClick={closeModal} className="px-6 py-3 rounded-lg border border-slate-300 font-bold text-slate-600 hover:bg-slate-50 transition-colors">Cancelar</button>
                                    <button type="submit" disabled={isSubmitting} className={`px-8 py-3 rounded-lg font-bold text-white shadow-lg hover:shadow-xl transition-all flex items-center justify-center min-w-[150px] ${isSubmitting ? 'bg-slate-400 cursor-not-allowed' : 'bg-brand-600 hover:bg-brand-700 transform hover:-translate-y-0.5'}`}>
                                        {isSubmitting ? <Loader2 className="animate-spin mr-2" /> : <Save className="mr-2" />}
                                        {editEntry ? 'Atualizar' : 'Registrar'}
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}
    </div>
  );
};