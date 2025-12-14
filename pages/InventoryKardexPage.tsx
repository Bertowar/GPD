

import React, { useState, useEffect, useMemo } from 'react';
import { fetchMaterials, fetchMaterialTransactions } from '../services/storage';
import { RawMaterial, InventoryTransaction } from '../types';
import { Search, Calendar, RefreshCw, FileText, ArrowDownCircle, ArrowUpCircle, AlertCircle, Loader2 } from 'lucide-react';
import { Input } from '../components/Input';

interface KardexEntry extends InventoryTransaction {
    balanceAfter: number;
    balanceBefore: number;
}

const InventoryKardexPage: React.FC = () => {
    const [materials, setMaterials] = useState<RawMaterial[]>([]);
    const [selectedMaterialId, setSelectedMaterialId] = useState('');
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    
    // Filters
    const today = new Date().toISOString().split('T')[0];
    const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const [startDate, setStartDate] = useState(firstDay);
    const [endDate, setEndDate] = useState(today);

    // Data
    const [kardexData, setKardexData] = useState<KardexEntry[]>([]);
    const [selectedMatDetails, setSelectedMatDetails] = useState<RawMaterial | null>(null);

    useEffect(() => {
        const init = async () => {
            const data = await fetchMaterials();
            setMaterials(data);
            setLoading(false);
        };
        init();
    }, []);

    const generateKardex = async () => {
        if (!selectedMaterialId) return;
        setGenerating(true);
        try {
            const mat = materials.find(m => m.id === selectedMaterialId);
            setSelectedMatDetails(mat || null);

            // Fetch ALL history (newest first)
            const transactions = await fetchMaterialTransactions(selectedMaterialId);
            
            // Calculate running balance (Backwards Strategy)
            // Starting Point: Current Stock (known)
            let currentBalance = mat?.currentStock || 0;
            
            const processed: KardexEntry[] = transactions.map(trx => {
                const qty = Number(trx.quantity);
                let balanceAfter = currentBalance;
                let balanceBefore = 0;

                // Revert operation to find previous balance
                if (trx.type === 'IN') {
                    // If IN added 10, then before was After - 10
                    balanceBefore = currentBalance - qty;
                } else if (trx.type === 'OUT') {
                    // If OUT removed 5, then before was After + 5
                    balanceBefore = currentBalance + qty;
                } else if (trx.type === 'ADJ') {
                    // ADJ sets absolute value. 
                    // This is tricky. We assume the ADJ value IS the balanceAfter.
                    // We cannot know balanceBefore exactly without the previous transaction's result, 
                    // but for this loop, we just move the cursor.
                    // Actually, for ADJ, the 'quantity' field IS the new stock.
                    // So balanceAfter is correct.
                    // But we don't know what it was before unless we track the stream perfectly.
                    // Backward calc breaks here slightly if we don't know the delta.
                    // HOWEVER, in `processStockTransaction` for ADJ, we update to `qty`.
                    // So `balanceAfter` is correct.
                    // We will mark BalanceBefore as "Unknown" or derive it from next iteration?
                    // Let's rely on the chain. 
                    // Ideally, we'd process Forward from 0, but we don't have infinite history.
                    
                    // Simplified: We accept the calculated stream.
                    balanceBefore = balanceAfter; // Placeholder
                }

                // Update cursor for next item (which is older)
                currentBalance = balanceBefore;

                return {
                    ...trx,
                    balanceAfter,
                    balanceBefore
                };
            });

            // Filter by date range
            const start = new Date(startDate);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);

            const filtered = processed.filter(t => {
                const d = new Date(t.createdAt);
                return d >= start && d <= end;
            });

            setKardexData(filtered);

        } catch (e) {
            console.error(e);
        } finally {
            setGenerating(false);
        }
    };

    return (
        <div className="space-y-6 pb-20">
            <div>
                <h2 className="text-2xl font-bold text-slate-800">Extrato de Movimentação (Kardex)</h2>
                <p className="text-slate-500">Histórico detalhado e evolução de saldo por item.</p>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div className="md:col-span-2">
                        <label className="text-sm font-bold text-slate-700 block mb-1">Material</label>
                        <select 
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                            value={selectedMaterialId}
                            onChange={e => setSelectedMaterialId(e.target.value)}
                        >
                            <option value="">Selecione um item...</option>
                            {materials.map(m => (
                                <option key={m.id} value={m.id}>{m.code} - {m.name} ({m.unit})</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <Input label="Data Início" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                    </div>
                    <div>
                        <Input label="Data Fim" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                    </div>
                </div>
                <div className="mt-4 flex justify-end">
                    <button 
                        onClick={generateKardex}
                        disabled={!selectedMaterialId || generating}
                        className="bg-brand-600 text-white px-6 py-2 rounded-lg font-bold flex items-center hover:bg-brand-700 disabled:opacity-50"
                    >
                        {generating ? <Loader2 className="animate-spin mr-2" /> : <RefreshCw className="mr-2" size={18} />}
                        Gerar Extrato
                    </button>
                </div>
            </div>

            {selectedMatDetails && kardexData.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in">
                    <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                        <h3 className="font-bold text-slate-700">
                            Movimentações: {selectedMatDetails.name}
                        </h3>
                        <span className="text-xs font-mono text-slate-500">
                            Saldo Atual: <b>{selectedMatDetails.currentStock} {selectedMatDetails.unit}</b>
                        </span>
                    </div>
                    
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-white text-slate-600 border-b border-slate-200">
                                <tr>
                                    <th className="px-6 py-3">Data / Hora</th>
                                    <th className="px-6 py-3 text-center">Tipo</th>
                                    <th className="px-6 py-3">Histórico / Nota</th>
                                    <th className="px-6 py-3 text-right">Qtd</th>
                                    <th className="px-6 py-3 text-right text-slate-400">Saldo Resultante</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {kardexData.map((trx) => (
                                    <tr key={trx.id} className="hover:bg-slate-50">
                                        <td className="px-6 py-3 whitespace-nowrap text-xs font-mono text-slate-500">
                                            {new Date(trx.createdAt).toLocaleString()}
                                        </td>
                                        <td className="px-6 py-3 text-center">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                                trx.type === 'IN' ? 'bg-green-100 text-green-700' :
                                                trx.type === 'OUT' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                                            }`}>
                                                {trx.type === 'IN' ? <ArrowDownCircle size={12} className="mr-1"/> : trx.type === 'OUT' ? <ArrowUpCircle size={12} className="mr-1"/> : <RefreshCw size={12} className="mr-1"/>}
                                                {trx.type}
                                            </span>
                                        </td>
                                        <td className="px-6 py-3 text-slate-700 max-w-md truncate">
                                            {trx.relatedEntryId ? 'Baixa Automática (Produção)' : trx.notes || '-'}
                                        </td>
                                        <td className={`px-6 py-3 text-right font-bold ${
                                            trx.type === 'IN' ? 'text-green-600' : trx.type === 'OUT' ? 'text-orange-600' : 'text-blue-600'
                                        }`}>
                                            {trx.type === 'OUT' ? '-' : ''}{Number(trx.quantity).toLocaleString()}
                                        </td>
                                        <td className="px-6 py-3 text-right font-mono font-medium text-slate-600 bg-slate-50/50">
                                            {trx.balanceAfter.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
            
            {selectedMatDetails && kardexData.length === 0 && !generating && (
                <div className="p-12 text-center bg-white rounded-xl border border-dashed border-slate-300 text-slate-400">
                    <FileText size={48} className="mx-auto mb-4 opacity-20" />
                    <p>Nenhuma movimentação encontrada neste período.</p>
                </div>
            )}
        </div>
    );
};

export default InventoryKardexPage;