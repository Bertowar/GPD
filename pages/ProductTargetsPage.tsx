
import React, { useState, useEffect, useMemo } from 'react';
import { fetchProducts, updateProductTarget, formatError } from '../services/storage';
import { Product } from '../types';
import { Search, Save, Target, Loader2, CheckCircle, AlertOctagon, Filter, TrendingUp, AlertTriangle, X } from 'lucide-react';

const ProductTargetsPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'SET' | 'UNSET'>('ALL');
  const [msg, setMsg] = useState('');
  const [savingId, setSavingId] = useState<number | null>(null);
  
  // Local state to handle inputs before saving (allows empty strings for UX)
  const [inputValues, setInputValues] = useState<Record<number, string>>({});

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const data = await fetchProducts();
      setProducts(data);
      // Initialize inputs
      const initialInputs: Record<number, string> = {};
      data.forEach(p => {
          initialInputs[p.codigo] = p.itemsPerHour ? p.itemsPerHour.toString() : '';
      });
      setInputValues(initialInputs);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (code: number, val: string) => {
    // Allows typing only numbers and empty string
    const cleanVal = val.replace(/[^0-9]/g, ''); 
    setInputValues(prev => ({ ...prev, [code]: cleanVal }));
  };

  const saveTarget = async (product: Product) => {
    setSavingId(product.codigo);
    const inputValue = inputValues[product.codigo];
    const targetValue = inputValue === '' ? 0 : Number(inputValue);

    try {
        await updateProductTarget(product.codigo, targetValue);
        
        // Update local product state to reflect saved changes
        setProducts(prev => prev.map(p => 
            p.codigo === product.codigo ? { ...p, itemsPerHour: targetValue } : p
        ));

        setMsg(`Meta do produto ${product.produto} atualizada!`);
        setTimeout(() => setMsg(''), 3000);
    } catch (e) {
        console.error(e);
        alert('Erro ao atualizar meta: ' + formatError(e));
    } finally {
        setSavingId(null);
    }
  };

  // Stats Calculation
  const stats = useMemo(() => {
      const total = products.length;
      const set = products.filter(p => p.itemsPerHour && p.itemsPerHour > 0).length;
      const unset = total - set;
      return { total, set, unset };
  }, [products]);

  // Filtering Logic
  const filteredProducts = products.filter(p => {
    const matchesSearch = p.produto.toLowerCase().includes(searchTerm.toLowerCase()) || p.codigo.toString().includes(searchTerm);
    const hasTarget = p.itemsPerHour && p.itemsPerHour > 0;
    
    if (filterType === 'SET') return matchesSearch && hasTarget;
    if (filterType === 'UNSET') return matchesSearch && !hasTarget;
    return matchesSearch;
  });

  if (loading) return <div className="p-12 text-center text-slate-500"><Loader2 className="animate-spin mx-auto mb-2" />Carregando produtos...</div>;

  return (
    <div className="space-y-6 pb-20">
      
      {/* HEADER & STATS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-3">
            <h2 className="text-2xl font-bold text-slate-800">Metas de Produção</h2>
            <p className="text-slate-500">Defina a capacidade padrão (Peças/Hora) para o cálculo de OEE e Eficiência.</p>
          </div>
          
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                  <p className="text-sm font-medium text-slate-500">Total de Produtos</p>
                  <p className="text-2xl font-bold text-slate-800">{stats.total}</p>
              </div>
              <div className="p-3 bg-slate-100 rounded-lg text-slate-600"><Target size={24} /></div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                  <p className="text-sm font-medium text-slate-500">Metas Definidas</p>
                  <p className="text-2xl font-bold text-green-600">{stats.set}</p>
              </div>
              <div className="p-3 bg-green-50 rounded-lg text-green-600"><CheckCircle size={24} /></div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                  <p className="text-sm font-medium text-slate-500">Pendentes (Sem Meta)</p>
                  <p className="text-2xl font-bold text-orange-600">{stats.unset}</p>
              </div>
              <div className="p-3 bg-orange-50 rounded-lg text-orange-600"><AlertTriangle size={24} /></div>
          </div>
      </div>

      {msg && (
        <div className="fixed top-20 right-8 z-50 bg-green-600 text-white px-6 py-3 rounded-lg shadow-xl flex items-center animate-in slide-in-from-right duration-300">
            <CheckCircle size={20} className="mr-2" /> {msg}
        </div>
      )}

      {/* MAIN CONTENT CARD */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col min-h-[600px]">
        
        {/* TOOLBAR */}
        <div className="p-4 border-b border-slate-100 flex flex-col lg:flex-row justify-between lg:items-center gap-4 bg-slate-50/50">
            {/* Filters Tabs */}
            <div className="flex bg-slate-200/50 p-1 rounded-lg self-start lg:self-auto">
                {[
                    { id: 'ALL', label: 'Todos' },
                    { id: 'SET', label: 'Com Meta' },
                    { id: 'UNSET', label: 'Sem Meta' }
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setFilterType(tab.id as any)}
                        className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${
                            filterType === tab.id 
                            ? 'bg-white text-slate-800 shadow-sm' 
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Search */}
            <div className="relative w-full lg:w-72">
                <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
                <input 
                    type="text" 
                    placeholder="Buscar produto..." 
                    className="pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm w-full outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all bg-white"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                />
            </div>
        </div>

        {/* TABLE */}
        <div className="overflow-x-auto flex-1">
            <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-600 font-semibold text-xs uppercase tracking-wider sticky top-0 z-10 border-b border-slate-200">
                    <tr>
                        <th className="px-6 py-4 w-24">Cód.</th>
                        <th className="px-6 py-4">Produto / Descrição</th>
                        <th className="px-6 py-4 w-40">Status</th>
                        <th className="px-6 py-4 w-48">Meta (Peças/Hora)</th>
                        <th className="px-6 py-4 text-right w-32">Ação</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {filteredProducts.map(p => {
                        const currentInput = inputValues[p.codigo] || '';
                        const hasTarget = p.itemsPerHour && p.itemsPerHour > 0;
                        const isModified = (p.itemsPerHour || 0).toString() !== (currentInput === '' ? '0' : currentInput);

                        return (
                            <tr key={p.codigo} className={`group transition-colors ${isModified ? 'bg-orange-50/50' : 'hover:bg-slate-50'}`}>
                                <td className="px-6 py-4 font-mono text-slate-400 font-medium">{p.codigo}</td>
                                <td className="px-6 py-4">
                                    <div className="font-bold text-slate-800 text-base">{p.produto}</div>
                                    <div className="text-xs text-slate-500 mt-0.5 truncate max-w-md">{p.descricao}</div>
                                </td>
                                <td className="px-6 py-4">
                                    {hasTarget ? (
                                        <div className="flex items-center text-green-700 text-xs font-bold bg-green-100 px-2 py-1 rounded w-fit">
                                            <TrendingUp size={14} className="mr-1.5" /> Ativo
                                        </div>
                                    ) : (
                                        <div className="flex items-center text-orange-700 text-xs font-bold bg-orange-100 px-2 py-1 rounded w-fit">
                                            <AlertOctagon size={14} className="mr-1.5" /> Pendente
                                        </div>
                                    )}
                                </td>
                                <td className="px-6 py-4">
                                    <div className={`flex items-center border rounded-lg overflow-hidden transition-all bg-white ${isModified ? 'border-brand-500 ring-2 ring-brand-100' : 'border-slate-300 group-hover:border-slate-400'}`}>
                                        <input 
                                            type="text"
                                            inputMode="numeric" 
                                            className="w-full pl-3 pr-2 py-2 outline-none font-mono font-bold text-slate-800 text-right bg-transparent"
                                            value={currentInput}
                                            onChange={e => handleInputChange(p.codigo, e.target.value)}
                                            placeholder="0"
                                        />
                                        <div className="bg-slate-100 px-3 py-2 text-xs text-slate-500 font-bold border-l border-slate-200">
                                            un/h
                                        </div>
                                    </div>
                                    {isModified && (
                                        <span className="text-[10px] text-brand-600 font-bold mt-1 block animate-pulse">
                                            Alteração pendente
                                        </span>
                                    )}
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <button 
                                        onClick={() => saveTarget(p)}
                                        disabled={savingId === p.codigo || !isModified}
                                        className={`font-bold text-xs px-4 py-2 rounded-lg transition-all flex items-center justify-center ml-auto shadow-sm min-w-[100px] ${
                                            savingId === p.codigo 
                                            ? 'bg-slate-100 text-slate-400 cursor-wait' 
                                            : isModified
                                                ? 'bg-brand-600 text-white hover:bg-brand-700 hover:shadow-md transform hover:-translate-y-0.5'
                                                : 'bg-white border border-slate-200 text-slate-300 cursor-not-allowed'
                                        }`}
                                    >
                                        {savingId === p.codigo ? (
                                            <Loader2 size={16} className="animate-spin" />
                                        ) : (
                                            <>
                                                <Save size={16} className="mr-2" /> Salvar
                                            </>
                                        )}
                                    </button>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            {filteredProducts.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                    <Filter size={48} className="mb-4 opacity-20" />
                    <p>Nenhum produto encontrado com os filtros atuais.</p>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default ProductTargetsPage;
