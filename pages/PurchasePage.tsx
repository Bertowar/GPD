

import React, { useState, useEffect, useMemo } from 'react';
import { fetchMaterials, fetchSuppliers, saveSupplier, deleteSupplier, fetchPurchaseOrders, savePurchaseOrder, deletePurchaseOrder, savePurchaseItem, deletePurchaseItem, fetchPurchaseItems, receivePurchaseOrder, formatError } from '../services/storage';
import { RawMaterial, Supplier, PurchaseOrder, PurchaseOrderItem } from '../types';
import { ShoppingCart, Plus, Users, Loader2, AlertCircle, Save, Trash2, CheckCircle, Package, Calendar, ArrowDownCircle, Edit, X } from 'lucide-react';
import { Input } from '../components/Input';

const PurchasePage: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'suggestions' | 'orders' | 'suppliers'>('suggestions');
    const [loading, setLoading] = useState(true);
    
    const [materials, setMaterials] = useState<RawMaterial[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [orders, setOrders] = useState<PurchaseOrder[]>([]);

    // Modals
    const [supplierModalOpen, setSupplierModalOpen] = useState(false);
    const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
    
    const [orderModalOpen, setOrderModalOpen] = useState(false);
    const [editingOrder, setEditingOrder] = useState<PurchaseOrder | null>(null);
    const [orderItems, setOrderItems] = useState<PurchaseOrderItem[]>([]);
    
    // Order Form
    const [selSupplierId, setSelSupplierId] = useState('');
    const [dateExp, setDateExp] = useState('');
    const [notes, setNotes] = useState('');
    
    // Add Item Form
    const [addItemMatId, setAddItemMatId] = useState('');
    const [addItemQty, setAddItemQty] = useState('');
    const [addItemCost, setAddItemCost] = useState('');

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        setLoading(true);
        const [m, s, o] = await Promise.all([
            fetchMaterials(),
            fetchSuppliers(),
            fetchPurchaseOrders()
        ]);
        setMaterials(m);
        setSuppliers(s);
        setOrders(o);
        setLoading(false);
    };

    // --- SUGGESTIONS LOGIC ---
    const criticalItems = useMemo(() => {
        return materials.filter(m => m.currentStock <= m.minStock).map(m => ({
            ...m,
            suggestedQty: (m.minStock * 2) - m.currentStock // Suggest restocking up to 2x min
        }));
    }, [materials]);

    // --- HANDLERS ---

    // Supplier
    const handleSaveSupplier = async (e: React.FormEvent) => {
        e.preventDefault();
        if(!editingSupplier) return;
        try {
            await saveSupplier(editingSupplier);
            setSupplierModalOpen(false);
            const s = await fetchSuppliers();
            setSuppliers(s);
        } catch (e) { alert("Erro: " + formatError(e)); }
    };

    const handleDeleteSupplier = async (id: string) => {
        if(!confirm("Excluir fornecedor?")) return;
        try {
            await deleteSupplier(id);
            const s = await fetchSuppliers();
            setSuppliers(s);
        } catch (e) { alert("Erro: " + formatError(e)); }
    };

    // Orders
    const handleOpenOrder = async (order?: PurchaseOrder) => {
        if (order) {
            setEditingOrder(order);
            setSelSupplierId(order.supplierId);
            setDateExp(order.dateExpected || '');
            setNotes(order.notes || '');
            const items = await fetchPurchaseItems(order.id);
            setOrderItems(items);
        } else {
            setEditingOrder(null);
            setSelSupplierId('');
            setDateExp('');
            setNotes('');
            setOrderItems([]);
        }
        setOrderModalOpen(true);
    };

    const handleCreateOrder = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const id = await savePurchaseOrder({
                id: editingOrder?.id || '',
                supplierId: selSupplierId,
                status: editingOrder?.status || 'DRAFT',
                dateExpected: dateExp,
                notes
            });
            if (!editingOrder) {
                // Determine mock Supplier object for UI immediately
                const sup = suppliers.find(s => s.id === selSupplierId);
                setEditingOrder({ id, supplierId: selSupplierId, status: 'DRAFT', dateCreated: new Date().toISOString(), dateExpected: dateExp, notes, supplier: sup });
            }
            const o = await fetchPurchaseOrders();
            setOrders(o);
        } catch (e) { alert("Erro: " + formatError(e)); }
    };

    const handleAddItem = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingOrder || !addItemMatId) return;
        try {
            await savePurchaseItem({
                orderId: editingOrder.id,
                materialId: addItemMatId,
                quantity: Number(addItemQty),
                unitCost: Number(addItemCost)
            });
            const items = await fetchPurchaseItems(editingOrder.id);
            setOrderItems(items);
            setAddItemQty('');
            // Keep cost logic optional: maybe fetch last cost?
        } catch (e) { alert("Erro: " + formatError(e)); }
    };

    const handleQuickOrder = async (material: RawMaterial) => {
        // Quick shortcut to create a draft order for this item
        // 1. Ask Supplier? Simplified: create blank draft then open modal
        alert("Crie um novo pedido e adicione este item.");
        setActiveTab('orders');
        handleOpenOrder();
    };

    const handleReceiveOrder = async (orderId: string) => {
        if (!confirm("Confirmar recebimento? Isso dará entrada automática no estoque.")) return;
        try {
            await receivePurchaseOrder(orderId);
            alert("Estoque atualizado com sucesso!");
            setOrderModalOpen(false);
            loadData();
        } catch(e) { alert("Erro ao receber: " + formatError(e)); }
    };

    const handleDeleteOrder = async (id: string) => {
         if (!confirm("Excluir pedido?")) return;
         try {
             await deletePurchaseOrder(id);
             loadData();
         } catch(e) { alert("Erro: " + formatError(e)); }
    };

    if (loading) return <div className="p-8 text-center"><Loader2 className="animate-spin mx-auto" /></div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800">Compras & Ressuprimento</h2>
                    <p className="text-slate-500">Gestão de Fornecedores e Pedidos de Compra</p>
                </div>
            </div>

            <div className="flex space-x-1 border-b border-slate-200">
                <button onClick={() => setActiveTab('suggestions')} className={`px-4 py-3 text-sm font-medium flex items-center ${activeTab === 'suggestions' ? 'border-b-2 border-brand-600 text-brand-600' : 'text-slate-500'}`}>
                    <AlertCircle size={16} className="mr-2" /> Sugestões de Compra
                    {criticalItems.length > 0 && <span className="ml-2 bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded-full font-bold">{criticalItems.length}</span>}
                </button>
                <button onClick={() => setActiveTab('orders')} className={`px-4 py-3 text-sm font-medium flex items-center ${activeTab === 'orders' ? 'border-b-2 border-brand-600 text-brand-600' : 'text-slate-500'}`}>
                    <ShoppingCart size={16} className="mr-2" /> Pedidos
                </button>
                <button onClick={() => setActiveTab('suppliers')} className={`px-4 py-3 text-sm font-medium flex items-center ${activeTab === 'suppliers' ? 'border-b-2 border-brand-600 text-brand-600' : 'text-slate-500'}`}>
                    <Users size={16} className="mr-2" /> Fornecedores
                </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 min-h-[500px]">
                
                {/* SUGGESTIONS TAB */}
                {activeTab === 'suggestions' && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-bold text-slate-700">Itens com Estoque Crítico</h3>
                        </div>
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-600 font-semibold border-b">
                                <tr>
                                    <th className="px-4 py-2">Item</th>
                                    <th className="px-4 py-2 text-right">Estoque Atual</th>
                                    <th className="px-4 py-2 text-right">Mínimo</th>
                                    <th className="px-4 py-2 text-right">Sugestão Compra</th>
                                    <th className="px-4 py-2 text-center">Ação</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {criticalItems.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-400">Tudo certo! Nenhum item crítico no momento.</td></tr>}
                                {criticalItems.map(m => (
                                    <tr key={m.id} className="hover:bg-red-50/30">
                                        <td className="px-4 py-3 font-medium text-slate-800">{m.name} <span className="text-slate-400 text-xs block">{m.code}</span></td>
                                        <td className="px-4 py-3 text-right font-bold text-red-600">{m.currentStock} {m.unit}</td>
                                        <td className="px-4 py-3 text-right text-slate-500">{m.minStock} {m.unit}</td>
                                        <td className="px-4 py-3 text-right font-bold text-brand-600">{m.suggestedQty.toFixed(2)} {m.unit}</td>
                                        <td className="px-4 py-3 text-center">
                                            <button onClick={() => handleQuickOrder(m)} className="text-xs bg-brand-100 text-brand-700 px-3 py-1.5 rounded hover:bg-brand-200 font-bold">
                                                Comprar
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* ORDERS TAB */}
                {activeTab === 'orders' && (
                    <div>
                        <div className="flex justify-between mb-4">
                            <h3 className="font-bold text-slate-700">Pedidos de Compra</h3>
                            <button onClick={() => handleOpenOrder()} className="bg-brand-600 text-white px-3 py-1.5 rounded text-sm font-bold flex items-center hover:bg-brand-700">
                                <Plus size={16} className="mr-1" /> Novo Pedido
                            </button>
                        </div>
                        <div className="grid grid-cols-1 gap-4">
                            {orders.map(o => (
                                <div key={o.id} onClick={() => handleOpenOrder(o)} className="border rounded-lg p-4 hover:shadow-md cursor-pointer transition-all bg-white relative group">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                                o.status === 'RECEIVED' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
                                            }`}>
                                                {o.status === 'RECEIVED' ? 'Recebido' : 'Rascunho / Pendente'}
                                            </span>
                                            <h4 className="font-bold text-slate-800 mt-1">{o.supplier?.name || 'Fornecedor ñ encontrado'}</h4>
                                            <p className="text-xs text-slate-500">{new Date(o.dateCreated).toLocaleDateString()}</p>
                                        </div>
                                        <Trash2 size={16} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => {e.stopPropagation(); handleDeleteOrder(o.id)}} />
                                    </div>
                                </div>
                            ))}
                            {orders.length === 0 && <div className="text-center text-slate-400 py-10 border border-dashed rounded">Nenhum pedido cadastrado.</div>}
                        </div>
                    </div>
                )}

                {/* SUPPLIERS TAB */}
                {activeTab === 'suppliers' && (
                    <div>
                        <div className="flex justify-between mb-4">
                            <h3 className="font-bold text-slate-700">Base de Fornecedores</h3>
                            <button onClick={() => { setEditingSupplier({id: '', name: '', contactName: '', email: '', phone: ''}); setSupplierModalOpen(true); }} className="bg-brand-600 text-white px-3 py-1.5 rounded text-sm font-bold flex items-center hover:bg-brand-700">
                                <Plus size={16} className="mr-1" /> Novo Fornecedor
                            </button>
                        </div>
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-600 font-semibold border-b">
                                <tr>
                                    <th className="px-4 py-2">Empresa</th>
                                    <th className="px-4 py-2">Contato</th>
                                    <th className="px-4 py-2">Email / Telefone</th>
                                    <th className="px-4 py-2 text-right">Ação</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {suppliers.map(s => (
                                    <tr key={s.id} className="hover:bg-slate-50">
                                        <td className="px-4 py-3 font-bold text-slate-700">{s.name}</td>
                                        <td className="px-4 py-3 text-slate-600">{s.contactName}</td>
                                        <td className="px-4 py-3 text-slate-500">{s.email} <br/> {s.phone}</td>
                                        <td className="px-4 py-3 text-right">
                                            <button onClick={() => { setEditingSupplier(s); setSupplierModalOpen(true); }} className="text-blue-600 hover:underline mr-3">Editar</button>
                                            <button onClick={() => handleDeleteSupplier(s.id)} className="text-red-500 hover:underline">Excluir</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* MODAL FORNECEDOR */}
            {supplierModalOpen && editingSupplier && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-xl w-full max-w-md p-6">
                        <h3 className="font-bold text-lg mb-4">Dados do Fornecedor</h3>
                        <form onSubmit={handleSaveSupplier} className="space-y-4">
                            <Input label="Empresa" value={editingSupplier.name} onChange={e => setEditingSupplier({...editingSupplier, name: e.target.value})} required />
                            <Input label="Nome Contato" value={editingSupplier.contactName || ''} onChange={e => setEditingSupplier({...editingSupplier, contactName: e.target.value})} />
                            <Input label="Email" type="email" value={editingSupplier.email || ''} onChange={e => setEditingSupplier({...editingSupplier, email: e.target.value})} />
                            <Input label="Telefone" value={editingSupplier.phone || ''} onChange={e => setEditingSupplier({...editingSupplier, phone: e.target.value})} />
                            <div className="flex justify-end gap-2 pt-2">
                                <button type="button" onClick={() => setSupplierModalOpen(false)} className="px-4 py-2 border rounded">Cancelar</button>
                                <button type="submit" className="px-4 py-2 bg-brand-600 text-white rounded font-bold">Salvar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL PEDIDO */}
            {orderModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
                        <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                            <h3 className="font-bold text-lg text-slate-800">
                                {editingOrder ? 'Detalhes do Pedido' : 'Novo Pedido'}
                            </h3>
                            <button onClick={() => setOrderModalOpen(false)}><X className="text-slate-400 hover:text-slate-600"/></button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            <form onSubmit={handleCreateOrder} className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-100">
                                <div className="md:col-span-1">
                                    <label className="text-sm font-bold text-slate-700">Fornecedor</label>
                                    <select 
                                        className="w-full p-2 border rounded text-sm mt-1"
                                        value={selSupplierId}
                                        onChange={e => setSelSupplierId(e.target.value)}
                                        required
                                        disabled={!!editingOrder?.id} // Lock supplier after creation
                                    >
                                        <option value="">Selecione...</option>
                                        {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                </div>
                                <Input label="Previsão Entrega" type="date" value={dateExp} onChange={e => setDateExp(e.target.value)} />
                                <Input label="Notas" value={notes} onChange={e => setNotes(e.target.value)} />
                                <button type="submit" className="md:col-span-3 bg-brand-600 text-white py-2 rounded font-bold hover:bg-brand-700 flex items-center justify-center">
                                    <Save size={16} className="mr-2" /> Salvar Cabeçalho
                                </button>
                            </form>

                            {editingOrder?.id && (
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center border-b pb-2">
                                        <h4 className="font-bold text-slate-700">Itens do Pedido</h4>
                                        {editingOrder.status !== 'RECEIVED' && (
                                            <button onClick={() => handleReceiveOrder(editingOrder.id)} className="text-xs bg-green-600 text-white px-3 py-1.5 rounded font-bold hover:bg-green-700 flex items-center">
                                                <ArrowDownCircle size={14} className="mr-1" /> Receber Pedido (Entrada Estoque)
                                            </button>
                                        )}
                                    </div>
                                    
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-slate-50 text-slate-600">
                                            <tr>
                                                <th className="px-4 py-2">Material</th>
                                                <th className="px-4 py-2 text-right">Qtd</th>
                                                <th className="px-4 py-2 text-right">Custo Un.</th>
                                                <th className="px-4 py-2 text-right">Total</th>
                                                <th className="px-4 py-2 text-right"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {orderItems.map(item => (
                                                <tr key={item.id}>
                                                    <td className="px-4 py-2">{item.material?.name}</td>
                                                    <td className="px-4 py-2 text-right font-bold">{item.quantity} {item.material?.unit}</td>
                                                    <td className="px-4 py-2 text-right">R$ {item.unitCost.toFixed(2)}</td>
                                                    <td className="px-4 py-2 text-right">R$ {(item.quantity * item.unitCost).toFixed(2)}</td>
                                                    <td className="px-4 py-2 text-right">
                                                        {editingOrder.status !== 'RECEIVED' && (
                                                            <button onClick={async () => { await deletePurchaseItem(item.id); setOrderItems(await fetchPurchaseItems(editingOrder.id)); }} className="text-red-500"><Trash2 size={14}/></button>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot className="bg-slate-50 font-bold">
                                            <tr>
                                                <td colSpan={3} className="px-4 py-2 text-right">Total Pedido</td>
                                                <td className="px-4 py-2 text-right">R$ {orderItems.reduce((acc, i) => acc + (i.quantity * i.unitCost), 0).toFixed(2)}</td>
                                                <td></td>
                                            </tr>
                                        </tfoot>
                                    </table>

                                    {editingOrder.status !== 'RECEIVED' && (
                                        <form onSubmit={handleAddItem} className="flex gap-4 items-end bg-slate-100 p-3 rounded">
                                            <div className="flex-1">
                                                <label className="text-xs font-bold text-slate-500">Item</label>
                                                <select className="w-full p-2 border rounded text-sm mt-1" value={addItemMatId} onChange={e => {
                                                    setAddItemMatId(e.target.value);
                                                    const mat = materials.find(m => m.id === e.target.value);
                                                    if(mat) setAddItemCost(mat.unitCost.toString());
                                                }}>
                                                    <option value="">Selecione...</option>
                                                    {materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                                </select>
                                            </div>
                                            <div className="w-24">
                                                <Input label="Qtd" type="number" value={addItemQty} onChange={e => setAddItemQty(e.target.value)} />
                                            </div>
                                            <div className="w-24">
                                                <Input label="Custo" type="number" value={addItemCost} onChange={e => setAddItemCost(e.target.value)} />
                                            </div>
                                            <button type="submit" className="h-[42px] bg-blue-600 text-white px-4 rounded font-bold hover:bg-blue-700">
                                                <Plus size={18} />
                                            </button>
                                        </form>
                                    )}
                                </div>
                            )}

                            {!editingOrder?.id && <div className="text-center text-slate-400 border border-dashed py-8">Salve o cabeçalho para adicionar itens.</div>}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PurchasePage;