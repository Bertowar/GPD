import React, { useState, useEffect } from 'react';
import { 
  fetchProducts, fetchOperators, fetchMachines, fetchDowntimeTypes, fetchMaterials, fetchScrapReasons, fetchProductCategories, fetchSectors, fetchWorkShifts,
  saveProduct, deleteProduct, saveMachine, deleteMachine, saveOperator, deleteOperator, saveDowntimeType, deleteDowntimeType, saveScrapReason, deleteScrapReason, saveProductCategory, deleteProductCategory, saveSector, deleteSector, saveWorkShift, deleteWorkShift, formatError
} from '../services/storage';
import { Product, Operator, Machine, DowntimeType, MachineSector, RawMaterial, ScrapReason, ProductCategory, Sector, WorkShift } from '../types';
import { Trash2, Edit, Save, Package, Users, Cpu, Timer, AlertCircle, X, Plus, Loader2, AlertTriangle, Layers, Grid, Clock, CheckSquare, Search, XCircle, DollarSign } from 'lucide-react';
import { Input } from '../components/Input';

// --- Interfaces ---
interface SimpleTableProps<T> {
  data: T[];
  columns: { header: string; render: (item: T) => React.ReactNode }[];
  onDelete: (item: T) => void;
  FormComponent: React.FC<{ onSave: () => void; initialData?: T }>;
  onSaveSuccess: () => void;
  footer?: React.ReactNode; // Added Footer Prop
}

