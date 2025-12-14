
import React, { useState, useEffect, useMemo } from 'react';
import { fetchProductionOrders, saveProductionOrder, deleteProductionOrder, fetchProducts, fetchMachines, fetchSettings, formatError } from '../services/storage';
import { ProductionOrder, Product, Machine, AppSettings } from '../types';
import { ClipboardList, Plus, Calendar, User, Package, Trash2, Edit, Save, X, Search, Filter, CheckCircle2, AlertCircle, Clock, Loader2, Calculator, ArrowRight, Zap, Info, FlaskConical, AlertTriangle } from 'lucide-react';
import { Input, Textarea } from '../components/Input';
import { ProductSelect } from '../components/ProductSelect';

const ProductionPlanPage: React.FC = () => {
    const [orders, setOrders] = useState<ProductionOrder[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [machines, setMachines] = useState<Machine[]>([]);
    const [settings, setSettings] = useState<AppSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState<string>('ALL');
    
    // Modal
    const [modalOpen, setModalOpen] = useState(false);
    const [editingOrder, setEditingOrder] = useState<Partial<ProductionOrder>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Mix/Formulation State (for Extrusion OPs) - Stored as % in OP
    const [mixItems, setMixItems] = useState<{type: string, subType: string, qty: string}[]>([
        {type: 'FLAKE', subType: 'CRISTAL', qty: ''},
        {type: 'FLAKE', subType: 'BRANCO', qty: ''},
        {type: '', subType: '', qty: ''},
        {type: '', subType: '', qty: ''}
    ]);

    // Calculation State for UI feedback
    const [calcInfo, setCalcInfo] = useState<{ hours: number, shifts: number, days: number, rateUsed: number, source: string } | null>(null);

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        setLoading(true);
        const [o, p, m, s] = await Promise.all([
            fetchProductionOrders(), 
            fetchProducts(), 
            fetchMachines(),
            fetchSettings()
        ]);
        setOrders(o);
        setProducts(p);
        setMachines(m);
        setSettings(s);
        setLoading(false);
    };

    // --- LOGIC: Capacity Calculation (Capacity Planning) ---
    useEffect(() => {
        // Only run logic if modal is open and we have necessary data
        if (!modalOpen || !editingOrder.productCode || !editingOrder.targetQuantity) {
            setCalcInfo(null);
            return;
        }

        const product = products.find(p => p.codigo === editingOrder.productCode);
        const machine = machines.find(m => m.code === editingOrder.machineId);
        
        let capacityPerHour = 0;
        let rateSource = '';

        // LÓGICA HÍBRIDA DE CAPACIDADE
        // Verifica se é Extrusão (case insensitive para robustez)
        const isExtrusion = machine?.sector && machine.sector.toLowerCase().includes('extru');

        // 1. Extrusão: Usa Capacidade da Máquina (kg/h)
        if (isExtrusion) {
            capacityPerHour = Number(machine?.productionCapacity) || 0;
            rateSource = 'Capacidade Máquina (Kg/h)';
        } 
        // 2. Termoformagem (e padrão): Usa Meta do Produto (un/h)
        else {
            capacityPerHour = Number(product?.itemsPerHour) || 0;
            rateSource = 'Meta Produto (Peças/h)';
        }

        if (capacityPerHour > 0) {
            const qty = Number(editingOrder.targetQuantity);
            const totalHours = qty / capacityPerHour;
            const shiftHours = Number(settings?.shiftHours) || 8.8; // Default from settings or fallback
            
            // Fórmula solicitada: Dias = Horas Necessárias / HorasPorTurno
            // Aqui tratamos "Dias" como a quantidade de turnos de trabalho necessários.
            const totalShifts = totalHours / shiftHours;
            
            // Arredonda para cima para definir dias de calendário (mínimo 0 se qtd for 0)
            const daysToComplete = Math.ceil(totalShifts); 

            setCalcInfo({
                hours: parseFloat(totalHours.toFixed(1)),
                shifts: parseFloat(totalShifts.toFixed(1)),
                days: daysToComplete,
                rateUsed: capacityPerHour,
                source: rateSource
            });

            // Auto-update Date only if user hasn't manually set a date far in the future? 
            // Currently overrides date on calc change.
            // Logic: Today + Days needed. 
            // Using Local Timezone to avoid UTC issues with date inputs
            const today = new Date();
            const targetDate = new Date(today);
            targetDate.setDate(today.getDate() + daysToComplete);
            
            // Correctly format to YYYY-MM-DD in local time
            const offset = targetDate.getTimezoneOffset() * 60000;
            const localDateString = (new Date(targetDate.getTime() - offset)).toISOString().slice(0, 10);

            setEditingOrder(prev => ({
                ...prev,
                deliveryDate: localDateString
            }));
        } else {
            setCalcInfo(null);
        }

    }, [editingOrder.productCode, editingOrder.targetQuantity, editingOrder.machineId, settings, modalOpen, machines, products]);


    const handleOpenModal = (order?: ProductionOrder) => {
        if (order) {
            setEditingOrder(order);
            // Load mix data if exists
            if (order.metaData?.extrusion_mix) {
                setMixItems(order.metaData.extrusion_mix);
            } else {
                setMixItems([
                    {type: 'FLAKE', subType: 'CRISTAL', qty: ''},
                    {type: 'FLAKE', subType: 'BRANCO', qty: ''},
                    {type: '', subType: '', qty: ''},
                    {type: '', subType: '', qty: ''}
                ]);
            }
        } else {
            // Defaults for New OP
            const todayLocal = new Date();
            const offset = todayLocal.getTimezoneOffset() * 60000;
            const todayString = (new Date(todayLocal.getTime() - offset)).toISOString().slice(0, 10);

            setEditingOrder({
                id: `OP-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000)}`,
                status: 'PLANNED',
                priority: 'NORMAL',
                targetQuantity: 0,
                deliveryDate: todayString
            });
            setMixItems([
                {type: 'FLAKE', subType: 'CRISTAL', qty: ''},
                {type: 'FLAKE', subType: 'BRANCO', qty: ''},
                {type: '', subType: '', qty: ''},
                {type: '', subType: '', qty: ''}
            ]);
        }
        setModalOpen(true);
    };

    // Computed total for Mix Validation
    const totalMixPercentage = useMemo(() => {
        return mixItems.reduce((acc, item) => acc + (parseFloat(item.qty) || 0), 0);
    }, [mixItems]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingOrder.id || !editingOrder.productCode || !editingOrder.targetQuantity) return;
        
        // VALIDATION: Mix must be 100% if it's Extrusion
        const isExtrusion = isExtrusionContext();
        if (isExtrusion) {
            const hasItems = mixItems.some(i => i.type && parseFloat(i.qty) > 0);
            if (hasItems) {
                // Tolerance for float issues
                if (Math.abs(totalMixPercentage - 100) > 0.1) {
                    alert(`A receita (Mix) deve fechar em 100%.\nTotal atual: ${totalMixPercentage.toFixed(1)}%`);
                    return;
                }
            }
        }

        setIsSubmitting(true);
        try {
            const payload = {
                ...editingOrder,
                metaData: {
                    ...editingOrder.metaData,
                    // Save Mix only if it's extrusion
                    extrusion_mix: isExtrusion ? mixItems.filter(i => i.type && i.qty) : undefined
                }
            };

            await saveProductionOrder(payload);
            setModalOpen(false);
            loadData();
        } catch (e) {
            alert("Erro ao salvar OP: " + formatError(e));
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Excluir esta Ordem de Produção?")) return;
        try {
            await deleteProductionOrder(id);
            loadData();
        } catch (e) {
            alert("Erro ao excluir: " + formatError(e));
        }
    };

    const getStatusColor = (status?: string) => {
        switch(status) {
            case 'PLANNED': return 'bg-slate-100 text-slate-600 border-slate-200';
            case 'IN_PROGRESS': return 'bg-blue-100 text-blue-700 border-blue-200';
            case 'COMPLETED': return 'bg-green-100 text-green-700 border-green-200';
            case 'CANCELLED': return 'bg-red-50 text-red-700 border-red-200 opacity-60';
            default: return 'bg-slate-100';
        }
    };

    const getPriorityBadge = (p?: string) => {
        switch(p) {
            case 'URGENT': return <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded">URGENTE</span>;
            case 'HIGH': return <span className="bg-orange-100 text-orange-700 text-[10px] font-bold px-2 py-0.5 rounded">ALTA</span>;
            default: return null;
        }
    };

    // --- SMART MACHINE FILTERING LOGIC ---
    const filteredMachinesForOrder = useMemo(() => {
        if (!editingOrder.productCode) return [];

        const product = products.find(p => p.codigo === editingOrder.productCode);
        if (!product) return machines;

        if (product.compatibleMachines && product.compatibleMachines.length > 0) {
            return machines.filter(m => product.compatibleMachines!.includes(m.code));
        }

        const type = (product.type || '').toUpperCase();
        if (type === 'INTERMEDIATE') return machines.filter(m => m.sector === 'Extrusão');
        if (type === 'FINISHED') return machines.filter(m => m.sector === 'Termoformagem');

        return machines;
    }, [machines, products, editingOrder.productCode]);

    useEffect(() => {
        if (editingOrder.machineId && filteredMachinesForOrder.length > 0) {
            const isValid = filteredMachinesForOrder.some(m => m.code === editingOrder.machineId);
            if (!isValid) {
                setEditingOrder(prev => ({ ...prev, machineId: '' }));
            }
        }
    }, [editingOrder.productCode, filteredMachinesForOrder]);

    const isExtrusionContext = () => {
        if (!editingOrder.productCode) return false;
        const product = products.find(p => p.codigo === editingOrder.productCode);
        const machine = machines.find(m => m.code === editingOrder.machineId);
        
        // 1. Check by Product Type
        if (product?.type === 'INTERMEDIATE') return true;
        
        // 2. Check by Selected Machine Sector
        if (machine?.sector && machine.sector.toLowerCase().includes('extru')) return true;
        
        // 3. NEW: Check by Compatible Machines (Implicit Context)
        // Helps when creating new OP without machine selected yet
        if (product?.compatibleMachines && product.compatibleMachines.length > 0) {
             const linkedMachines = machines.filter(m => product.compatibleMachines!.includes(m.code));
             const hasExtrusionLink = linkedMachines.some(m => m.sector && m.sector.toLowerCase().includes('extru'));
             if (hasExtrusionLink) return true;
        }

        return false;
    };

    const handleMixItemChange = (index: number, field: string, val: string) => {
        const newItems = [...mixItems];
        (newItems[index] as any)[field] = val;
        setMixItems(newItems);
    };

    const filteredOrders = orders.filter(o => filterStatus === 'ALL' || o.status === filterStatus);

    const getProgress = (produced: number = 0, target: number = 1) => {
        const pct = (produced / target) * 100;
        return Math.min(pct, 100);
    };

    if (loading) return <div className="p-8 text-center"><Loader2 className="animate-spin mx-auto text-brand-600" /></div>;

    return (
        <div className="space-y-6 pb-20">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800">Planejamento e Controle (PCP)</h2>
                    <p className="text-slate-500">Gestão de Ordens de Produção (OPs)</p>
                </div>
                <button onClick={() => handleOpenModal()} className="bg-brand-600 text-white px-4 py-2 rounded-lg flex items-center hover:bg-brand-700 font-bold shadow-md transition-transform hover:-translate-y-0.5">
                    <Plus size={20} className="mr-2" /> Nova OP
                </button>
            </div>

            {/* FILTERS */}
            <div className="flex space-x-2 border-b border-slate-200 pb-2 overflow-x-auto">
                {['ALL', 'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].map(status => (
                    <button
                        key={status}
                        onClick={() => setFilterStatus(status)}
                        className={`px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                            filterStatus === status 
                            ? 'bg-slate-800 text-white shadow-md' 
                            : 'bg-white text-slate-500 hover:bg-slate-50 border border-slate-200'
                        }`}
                    >
                        {status === 'ALL' ? 'Todas' : status === 'PLANNED' ? 'Planejadas' : status === 'IN_PROGRESS' ? 'Em Andamento' : status === 'COMPLETED' ? 'Concluídas' : 'Canceladas'}
                    </button>
                ))}
            </div>

            {/* KANBAN / LIST VIEW */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredOrders.length === 0 && (
                    <div className="col-span-full py-12 text-center text-slate-400 bg-white rounded-xl border border-dashed border-slate-200">
                        Nenhuma ordem encontrada.
                    </div>
                )}
                
                {filteredOrders.map(order => (
                    <div key={order.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 hover:shadow-md transition-shadow relative overflow-hidden group">
                        <div className={`absolute top-0 left-0 w-1 h-full ${
                            order.status === 'COMPLETED' ? 'bg-green-500' :
                            order.status === 'IN_PROGRESS' ? 'bg-blue-500' :
                            order.priority === 'URGENT' ? 'bg-red-500' : 'bg-slate-300'
                        }`}></div>

                        <div className="flex justify-between items-start mb-3 pl-2">
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="font-mono text-xs font-bold text-slate-500 bg-slate-100 px-1.5 rounded">{order.id}</span>
                                    {getPriorityBadge(order.priority)}
                                </div>
                                <h3 className="font-bold text-slate-800 text-lg mt-1">{order.product?.produto || `Prod ${order.productCode}`}</h3>
                            </div>
                            
                            <div className="flex gap-2">
                                <button onClick={() => handleOpenModal(order)} className="p-1.5 bg-slate-50 rounded text-slate-500 hover:text-brand-600 hover:bg-slate-100" title="Editar"><Edit size={16}/></button>
                                <button onClick={() => handleDelete(order.id)} className="p-1.5 bg-red-50 rounded text-red-400 hover:text-red-600 hover:bg-red-100" title="Excluir"><Trash2 size={16}/></button>
                            </div>
                        </div>

                        <div className="pl-2 space-y-2 mb-4">
                            <div className="flex justify-between text-sm text-slate-600">
                                <span className="flex items-center"><User size={14} className="mr-1 opacity-50"/> {order.customerName || 'Interno'}</span>
                                <span className="flex items-center text-xs font-bold bg-slate-50 px-2 py-0.5 rounded border border-slate-200" title="Previsão de Término">
                                    <Calendar size={12} className="mr-1 opacity-50"/> {order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString() : 'N/D'}
                                </span>
                            </div>
                            {order.machineId && (
                                <div className="text-xs text-slate-500 bg-slate-50 p-1 rounded w-fit flex items-center">
                                    <Clock size={12} className="mr-1"/> Máquina: <b>{order.machineId}</b>
                                </div>
                            )}
                        </div>

                        {/* PROGRESS BAR */}
                        <div className="pl-2 mb-4">
                            <div className="flex justify-between text-xs font-bold text-slate-600 mb-1">
                                <span>Progresso</span>
                                <span>{order.producedQuantity || 0} / {order.targetQuantity}</span>
                            </div>
                            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                <div 
                                    className={`h-full rounded-full transition-all duration-500 ${
                                        (order.producedQuantity || 0) >= order.targetQuantity ? 'bg-green-500' : 'bg-brand-500'
                                    }`}
                                    style={{ width: `${getProgress(order.producedQuantity, order.targetQuantity)}%` }}
                                ></div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* MODAL NOVA ORDEM - NOVO LAYOUT */}
            {modalOpen && (
                <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-in zoom-in-95">
                    <div className="bg-white rounded-xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
                        
                        {/* HEADER MODAL */}
                        <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
                            <div className="flex flex-col">
                                <h3 className="font-bold text-xl text-slate-800 flex items-center">
                                    <ClipboardList className="mr-2 text-brand-600" size={24} />
                                    {editingOrder.id && orders.find(o => o.id === editingOrder.id) ? 'Editar Ordem de Produção' : 'Nova Ordem de Produção'}
                                </h3>
                                <div className="flex items-center gap-3 mt-1">
                                    <span className="text-xs font-mono font-bold bg-white px-2 py-0.5 rounded border border-slate-300 text-slate-600 shadow-sm">{editingOrder.id}</span>
                                    <div className="h-4 w-px bg-slate-300"></div>
                                    <select 
                                        className="text-xs bg-transparent font-bold text-brand-700 outline-none uppercase cursor-pointer hover:text-brand-900"
                                        value={editingOrder.status}
                                        onChange={e => setEditingOrder({...editingOrder, status: e.target.value as any})}
                                    >
                                        <option value="PLANNED">Planejada</option>
                                        <option value="IN_PROGRESS">Em Andamento</option>
                                        <option value="URGENT">Urgente (Prioridade)</option>
                                    </select>
                                </div>
                            </div>
                            <button onClick={() => setModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600 transition-colors"><X size={24}/></button>
                        </div>
                        
                        <div className="overflow-y-auto p-6 flex-1 space-y-8 bg-white">
                            <form id="op-form" onSubmit={handleSave} className="space-y-8">
                                
                                {/* SEÇÃO 1: O QUE PRODUZIR? */}
                                <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                                    <div className="md:col-span-7">
                                        <div className="mb-1 flex items-center gap-2">
                                            <Package size={16} className="text-brand-600"/>
                                            <label className="text-sm font-bold text-slate-700">Produto</label>
                                        </div>
                                        <ProductSelect 
                                            products={products} 
                                            value={editingOrder.productCode || null} 
                                            onChange={(val) => setEditingOrder({...editingOrder, productCode: val || undefined})}
                                        />
                                    </div>
                                    <div className="md:col-span-5">
                                        <div className="mb-2 flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <Zap size={16} className="text-orange-500"/>
                                                <label className="text-sm font-bold text-slate-700">Máquina Preferencial</label>
                                            </div>
                                            {editingOrder.productCode && filteredMachinesForOrder.length > 0 && (
                                                <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-bold">
                                                    {filteredMachinesForOrder.length} compatíveis
                                                </span>
                                            )}
                                        </div>
                                        <select 
                                            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-brand-500 outline-none transition-all h-[42px] font-medium text-sm ${
                                                !editingOrder.productCode ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-white border-slate-300 text-slate-800'
                                            }`}
                                            value={editingOrder.machineId || ''}
                                            onChange={e => setEditingOrder({...editingOrder, machineId: e.target.value})}
                                            disabled={!editingOrder.productCode}
                                        >
                                            <option value="">
                                                {!editingOrder.productCode ? 'Selecione o produto primeiro...' : 'Selecione a máquina...'}
                                            </option>
                                            {filteredMachinesForOrder.map(m => (
                                                <option key={m.code} value={m.code}>
                                                    {m.code} - {m.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {/* SEÇÃO 2: PLANEJAMENTO (CAPACITY) - ESTILO CARD DESTACADO */}
                                <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 relative overflow-hidden">
                                    {/* Decorative Background Icon */}
                                    <Calculator className="absolute -right-6 -bottom-6 text-slate-200/50 w-32 h-32 pointer-events-none" />
                                    
                                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center border-b border-slate-200 pb-2">
                                        <Clock size={14} className="mr-2" /> Planejamento de Capacidade
                                    </h4>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative z-10">
                                        {/* Coluna 1: Quantidade */}
                                        <div className="flex flex-col">
                                            <label className="text-sm font-bold text-slate-700 mb-2">Quantidade Planejada</label>
                                            <Input 
                                                label="" 
                                                type="number" 
                                                value={editingOrder.targetQuantity} 
                                                onChange={e => setEditingOrder({...editingOrder, targetQuantity: Number(e.target.value)})} 
                                                required 
                                                className="text-2xl font-bold text-slate-800 h-12 bg-white shadow-sm border-slate-300" 
                                                placeholder="0"
                                            />
                                        </div>

                                        {/* Coluna 2: Painel Informativo (Cálculo) */}
                                        <div className="flex flex-col justify-end pb-1">
                                            {calcInfo ? (
                                                <div className="bg-blue-100/50 p-3 rounded-lg border border-blue-200 space-y-1">
                                                    <div className="flex justify-between text-xs text-blue-800 font-medium">
                                                        <span>Meta Base:</span>
                                                        <strong>{calcInfo.rateUsed}</strong>
                                                    </div>
                                                    <div className="flex justify-between text-xs text-blue-600 font-normal">
                                                        <span>Fonte:</span>
                                                        <span>{calcInfo.source}</span>
                                                    </div>
                                                    <div className="flex justify-between text-xs text-blue-800 font-medium mt-1">
                                                        <span>Tempo Estimado:</span>
                                                        <strong>{calcInfo.hours} horas</strong>
                                                    </div>
                                                    <div className="flex justify-between text-xs text-blue-800 font-bold pt-1 border-t border-blue-200 mt-1">
                                                        <span>Turnos Necessários:</span>
                                                        <strong>{calcInfo.shifts} turnos</strong>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="h-full flex items-center justify-center text-xs text-slate-400 bg-slate-100/50 rounded-lg border border-dashed border-slate-200 p-2 text-center flex-col">
                                                    <Info size={16} className="mb-1" />
                                                    {editingOrder.targetQuantity 
                                                        ? "Sem dados de meta/capacidade para cálculo." 
                                                        : "Defina a quantidade para calcular."}
                                                </div>
                                            )}
                                        </div>

                                        {/* Coluna 3: Data Calculada */}
                                        <div className="flex flex-col">
                                            <label className="text-sm font-bold text-slate-700 mb-2 flex items-center justify-between">
                                                Previsão de Término
                                                {calcInfo && <span className="text-[10px] text-green-600 font-bold bg-green-50 px-1.5 rounded">Calculado</span>}
                                            </label>
                                            <div className="relative">
                                                <Input 
                                                    label="" 
                                                    type="date" 
                                                    value={editingOrder.deliveryDate} 
                                                    onChange={e => setEditingOrder({...editingOrder, deliveryDate: e.target.value})} 
                                                    required 
                                                    className={`h-12 font-bold text-lg ${calcInfo ? 'bg-green-50/50 border-green-300 text-green-800 focus:ring-green-500' : 'bg-white'}`}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* SEÇÃO 3: FORMULAÇÃO / MIX (EXTRUSÃO ONLY) */}
                                {isExtrusionContext() && (
                                    <div className="bg-blue-50 p-6 rounded-xl border border-blue-100 animate-in fade-in">
                                        <div className="flex items-center gap-2 mb-4 text-blue-800 border-b border-blue-200 pb-2">
                                            <FlaskConical size={18} className="text-blue-600"/> 
                                            <h3 className="font-bold text-sm uppercase tracking-wide">Receita de Mistura / Mix Padrão</h3>
                                        </div>
                                        
                                        <div className="bg-white p-4 rounded-lg border border-blue-100 shadow-sm">
                                            <p className="text-xs text-slate-500 mb-4">
                                                Defina a composição da receita em <b>Porcentagem (%)</b>. O total deve fechar em 100%.
                                            </p>
                                            {mixItems.map((item, idx) => (
                                                <div key={idx} className="flex gap-2 mb-2">
                                                    <select className="w-24 px-2 py-1.5 text-xs border rounded bg-slate-50" value={item.type} onChange={e => handleMixItemChange(idx, 'type', e.target.value)}>
                                                        <option value="">Tipo...</option>
                                                        <option value="FLAKE">FLAKE</option>
                                                        <option value="APARA">APARA</option>
                                                    </select>
                                                    <select className="flex-1 px-2 py-1.5 text-xs border rounded bg-slate-50" value={item.subType} onChange={e => handleMixItemChange(idx, 'subType', e.target.value)}>
                                                        <option value="">Cor / Material...</option>
                                                        <option value="CRISTAL">CRISTAL</option>
                                                        <option value="BRANCO">BRANCO</option>
                                                        <option value="PRETO">PRETO</option>
                                                        <option value="AZUL">AZUL</option>
                                                    </select>
                                                    <div className="flex items-center w-28">
                                                        <input 
                                                            type="number" 
                                                            step="0.1" 
                                                            className="w-full px-2 py-1.5 text-xs border rounded text-right font-bold" 
                                                            placeholder="0" 
                                                            value={item.qty} 
                                                            onChange={e => handleMixItemChange(idx, 'qty', e.target.value)} 
                                                        />
                                                        <span className="text-[10px] ml-1 text-slate-400 font-bold">%</span>
                                                    </div>
                                                </div>
                                            ))}
                                            
                                            {/* Validation Footer */}
                                            <div className="mt-2 pt-2 border-t border-slate-100 flex justify-end items-center">
                                                <span className="text-xs font-bold text-slate-500 mr-2">Total Receita:</span>
                                                <span className={`text-sm font-bold px-2 py-0.5 rounded ${
                                                    Math.abs(totalMixPercentage - 100) <= 0.1 
                                                    ? 'bg-green-100 text-green-700' 
                                                    : 'bg-red-100 text-red-700'
                                                }`}>
                                                    {totalMixPercentage.toFixed(1)}%
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* SEÇÃO 4: DETALHES GERAIS */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="text-sm font-bold text-slate-700 mb-2 block">Prioridade</label>
                                        <div className="flex bg-slate-100 p-1 rounded-lg">
                                            {['NORMAL', 'HIGH', 'URGENT'].map(p => (
                                                <button
                                                    key={p}
                                                    type="button"
                                                    onClick={() => setEditingOrder({...editingOrder, priority: p as any})}
                                                    className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${
                                                        editingOrder.priority === p
                                                        ? (p === 'URGENT' ? 'bg-red-600 text-white shadow-md' : p === 'HIGH' ? 'bg-orange-500 text-white shadow-md' : 'bg-white text-slate-800 shadow-md')
                                                        : 'text-slate-500 hover:text-slate-700'
                                                    }`}
                                                >
                                                    {p === 'NORMAL' ? 'Normal' : p === 'HIGH' ? 'Alta' : 'URGENTE'}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <Input label="Cliente (Opcional)" value={editingOrder.customerName || ''} onChange={e => setEditingOrder({...editingOrder, customerName: e.target.value})} placeholder="Nome do Cliente" />
                                    </div>
                                    <div className="md:col-span-2">
                                        <Textarea label="Observações / Instruções" value={editingOrder.notes || ''} onChange={e => setEditingOrder({...editingOrder, notes: e.target.value})} rows={2} placeholder="Detalhes específicos para a produção, lote de MP, etc..." />
                                    </div>
                                </div>

                            </form>
                        </div>

                        {/* FOOTER */}
                        <div className="p-5 bg-slate-50 border-t border-slate-200 flex justify-end gap-3 shrink-0">
                            <button type="button" onClick={() => setModalOpen(false)} className="px-6 py-3 border border-slate-300 rounded-lg hover:bg-white font-bold text-slate-600 transition-colors">Cancelar</button>
                            <button 
                                type="submit" 
                                form="op-form"
                                disabled={isSubmitting}
                                className="px-8 py-3 bg-brand-600 text-white rounded-lg hover:bg-brand-700 font-bold flex items-center shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all disabled:opacity-70 disabled:transform-none"
                            >
                                {isSubmitting ? <Loader2 className="animate-spin mr-2" /> : <Save className="mr-2" size={18} />}
                                Salvar Ordem
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProductionPlanPage;
