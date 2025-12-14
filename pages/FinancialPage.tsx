

import React, { useState, useEffect, useMemo } from 'react';
import { fetchProductCosts, fetchAllBOMs, saveProduct } from '../services/storage';
import { ProductCostSummary, ProductBOM, MaterialCategory } from '../types';
import { DollarSign, Search, Loader2, Save, TrendingUp, TrendingDown, PieChart, List, X, Box, Zap, User, Hammer, ChevronLeft, ChevronRight } from 'lucide-react';
import { PieChart as RePieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const COLORS = ['#3b82f6', '#f97316', '#eab308']; // Mat, Pack, Op

const FinancialPage: React.FC = () => {
    const [costData, setCostData] = useState<ProductCostSummary[]>([]);
    const [boms, setBoms] = useState<ProductBOM[]>([]); // Keep BOMs only for details view (lighter)
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedProductCode, setSelectedProductCode] = useState<number | null>(null);
    const [detailsModalOpen, setDetailsModalOpen] = useState(false);

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    useEffect(() => {
        const loadData = async () => {
            // Now fetches pre-calculated data from DB View
            const [costs, b] = await Promise.all([fetchProductCosts(), fetchAllBOMs()]);
            setCostData(costs);
            setBoms(b); // Only needed for detailed BOM drill-down
            setLoading(false);
        };
        loadData();
    }, []);

    // Reset pagination when search changes
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm]);

    // Enhanced Data with Margin Calculation (Client Side is fast for simple math)
    const enhancedData = useMemo(() => {
        return costData.map(c => {
            const margin = c.sellingPrice - c.totalCost;
            const marginPercent = c.sellingPrice > 0 ? (margin / c.sellingPrice) * 100 : 0;
            return { ...c, margin, marginPercent };
        });
    }, [costData]);

    const filteredData = enhancedData.filter(d => 
        d.productName.toLowerCase().includes(searchTerm.toLowerCase()) || 
        d.productCode.toString().includes(searchTerm)
    );

    // Pagination Logic
    const totalPages = Math.ceil(filteredData.length / itemsPerPage);
    const currentData = filteredData.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const handlePriceChange = async (code: number, newPrice: string) => {
        const val = parseFloat(newPrice) || 0;
        
        // Update Local
        setCostData(prev => prev.map(c => c.productCode === code ? { ...c, sellingPrice: val } : c));
        
        // Save DB (Updates product table, trigger updates view)
        try {
            await saveProduct({ codigo: code, sellingPrice: val } as any);
        } catch (e) { console.error("Erro ao salvar preço", e); }
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
            case 'overhead': return 'Indireto';
            default: return 'Outros';
        }
    };

    const selectedCost = selectedProductCode ? enhancedData.find(c => c.productCode === selectedProductCode) : null;
    
    // Items for the selected product BOM (fetched separately or from cache)
    const selectedBOMItems = selectedProductCode ? boms.filter(b => b.productCode === selectedProductCode).map(item => ({
        ...item,
        totalCost: (item.material?.unitCost || 0) * item.quantityRequired
    })).sort((a, b) => b.totalCost - a.totalCost) : [];

    const pieData = selectedCost ? [
        { name: 'Matéria Prima', value: selectedCost.materialCost },
        { name: 'Embalagem', value: selectedCost.packagingCost },
        { name: 'Operacional', value: selectedCost.operationalCost }
    ].filter(d => d.value > 0) : [];

    if (loading) return <div className="p-8 text-center"><Loader2 className="animate-spin mx-auto" /></div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800">Financeiro & Custos</h2>
                    <p className="text-slate-500">Custo Padrão Integrado (Via Materialized View).</p>
                </div>
                <div className="bg-white px-4 py-2 rounded-lg shadow-sm border border-slate-200 flex items-center">
                    <Search className="text-slate-400 mr-2" size={18} />
                    <input 
                        type="text" 
                        placeholder="Buscar produto..." 
                        className="outline-none text-sm"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* LISTA DE PRODUTOS E CUSTOS */}
                <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col min-h-[600px]">
                    <div className="flex-1 overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                                <tr>
                                    <th className="px-4 py-3">Produto</th>
                                    <th className="px-4 py-3 text-right">Custo Ind.</th>
                                    <th className="px-4 py-3 text-right">Preço Venda</th>
                                    <th className="px-4 py-3 text-right">Margem R$</th>
                                    <th className="px-4 py-3 text-right">Margem %</th>
                                    <th className="px-4 py-3 text-center">Detalhes</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {currentData.map((item) => (
                                    <tr key={item.productCode} className={`hover:bg-slate-50 transition-colors ${selectedProductCode === item.productCode ? 'bg-blue-50' : ''}`}>
                                        <td className="px-4 py-3">
                                            <div className="font-bold text-slate-800">{item.productName}</div>
                                            <div className="text-xs text-slate-500">Cod: {item.productCode}</div>
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono text-slate-600">
                                            R$ {item.totalCost.toFixed(2)}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex items-center justify-end space-x-1">
                                                <span className="text-xs text-slate-400">R$</span>
                                                <input 
                                                    type="number" 
                                                    step="0.01" 
                                                    className="w-20 px-2 py-1 border border-slate-300 rounded text-right focus:ring-2 focus:ring-brand-500 outline-none"
                                                    value={item.sellingPrice || ''}
                                                    onChange={e => handlePriceChange(item.productCode, e.target.value)}
                                                    placeholder="0.00"
                                                />
                                            </div>
                                        </td>
                                        <td className={`px-4 py-3 text-right font-bold ${item.margin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                            R$ {item.margin.toFixed(2)}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <span className={`px-2 py-1 rounded text-xs font-bold ${item.marginPercent >= 30 ? 'bg-green-100 text-green-800' : item.marginPercent > 0 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
                                                {item.marginPercent.toFixed(1)}%
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <button 
                                                onClick={() => setSelectedProductCode(item.productCode)}
                                                className="text-brand-600 hover:bg-brand-50 p-1.5 rounded"
                                            >
                                                <PieChart size={18} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {currentData.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="text-center py-10 text-slate-400">
                                            Nenhum produto encontrado.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* PAGINAÇÃO */}
                    {totalPages > 1 && (
                        <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
                            <span className="text-xs text-slate-500">
                                Mostrando <b>{(currentPage - 1) * itemsPerPage + 1}</b> a <b>{Math.min(currentPage * itemsPerPage, filteredData.length)}</b> de <b>{filteredData.length}</b> itens
                            </span>
                            <div className="flex space-x-1">
                                <button 
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className="p-1 rounded hover:bg-slate-200 disabled:opacity-30"
                                >
                                    <ChevronLeft size={20} />
                                </button>
                                <div className="px-3 py-1 bg-white border border-slate-200 rounded text-sm font-medium">
                                    {currentPage} / {totalPages}
                                </div>
                                <button 
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                    className="p-1 rounded hover:bg-slate-200 disabled:opacity-30"
                                >
                                    <ChevronRight size={20} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* DETALHES DO CUSTO (SIDEBAR) */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col h-fit">
                    {selectedCost ? (
                        <>
                            <h3 className="text-lg font-bold text-slate-800 border-b border-slate-100 pb-2 mb-4">
                                Composição do Custo
                            </h3>
                            <div className="mb-2">
                                <p className="text-sm text-slate-500">Produto</p>
                                <p className="font-bold text-brand-700">{selectedCost.productName}</p>
                            </div>

                            <div className="h-48 w-full mb-6 cursor-pointer hover:opacity-90 transition-opacity" onClick={() => setDetailsModalOpen(true)} title="Clique para ver detalhes">
                                {selectedCost.totalCost > 0 ? (
                                    <ResponsiveContainer>
                                        <RePieChart>
                                            <Pie 
                                                data={pieData} 
                                                innerRadius={40} 
                                                outerRadius={70} 
                                                paddingAngle={5} 
                                                dataKey="value"
                                                isAnimationActive={true}
                                            >
                                                {pieData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip formatter={(value: number) => `R$ ${value.toFixed(3)}`} />
                                            <Legend />
                                        </RePieChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="h-full flex items-center justify-center text-slate-400 text-sm italic border-2 border-dashed border-slate-100 rounded-lg">
                                        Sem custos cadastrados na Engenharia (BOM).
                                    </div>
                                )}
                            </div>

                            <div className="space-y-3 text-sm">
                                <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                                    <span className="flex items-center"><div className="w-3 h-3 bg-blue-500 rounded-full mr-2"></div> Materiais</span>
                                    <span className="font-mono">R$ {selectedCost.materialCost.toFixed(3)}</span>
                                </div>
                                <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                                    <span className="flex items-center"><div className="w-3 h-3 bg-orange-500 rounded-full mr-2"></div> Embalagem</span>
                                    <span className="font-mono">R$ {selectedCost.packagingCost.toFixed(3)}</span>
                                </div>
                                <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                                    <span className="flex items-center"><div className="w-3 h-3 bg-yellow-500 rounded-full mr-2"></div> Operacional</span>
                                    <span className="font-mono">R$ {selectedCost.operationalCost.toFixed(3)}</span>
                                </div>
                                <div className="flex justify-between items-center pt-2 font-bold text-slate-800 text-base">
                                    <span>TOTAL</span>
                                    <span>R$ {selectedCost.totalCost.toFixed(3)}</span>
                                </div>
                            </div>

                            <button 
                                onClick={() => setDetailsModalOpen(true)} 
                                className="mt-6 w-full py-2 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg text-xs font-bold flex items-center justify-center transition-colors"
                            >
                                <List size={16} className="mr-2" />
                                Ver Detalhamento Completo
                            </button>
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                            <DollarSign size={48} className="mb-4 opacity-20" />
                            <p className="text-center">Selecione um produto na lista para ver o detalhamento de custos.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* MODAL DETALHAMENTO DE CUSTOS */}
            {detailsModalOpen && selectedCost && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800 flex items-center">
                                    <List className="mr-2 text-brand-600" size={20} />
                                    Detalhamento de Custos
                                </h3>
                                <p className="text-sm text-slate-500 font-mono mt-1">{selectedCost.productName}</p>
                            </div>
                            <button onClick={() => setDetailsModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-full text-slate-500">
                                <X size={20} />
                            </button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-0">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                                    <tr>
                                        <th className="px-6 py-3">Item / Recurso</th>
                                        <th className="px-6 py-3 text-center">Tipo</th>
                                        <th className="px-6 py-3 text-right">Qtd</th>
                                        <th className="px-6 py-3 text-right">Custo Unit.</th>
                                        <th className="px-6 py-3 text-right">Total</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {selectedBOMItems.map((item, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50">
                                            <td className="px-6 py-3 font-medium text-slate-800">
                                                {item.material?.name}
                                            </td>
                                            <td className="px-6 py-3 text-center">
                                                <div className="flex items-center justify-center text-xs text-slate-500" title={getCategoryLabel(item.material?.category)}>
                                                    {getCategoryIcon(item.material?.category)}
                                                </div>
                                            </td>
                                            <td className="px-6 py-3 text-right font-mono text-slate-600">
                                                {item.quantityRequired} <span className="text-[10px] text-slate-400">{item.material?.unit}</span>
                                            </td>
                                            <td className="px-6 py-3 text-right text-slate-500">
                                                R$ {item.material?.unitCost.toFixed(2)}
                                            </td>
                                            <td className="px-6 py-3 text-right font-bold text-slate-700">
                                                R$ {item.totalCost.toFixed(3)}
                                            </td>
                                        </tr>
                                    ))}
                                    {selectedBOMItems.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="px-6 py-8 text-center text-slate-400 italic">
                                                Nenhum item cadastrado na ficha técnica.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                                <tfoot className="bg-slate-50 font-bold border-t border-slate-200">
                                    <tr>
                                        <td colSpan={4} className="px-6 py-3 text-right text-slate-600 uppercase text-xs tracking-wider">Custo Total Industrial</td>
                                        <td className="px-6 py-3 text-right text-brand-700 text-base">
                                            R$ {selectedCost.totalCost.toFixed(3)}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FinancialPage;