const SimpleTable = <T,>({ data, columns, onDelete, FormComponent, onSaveSuccess, footer }: SimpleTableProps<T>) => {
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<T | undefined>(undefined);

  const handleEdit = (item: T) => {
    setEditingItem(item);
    setShowForm(true);
  };

  const handleAddNew = () => {
    setEditingItem(undefined);
    setShowForm(true);
  };

  const handleClose = () => {
    setShowForm(false);
    setEditingItem(undefined);
  };

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <button onClick={handleAddNew} className="flex items-center px-4 py-2 bg-brand-600 text-white rounded-md hover:bg-brand-700 shadow-sm transition-all font-bold text-sm">
            <Plus size={16} className="mr-2" /> Adicionar Novo
        </button>
      </div>

      <div className="overflow-x-auto border rounded-lg shadow-sm">
        <table className="w-full text-sm text-left bg-white">
            <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
                {columns.map((c, i) => <th key={i} className="px-4 py-3 font-semibold text-slate-700 whitespace-nowrap">{c.header}</th>)}
                <th className="px-4 py-3 text-right text-slate-700 font-semibold">Ações</th>
            </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
            {data.length === 0 ? (
                <tr><td colSpan={columns.length + 1} className="p-8 text-center text-slate-400">Nenhum registro encontrado.</td></tr>
            ) : (
                data.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                    {columns.map((c, i) => <td key={i} className="px-4 py-3 whitespace-nowrap">{c.render(item)}</td>)}
                    <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                            <button 
                                onClick={(e) => { e.stopPropagation(); handleEdit(item); }} 
                                className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-md transition-colors" 
                                title="Editar"
                            >
                                <Edit size={16} />
                            </button>
                            <button 
                                onClick={(e) => { e.stopPropagation(); onDelete(item); }} 
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors" 
                                title="Excluir"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    </td>
                    </tr>
                ))
            )}
            </tbody>
            {footer && (
                <tfoot className="bg-slate-50 border-t border-slate-200 font-bold text-slate-800">
                    {footer}
                </tfoot>
            )}
        </table>
      </div>

      {/* MODAL FORM POPUP */}
      {showForm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden scale-100">
                <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
                    <h3 className="text-lg font-bold text-slate-800">
                        {editingItem ? 'Editar Registro' : 'Novo Registro'}
                    </h3>
                    <button onClick={handleClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-500 transition-colors">
                        <X size={24} />
                    </button>
                </div>
                
                <div className="p-6 overflow-y-auto">
                    <FormComponent 
                        initialData={editingItem} 
                        onSave={() => { setShowForm(false); onSaveSuccess(); }} 
                    />
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

// Helper for Schema Warnings
const handleSafeSave = async (saveFn: () => Promise<void>, onSave: () => void, itemName: string) => {
    try {
        await saveFn();
        onSave();
    } catch (e: any) {
        const msg = formatError(e);
        if (msg.includes('AVISO_SCHEMA')) {
            // Mostra o aviso mas considera Sucesso (fecha modal)
            alert(msg.replace('AVISO_SCHEMA: ', '⚠️ Aviso Importante: '));
            onSave();
        } else {
            alert(`Erro ao salvar ${itemName}: ` + msg);
        }
    }
};

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

// --- Inline Forms ---

const ProductForm: React.FC<{ onSave: () => void; initialData?: Product }> = ({ onSave, initialData }) => {
    const [code, setCode] = useState(initialData?.codigo?.toString() || '');
    const [name, setName] = useState(initialData?.produto || '');
    const [desc, setDesc] = useState(initialData?.descricao || '');
    const [weight, setWeight] = useState(initialData?.pesoLiquido?.toString() || '');
    const [cost, setCost] = useState(initialData?.custoUnit?.toString() || '');
    const [category, setCategory] = useState(initialData?.category || 'ARTICULADO');
    const [type, setType] = useState<'FINISHED' | 'INTERMEDIATE' | 'COMPONENT'>(initialData?.type || 'FINISHED');
    const [unit, setUnit] = useState(initialData?.unit || 'un');
    const [scrapId, setScrapId] = useState(initialData?.scrapMaterialId || '');
    // Ensure it's initialized as array
    const [compMachines, setCompMachines] = useState<string[]>(initialData?.compatibleMachines || []);
    
    const [machines, setMachines] = useState<Machine[]>([]);
    const [materials, setMaterials] = useState<RawMaterial[]>([]);
    const [categories, setCategories] = useState<ProductCategory[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => { 
        const loadDependencies = async () => {
            const [m, mat, cats] = await Promise.all([fetchMachines(), fetchMaterials(), fetchProductCategories()]);
            setMachines(m);
            setMaterials(mat);
            setCategories(cats);
        };
        loadDependencies();
    }, []);

    // Effect to handle both Edit (initialData present) and New (initialData undefined)
    useEffect(() => {
        if(initialData) { 
            setCode(initialData.codigo.toString()); 
            setName(initialData.produto); 
            setDesc(initialData.descricao); 
            setWeight(initialData.pesoLiquido.toString()); 
            setCost(initialData.custoUnit.toString());
            setCategory(initialData.category || 'ARTICULADO');
            setType(initialData.type || 'FINISHED');
            setUnit(initialData.unit || 'un');
            setScrapId(initialData.scrapMaterialId || '');
            // Force reset when switching items
            setCompMachines(initialData.compatibleMachines || []);
        } else {
            // Force explicit reset on new item (clean state)
            setCode('');
            setName('');
            setDesc('');
            setWeight('');
            setCost('');
            setCategory('ARTICULADO');
            setType('FINISHED');
            setUnit('un');
            setScrapId('');
            setCompMachines([]);
        }
    }, [initialData]);

    const handleMachineToggle = (code: string) => {
        setCompMachines(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);
    };

    const handleSubmit = async (e: React.FormEvent) => { 
        e.preventDefault(); 
        setIsSubmitting(true);
        try {
            if (!code) throw new Error("O código do produto é obrigatório.");

            // FIX: Handle comma vs dot for brazilian users
            const cleanWeight = weight ? weight.replace(',', '.') : '0';
            const cleanCost = cost ? cost.replace(',', '.') : '0';

            const numWeight = Number(cleanWeight);
            const numCost = Number(cleanCost);

            if (isNaN(numWeight)) throw new Error("Peso inválido (verifique vírgulas/pontos)");
            if (isNaN(numCost)) throw new Error("Custo inválido (verifique vírgulas/pontos)");

            await saveProduct({ 
                ...initialData, // Preserve hidden fields
                codigo: Number(code), 
                produto: name, 
                descricao: desc, 
                pesoLiquido: numWeight, 
                custoUnit: numCost,
                category: category,
                type: type,
                unit: unit,
                scrapMaterialId: scrapId || undefined, // Send undefined if empty string
                compatibleMachines: compMachines
            }); 
            onSave(); 
        } catch(e: any) {
            console.error(e);
            alert("Erro ao salvar produto: " + formatError(e));
        } finally {
            setIsSubmitting(false);
        }
    };

    return ( 
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
            <Input label="Cód" value={code} onChange={e => setCode(e.target.value)} required disabled={!!initialData} />
            <Input label="Produto" value={name} onChange={e => setName(e.target.value)} required className="md:col-span-3" />
            <Input label="Descrição" value={desc} onChange={e => setDesc(e.target.value)} className="md:col-span-4" />
            <Input label="Peso (g)" type="text" value={weight} onChange={e => setWeight(e.target.value)} placeholder="0.00" />
            <Input label="Custo (R$)" type="text" value={cost} onChange={e => setCost(e.target.value)} placeholder="0.00" />
            
            <div className="flex flex-col">
                <label className="text-sm font-semibold text-slate-700">Categoria (PCP)</label>
                <select 
                    value={category} 
                    onChange={(e) => setCategory(e.target.value)} 
                    className="px-3 py-2 border rounded-lg bg-white"
                >
                    {categories.map(cat => (
                        <option key={cat.id} value={cat.name}>{cat.name}</option>
                    ))}
                    {!categories.find(c => c.name === category) && category && <option value={category}>{category}</option>}
                    {/* Fallback to display the KIT placeholder correctly if nothing selected */}
                    {!category && <option value="KIT">KIT DE POTE</option>} 
                </select>
            </div>

            <div className="flex flex-col">
                <label className="text-sm font-semibold text-slate-700">Tipo de Produto</label>
                <select 
                    value={type} 
                    onChange={(e) => {
                        const newType = e.target.value as any;
                        setType(newType);
                        // Auto-suggest unit only on explicit type change
                        if (newType === 'INTERMEDIATE') setUnit('kg');
                        else if (newType === 'FINISHED') setUnit('un');
                    }}
                    className="px-3 py-2 border rounded-lg bg-white"
                >
                    <option value="FINISHED">Produto Acabado (Termoformagem)</option>
                    <option value="INTERMEDIATE">Bobina (Extrusão)</option>
                    <option value="COMPONENT">Componente / Outro</option>
                </select>
            </div>

            <div className="flex flex-col">
                <label className="text-sm font-semibold text-slate-700">Unidade de Medida</label>
                <select 
                    value={unit} 
                    onChange={(e) => setUnit(e.target.value)} 
                    className="px-3 py-2 border rounded-lg bg-white"
                >
                    <option value="un">Unidade (un)</option>
                    <option value="kg">Quilo (kg)</option>
                    <option value="mil">Milheiro (mil)</option>
                    <option value="cx">Caixa (cx)</option>
                </select>
            </div>

            <div className="flex flex-col md:col-span-2">
                <label className="text-sm font-semibold text-slate-700">Reciclagem (Aparas/Refugo vira...)</label>
                <select 
                    value={scrapId} 
                    onChange={(e) => setScrapId(e.target.value)} 
                    className="px-3 py-2 border rounded-lg bg-white text-xs"
                >
                    <option value="">- Nenhuma recuperação -</option>
                    {materials.filter(m => m.category === 'raw_material').map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
            </div>

            <div className="md:col-span-4 border border-slate-200 rounded-lg p-3 bg-white">
                <label className="block text-sm font-semibold text-slate-700 mb-2">Máquinas Compatíveis (Deixe vazio para todas)</label>
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                    {machines.map(m => (
                        <button
                            key={m.code}
                            type="button"
                            onClick={() => handleMachineToggle(m.code)}
                            className={`text-xs px-2 py-1 rounded border transition-colors ${
                                compMachines.includes(m.code)
                                ? 'bg-brand-100 text-brand-700 border-brand-300 font-bold'
                                : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                            }`}
                        >
                            {m.code}
                        </button>
                    ))}
                </div>
            </div>

            <button 
                type="submit" 
                disabled={isSubmitting}
                className="md:col-span-4 bg-green-600 text-white py-3 rounded-lg flex items-center justify-center font-bold hover:bg-green-700 disabled:opacity-50 mt-4"
            >
                {isSubmitting ? <Loader2 className="animate-spin mr-2" /> : <Save size={18} className="mr-2" />}
                {isSubmitting ? 'Salvando...' : 'Salvar Produto'}
            </button>
        </form> 
    );
};

const OperatorForm: React.FC<{ onSave: () => void; initialData?: Operator }> = ({ onSave, initialData }) => {
    const [name, setName] = useState(initialData?.name || '');
    const [sector, setSector] = useState(initialData?.sector || '');
    const [shiftId, setShiftId] = useState(initialData?.defaultShift || '');
    const [role, setRole] = useState(initialData?.role || '');
    const [salary, setSalary] = useState(initialData?.baseSalary?.toString() || '');
    const [admission, setAdmission] = useState(initialData?.admissionDate || '');
    const [termination, setTermination] = useState(initialData?.terminationDate || '');
    const [active, setActive] = useState(initialData?.active !== undefined ? initialData.active : true);
    
    const [sectorsList, setSectorsList] = useState<Sector[]>([]);
    const [shifts, setShifts] = useState<WorkShift[]>([]);

    useEffect(() => {
        const loadDeps = async () => {
            const [s, w] = await Promise.all([fetchSectors(), fetchWorkShifts()]);
            setSectorsList(s);
            setShifts(w);
        };
        loadDeps();

        if(initialData) {
            setName(initialData.name);
            setSector(initialData.sector || '');
            setShiftId(initialData.defaultShift || '');
            setRole(initialData.role || '');
            setSalary(initialData.baseSalary?.toString() || '');
            setAdmission(initialData.admissionDate || '');
            setTermination(initialData.terminationDate || '');
            setActive(initialData.active !== undefined ? initialData.active : true);
        }
    }, [initialData]);

    useEffect(() => {
        if (termination) {
            setActive(false);
        }
    }, [termination]);

    const handleSubmit = async (e: React.FormEvent) => { 
        e.preventDefault(); 
        const cleanSalary = salary ? parseFloat(salary.replace(',', '.')) : 0;
        if (isNaN(cleanSalary)) { alert("Salário inválido"); return; }

        await handleSafeSave(async () => {
            await saveOperator({ 
                id: initialData?.id || 0,
                name,
                sector,
                defaultShift: shiftId,
                role,
                baseSalary: cleanSalary,
                admissionDate: admission,
                terminationDate: termination,
                active
            });
        }, onSave, "operador");
    };

    return ( 
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4">
            <Input label="Nome Completo" value={name} onChange={e => setName(e.target.value)} required className="md:col-span-2" />
            
            <div className="flex flex-col">
                <label className="text-sm font-semibold text-slate-700">Setor</label>
                <select 
                    value={sector} 
                    onChange={(e) => setSector(e.target.value)} 
                    className="px-3 py-2 border rounded-lg bg-white"
                >
                    <option value="">Indefinido</option>
                    {sectorsList.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
            </div>

            <div className="flex flex-col">
                <label className="text-sm font-semibold text-slate-700">Turno Padrão</label>
                <select 
                    value={shiftId} 
                    onChange={(e) => setShiftId(e.target.value)} 
                    className="px-3 py-2 border rounded-lg bg-white"
                >
                    <option value="">Todos / Flexível</option>
                    {shifts.map(s => <option key={s.id} value={s.id}>{s.name} ({s.startTime}-{s.endTime})</option>)}
                </select>
            </div>

            <Input label="Função / Cargo" value={role} onChange={e => setRole(e.target.value)} />
            
            <Input label="Salário Base (R$)" value={salary} onChange={e => setSalary(e.target.value)} placeholder="0.00" />
            <Input label="Data Admissão" type="date" value={admission} onChange={e => setAdmission(e.target.value)} />
            <Input label="Data Demissão" type="date" value={termination} onChange={e => setTermination(e.target.value)} />
            
            <div className="flex items-center mt-6">
                <input 
                    type="checkbox" 
                    id="op_active" 
                    checked={active} 
                    onChange={e => setActive(e.target.checked)} 
                    className="w-5 h-5 text-green-600 rounded focus:ring-green-500"
                />
                <label htmlFor="op_active" className="ml-2 font-bold text-slate-700">Funcionário Ativo</label>
            </div>

            <button type="submit" className="md:col-span-4 mt-2 px-4 py-3 bg-green-600 text-white rounded-lg flex items-center justify-center font-bold hover:bg-green-700">
                <Save size={18} className="mr-2" /> Salvar Operador
            </button>
        </form> 
    );
};

const DowntimeForm: React.FC<{ onSave: () => void; initialData?: DowntimeType }> = ({ onSave, initialData }) => {
    const [id, setId] = useState(initialData?.id || '');
    const [desc, setDesc] = useState(initialData?.description || '');
    const [exempt, setExempt] = useState(initialData?.exemptFromOperator || false);
    const [sector, setSector] = useState(initialData?.sector || '');
    const [sectorsList, setSectorsList] = useState<Sector[]>([]);

    useEffect(() => { 
        const loadSectors = async () => {
            const s = await fetchSectors();
            setSectorsList(s);
        };
        loadSectors();

        if(initialData) { 
            setId(initialData.id); 
            setDesc(initialData.description);
            setExempt(initialData.exemptFromOperator || false);
            setSector(initialData.sector || '');
        } 
    }, [initialData]);

    const handleSubmit = async (e: React.FormEvent) => { 
        e.preventDefault(); 
        await handleSafeSave(async () => {
            await saveDowntimeType({ 
                id, 
                description: desc,
                exemptFromOperator: exempt,
                sector: sector || undefined 
            });
        }, onSave, "parada");
    };

    return ( 
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="w-full">
                <Input label="Cód" value={id} onChange={e => setId(e.target.value)} required disabled={!!initialData} />
            </div>
            <div className="w-full md:col-span-2">
                <Input label="Descrição" value={desc} onChange={e => setDesc(e.target.value)} required />
            </div>
            
            <div className="flex flex-col">
                <label className="text-sm font-semibold text-slate-700">Setor</label>
                <select 
                    value={sector} 
                    onChange={(e) => setSector(e.target.value)} 
                    className="px-3 py-2 border border-slate-200 rounded-lg bg-white h-[42px]"
                >
                    <option value="">Global / Todos</option>
                    {sectorsList.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
            </div>

            <div className="md:col-span-4 flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                <div className="flex items-center h-10 px-3 border border-slate-200 rounded-lg bg-slate-50">
                    <input 
                        type="checkbox" 
                        id="exempt_op" 
                        checked={exempt} 
                        onChange={e => setExempt(e.target.checked)} 
                        className="w-4 h-4 text-brand-600 rounded focus:ring-brand-500"
                    />
                    <label htmlFor="exempt_op" className="ml-2 text-sm font-bold text-slate-700 cursor-pointer">
                        Isenta Operador?
                    </label>
                </div>
                <button type="submit" className="px-6 py-2 bg-green-600 text-white rounded-lg flex items-center justify-center font-bold hover:bg-green-700">
                    <Save size={18} className="mr-2"/> Salvar Parada
                </button>
            </div>
        </form> 
    );
};

const ScrapForm: React.FC<{ onSave: () => void; initialData?: ScrapReason }> = ({ onSave, initialData }) => {
    const [desc, setDesc] = useState(initialData?.description || '');
    useEffect(() => { if(initialData) setDesc(initialData.description); }, [initialData]);
    const handleSubmit = async (e: React.FormEvent) => { 
        e.preventDefault(); 
        try {
            await saveScrapReason({ id: initialData?.id, description: desc }); 
            onSave(); 
        } catch(e: any) {
            alert("Erro ao salvar motivo de refugo: " + formatError(e));
        }
    };
    return ( <form onSubmit={handleSubmit} className="flex gap-4 items-end"><div className="flex-1"><Input label="Descrição do Defeito" value={desc} onChange={e => setDesc(e.target.value)} required /></div><button type="submit" className="mb-[2px] px-4 py-2 bg-green-600 text-white rounded-lg"><Save size={18} /></button></form> );
};

const CategoryForm: React.FC<{ onSave: () => void; initialData?: ProductCategory }> = ({ onSave, initialData }) => {
    const [name, setName] = useState(initialData?.name || '');
    useEffect(() => { if(initialData) setName(initialData.name); }, [initialData]);
    const handleSubmit = async (e: React.FormEvent) => { 
        e.preventDefault(); 
        try {
            await saveProductCategory({ id: initialData?.id, name }); 
            onSave(); 
        } catch(e: any) {
            alert("Erro ao salvar categoria: " + formatError(e));
        }
    };
    return ( 
        <form onSubmit={handleSubmit} className="flex gap-4 items-end">
            <div className="flex-1">
                <Input label="Nome da Categoria" value={name} onChange={e => setName(e.target.value)} required className="w-full" placeholder="Ex: KIT" />
            </div>
            <button type="submit" className="mb-[2px] px-4 py-2 bg-green-600 text-white rounded-lg"><Save size={18} /></button>
        </form> 
    );
};

const SectorForm: React.FC<{ onSave: () => void; initialData?: Sector }> = ({ onSave, initialData }) => {
    const [name, setName] = useState(initialData?.name || '');
    useEffect(() => { if(initialData) setName(initialData.name); }, [initialData]);
    const handleSubmit = async (e: React.FormEvent) => { 
        e.preventDefault(); 
        try {
            await saveSector({ id: initialData?.id || '', name, active: true }); 
            onSave(); 
        } catch(e: any) {
            alert("Erro ao salvar setor: " + formatError(e));
        }
    };
    return ( 
        <form onSubmit={handleSubmit} className="flex gap-4 items-end">
            <div className="flex-1">
                <Input label="Nome do Setor" value={name} onChange={e => setName(e.target.value)} required className="w-full" placeholder="Ex: Termoformagem" />
            </div>
            <button type="submit" className="mb-[2px] px-4 py-2 bg-green-600 text-white rounded-lg"><Save size={18} /></button>
        </form> 
    );
};

const WorkShiftForm: React.FC<{ onSave: () => void; initialData?: WorkShift }> = ({ onSave, initialData }) => {
    const [name, setName] = useState(initialData?.name || '');
    const [startTime, setStartTime] = useState(initialData?.startTime || '06:00');
    const [endTime, setEndTime] = useState(initialData?.endTime || '14:00');
    const [sector, setSector] = useState(initialData?.sector || ''); 
    const [sectorsList, setSectorsList] = useState<Sector[]>([]);

    useEffect(() => {
        const loadSectors = async () => {
            const s = await fetchSectors();
            setSectorsList(s);
        };
        loadSectors();

        if(initialData) {
            setName(initialData.name);
            setStartTime(initialData.startTime);
            setEndTime(initialData.endTime);
            setSector(initialData.sector || '');
        }
    }, [initialData]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await handleSafeSave(async () => {
            await saveWorkShift({
                id: initialData?.id || '',
                name,
                startTime,
                endTime,
                active: true,
                sector: sector || undefined
            });
        }, onSave, "turno");
    };

    return (
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
            <div className="md:col-span-2">
                <Input label="Nome do Turno" placeholder="Ex: Manhã" value={name} onChange={e => setName(e.target.value)} required />
            </div>
            
            <div className="flex flex-col">
                <label className="text-sm font-semibold text-slate-700">Setor Específico</label>
                <select 
                    value={sector} 
                    onChange={(e) => setSector(e.target.value)} 
                    className="px-3 py-2 border rounded-lg bg-white h-[42px]"
                >
                    <option value="">Global / Todos</option>
                    {sectorsList.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
            </div>

            <Input label="Início" type="time" value={startTime} onChange={e => setStartTime(e.target.value)} required />
            <Input label="Fim" type="time" value={endTime} onChange={e => setEndTime(e.target.value)} required />
            
            <button type="submit" className="md:col-span-5 bg-green-600 text-white py-3 rounded-lg font-bold hover:bg-green-700 flex items-center justify-center mt-2">
                <Save size={18} className="mr-2" /> Salvar Turno
            </button>
        </form>
    );
};

const MachineForm: React.FC<{ onSave: () => void; initialData?: Machine }> = ({ onSave, initialData }) => {
    const [code, setCode] = useState(initialData?.code || '');
    const [name, setName] = useState(initialData?.name || '');
    const [sector, setSector] = useState<MachineSector>(initialData?.sector || 'Termoformagem');
    const [capacity, setCapacity] = useState(initialData?.productionCapacity?.toString() || ''); 
    const [sectorsList, setSectorsList] = useState<Sector[]>([]);

    useEffect(() => {
        const loadSectors = async () => {
            const s = await fetchSectors();
            setSectorsList(s);
            if (!initialData && s.length > 0) {
                setSector(s[0].name);
            }
        };
        loadSectors();

        if(initialData) { 
            setCode(initialData.code); 
            setName(initialData.name); 
            if(initialData.sector) setSector(initialData.sector);
            if(initialData.productionCapacity) setCapacity(initialData.productionCapacity.toString());
        }
    }, [initialData]);

    const handleSubmit = async (e: React.FormEvent) => { 
        e.preventDefault(); 
        await handleSafeSave(async () => {
            await saveMachine({ 
                ...initialData, 
                code, 
                name, 
                sector,
                productionCapacity: capacity ? Number(capacity) : undefined 
            });
        }, onSave, "máquina");
    };
    
    const capacityLabel = sector === 'Extrusão' ? 'Capacidade (kg/h)' : 'Capacidade Nominal (Ciclos/h)';

    return ( 
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <Input label="Cód" value={code} onChange={e => setCode(e.target.value)} required disabled={!!initialData} />
            <Input label="Nome" value={name} onChange={e => setName(e.target.value)} required className="md:col-span-2" />
            
            <div className="flex flex-col">
                <label className="text-sm font-semibold">Setor</label>
                <select value={sector} onChange={(e) => setSector(e.target.value as any)} className="px-3 py-2 border rounded-lg bg-white">
                    {sectorsList.map(s => (
                        <option key={s.id} value={s.name}>{s.name}</option>
                    ))}
                    {!sectorsList.length && (
                        <>
                           <option value="Termoformagem">Termoformagem</option>
                           <option value="Extrusão">Extrusão</option>
                        </>
                    )}
                </select>
            </div>

            <div className="flex flex-col">
                <Input label={capacityLabel} type="number" value={capacity} onChange={e => setCapacity(e.target.value)} placeholder="0" />
            </div>

            <button type="submit" className="md:col-span-4 bg-green-600 text-white py-2 rounded-lg"><Save size={18} className="mx-auto" /></button>
        </form> 
    );
};

const EngineeringRegistrations: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'products' | 'categories' | 'machines' | 'sectors' | 'operators' | 'downtime' | 'scrap' | 'shifts'>('products');
  
  // Data States
  const [products, setProducts] = useState<Product[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [downtimeTypes, setDowntimeTypes] = useState<DowntimeType[]>([]);
  const [scrapReasons, setScrapReasons] = useState<ScrapReason[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [workShifts, setWorkShifts] = useState<WorkShift[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Delete States
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<any>(null);
  const [deleteType, setDeleteType] = useState<string>('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load Initial Data
  useEffect(() => {
    refreshAllData();
  }, []);

  // Clear search on tab change
  useEffect(() => {
      setSearchTerm('');
  }, [activeTab]);

  const refreshAllData = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
        const [pData, mData, oData, dtData, scData, catData, secData, wData] = await Promise.all([
        fetchProducts(),
        fetchMachines(),
        fetchOperators(),
        fetchDowntimeTypes(),
        fetchScrapReasons(),
        fetchProductCategories(),
        fetchSectors(),
        fetchWorkShifts()
        ]);
        setProducts(pData);
        setMachines(mData);
        setOperators(oData);
        setDowntimeTypes(dtData);
        setScrapReasons(scData);
        setCategories(catData);
        setSectors(secData);
        setWorkShifts(wData);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleDeleteError = (e: any, typeName: string) => {
    console.error(`Erro ao deletar ${typeName}:`, e);
    let msg = `Erro ao excluir ${typeName}.`;
    const safeError = formatError(e);
    
    if (safeError && (safeError.includes('foreign key constraint') || safeError.includes('23503'))) {
        msg = `NÃO FOI POSSÍVEL EXCLUIR: Este ${typeName} está vinculado a outros registros.`;
    } else {
        msg = `Erro: ${safeError || 'Permissão Negada.'}`;
    }
    setErrorMessage(msg);
    setTimeout(() => setErrorMessage(null), 10000);
  };

  const openDeleteModal = (item: any, type: string) => {
    setItemToDelete(item);
    setDeleteType(type);
    setDeleteModalOpen(true);
    setErrorMessage(null);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    setIsDeleting(true);
    
    try {
        if (deleteType === 'produto') await deleteProduct(itemToDelete.codigo);
        else if (deleteType === 'maquina') await deleteMachine(itemToDelete.code);
        else if (deleteType === 'operador') await deleteOperator(itemToDelete.id);
        else if (deleteType === 'parada') await deleteDowntimeType(itemToDelete.id);
        else if (deleteType === 'refugo') await deleteScrapReason(itemToDelete.id);
        else if (deleteType === 'categoria') await deleteProductCategory(itemToDelete.id);
        else if (deleteType === 'setor') await deleteSector(itemToDelete.id);
        else if (deleteType === 'turno') await deleteWorkShift(itemToDelete.id);
        
        await refreshAllData();
        setDeleteModalOpen(false);
        setItemToDelete(null);
    } catch (e: any) {
        handleDeleteError(e, deleteType === 'parada' ? 'tipo de parada' : deleteType);
        setDeleteModalOpen(false);
    } finally {
        setIsDeleting(false);
    }
  };

  const handleRemoveMachineFromProduct = async (product: Product, machineCode: string) => {
    // 1. Filter out the specific machine
    const newMachines = product.compatibleMachines?.filter(m => m !== machineCode) || [];

    try {
        // 2. Save the updated product
        await saveProduct({
            ...product,
            compatibleMachines: newMachines
        });
        // 3. Refresh List
        await refreshAllData();
    } catch (e: any) {
        setErrorMessage("Erro ao remover máquina: " + formatError(e));
        setTimeout(() => setErrorMessage(null), 5000);
    }
  };

  const getDeleteMessage = () => {
    if (!itemToDelete) return '';
    if (deleteType === 'produto') return `Deseja excluir o produto "${itemToDelete.produto}"?`;
    if (deleteType === 'maquina') return `Deseja excluir a máquina "${itemToDelete.name}"?`;
    if (deleteType === 'operador') return `Deseja excluir o operador "${itemToDelete.name}"?`;
    if (deleteType === 'parada') return `Deseja excluir o tipo de parada "${itemToDelete.description}"?`;
    if (deleteType === 'refugo') return `Deseja excluir o motivo "${itemToDelete.description}"?`;
    if (deleteType === 'categoria') return `Deseja excluir a categoria "${itemToDelete.name}"?`;
    if (deleteType === 'setor') return `Deseja excluir o setor "${itemToDelete.name}"?`;
    if (deleteType === 'turno') return `Deseja excluir o turno "${itemToDelete.name}" (${itemToDelete.startTime}-{itemToDelete.endTime})?`;
    return 'Confirmar exclusão?';
  };

  return (
    <div className="space-y-6">
      <DeleteConfirmationModal 
        isOpen={deleteModalOpen} 
        onClose={() => setDeleteModalOpen(false)} 
        onConfirm={confirmDelete} 
        isDeleting={isDeleting}
        title="Confirmar Exclusão"
        message={getDeleteMessage()}
      />

      <div className="flex justify-between items-center">
        <div>
            <h2 className="text-2xl font-bold text-slate-800">Cadastros Gerais</h2>
            <p className="text-slate-500">Dados mestres do sistema: Produtos, Máquinas e Pessoas.</p>
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

      {/* Tabs */}
      <div className="flex space-x-1 border-b border-slate-200 overflow-x-auto pb-1">
        {[
          { id: 'products', label: 'Produtos', icon: Package },
          { id: 'categories', label: 'Categorias Prod.', icon: Layers },
          { id: 'machines', label: 'Máquinas', icon: Cpu },
          { id: 'sectors', label: 'Setores', icon: Grid },
          { id: 'operators', label: 'Operadores', icon: Users },
          { id: 'shifts', label: 'Turnos', icon: Clock },
          { id: 'downtime', label: 'Tipos de Parada', icon: Timer },
          { id: 'scrap', label: 'Motivos de Refugo', icon: AlertTriangle },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-3 text-sm font-medium flex items-center space-x-2 transition-all rounded-t-lg whitespace-nowrap ${
              activeTab === tab.id 
              ? 'border border-b-0 border-slate-200 bg-white text-brand-600 shadow-sm translate-y-px' 
              : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            <tab.icon size={16} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* SEARCH BAR ROW */}
      <div className="bg-slate-100/50 p-2 flex justify-end border-x border-slate-200">
          <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
              <input 
                  type="text" 
                  placeholder={`Buscar em ${activeTab}...`} 
                  className="w-full pl-9 pr-8 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-200 transition-all bg-white"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                  <button onClick={() => setSearchTerm('')} className="absolute right-2 top-2 text-slate-400 hover:text-slate-600">
                      <XCircle size={16} />
                  </button>
              )}
          </div>
      </div>

      <div className="bg-white rounded-b-xl rounded-tr-xl shadow-sm border border-slate-200 p-6 min-h-[500px]">
        {activeTab === 'machines' && <SimpleTable<Machine>
          data={machines.filter(m => 
             !searchTerm || 
             m.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
             m.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
             (m.sector || '').toLowerCase().includes(searchTerm.toLowerCase())
          )}
          columns={[
            { header: 'Código', render: (m: Machine) => <span className="font-mono font-bold text-slate-700">{m.code}</span> },
            { header: 'Nome', render: (m: Machine) => m.name },
            { header: 'Setor', render: (m: Machine) => <span className={`px-2 py-1 rounded text-xs font-semibold bg-blue-100 text-blue-800`}>{m.sector}</span> },
            { header: 'Capacidade', render: (m: Machine) => m.productionCapacity ? <span className="font-mono text-xs">{m.productionCapacity} {m.sector === 'Extrusão' ? 'kg/h' : 'ciclos/h'}</span> : '-' },
            { header: 'Data Aquisição', render: (m: Machine) => m.acquisitionDate ? new Date(m.acquisitionDate).toLocaleDateString() : '-' },
          ]}
          onDelete={(m) => openDeleteModal(m, 'maquina')}
          FormComponent={MachineForm}
          onSaveSuccess={refreshAllData}
        />}

        {activeTab === 'sectors' && <SimpleTable<Sector>
          data={sectors.filter(s => 
             !searchTerm || s.name.toLowerCase().includes(searchTerm.toLowerCase())
          )}
          columns={[
            { header: 'Nome', render: (s: Sector) => <span className="font-bold text-slate-800">{s.name}</span> },
            { 
                header: 'Folha Salarial (Est.)', 
                render: (s: Sector) => {
                    const totalSalary = operators
                        .filter(op => op.sector === s.name && op.active)
                        .reduce((acc, op) => acc + (op.baseSalary || 0), 0);
                    
                    return (
                        <div className="flex flex-col">
                            <span className="font-mono text-xs font-bold text-slate-700">
                                {totalSalary.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </span>
                            <span className="text-[10px] text-slate-400">
                                {operators.filter(op => op.sector === s.name && op.active).length} funcionários
                            </span>
                        </div>
                    );
                } 
            },
          ]}
          footer={
              <>
                <tr>
                    <td className="px-4 py-3 text-right uppercase tracking-wider text-xs font-bold text-slate-500">Total Geral da Folha:</td>
                    <td className="px-4 py-3 font-mono text-base font-bold text-brand-700 bg-brand-50 border-l border-brand-100">
                        {operators
                            .filter(op => op.active)
                            .reduce((acc, op) => acc + (op.baseSalary || 0), 0)
                            .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                    <td></td>
                </tr>
              </>
          }
          onDelete={(s) => openDeleteModal(s, 'setor')}
          FormComponent={SectorForm}
          onSaveSuccess={refreshAllData}
        />}

        {activeTab === 'products' && <SimpleTable<Product>
          data={products.filter(p => 
             !searchTerm || 
             p.produto.toLowerCase().includes(searchTerm.toLowerCase()) || 
             p.codigo.toString().includes(searchTerm) || 
             p.descricao.toLowerCase().includes(searchTerm.toLowerCase())
          )}
          columns={[
            { header: 'Cód', render: (p: Product) => <span className="font-mono text-xs">{p.codigo}</span> },
            { header: 'Produto', render: (p: Product) => (
                <div>
                    <div className="font-bold text-slate-800">{p.produto}</div>
                    <div className="flex gap-2 mt-1">
                        <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${p.type === 'INTERMEDIATE' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-700'}`}>
                            {p.type === 'INTERMEDIATE' ? 'Bobina' : 'Acabado'}
                        </span>
                        <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                            {p.unit || 'un'}
                        </span>
                    </div>
                </div>
            ) },
            { header: 'Compatibilidade', render: (p: Product) => (
                <div className="flex flex-wrap gap-1 max-w-[240px]">
                    {p.compatibleMachines && p.compatibleMachines.length > 0 ? (
                        p.compatibleMachines.map(mCode => (
                            <span key={mCode} className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100 group">
                                {mCode}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation(); // Stop row click
                                        handleRemoveMachineFromProduct(p, mCode);
                                    }}
                                    className="ml-1.5 text-blue-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                                    title="Remover máquina"
                                >
                                    <X size={10} strokeWidth={3} />
                                </button>
                            </span>
                        ))
                    ) : (
                        <span className="text-xs text-slate-400 italic bg-slate-50 px-2 py-1 rounded">Todas (Universal)</span>
                    )}
                </div>
            ) },
            { header: 'Meta (Pç/h)', render: (p: Product) => p.itemsPerHour ? <span className="font-mono bg-slate-100 px-2 rounded">{p.itemsPerHour}</span> : '-' },
            { header: 'Peso', render: (p: Product) => p.pesoLiquido },
            { header: 'Custo', render: (p: Product) => `R$ ${p.custoUnit}` },
          ]}
          onDelete={(p) => openDeleteModal(p, 'produto')}
          FormComponent={ProductForm}
          onSaveSuccess={refreshAllData}
        />}

        {activeTab === 'categories' && <SimpleTable<ProductCategory>
           data={categories.filter(c => 
              !searchTerm || 
              c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
              c.id.toLowerCase().includes(searchTerm.toLowerCase())
           )}
           columns={[
             { header: 'ID / Chave', render: (c: ProductCategory) => <span className="text-slate-400 font-mono text-xs">{c.id}</span> },
             { header: 'Nome da Categoria', render: (c: ProductCategory) => <span className="font-bold text-slate-800">{c.name}</span> },
           ]}
           onDelete={(c) => openDeleteModal(c, 'categoria')}
           FormComponent={CategoryForm}
           onSaveSuccess={refreshAllData}
        />}

        {activeTab === 'operators' && <SimpleTable<Operator>
           data={operators.filter(o => 
              !searchTerm || 
              o.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
              (o.sector || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
              (o.role || '').toLowerCase().includes(searchTerm.toLowerCase())
           )}
           columns={[
             { header: 'Nome', render: (o: Operator) => (
                 <div>
                     <span className={`font-bold ${!o.active ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{o.name}</span>
                     {!o.active && <span className="ml-2 text-[10px] bg-red-100 text-red-600 px-1.5 rounded uppercase font-bold">Inativo</span>}
                 </div>
             ) },
             { header: 'Setor', render: (o: Operator) => <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded">{o.sector || 'Indefinido'}</span> },
             { header: 'Turno', render: (o: Operator) => {
                 const shift = workShifts.find(s => s.id === o.defaultShift);
                 return <span className="text-xs text-slate-600">{shift ? shift.name : 'Flexível'}</span>
             } },
             { header: 'Função', render: (o: Operator) => o.role || '-' },
             { header: 'Admissão', render: (o: Operator) => o.admissionDate ? new Date(o.admissionDate).toLocaleDateString() : '-' },
           ]}
           onDelete={(o) => openDeleteModal(o, 'operador')}
           FormComponent={OperatorForm}
           onSaveSuccess={refreshAllData}
        />}

        {activeTab === 'shifts' && <SimpleTable<WorkShift>
            data={workShifts.filter(s => 
               !searchTerm || s.name.toLowerCase().includes(searchTerm.toLowerCase())
            )}
            columns={[
                { header: 'Nome', render: (s: WorkShift) => <span className="font-bold text-slate-800">{s.name}</span> },
                { header: 'Setor', render: (s: WorkShift) => s.sector ? <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded border border-blue-100">{s.sector}</span> : <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded">Global</span> },
                { header: 'Início', render: (s: WorkShift) => <span className="font-mono bg-slate-100 px-2 py-1 rounded">{s.startTime}</span> },
                { header: 'Fim', render: (s: WorkShift) => <span className="font-mono bg-slate-100 px-2 py-1 rounded">{s.endTime}</span> },
            ]}
            onDelete={(s) => openDeleteModal(s, 'turno')}
            FormComponent={WorkShiftForm}
            onSaveSuccess={refreshAllData}
        />}

        {activeTab === 'downtime' && <SimpleTable<DowntimeType>
           data={downtimeTypes.filter(d => 
              !searchTerm || 
              d.description.toLowerCase().includes(searchTerm.toLowerCase()) || 
              d.id.toLowerCase().includes(searchTerm.toLowerCase())
           )}
           columns={[
             { header: 'Código', render: (d: DowntimeType) => <span className="font-mono font-bold bg-slate-100 px-2 py-1 rounded">{d.id}</span> },
             { header: 'Descrição', render: (d: DowntimeType) => d.description },
             { header: 'Setor', render: (d: DowntimeType) => d.sector ? <span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded border border-blue-100">{d.sector}</span> : <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded">Global</span> },
             { header: 'Regra', render: (d: DowntimeType) => d.exemptFromOperator ? <span className="flex items-center text-orange-600 text-xs font-bold"><CheckSquare size={12} className="mr-1"/> Isenta Operador</span> : '-' },
           ]}
           onDelete={(dt) => openDeleteModal(dt, 'parada')}
           FormComponent={DowntimeForm}
           onSaveSuccess={refreshAllData}
        />}

        {activeTab === 'scrap' && <SimpleTable<ScrapReason>
           data={scrapReasons.filter(s => 
              !searchTerm || s.description.toLowerCase().includes(searchTerm.toLowerCase())
           )}
           columns={[
             { header: 'Descrição', render: (s: ScrapReason) => s.description },
           ]}
           onDelete={(s) => openDeleteModal(s, 'refugo')}
           FormComponent={ScrapForm}
           onSaveSuccess={refreshAllData}
        />}
      </div>
    </div>
  );
};

export default EngineeringRegistrations;