import React, { useState, useEffect, useMemo } from 'react';
import { fetchMaterials, saveMaterial, deleteMaterial, processStockTransaction, fetchInventoryTransactions, formatError, renameMaterialGroup } from '../services/storage';
import { RawMaterial, MaterialCategory, InventoryTransaction } from '../types';
import { Plus, Search, Cuboid, Save, ArrowDownCircle, ArrowUpCircle, RefreshCw, Trash2, X, Box, Zap, User, Hammer, Loader2, AlertCircle, ArrowRight, Minus, History, FileText, DollarSign, BarChart3, Filter, Cpu, Layers, ChevronRight, ArrowLeft, LayoutGrid, List as ListIcon, Edit, Undo2, Info, CheckCircle2, Tag, ShieldAlert, Eye, EyeOff } from 'lucide-react';
import { Input } from '../components/Input';
import { useAuth } from '../contexts/AuthContext';

// Robust number parser for PT-BR input
const parseInputNumber = (input: string): number => {
    if (!input) return 0;
    let clean = input.toString().replace(/[^0-9,.]/g, '');
    if (clean.includes(',')) {
        if (clean.indexOf('.') < clean.indexOf(',')) {
             clean = clean.replace(/\./g, '');
        }
        clean = clean.replace(',', '.');
    }
    return Number(clean);
};

// --- INTERFACES FOR GROUPING ---
interface MaterialGroup {
    name: string;
    items: RawMaterial[];
    totalStock: number;
    totalValue: number;
    lowStockCount: number;
    units: Set<string>;
}

// Default Categories Map (Key -> Label)
const DEFAULT_CATEGORIES: Record<string, string> = {
    'raw_material': 'Matéria Prima',
    'packaging': 'Embalagem',
    'return': 'Retorno',
    'energy': 'Energia (kWh)',
    'labor': 'Mão de Obra (h)',
    'overhead': 'Custos Indiretos'
};

// --- Componente Modal de Confirmação ---
const DeleteModal = ({ isOpen, onClose, onConfirm, isDeleting }: { isOpen: boolean, onClose: () => void, onConfirm: () => void, isDeleting: boolean }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 transform scale-100 transition-all">
                <div className="flex items-center gap-3 mb-4 text-red-600">
                    <div className="p-2 bg-red-100 rounded-full">
                        <Trash2 size={24} />
                    </div>
                    <h3 className="text-lg font-bold text-slate-800">Confirmar Exclusão</h3>
                </div>
                <p className="text-slate-600 mb-6 text-sm font-medium">Tem certeza que deseja excluir este material?</p>
                <div className="flex justify-end gap-3">
                    <button onClick={onClose} disabled={isDeleting} className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 font-bold text-sm transition-colors">Cancelar</button>
                    <button onClick={onConfirm} disabled={isDeleting} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-bold text-sm flex items-center shadow-md transition-colors">
                        {isDeleting && <Loader2 className="animate-spin mr-2" size={16}/>} Excluir
                    </button>
                </div>
            </div>
        </div>
    );
};

