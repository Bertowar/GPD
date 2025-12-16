import React, { useState, useEffect, useMemo } from 'react';
import { fetchMaterials, processStockTransaction, formatError, fetchProducts, fetchAllBOMs, adjustProductStock } from '../services/storage';
import { RawMaterial, MaterialCategory, Product, ProductBOM } from '../types';
import { Save, Search, AlertTriangle, CheckCircle2, Loader2, Box, ChevronRight, ArrowLeft, Info, Package } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

type ViewContext = 'MATERIALS' | 'PRODUCTS';
type FilterType = 'ALL' | 'raw_material' | 'packaging' | 'FINISHED_GOODS';

const InventoryAuditPage: React.FC = () => {
    const { user } = useAuth();
    
    // Data
    const [materials, setMaterials] = useState<RawMaterial[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [boms, setBoms] = useState<ProductBOM[]>([]);
    const [loading, setLoading] = useState(true);
    
    // State Control
    const [viewContext, setViewContext] = useState<ViewContext>('MATERIALS');
    const [activeFilter, setActiveFilter] = useState<FilterType>('ALL');
    const [searchTerm, setSearchTerm] = useState('');
    
    // Audit Data
    const [auditValues, setAuditValues] = useState<Record<string, string>>({}); // Key can be Material ID or Product Code (stringified)
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [matData, prodData, bomData] = await Promise.all([
                fetchMaterials(),
                fetchProducts(),
                fetchAllBOMs()
            ]);
            setMaterials(matData);
            setProducts(prodData);
            setBoms(bomData);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    // --- Logic ---

    const handleFilterClick = (filter: FilterType) => {
        setSearchTerm(''); // Clear search on tab switch
        setAuditValues({}); // Clear current audit values to prevent mixup
        
        if (filter === 'FINISHED_GOODS') {
            setViewContext('PRODUCTS');
            setActiveFilter('FINISHED_GOODS');
        } else {
            setViewContext('MATERIALS');
            setActiveFilter(filter);
        }
    };

    const handleCountChange = (key: string, value: string) => {
        setAuditValues(prev => ({ ...prev, [key]: value }));
    };

    // Helper to calc divergence
    const getDivergence = (currentStock: number, key: string) => {
        const inputVal = auditValues[key];
        if (inputVal === undefined || inputVal === '') return null;
        const physicalQty = parseFloat(inputVal.replace(',', '.'));
        if (isNaN(physicalQty)) return null;
        return physicalQty - currentStock;
    };

    // --- Filtering Lists ---

    const filteredItems = useMemo(() => {
        if (viewContext === 'PRODUCTS') {
            return products.filter(p => 
                (p.produto && p.produto.toLowerCase().includes(searchTerm.toLowerCase())) || 
                p.codigo.toString().includes(searchTerm)
            );
        } else {
            return materials.filter(m => {
                const matchesSearch = (m.name && m.name.toLowerCase().includes(searchTerm.toLowerCase())) || (m.code && m.code.toLowerCase().includes(searchTerm.toLowerCase()));
                let matchesCategory = true;
                if (activeFilter === 'raw_material') matchesCategory = m.category === 'raw_material';
                if (activeFilter === 'packaging') matchesCategory = m.category === 'packaging';
                return matchesSearch && matchesCategory;
            }).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        }
    }, [materials, products, searchTerm, activeFilter, viewContext]);

    const itemsWithChanges = filteredItems.filter((item: any) => {
        // Polymorphic check
        const key = viewContext === 'PRODUCTS' ? item.codigo.toString() : item.id;
        const stock = viewContext === 'PRODUCTS' ? (item.currentStock || 0) : item.currentStock;
        const diff = getDivergence(stock, key);
        return diff !== null && diff !== 0;
    });

    const showBOMDetails = (product: Product) => {
        const productBOM = boms.filter(b => b.productCode === product.codigo);
        if (productBOM.length === 0) {
            alert(`O produto ${product.produto} não possui composição (BOM) cadastrada.`);
            return;
        }
        const details = productBOM.map(b => `- ${b.material?.name}: ${b.quantityRequired} ${b.material?.unit}`).join('\n');
        alert(`Composição de ${product.produto}:\n\n${details}`);
    };

    // --- Saving ---

    const handleFinalizeAudit = async () => {
        if (itemsWithChanges.length === 0) {
            alert("Nenhuma divergência encontrada para ajustar.");
            return;
        }

        if (!confirm(`Confirma o ajuste de estoque para ${itemsWithChanges.length} itens?`)) return;

        setIsSubmitting(true);
        try {
            const auditBatchId = new Date().toISOString().slice(0, 19).replace('T', ' ');
            
            for (const item of itemsWithChanges as any[]) {
                const isProduct = viewContext === 'PRODUCTS';
                const key = isProduct ? item.codigo.toString() : item.id;
                const physicalQty = parseFloat(auditValues[key].replace(',', '.'));

                if (isProduct) {
                    // Adjust Product Stock
                    await adjustProductStock(item.codigo, physicalQty);
                } else {
                    // Adjust Material Stock
                    await processStockTransaction({
                        materialId: item.id,
                        type: 'ADJ',
                        quantity: physicalQty,
                        notes: `Auditoria ${auditBatchId} - ${user?.fullName || 'Admin'}`
                    });
                }
            }
            setSuccessMsg(`Sucesso! ${itemsWithChanges.length} itens ajustados.`);
            setAuditValues({});
            await loadData();
            setTimeout(() => setSuccessMsg(''), 5000);
        } catch (err) {
            alert("Erro: " + formatError(err));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-4 pb-20">
            {/* Header */}
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-slate-800">Conferência / Audit</h2>
                {itemsWithChanges.length > 0 && (
                    <div className="bg-orange-50 text-orange-800 px-3 py-1 rounded border border-orange-200 text-xs font-bold flex items-center animate-in fade-in">
                        <AlertTriangle size={14} className="mr-1.5" />
                        {itemsWithChanges.length} divergências
                    </div>
                )}
            </div>

            {successMsg && (
                <div className="bg-green-100 border border-green-300 text-green-800 px-4 py-2 rounded text-sm flex items-center">
                    <CheckCircle2 size={16} className="mr-2" /> {successMsg}
                </div>
            )}

            {/* BARRA DE FERRAMENTAS */}
            <div className="bg-white p-2 rounded-lg shadow-sm border border-slate-200 flex flex-col md:flex-row gap-2 items-center sticky top-0 z-30">
                
                {/* Busca */}
                <div className="relative w-full md:w-48">
                    <Search className="absolute left-2.5 top-2 text-slate-400" size={14} />
                    <input 
                        type="text" 
                        placeholder={viewContext === 'PRODUCTS' ? "Buscar produto..." : "Busca material..."}
                        className="pl-8 pr-3 py-1.5 border border-slate-300 rounded text-xs w-full outline-none focus:border-brand-500 transition-all font-medium h-8"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="h-6 w-px bg-slate-200 hidden md:block mx-1"></div>
                
                {/* Botões de Filtro */}
                <div className="flex space-x-2 overflow-x-auto w-full md:w-auto pb-1 md:pb-0 no-scrollbar items-center">
                    
                    {[
                        { id: 'ALL', label: 'Todos os itens' },
                        { id: 'raw_material', label: 'Mat. Prima' },
                        { id: 'packaging', label: 'Embalagens' },
                    ].map(cat => (
                        <button
                            key={cat.id}
                            onClick={() => handleFilterClick(cat.id as any)}
                            className={`px-3 py-1.5 rounded text-xs font-bold whitespace-nowrap transition-all border ${
                                activeFilter === cat.id
                                ? 'bg-slate-800 text-white border-slate-800' 
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                            }`}
                        >
                            {cat.label}
                        </button>
                    ))}

                    {/* Botão PRODUTO como filtro (Mesmo estilo) */}
                    <button
                        onClick={() => handleFilterClick('FINISHED_GOODS')}
                        className={`px-3 py-1.5 rounded text-xs font-bold whitespace-nowrap transition-all border flex items-center ${
                            activeFilter === 'FINISHED_GOODS'
                            ? 'bg-slate-800 text-white border-slate-800' 
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                    >
                        Produtos
                    </button>
                </div>
            </div>

            {/* CONTEÚDO DA TABELA */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden min-h-[400px]">
                {loading ? (
                    <div className="p-12 text-center"><Loader2 className="animate-spin mx-auto text-brand-600" /></div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left animate-in fade-in">
                            <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                                <tr>
                                    <th className="px-6 py-4 w-1/3">
                                        {viewContext === 'PRODUCTS' ? 'Produto Acabado' : 'Material / Insumo'}
                                    </th>
                                    <th className="px-6 py-4 text-center w-32 bg-slate-100/50">Saldo Sistema</th>
                                    <th className="px-6 py-4 text-center w-40 bg-brand-50/30">Contagem Física</th>
                                    <th className="px-6 py-4 text-right">Divergência</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredItems.map((item: any) => {
                                    const isProduct = viewContext === 'PRODUCTS';
                                    const key = isProduct ? item.codigo.toString() : item.id;
                                    const stock = isProduct ? (item.currentStock || 0) : item.currentStock;
                                    const diff = getDivergence(stock, key);
                                    const hasEntry = auditValues[key] !== undefined && auditValues[key] !== '';
                                    const unit = item.unit || 'un';

                                    return (
                                        <tr key={key} className={`hover:bg-slate-50 transition-colors ${hasEntry && diff !== 0 ? 'bg-orange-50/30' : ''}`}>
                                            <td className="px-6 py-3">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <div className="font-bold text-slate-800">{isProduct ? item.produto : item.name}</div>
                                                        <div className="text-xs text-slate-400 font-mono">
                                                            {isProduct ? item.codigo : item.code} • {unit}
                                                        </div>
                                                    </div>
                                                    {isProduct && (
                                                        <button 
                                                            onClick={() => showBOMDetails(item)} 
                                                            className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded"
                                                            title="Ver Composição (BOM)"
                                                        >
                                                            <Info size={16} />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-3 text-center bg-slate-100/30">
                                                <span className="font-mono text-slate-600 font-medium">{stock.toLocaleString('pt-BR')}</span>
                                            </td>
                                            <td className="px-6 py-3 text-center bg-brand-50/10 p-2">
                                                <input 
                                                    type="number" step="0.001" placeholder="0"
                                                    className={`w-28 text-center px-2 py-1.5 border rounded outline-none font-bold transition-all text-xs ${
                                                        hasEntry 
                                                            ? (diff !== 0 ? 'border-orange-400 bg-white text-orange-700 ring-2 ring-orange-100' : 'border-green-400 bg-green-50 text-green-700') 
                                                            : 'border-slate-300 focus:border-brand-500'
                                                    }`}
                                                    value={auditValues[key] || ''}
                                                    onChange={e => handleCountChange(key, e.target.value)}
                                                />
                                            </td>
                                            <td className="px-6 py-3 text-right">
                                                {hasEntry ? (
                                                    <div className={`flex items-center justify-end font-bold ${diff === 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                        {diff === 0 ? (
                                                            <span className="flex items-center text-xs uppercase tracking-wider"><CheckCircle2 size={14} className="mr-1"/> OK</span>
                                                        ) : (
                                                            <span>{diff && diff > 0 ? '+' : ''}{diff?.toLocaleString('pt-BR')} {unit}</span>
                                                        )}
                                                    </div>
                                                ) : ( <span className="text-slate-300">-</span> )}
                                            </td>
                                        </tr>
                                    );
                                })}
                                {filteredItems.length === 0 && (
                                    <tr><td colSpan={4} className="p-8 text-center text-slate-400">Nenhum item encontrado.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* ACTION FOOTER */}
            <div className="fixed bottom-0 left-0 md:left-20 right-0 bg-white border-t border-slate-200 p-4 shadow-lg z-20 flex justify-between items-center animate-in slide-in-from-bottom-5">
                <div className="hidden md:block">
                    <p className="text-xs text-slate-500">
                        Contexto: <span className="font-bold text-slate-800">{viewContext === 'PRODUCTS' ? 'Produtos Acabados' : 'Materiais / Insumos'}</span> | 
                        Listados: <span className="font-bold text-slate-800">{filteredItems.length}</span> | 
                        Contados: <span className="font-bold text-brand-600">{Object.keys(auditValues).length}</span>
                    </p>
                </div>
                <div className="flex gap-4 w-full md:w-auto">
                    <button 
                        onClick={() => { if(confirm("Limpar contagens?")) setAuditValues({}); }}
                        disabled={Object.keys(auditValues).length === 0 || isSubmitting}
                        className="px-6 py-3 rounded-lg font-bold text-slate-500 hover:bg-slate-100 disabled:opacity-50 transition-colors text-xs uppercase tracking-wider"
                    >
                        Limpar
                    </button>
                    <button 
                        onClick={handleFinalizeAudit}
                        disabled={itemsWithChanges.length === 0 || isSubmitting}
                        className="flex-1 md:flex-none px-8 py-3 bg-brand-600 text-white rounded-lg font-bold hover:bg-brand-700 disabled:opacity-50 shadow-lg flex items-center justify-center transition-all active:scale-95 text-sm"
                    >
                        {isSubmitting ? <Loader2 className="animate-spin mr-2" /> : <Save className="mr-2" size={18} />}
                        {itemsWithChanges.length > 0 ? `Finalizar Ajustes (${itemsWithChanges.length})` : 'Finalizar Audit'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default InventoryAuditPage;