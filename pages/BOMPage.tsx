import React, { useState, useEffect } from 'react';
import { fetchProducts, fetchMaterials, fetchBOM, saveBOM, deleteBOMItem, formatError } from '../services/storage';
import { Product, RawMaterial, ProductBOM, MaterialCategory } from '../types';
import { Wrench, Plus, Trash2, Loader2, Edit, Save, X, Box, Zap, User, Hammer, AlertCircle } from 'lucide-react';

// --- Components ---

const DeleteModal = ({ isOpen, onClose, onConfirm, isDeleting }: { isOpen: boolean, onClose: () => void, onConfirm: () => void, isDeleting: boolean }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 transform scale-100 transition-all">
                <div className="flex items-center gap-3 mb-4 text-red-600">
                    <div className="p-2 bg-red-100 rounded-full">
                        <Trash2 size={24} />
                    </div>
                    <h3 className="text-lg font-bold text-slate-800">Confirmar Exclusão</h3>
                </div>
                <p className="text-slate-600 mb-6 text-sm font-medium">Tem certeza que deseja remover este item da receita?</p>
                <div className="flex justify-end gap-3">
                    <button 
                        onClick={onClose} 
                        disabled={isDeleting} 
                        className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 font-bold text-sm transition-colors"
                    >
                        Cancelar
                    </button>
                    <button 
                        onClick={onConfirm} 
                        disabled={isDeleting} 
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-bold text-sm flex items-center shadow-md transition-colors"
                    >
                        {isDeleting && <Loader2 className="animate-spin mr-2" size={16}/>}
                        Excluir
                    </button>
                </div>
            </div>
        </div>
    );
};