const InventoryPage: React.FC = () => {
    const { user } = useAuth();
    
    // --- STATE ---
    const [materials, setMaterials] = useState<RawMaterial[]>([]);
    const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeCategory, setActiveCategory] = useState<MaterialCategory | 'ALL'>('ALL');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [showInactive, setShowInactive] = useState(false); // NEW: Toggle Inactive Visibility
    
    // VIEW MODE: GROUPS or ITEMS (Drill-down)
    const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

    // Modals
    const [modalOpen, setModalOpen] = useState(false);
    const [trxModalOpen, setTrxModalOpen] = useState(false);
    
    // Delete State
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    
    // Form States
    const [editingMat, setEditingMat] = useState<RawMaterial | null>(null);
    const [selectedMat, setSelectedMat] = useState<RawMaterial | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // UI State for Group Creation (Split Logic)
    const [groupMode, setGroupMode] = useState<'SELECT' | 'CREATE'>('SELECT');
    // UI State for Category Creation
    const [categoryMode, setCategoryMode] = useState<'SELECT' | 'CREATE'>('SELECT');
    
    // Transaction Form
    const [trxType, setTrxType] = useState<'IN' | 'OUT' | 'ADJ'>('IN');
    const [trxQty, setTrxQty] = useState('');
    const [trxNote, setTrxNote] = useState('');
    const [isTrxSubmitting, setIsTrxSubmitting] = useState(false);

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [matData, trxData] = await Promise.all([
                fetchMaterials(),
                fetchInventoryTransactions()
            ]);
            setMaterials(matData);
            setTransactions(trxData);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleRefreshHistory = async () => {
        const trxData = await fetchInventoryTransactions();
        setTransactions(trxData);
    };

    // --- GROUPING LOGIC ---
    const groupedInventory = useMemo(() => {
        const groups: Record<string, MaterialGroup> = {};
        
        // Filter first
        const filtered = materials.filter(m => {
            const matchesSearch = (m.name && m.name.toLowerCase().includes(searchTerm.toLowerCase())) || 
                                  (m.code && m.code.toLowerCase().includes(searchTerm.toLowerCase())) || 
                                  (m.group || '').toLowerCase().includes(searchTerm.toLowerCase());
            const matchesCat = activeCategory === 'ALL' || m.category === activeCategory;
            const matchesActive = showInactive ? true : m.active !== false; // Filter Inactive if toggle is off
            return matchesSearch && matchesCat && matchesActive;
        });

        filtered.forEach(mat => {
            const groupName = mat.group || 'Diversos';
            if (!groups[groupName]) {
                groups[groupName] = {
                    name: groupName,
                    items: [],
                    totalStock: 0,
                    totalValue: 0,
                    lowStockCount: 0,
                    units: new Set()
                };
            }
            
            groups[groupName].items.push(mat);
            groups[groupName].totalStock += mat.currentStock;
            groups[groupName].totalValue += (mat.currentStock * mat.unitCost);
            if (mat.active !== false && mat.currentStock <= mat.minStock) groups[groupName].lowStockCount++; 
            groups[groupName].units.add(mat.unit);
        });

        return Object.values(groups).sort((a,b) => b.totalValue - a.totalValue);
    }, [materials, searchTerm, activeCategory, showInactive]);

    // Used for the "Details" view
    const currentGroupItems = useMemo(() => {
        if (!selectedGroup) return [];
        return materials
            .filter(m => (m.group || 'Diversos') === selectedGroup)
            .filter(m => showInactive ? true : m.active !== false) // Apply filter here too
            .sort((a,b) => {
                // Inactive items at bottom
                if (a.active !== false && b.active === false) return -1;
                if (a.active === false && b.active !== false) return 1;
                return (a.name || '').localeCompare(b.name || '');
            });
    }, [materials, selectedGroup, showInactive]);

    // --- DASHBOARD METRICS ---
    const metrics = useMemo(() => {
        let totalValue = 0;
        let lowStockCount = 0;
        let totalItems = 0;

        materials.forEach(m => {
            if (m.active !== false) {
                totalValue += (m.currentStock * m.unitCost);
                if (m.currentStock <= m.minStock) lowStockCount++;
                totalItems++;
            }
        });

        return { totalValue, lowStockCount, totalItems };
    }, [materials]);

    const handleSaveMaterial = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingMat) return;

        // Validation for Create Modes
        if (groupMode === 'CREATE') {
            if (!editingMat.group || editingMat.group.trim().length < 2) {
                alert("Por favor, digite um nome válido para a nova família/grupo (mínimo 2 caracteres).");
                return;
            }
        }
        
        if (categoryMode === 'CREATE') {
            if (!editingMat.category || editingMat.category.trim().length < 2) {
                alert("Por favor, digite um nome válido para a nova categoria.");
                return;
            }
        }

        setIsSubmitting(true);
        setErrorMsg(null);
        try {
            const cost = parseInputNumber(editingMat.unitCost.toString());
            const min = parseInputNumber(editingMat.minStock.toString());
            const current = parseInputNumber(editingMat.currentStock.toString());
            
            if (isNaN(cost) || isNaN(min) || isNaN(current)) throw new Error("Valores numéricos inválidos");

            // Ensure group is set (default to Diversos if empty)
            const finalGroup = editingMat.group && editingMat.group.trim() !== '' ? editingMat.group : 'Diversos';

            await saveMaterial({
                ...editingMat,
                unitCost: cost,
                minStock: min,
                currentStock: current,
                group: finalGroup
            });
            setModalOpen(false);
            setEditingMat(null);
            loadData();
        } catch (error: any) { 
            alert("Erro ao salvar material: " + formatError(error)); 
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCategoryChange = (cat: MaterialCategory) => {
        if (!editingMat) return;
        let defaultUnit = editingMat.unit;
        // Logic specific to default categories
        if (cat === 'energy') defaultUnit = 'kWh';
        else if (cat === 'labor') defaultUnit = 'h';
        else if (cat === 'raw_material' && defaultUnit === 'h') defaultUnit = 'kg'; 
        else if (cat === 'packaging' && defaultUnit === 'kg') defaultUnit = 'un';
        
        setEditingMat({...editingMat, category: cat, unit: defaultUnit});
    };

    const handleDeleteClick = (id: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDeleteId(id);
        setErrorMsg(null);
    };

    const confirmDelete = async () => {
        if (!deleteId) return;
        setIsDeleting(true);
        try {
            await deleteMaterial(deleteId);
            loadData();
            setDeleteId(null);
        } catch (e: any) { 
            // Don't close modal on generic error, but for FK error we display it in the main UI
            setDeleteId(null);
            setErrorMsg(formatError(e)); 
        } finally {
            setIsDeleting(false);
        }
    };

    const handleTransaction = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedMat || !trxQty) return;
        
        setIsTrxSubmitting(true);
        try {
            const numQty = parseInputNumber(trxQty);
            if (isNaN(numQty) || (trxType !== 'ADJ' && numQty <= 0)) {
                throw new Error(`Quantidade inválida. Insira um número maior que zero.`);
            }

            // Append User Info to Notes
            let finalNote = trxNote;
            if (user && user.fullName) {
                finalNote = finalNote ? `${finalNote} - por ${user.fullName}` : `Manual - por ${user.fullName}`;
            }

            await processStockTransaction({
                materialId: selectedMat.id,
                type: trxType,
                quantity: numQty,
                notes: finalNote
            });
            
            setTrxModalOpen(false);
            loadData();
        } catch (e: any) { 
            alert("Erro na transação: " + formatError(e)); 
        } finally {
            setIsTrxSubmitting(false);
        }
    };

    const handleRenameGroup = async () => {
        if (!selectedGroup || selectedGroup === 'Diversos') {
            alert("Não é possível renomear o grupo padrão.");
            return;
        }
        
        const newName = window.prompt("Novo nome para o grupo (Isso atualizará todos os itens):", selectedGroup);
        if (!newName || newName === selectedGroup) return;

        try {
            setLoading(true);
            await renameMaterialGroup(selectedGroup, newName);
            setSelectedGroup(newName); // Update UI context
            loadData(); // Refresh data
        } catch(e) {
            alert("Erro ao renomear: " + formatError(e));
            setLoading(false);
        }
    };

    const openNew = () => {
        // Pre-fill group if inside a group view
        const defaultGroup = selectedGroup && selectedGroup !== 'Diversos' ? selectedGroup : 'Diversos';
        setEditingMat({ id: '', code: '', name: '', unit: 'kg', currentStock: 0, minStock: 100, unitCost: 0, category: 'raw_material', group: defaultGroup, active: true });
        setGroupMode('SELECT'); // Reset to selection mode
        setCategoryMode('SELECT');
        setModalOpen(true);
    };

    const openEdit = (mat: RawMaterial, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setEditingMat(mat);
        setGroupMode('SELECT'); 
        setCategoryMode('SELECT');
        setModalOpen(true);
    };

    const openTrx = (mat: RawMaterial, type: 'IN' | 'OUT', e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setSelectedMat(mat);
        setTrxType(type);
        setTrxQty('');
        setTrxNote('');
        setTrxModalOpen(true);
    };

    const getCategoryIcon = (cat: MaterialCategory) => {
        switch(cat) {
            case 'packaging': return <Box size={18} className="text-orange-500"/>;
            case 'return': return <Undo2 size={18} className="text-red-500"/>;
            case 'energy': return <Zap size={18} className="text-yellow-500"/>;
            case 'labor': return <User size={18} className="text-blue-500"/>;
            case 'overhead': return <DollarSign size={18} className="text-green-500"/>;
            case 'raw_material': return <Hammer size={18} className="text-slate-500"/>;
            default: return <Tag size={18} className="text-indigo-500"/>;
        }
    };

    const getCategoryLabel = (cat: string) => {
        return DEFAULT_CATEGORIES[cat] || cat;
    };

    const getTransactionPreview = () => {
        if (!selectedMat || !trxQty) return null;
        const qty = parseInputNumber(trxQty);
        if (isNaN(qty)) return null;
        
        const current = selectedMat.currentStock;
        let future = current;
        if (trxType === 'IN') future = current + qty;
        else if (trxType === 'OUT') future = current - qty;
        else if (trxType === 'ADJ') future = qty;
        
        return { current, future, diff: future - current };
    };

    // Suggest existing groups for autocomplete
    const existingGroups = useMemo(() => {
        const s = new Set<string>();
        materials.forEach(m => { if(m.group && m.group !== 'Diversos') s.add(m.group); });
        return Array.from(s).sort();
    }, [materials]);

    // Consolidate all available categories (Defaults + Custom ones found in DB)
    const allCategories = useMemo(() => {
        const cats = new Set(Object.keys(DEFAULT_CATEGORIES));
        materials.forEach(m => {
            if (m.category) cats.add(m.category);
        });
        return Array.from(cats).sort();
    }, [materials]);

    const preview = getTransactionPreview();
    const isBalanceInsufficient = trxType === 'OUT' && preview && preview.future < 0;

    return (
        <div className="space-y-6 pb-20">
            <DeleteModal 
                isOpen={!!deleteId} 
                onClose={() => setDeleteId(null)} 
                onConfirm={confirmDelete} 
                isDeleting={isDeleting} 
            />

            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800">Gestão de Estoque (WMS)</h2>
                    <p className="text-slate-500">
                        {selectedGroup ? `Itens da Família: ${selectedGroup}` : 'Visão Geral por Família de Materiais'}
                    </p>
                </div>
                
                <div className="flex items-center gap-3">
                    {selectedGroup && (
                        <button onClick={() => setSelectedGroup(null)} className="px-3 py-2 border border-slate-300 rounded-lg text-slate-600 font-bold hover:bg-slate-100 flex items-center transition-all">
                            <ArrowLeft size={18} className="mr-2" /> Voltar
                        </button>
                    )}
                    <button onClick={openNew} className="bg-brand-600 text-white px-4 py-2 rounded-lg flex items-center hover:bg-brand-700 shadow-sm transition-all font-bold">
                        <Plus size={20} className="mr-2" /> Novo Item
                    </button>
                </div>
            </div>

            {errorMsg && (
                <div className="bg-red-50 border border-red-200 text-red-800 px-6 py-4 rounded-xl flex items-start animate-in fade-in shadow-sm">
                    <ShieldAlert size={24} className="mr-4 flex-shrink-0 mt-1 text-red-600" />
                    <div className="flex-1">
                        <h4 className="font-bold text-lg mb-1">Ação Bloqueada</h4>
                        <p className="text-sm whitespace-pre-line leading-relaxed">{errorMsg}</p>
                    </div>
                    <button onClick={() => setErrorMsg(null)} className="ml-4 text-red-400 hover:text-red-700 p-1 hover:bg-red-100 rounded-full"><X size={20}/></button>
                </div>
            )}

            {/* DASHBOARD CARDS (Show only on Main View) */}
            {!selectedGroup && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-slate-500">Valor Total (Ativos)</p>
                            <h3 className="text-2xl font-bold text-brand-700">R$ {metrics.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h3>
                        </div>
                        <div className="p-3 bg-brand-50 text-brand-600 rounded-lg">
                            <DollarSign size={24} />
                        </div>
                    </div>
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-slate-500">Itens Críticos</p>
                            <h3 className={`text-2xl font-bold ${metrics.lowStockCount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                {metrics.lowStockCount} <span className="text-sm text-slate-400 font-normal">de {metrics.totalItems}</span>
                            </h3>
                        </div>
                        <div className={`p-3 rounded-lg ${metrics.lowStockCount > 0 ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                            <AlertCircle size={24} />
                        </div>
                    </div>
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-slate-500">Movimentações Recentes</p>
                            <h3 className="text-2xl font-bold text-slate-700">{transactions.length}</h3>
                        </div>
                        <div className="p-3 bg-purple-50 text-purple-600 rounded-lg">
                            <History size={24} />
                        </div>
                    </div>
                </div>
            )}

            {/* FILTERS & SEARCH (Always visible but adapts) */}
            <div className="flex flex-col md:flex-row gap-4 items-center bg-white p-2 rounded-xl shadow-sm border border-slate-200 sticky top-0 z-20">
                <div className="flex-1 w-full md:w-auto flex items-center px-2">
                    <Search className="text-slate-400 mr-2" size={20} />
                    <input 
                        type="text" 
                        placeholder={selectedGroup ? `Buscar itens em ${selectedGroup}...` : "Buscar grupos ou materiais..."}
                        className="flex-1 outline-none text-slate-700 text-sm h-10"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
                
                <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0 scrollbar-hide px-2">
                    {/* Show/Hide Inactive Toggle */}
                    <button
                        onClick={() => setShowInactive(!showInactive)}
                        className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center whitespace-nowrap transition-all border ${
                            showInactive 
                            ? 'bg-slate-100 text-slate-700 border-slate-300' 
                            : 'bg-white text-slate-400 border-dashed border-slate-300 hover:text-slate-600'
                        }`}
                        title={showInactive ? "Ocultar itens inativos" : "Mostrar itens inativos"}
                    >
                        {showInactive ? <Eye size={14} className="mr-1.5"/> : <EyeOff size={14} className="mr-1.5"/>}
                        {showInactive ? 'Inativos Visíveis' : 'Inativos Ocultos'}
                    </button>

                    <div className="w-px h-6 bg-slate-200 mx-1"></div>

                    {!selectedGroup && [
                        { id: 'ALL', label: 'Todos', icon: Cuboid },
                        { id: 'raw_material', label: 'Mat. Prima', icon: Hammer },
                        { id: 'packaging', label: 'Embalagem', icon: Box },
                        { id: 'return', label: 'Retorno', icon: Undo2 },
                        { id: 'labor', label: 'M.O.', icon: User },
                    ].map(cat => (
                        <button
                            key={cat.id}
                            onClick={() => setActiveCategory(cat.id as any)}
                            className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center whitespace-nowrap transition-all ${
                                activeCategory === cat.id 
                                ? 'bg-slate-800 text-white shadow-md' 
                                : 'text-slate-500 hover:bg-slate-100'
                            }`}
                        >
                            <cat.icon size={14} className="mr-1.5" />
                            {cat.label}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="animate-spin text-brand-600" /></div>
            ) : (
                <>
                    {/* VIEW 1: GROUP CARDS (PARENTS) */}
                    {!selectedGroup && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {groupedInventory.map(group => (
                                <div 
                                    key={group.name} 
                                    onClick={() => setSelectedGroup(group.name)}
                                    className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-all cursor-pointer group hover:border-brand-300 relative h-full flex flex-col"
                                >
                                    {/* Parent Indicator Badge */}
                                    <div className="absolute top-0 right-0 bg-brand-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-bl-lg">
                                        FAMÍLIA / PAI
                                    </div>

                                    <div className="p-5 border-b border-slate-50 flex justify-between items-start mt-2">
                                        <div className="flex items-center space-x-3 w-full">
                                            <div className="p-3 bg-brand-50 text-brand-600 rounded-lg group-hover:bg-brand-600 group-hover:text-white transition-colors shrink-0">
                                                <Layers size={24} />
                                            </div>
                                            <div className="overflow-hidden">
                                                <h3 className="text-lg font-bold text-slate-800 leading-tight truncate w-full" title={group.name}>{group.name}</h3>
                                                <div className="flex items-center text-slate-500 text-xs mt-1">
                                                    <span className="font-bold bg-slate-100 px-1.5 py-0.5 rounded mr-1 text-slate-700">{group.items.length}</span>
                                                    <span>itens vinculados</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="p-5 bg-slate-50/50 flex-1 flex flex-col justify-between">
                                        <div className="grid grid-cols-1 gap-2 mb-2">
                                            <div className="flex justify-between items-center bg-white p-2 rounded border border-slate-200 shadow-sm">
                                                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Total em Estoque</p>
                                                <p className="text-lg font-bold text-slate-800">
                                                    {group.totalStock.toLocaleString('pt-BR')} 
                                                    <span className="text-[10px] font-normal text-slate-400 ml-1">
                                                        {Array.from(group.units).join('/')}
                                                    </span>
                                                </p>
                                            </div>
                                            <div className="text-right mt-1">
                                                <span className="text-[10px] text-slate-400 font-bold uppercase mr-2">Valor Estimado</span>
                                                <span className="text-sm font-bold text-brand-700 bg-brand-50 px-2 py-0.5 rounded">
                                                    R$ {group.totalValue.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                                                </span>
                                            </div>
                                        </div>
                                        {group.lowStockCount > 0 && (
                                            <div className="mt-3 bg-red-100 text-red-700 px-3 py-2 rounded-lg text-xs font-bold flex items-center justify-center animate-pulse">
                                                <AlertCircle size={14} className="mr-2" />
                                                {group.lowStockCount} itens críticos
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {groupedInventory.length === 0 && (
                                <div className="col-span-full py-12 text-center text-slate-400 bg-white rounded-xl border border-dashed border-slate-200">
                                    Nenhum material encontrado. {showInactive ? '' : 'Tente ativar o filtro "Inativos Ocultos".'}
                                </div>
                            )}
                        </div>
                    )}

                    {/* VIEW 2: ITEMS LIST (CHILDREN) */}
                    {selectedGroup && (
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-right-4">
                            <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-brand-100 text-brand-700 rounded-lg">
                                        <Layers size={20} />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-bold text-slate-800 text-lg flex items-center">
                                                {selectedGroup}
                                            </h3>
                                            <button 
                                                onClick={handleRenameGroup} 
                                                className="p-1 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors" 
                                                title="Renomear Grupo (Pai)"
                                            >
                                                <Edit size={14} />
                                            </button>
                                        </div>
                                        <p className="text-xs text-slate-500">Visualizando itens vinculados a este grupo</p>
                                    </div>
                                </div>
                                <span className="text-xs bg-white border px-2 py-1 rounded text-slate-500 font-bold shadow-sm">
                                    {currentGroupItems.length} variações
                                </span>
                            </div>
                            
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-white text-slate-600 font-semibold border-b">
                                        <tr>
                                            <th className="px-6 py-4">Item (Filho)</th>
                                            <th className="px-6 py-4">Categoria</th>
                                            <th className="px-6 py-4 text-right">Estoque</th>
                                            <th className="px-6 py-4 text-right">Custo Un.</th>
                                            <th className="px-6 py-4 text-center">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {currentGroupItems.map(mat => (
                                            <tr key={mat.id} className={`group transition-colors ${mat.active === false ? 'opacity-60 bg-slate-50 grayscale hover:bg-slate-100' : 'hover:bg-slate-50'}`}>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center">
                                                        <div className={`w-2 h-2 rounded-full mr-3 ${mat.active === false ? 'bg-slate-300' : mat.currentStock <= mat.minStock ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`}></div>
                                                        <div>
                                                            <div className="font-bold text-slate-800 flex items-center">
                                                                {mat.name}
                                                                {mat.active === false && (
                                                                    <span className="ml-2 text-[9px] bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded border border-slate-300 uppercase tracking-wide">Inativo</span>
                                                                )}
                                                            </div>
                                                            <div className="text-xs text-slate-400 font-mono">{mat.code}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center text-slate-500 text-xs">
                                                        {getCategoryIcon(mat.category)}
                                                        <span className="ml-2 capitalize">{getCategoryLabel(mat.category)}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className={`font-bold ${mat.active === false ? 'text-slate-500' : mat.currentStock <= mat.minStock ? 'text-red-600' : 'text-slate-700'}`}>
                                                        {mat.currentStock.toLocaleString('pt-BR')} <span className="text-xs font-normal text-slate-400">{mat.unit}</span>
                                                    </div>
                                                    {mat.active !== false && <div className="text-[10px] text-slate-400">Min: {mat.minStock}</div>}
                                                </td>
                                                <td className="px-6 py-4 text-right font-mono text-slate-600">
                                                    R$ {mat.unitCost.toFixed(2)}
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <div className="flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        {mat.active !== false && (
                                                            <>
                                                                <button 
                                                                    type="button"
                                                                    onClick={(e) => openTrx(mat, 'IN', e)} 
                                                                    className="p-1.5 bg-green-50 text-green-700 rounded hover:bg-green-100" 
                                                                    title="Entrada"
                                                                >
                                                                    <ArrowDownCircle size={16} />
                                                                </button>
                                                                <button 
                                                                    type="button"
                                                                    onClick={(e) => openTrx(mat, 'OUT', e)} 
                                                                    className="p-1.5 bg-orange-50 text-orange-700 rounded hover:bg-orange-100" 
                                                                    title="Saída"
                                                                >
                                                                    <ArrowUpCircle size={16} />
                                                                </button>
                                                            </>
                                                        )}
                                                        <button 
                                                            type="button"
                                                            onClick={(e) => openEdit(mat, e)} 
                                                            className="p-1.5 bg-blue-50 text-blue-700 rounded hover:bg-blue-100" 
                                                            title="Editar"
                                                        >
                                                            <RefreshCw size={16} />
                                                        </button>
                                                        <button 
                                                            type="button"
                                                            onClick={(e) => handleDeleteClick(mat.id, e)} 
                                                            className="p-1.5 bg-red-50 text-red-700 rounded hover:bg-red-100" 
                                                            title="Excluir"
                                                        >
                                                            <Trash2 size={16} className="pointer-events-none" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* MODAL CADASTRO (Updated with Tabs for Group AND Category Selection) */}
            {modalOpen && editingMat && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white rounded-xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
                        <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
                            <h3 className="font-bold text-slate-800">{editingMat.id ? 'Editar Item de Estoque' : 'Novo Item de Estoque'}</h3>
                            <button onClick={() => setModalOpen(false)}><X className="text-slate-400 hover:text-slate-600"/></button>
                        </div>
                        
                        <div className="p-6 overflow-y-auto">
                            <form onSubmit={handleSaveMaterial} className="space-y-6">
                                
                                {/* 1. GROUP SELECTION SECTION (With Tabs) */}
                                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                                    <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 gap-2">
                                        <label className="text-sm font-bold text-blue-800 flex items-center">
                                            <Layers size={18} className="mr-2 text-blue-600" />
                                            Classificação (Família / Pai)
                                        </label>
                                        
                                        {/* Group Tabs */}
                                        <div className="flex bg-white rounded-lg border border-blue-200 p-1 self-start md:self-auto">
                                            <button 
                                                type="button"
                                                onClick={() => { setGroupMode('SELECT'); setEditingMat(prev => prev ? {...prev, group: 'Diversos'} : null); }}
                                                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center ${groupMode === 'SELECT' ? 'bg-blue-100 text-blue-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}
                                            >
                                                <ListIcon size={12} className="mr-1.5"/> Selecionar Existente
                                            </button>
                                            <button 
                                                type="button"
                                                onClick={() => { setGroupMode('CREATE'); setEditingMat(prev => prev ? {...prev, group: ''} : null); }}
                                                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center ${groupMode === 'CREATE' ? 'bg-blue-100 text-blue-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}
                                            >
                                                <Plus size={12} className="mr-1.5"/> Criar Nova Família
                                            </button>
                                        </div>
                                    </div>

                                    {groupMode === 'SELECT' ? (
                                        <div className="animate-in fade-in slide-in-from-left-2 duration-300">
                                            <select 
                                                className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm bg-white font-semibold text-slate-700 focus:ring-2 focus:ring-blue-400 outline-none shadow-sm"
                                                value={editingMat.group || 'Diversos'}
                                                onChange={e => setEditingMat({...editingMat, group: e.target.value})}
                                            >
                                                <option value="Diversos">Diversos (Padrão)</option>
                                                {existingGroups.filter(g => g !== 'Diversos').map(g => (
                                                    <option key={g} value={g}>{g}</option>
                                                ))}
                                            </select>
                                            <p className="text-[10px] text-blue-600/70 mt-1.5 ml-1">
                                                Selecione uma família existente para agrupar este item.
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="animate-in fade-in slide-in-from-right-2 duration-300">
                                            <div className="relative">
                                                <Input 
                                                    label="" 
                                                    value={editingMat.group || ''} 
                                                    onChange={e => setEditingMat({...editingMat, group: e.target.value})} 
                                                    placeholder="Digite o nome da nova família (ex: Resinas, Caixas)..." 
                                                    className="bg-white border-blue-300 focus:ring-blue-400 font-bold text-blue-900 placeholder:font-normal placeholder:text-blue-300"
                                                    autoFocus
                                                />
                                                <div className="absolute right-2 top-2 text-green-600 pointer-events-none opacity-0 transition-opacity">
                                                    <CheckCircle2 size={20} />
                                                </div>
                                            </div>
                                            <p className="text-[10px] text-blue-700 mt-2 flex items-start bg-blue-100/50 p-2 rounded border border-blue-100">
                                                <Info size={14} className="mr-1.5 flex-shrink-0 mt-0.5"/> 
                                                <span>
                                                    <b>Atenção:</b> Uma nova família (Card Principal) será criada no painel com o nome digitado acima assim que você salvar este item.
                                                </span>
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {/* 2. MAIN GRID LAYOUT */}
                                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 pt-2 border-t border-slate-100">
                                    
                                    {/* Código */}
                                    <div className="md:col-span-3">
                                        <Input label="Código" value={editingMat.code} onChange={e => setEditingMat({...editingMat, code: e.target.value})} required placeholder="Cód." />
                                    </div>

                                    {/* Descrição */}
                                    <div className="md:col-span-9">
                                        <Input label="Descrição do Item (Filho)" value={editingMat.name} onChange={e => setEditingMat({...editingMat, name: e.target.value})} required placeholder="Ex: Caixa 300x300" />
                                    </div>

                                    {/* Categoria - NEW DYNAMIC SELECT/CREATE */}
                                    <div className="md:col-span-4">
                                        <label className="text-sm font-semibold text-slate-700 mb-1 flex justify-between items-center">
                                            Categoria
                                            <div className="flex bg-slate-100 rounded p-0.5">
                                                <button
                                                    type="button"
                                                    onClick={() => { setCategoryMode('SELECT'); setEditingMat(prev => prev ? {...prev, category: 'raw_material'} : null) }}
                                                    className={`px-2 py-0.5 text-[10px] font-bold rounded ${categoryMode === 'SELECT' ? 'bg-white shadow text-brand-600' : 'text-slate-400'}`}
                                                >
                                                    Lista
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => { setCategoryMode('CREATE'); setEditingMat(prev => prev ? {...prev, category: ''} : null) }}
                                                    className={`px-2 py-0.5 text-[10px] font-bold rounded ${categoryMode === 'CREATE' ? 'bg-white shadow text-brand-600' : 'text-slate-400'}`}
                                                >
                                                    Nova
                                                </button>
                                            </div>
                                        </label>
                                        
                                        {categoryMode === 'SELECT' ? (
                                            <select 
                                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-brand-500 outline-none" 
                                                value={editingMat.category} 
                                                onChange={e => handleCategoryChange(e.target.value as any)}
                                            >
                                                {allCategories.map(cat => (
                                                    <option key={cat} value={cat}>{getCategoryLabel(cat)}</option>
                                                ))}
                                            </select>
                                        ) : (
                                            <Input 
                                                label="" 
                                                value={editingMat.category} 
                                                onChange={e => setEditingMat({...editingMat, category: e.target.value})} 
                                                placeholder="Digite nova categoria..." 
                                                className="h-[38px] text-sm"
                                            />
                                        )}
                                    </div>

                                    {/* Unidade */}
                                    <div className="md:col-span-2">
                                        <label className="text-sm font-semibold text-slate-700 mb-1 block">Unidade</label>
                                        <select className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-brand-500 outline-none" value={editingMat.unit} onChange={e => setEditingMat({...editingMat, unit: e.target.value})}>
                                            <option value="kg">kg</option>
                                            <option value="g">g</option>
                                            <option value="un">un</option>
                                            <option value="l">l</option>
                                            <option value="m">m</option>
                                            <option value="kWh">kWh</option>
                                            <option value="h">h</option>
                                        </select>
                                    </div>

                                    {/* Custo Unitário */}
                                    <div className="md:col-span-3">
                                        <Input label="Custo Unit. (R$)" type="text" value={editingMat.unitCost} onChange={e => setEditingMat({...editingMat, unitCost: e.target.value as any})} placeholder="0.00" />
                                    </div>

                                    {/* Estoque Mínimo */}
                                    <div className="md:col-span-3">
                                        <Input label="Estoque Mínimo" type="text" value={editingMat.minStock} onChange={e => setEditingMat({...editingMat, minStock: e.target.value as any})} placeholder="0.00" />
                                    </div>
                                </div>

                                {/* 3. MANUAL STOCK ADJUSTMENT (Bottom Section) */}
                                <div className="pt-2 border-t border-slate-100">
                                    <div className="bg-orange-50 p-3 rounded-lg border border-orange-100 flex items-center justify-between">
                                        <div>
                                            <label className="text-xs font-bold text-orange-700 flex items-center">
                                                <AlertCircle size={12} className="mr-1" /> Saldo Inicial / Correção
                                            </label>
                                            <p className="text-[10px] text-orange-600 mt-0.5 max-w-[250px] leading-tight">
                                                Para movimentações do dia-a-dia, use os botões de Entrada/Saída na lista.
                                            </p>
                                        </div>
                                        <div className="w-32">
                                            <Input label="" type="text" value={editingMat.currentStock} onChange={e => setEditingMat({...editingMat, currentStock: e.target.value as any})} placeholder="0.00" className="bg-white border-orange-200 focus:ring-orange-200 text-right font-bold" />
                                        </div>
                                    </div>
                                </div>

                                {/* 4. TOGGLE ATIVO/INATIVO (NOVO) */}
                                <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-slate-50/50">
                                    <div className="flex items-center">
                                        <input
                                            type="checkbox"
                                            id="mat_active"
                                            checked={editingMat.active !== false}
                                            onChange={e => setEditingMat({...editingMat, active: e.target.checked})}
                                            className="w-5 h-5 text-brand-600 rounded focus:ring-brand-500 cursor-pointer"
                                        />
                                        <label htmlFor="mat_active" className="ml-3 font-bold text-slate-700 cursor-pointer select-none">
                                            Cadastro Ativo
                                        </label>
                                    </div>
                                    <span className="text-[10px] text-slate-400 italic">Desmarque para arquivar este item (histórico mantido).</span>
                                </div>
                                
                                <div className="flex justify-end space-x-3 pt-2">
                                    <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 border rounded-lg hover:bg-slate-50 text-sm font-medium text-slate-600">Cancelar</button>
                                    <button 
                                        type="submit" 
                                        disabled={isSubmitting}
                                        className="px-6 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 flex items-center font-bold shadow-md disabled:opacity-70"
                                    >
                                        {isSubmitting ? <Loader2 className="animate-spin mr-2" size={16}/> : <Save size={16} className="mr-2" />}
                                        Salvar Item
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL TRANSAÇÃO */}
            {trxModalOpen && selectedMat && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4 backdrop-blur-sm animate-in zoom-in-95">
                    <div className="bg-white rounded-xl w-full max-w-md p-6 shadow-2xl">
                        <h3 className="text-xl font-bold mb-1 flex items-center text-slate-800">
                            {trxType === 'IN' ? <ArrowDownCircle className="mr-2 text-green-600" /> : trxType === 'OUT' ? <ArrowUpCircle className="mr-2 text-orange-600" /> : <RefreshCw className="mr-2 text-blue-600" />}
                            {trxType === 'IN' ? 'Entrada de Estoque' : trxType === 'OUT' ? 'Saída Manual' : 'Ajuste de Inventário'}
                        </h3>
                        <p className="text-slate-500 mb-6 text-sm ml-8">{selectedMat.code} - {selectedMat.name}</p>
                        
                        <form onSubmit={handleTransaction} className="space-y-5">
                            <Input 
                                label={`Quantidade (${selectedMat.unit})`} 
                                type="text"
                                autoFocus
                                placeholder="0,00"
                                value={trxQty} 
                                onChange={e => setTrxQty(e.target.value)} 
                                required 
                                className="text-lg font-bold"
                            />
                            
                            {preview && (
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 relative overflow-hidden">
                                    <div className="flex justify-between items-center text-center relative z-10">
                                        <div>
                                            <p className="text-[10px] uppercase text-slate-400 font-bold">Atual</p>
                                            <p className="text-lg font-bold text-slate-700">{preview.current}</p>
                                        </div>
                                        <ArrowRight className="text-slate-300" />
                                        <div>
                                            <p className="text-[10px] uppercase text-slate-400 font-bold">Novo Saldo</p>
                                            <p className={`text-lg font-bold ${preview.future < 0 ? 'text-red-600' : 'text-brand-700'}`}>{preview.future}</p>
                                        </div>
                                    </div>
                                    {isBalanceInsufficient && (
                                        <div className="mt-3 bg-red-100 text-red-700 text-xs font-bold p-2 rounded flex items-center justify-center animate-pulse">
                                            <AlertCircle size={14} className="mr-1"/> Saldo Insuficiente!
                                        </div>
                                    )}
                                </div>
                            )}

                            <Input 
                                label="Observação (Opcional)" 
                                value={trxNote} 
                                onChange={e => setTrxNote(e.target.value)} 
                                placeholder="Ex: NF 1234, Ajuste contagem..."
                            />
                            
                            <div className="flex justify-end space-x-3 pt-2">
                                <button type="button" onClick={() => setTrxModalOpen(false)} className="px-4 py-2 border rounded-lg hover:bg-slate-50 text-sm font-medium">Cancelar</button>
                                <button 
                                    type="submit" 
                                    disabled={isTrxSubmitting || isBalanceInsufficient}
                                    className={`px-6 py-2 text-white rounded-lg font-bold flex items-center transition-all shadow-md ${
                                        isBalanceInsufficient ? 'bg-slate-300 cursor-not-allowed' :
                                        trxType === 'IN' ? 'bg-green-600 hover:bg-green-700' : 
                                        trxType === 'OUT' ? 'bg-orange-600 hover:bg-orange-700' : 'bg-blue-600 hover:bg-blue-700'
                                    }`}
                                >
                                    {isTrxSubmitting ? <Loader2 className="animate-spin mr-2" size={16}/> : null}
                                    Confirmar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default InventoryPage;