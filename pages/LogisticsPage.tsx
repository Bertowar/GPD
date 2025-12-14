
import React, { useState, useEffect } from 'react';
import { fetchShippingOrders, saveShippingOrder, deleteShippingOrder, fetchProducts, fetchShippingItems, saveShippingItem, deleteShippingItem, formatError } from '../services/storage';
import { ShippingOrder, ShippingItem, Product } from '../types';
import { Truck, Plus, Calendar, Trash2, Package, Search, Save, X, Loader2, FileText, ArrowRight } from 'lucide-react';
import { Input } from '../components/Input';
import { useNavigate } from 'react-router-dom';

const LogisticsPage: React.FC = () => {
    const navigate = useNavigate();

    // Orders Data
    const [orders, setOrders] = useState<ShippingOrder[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    
    // Modal State
    const [modalOpen, setModalOpen] = useState(false);
    const [currentOrder, setCurrentOrder] = useState<ShippingOrder | null>(null);
    const [orderItems, setOrderItems] = useState<ShippingItem[]>([]);
    
    // Form Inputs
    const [customer, setCustomer] = useState('');
    const [orderNum, setOrderNum] = useState('');
    const [date, setDate] = useState('');
    const [status, setStatus] = useState<'PENDING' | 'SEPARATED' | 'SHIPPED'>('PENDING');

    // Item Add
    const [newItemProd, setNewItemProd] = useState<number | null>(null);
    const [newItemQty, setNewItemQty] = useState('');

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        setLoading(true);
        try {
             const ords = await fetchShippingOrders();
             const prods = await fetchProducts();
             setOrders(ords);
             setProducts(prods);
        } catch(e) { console.error(e); }
        setLoading(false);
    };

    // --- CRUD HANDLERS ---
    const handleOpenOrder = async (order?: ShippingOrder) => {
        if (order) {
            setCurrentOrder(order);
            setCustomer(order.customerName);
            setOrderNum(order.orderNumber);
            setDate(order.scheduledDate);
            setStatus(order.status);
            const items = await fetchShippingItems(order.id);
            setOrderItems(items);
        } else {
            setCurrentOrder(null);
            setCustomer('');
            setOrderNum('');
            setDate(new Date().toISOString().split('T')[0]);
            setStatus('PENDING');
            setOrderItems([]);
        }
        setModalOpen(true);
    };

    const handleSaveHeader = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const id = await saveShippingOrder({
                id: currentOrder?.id || '',
                customerName: customer,
                orderNumber: orderNum,
                scheduledDate: date,
                status
            });
            if (!currentOrder) {
                setCurrentOrder({ id, customerName: customer, orderNumber: orderNum, scheduledDate: date, status });
            }
            loadData();
        } catch (e) { alert("Erro ao salvar pedido: " + formatError(e)); }
    };

    const handleAddItem = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentOrder || !newItemProd || !newItemQty) return;
        try {
            await saveShippingItem({
                id: '', orderId: currentOrder.id, productCode: newItemProd, quantity: Number(newItemQty)
            });
            const items = await fetchShippingItems(currentOrder.id);
            setOrderItems(items);
            setNewItemQty('');
        } catch (e) { alert("Erro ao adicionar item: " + formatError(e)); }
    };

    const handleDeleteItem = async (id: string) => {
        if (!confirm("Remover item?")) return;
        try {
            await deleteShippingItem(id);
            if (currentOrder) {
                const items = await fetchShippingItems(currentOrder.id);
                setOrderItems(items);
            }
        } catch (e) { alert("Erro ao remover item: " + formatError(e)); }
    };

    const handleDeleteOrder = async (id: string) => {
        if (!confirm("Excluir pedido de expedição?")) return;
        try {
            await deleteShippingOrder(id);
            loadData();
        } catch (e) { alert("Erro ao excluir pedido: " + formatError(e)); }
    };

    if (loading) return <div className="p-8 text-center"><Loader2 className="animate-spin mx-auto" /></div>;

    return (
        <div className="space-y-6 pb-20">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800">Logística e Expedição</h2>
                    <p className="text-slate-500">Gerenciamento de Pedidos e Saída de Materiais</p>
                </div>
                
                {/* Shortcut to the new Import Page */}
                <button 
                    onClick={() => navigate('/logistics/import')}
                    className="bg-white text-slate-600 border border-slate-300 px-4 py-2 rounded-lg font-bold hover:bg-slate-50 shadow-sm flex items-center transition-all"
                >
                    <FileText size={18} className="mr-2 text-brand-600" />
                    Importar Relatório TXT
                    <ArrowRight size={16} className="ml-2 opacity-50" />
                </button>
            </div>

            {/* TAB 1: ORDERS LIST */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in">
                <div className="lg:col-span-3">
                    <div className="flex justify-end mb-4">
                        <button onClick={() => handleOpenOrder()} className="bg-brand-600 text-white px-4 py-2 rounded-lg flex items-center hover:bg-brand-700 font-bold shadow-sm">
                            <Plus size={20} className="mr-2" /> Novo Pedido
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {orders.length === 0 && <div className="text-slate-400 col-span-3 text-center py-10 border border-dashed rounded-xl">Nenhum pedido registrado.</div>}
                        {orders.map(order => (
                            <div 
                                key={order.id} 
                                onClick={() => handleOpenOrder(order)}
                                className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer group relative"
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                                        order.status === 'SHIPPED' ? 'bg-green-100 text-green-700' : 
                                        order.status === 'SEPARATED' ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'
                                    }`}>
                                        {order.status === 'PENDING' ? 'Pendente' : order.status === 'SEPARATED' ? 'Separado' : 'Expedido'}
                                    </span>
                                    <Trash2 
                                        size={16} 
                                        className="text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100" 
                                        onClick={(e) => { e.stopPropagation(); handleDeleteOrder(order.id); }}
                                    />
                                </div>
                                <h3 className="font-bold text-slate-800 text-lg mb-1">{order.customerName}</h3>
                                <div className="flex justify-between text-sm text-slate-500">
                                    <span className="flex items-center"><Package size={14} className="mr-1" /> Ped: {order.orderNumber || 'S/N'}</span>
                                    <span className="flex items-center"><Calendar size={14} className="mr-1" /> {new Date(order.scheduledDate).toLocaleDateString()}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* MODAL EDIT PEDIDO (Existing) */}
            {modalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
                        <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                            <h3 className="font-bold text-lg text-slate-800 flex items-center">
                                <Truck className="mr-2 text-brand-600" />
                                {currentOrder ? 'Editar Expedição' : 'Novo Pedido de Expedição'}
                            </h3>
                            <button onClick={() => setModalOpen(false)}><X className="text-slate-400 hover:text-slate-600" /></button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {/* Header Form */}
                            <form onSubmit={handleSaveHeader} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end bg-slate-50 p-4 rounded-lg border border-slate-100">
                                <div className="md:col-span-2">
                                    <Input label="Cliente / Destino" value={customer} onChange={e => setCustomer(e.target.value)} required />
                                </div>
                                <Input label="Nº Pedido" value={orderNum} onChange={e => setOrderNum(e.target.value)} />
                                <Input label="Data Prevista" type="date" value={date} onChange={e => setDate(e.target.value)} required />
                                
                                <div className="md:col-span-2">
                                    <label className="text-sm font-semibold text-slate-700">Status</label>
                                    <div className="flex space-x-2 mt-1">
                                        {['PENDING', 'SEPARATED', 'SHIPPED'].map(s => (
                                            <button
                                                key={s}
                                                type="button"
                                                onClick={() => setStatus(s as any)}
                                                className={`flex-1 py-2 text-xs font-bold rounded border ${
                                                    status === s 
                                                    ? 'bg-brand-600 text-white border-brand-600' 
                                                    : 'bg-white text-slate-500 border-slate-300 hover:bg-slate-50'
                                                }`}
                                            >
                                                {s === 'PENDING' ? 'PENDENTE' : s === 'SEPARATED' ? 'SEPARADO' : 'ENVIADO'}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <button type="submit" className="md:col-span-2 h-10 bg-brand-600 text-white rounded font-bold hover:bg-brand-700 flex items-center justify-center">
                                    <Save size={18} className="mr-2" /> Salvar Cabeçalho
                                </button>
                            </form>

                            {/* Items Section */}
                            {currentOrder && (
                                <div className="space-y-4">
                                    <h4 className="font-bold text-slate-700 border-b pb-2">Itens do Pedido</h4>
                                    
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-slate-50 text-slate-600">
                                            <tr>
                                                <th className="px-4 py-2">Produto</th>
                                                <th className="px-4 py-2">Quantidade</th>
                                                <th className="px-4 py-2 text-right">Ação</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {orderItems.map(item => (
                                                <tr key={item.id}>
                                                    <td className="px-4 py-2 font-medium">
                                                        {item.product?.produto}
                                                        <span className="block text-xs text-slate-400">{item.productCode}</span>
                                                    </td>
                                                    <td className="px-4 py-2 font-mono font-bold text-slate-700">{item.quantity}</td>
                                                    <td className="px-4 py-2 text-right">
                                                        <button onClick={() => handleDeleteItem(item.id)} className="text-red-500 hover:text-red-700"><Trash2 size={16} /></button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>

                                    {/* Add Item Form */}
                                    <form onSubmit={handleAddItem} className="flex gap-4 items-end bg-blue-50 p-4 rounded-lg border border-blue-100">
                                        <div className="flex-1">
                                            <label className="text-xs font-bold text-slate-500 uppercase">Adicionar Produto</label>
                                            <select 
                                                className="w-full p-2 border rounded text-sm mt-1"
                                                value={newItemProd || ''}
                                                onChange={e => setNewItemProd(Number(e.target.value))}
                                            >
                                                <option value="">Selecione...</option>
                                                {products.filter(p => p.type === 'FINISHED').map(p => (
                                                    <option key={p.codigo} value={p.codigo}>{p.produto}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="w-32">
                                            <Input label="Qtd" type="number" value={newItemQty} onChange={e => setNewItemQty(e.target.value)} placeholder="0" />
                                        </div>
                                        <button type="submit" className="h-[42px] bg-blue-600 text-white px-4 rounded font-bold hover:bg-blue-700 flex items-center">
                                            <Plus size={18} />
                                        </button>
                                    </form>
                                </div>
                            )}
                            {!currentOrder && (
                                <div className="text-center py-10 text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-300">
                                    Salve os dados do pedido para adicionar itens.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LogisticsPage;