const BOMPage: React.FC = () => {
    const [products, setProducts] = useState<Product[]>([]);
    const [materials, setMaterials] = useState<RawMaterial[]>([]);
    const [selectedProduct, setSelectedProduct] = useState<number | null>(null);
    const [bomItems, setBomItems] = useState<ProductBOM[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingBom, setLoadingBom] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Form State
    const [isEditingId, setIsEditingId] = useState<string | null>(null);
    const [formMatId, setFormMatId] = useState('');
    const [formQty, setFormQty] = useState('');

    // Delete State
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        const init = async () => {
            const [p, m] = await Promise.all([fetchProducts(), fetchMaterials()]);
            setProducts(p);
            setMaterials(m);
            setLoading(false);
        };
        init();
    }, []);

    useEffect(() => {
        if (selectedProduct) {
            loadBOM(selectedProduct);
            resetForm();
        } else {
            setBomItems([]);
        }
    }, [selectedProduct]);

    const loadBOM = async (code: number) => {
        setLoadingBom(true);
        const data = await fetchBOM(code);
        setBomItems(data);
        setLoadingBom(false);
    };

    const resetForm = () => {
        setIsEditingId(null);
        setFormMatId('');
        setFormQty('');
        setErrorMsg(null);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg(null);
        if (!selectedProduct || !formMatId || !formQty) return;
        try {
            await saveBOM({
                id: isEditingId || '', 
                productCode: selectedProduct,
                materialId: formMatId,
                quantityRequired: Number(formQty)
            });
            resetForm();
            loadBOM(selectedProduct);
        } catch (e) { setErrorMsg("Erro ao salvar item: " + formatError(e)); }
    };

    const handleEdit = (item: ProductBOM, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsEditingId(item.id);
        setFormMatId(item.materialId);
        setFormQty(item.quantityRequired.toString());
        setErrorMsg(null);
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
            await deleteBOMItem(deleteId);
            if (selectedProduct) await loadBOM(selectedProduct);
            setDeleteId(null);
        } catch (e) { 
            setErrorMsg("Erro ao remover item: " + formatError(e));
            setDeleteId(null); // Close modal even on error to show message
        } finally {
            setIsDeleting(false);
        }
    };

    const getCategoryIcon = (cat?: MaterialCategory) => {
        switch(cat) {
            case 'packaging': return <Box size={14} className="text-orange-500"/>;
            case 'energy': return <Zap size={14} className="text-yellow-500"/>;
            case 'labor': return <User size={14} className="text-blue-500"/>;
            case 'raw_material': return <Hammer size={14} className="text-slate-500"/>;
            default: return <Hammer size={14} className="text-slate-500"/>;
        }
    };

    const getCategoryLabel = (cat?: MaterialCategory) => {
        switch(cat) {
            case 'packaging': return 'Embalagem';
            case 'energy': return 'Energia';
            case 'labor': return 'Mão de Obra';
            case 'raw_material': return 'Matéria Prima';
            default: return 'Outros';
        }
    };

    if (loading) return <div className="p-8 text-center"><Loader2 className="animate-spin mx-auto" /></div>;

    // Group items by category
    const groupedItems = bomItems.reduce((acc, item) => {
        const cat = item.material?.category || 'raw_material';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(item);
        return acc;
    }, {} as Record<string, ProductBOM[]>);

    return (
        <div className="flex h-[calc(100vh-100px)] gap-6">
            <DeleteModal 
                isOpen={!!deleteId} 
                onClose={() => setDeleteId(null)} 
                onConfirm={confirmDelete} 
                isDeleting={isDeleting} 
            />

            {/* Sidebar de Produtos */}
            <div className="w-1/3 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col">
                <div className="p-4 border-b border-slate-100 bg-slate-50 rounded-t-xl">
                    <h3 className="font-bold text-slate-700">Selecione o Produto</h3>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {products.map(p => (
                        <button
                            key={p.codigo}
                            onClick={() => setSelectedProduct(p.codigo)}
                            className={`w-full text-left p-3 rounded-lg text-sm transition-colors ${
                                selectedProduct === p.codigo 
                                ? 'bg-brand-50 text-brand-700 font-bold ring-1 ring-brand-200' 
                                : 'text-slate-600 hover:bg-slate-50'
                            }`}
                        >
                            <div className="flex justify-between">
                                <span>{p.produto}</span>
                                <span className="font-mono text-xs opacity-50">{p.codigo}</span>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Painel de Receita */}
            <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col relative">
                {selectedProduct ? (
                    <>
                        <div className="p-6 border-b border-slate-100">
                            <h2 className="text-2xl font-bold text-slate-800 flex items-center">
                                <Wrench className="mr-3 text-brand-600" />
                                Ficha Técnica (BOM)
                            </h2>
                            <p className="text-slate-500">
                                Recursos consumidos para <b>1 unidade</b> de {products.find(p => p.codigo === selectedProduct)?.produto}.
                            </p>
                        </div>

                        {errorMsg && (
                            <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center">
                                <AlertCircle size={20} className="mr-2 flex-shrink-0" />
                                <span className="text-sm font-medium">{errorMsg}</span>
                                <button onClick={() => setErrorMsg(null)} className="ml-auto text-red-500 hover:text-red-700"><X size={16}/></button>
                            </div>
                        )}

                        <div className="flex-1 p-6 overflow-y-auto">
                            {loadingBom ? <div className="flex justify-center py-10"><Loader2 className="animate-spin text-brand-500" /></div> : (
                                <div className="space-y-6">
                                    {Object.entries(groupedItems).map(([cat, items]) => (
                                        <div key={cat} className="space-y-2">
                                            <h4 className="text-xs font-bold uppercase text-slate-400 tracking-wider flex items-center gap-2 border-b border-slate-100 pb-1">
                                                {getCategoryIcon(cat as MaterialCategory)} {getCategoryLabel(cat as MaterialCategory)}
                                            </h4>
                                            <table className="w-full text-sm text-left">
                                                <thead className="text-slate-500 font-medium">
                                                    <tr>
                                                        <th className="px-2 py-1 w-1/3">Recurso</th>
                                                        <th className="px-2 py-1">Qtd</th>
                                                        <th className="px-2 py-1">Un</th>
                                                        <th className="px-2 py-1 text-right">Custo Total</th>
                                                        <th className="px-2 py-1 text-right">Ações</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-50">
                                                    {(items as ProductBOM[]).map(item => {
                                                        const unitCost = item.material?.unitCost || 0;
                                                        const totalCost = unitCost * item.quantityRequired;
                                                        
                                                        return (
                                                            <tr key={item.id} className="hover:bg-slate-50 group">
                                                                <td className="px-2 py-2 font-medium text-slate-800">{item.material?.name}</td>
                                                                <td className="px-2 py-2 font-mono text-slate-700">{item.quantityRequired}</td>
                                                                <td className="px-2 py-2 text-slate-500 text-xs">{item.material?.unit}</td>
                                                                <td className="px-2 py-2 text-right font-mono text-xs text-slate-600">
                                                                    R$ {totalCost.toFixed(2)}
                                                                </td>
                                                                <td className="px-2 py-2 text-right">
                                                                    <div className="flex justify-end gap-2">
                                                                        <button 
                                                                            type="button"
                                                                            onClick={(e) => handleEdit(item, e)} 
                                                                            className="text-blue-500 hover:text-blue-700 p-1 rounded hover:bg-blue-50 transition-colors" 
                                                                            title="Editar"
                                                                        >
                                                                            <Edit size={14} className="pointer-events-none"/>
                                                                        </button>
                                                                        <button 
                                                                            type="button"
                                                                            onClick={(e) => handleDeleteClick(item.id, e)} 
                                                                            className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition-colors" 
                                                                            title="Remover"
                                                                        >
                                                                            <Trash2 size={14} className="pointer-events-none"/>
                                                                        </button>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    ))}
                                    {bomItems.length === 0 && (
                                        <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-lg border border-dashed">
                                            Nenhum recurso vinculado a este produto. Adicione abaixo.
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="p-6 bg-slate-50 border-t border-slate-200 rounded-b-xl">
                            <h4 className="font-bold text-slate-700 mb-3 text-sm">
                                {isEditingId ? 'Editar Componente' : 'Adicionar Componente / Recurso'}
                            </h4>
                            <form onSubmit={handleSave} className="flex gap-4 items-end">
                                <div className="flex-1">
                                    <label className="block text-xs font-semibold text-slate-500 mb-1">Recurso</label>
                                    <select 
                                        className="w-full px-3 py-2 border rounded-lg bg-white outline-none focus:ring-2 focus:ring-brand-500"
                                        value={formMatId}
                                        onChange={e => setFormMatId(e.target.value)}
                                        required
                                        disabled={!!isEditingId} 
                                    >
                                        <option value="">Selecione...</option>
                                        {materials.map(m => (
                                            <option key={m.id} value={m.id}>
                                                {m.name} ({m.unit}) - {getCategoryLabel(m.category)}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="w-32">
                                    <label className="block text-xs font-semibold text-slate-500 mb-1">Quantidade</label>
                                    <input 
                                        type="number" 
                                        step="0.0001" 
                                        className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-brand-500"
                                        placeholder="0.00"
                                        value={formQty}
                                        onChange={e => setFormQty(e.target.value)}
                                        required
                                    />
                                </div>
                                <button type="submit" className="bg-brand-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-brand-700 flex items-center h-[42px] shadow-sm transition-all active:scale-95">
                                    <Save size={18} className="mr-1" /> {isEditingId ? 'Atualizar' : 'Adicionar'}
                                </button>
                                {isEditingId && (
                                    <button type="button" onClick={resetForm} className="bg-white border border-slate-300 text-slate-600 px-4 py-2 rounded-lg font-bold hover:bg-slate-50 flex items-center h-[42px] transition-all">
                                        <X size={18} className="mr-1" /> Cancelar
                                    </button>
                                )}
                            </form>
                        </div>
                    </>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400">
                        <Wrench size={48} className="mb-4 opacity-20" />
                        <p>Selecione um produto ao lado para editar a receita.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default BOMPage;