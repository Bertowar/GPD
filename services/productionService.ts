import { supabase } from './supabaseClient';
import { ProductionEntry, AppAlert, ProductionOrder, MachineStatus, DashboardSummary } from '../types';
import { SYSTEM_OPERATOR_ID } from '../constants';
import { formatError } from './utils';
import { processStockDeduction, processScrapGeneration } from './inventoryService';
import { fetchSettings } from './masterDataService';

// --- Helpers ---

const mapEntryFromDB = (data: any): ProductionEntry => ({
  id: data.id,
  date: data.date,
  shift: data.shift,
  operatorId: data.operator_id,
  productCode: data.product_code,
  machineId: data.machine_id,
  startTime: data.start_time,
  endTime: data.end_time,
  qtyOK: data.qty_ok,
  qtyDefect: data.qty_defect,
  scrapReasonId: data.scrap_reason_id,
  observations: data.observations,
  createdAt: Number(data.created_at),
  downtimeMinutes: data.downtime_minutes || 0,
  downtimeTypeId: data.downtime_type_id,
  metaData: data.meta_data || {},
  productionOrderId: data.production_order_id
});

const mapEntryToDB = (entry: ProductionEntry) => ({
  id: entry.id,
  date: entry.date,
  shift: entry.shift || null,
  operator_id: entry.operatorId,
  product_code: entry.productCode || null,
  machine_id: entry.machineId,
  start_time: entry.startTime || null,
  end_time: entry.endTime || null,
  qty_ok: entry.qtyOK || 0,
  qty_defect: entry.qtyDefect || 0,
  scrap_reason_id: entry.scrapReasonId || null,
  observations: entry.observations,
  created_at: entry.createdAt,
  downtime_minutes: entry.downtimeMinutes || 0,
  downtime_type_id: entry.downtimeTypeId || null,
  meta_data: entry.metaData || {},
  production_order_id: entry.productionOrderId || null
});

const mapAlertFromDB = (data: any): AppAlert => ({
  id: data.id,
  type: data.type,
  title: data.title,
  message: data.message,
  severity: data.severity,
  createdAt: Number(data.created_at),
  isRead: data.is_read,
  relatedEntryId: data.related_entry_id
});

const mapAlertToDB = (alert: AppAlert) => ({
  id: alert.id,
  type: alert.type,
  title: alert.title,
  message: alert.message,
  severity: alert.severity,
  created_at: alert.createdAt,
  is_read: alert.isRead,
  related_entry_id: alert.relatedEntryId
});

// --- Production Entries (CORE) ---

// DEPRECATED for direct use: Use registerProductionEntry (RPC) instead
export const saveEntry = async (entry: ProductionEntry): Promise<void> => {
  if (entry.operatorId === SYSTEM_OPERATOR_ID) {
      const { data } = await supabase.from('operators').select('id').eq('id', SYSTEM_OPERATOR_ID).single();
      if (!data) {
          await supabase.from('operators').insert([{ id: SYSTEM_OPERATOR_ID, name: 'SISTEMA (Inativo)' }]);
      }
  }
  const { error } = await supabase.from('production_entries').upsert([mapEntryToDB(entry)]);
  if (error) throw error;
};

// --- BUSINESS LOGIC HELPERS (SRP Refactoring) ---

const handleQualitySideEffects = async (entry: ProductionEntry): Promise<void> => {
    const isDraft = entry.metaData?.is_draft === true;
    if (isDraft) return;

    // Fetch Dynamic Thresholds
    const settings = await fetchSettings();
    const limitScrap = (settings.maxScrapRate || 5) / 100;
    const limitSludge = (settings.maxSludgeRate || 2) / 100;

    // A) EXTRUSION LOGIC (Separated Sludge vs Refile)
    if (entry.metaData?.extrusion) {
        const borra = Number(entry.metaData.extrusion.borra || 0);
        const refile = Number(entry.metaData.extrusion.refile || 0);
        const producedWeight = Number(entry.metaData.bobbin_weight || 0);
        
        // Total Input Weight = Output (Bobbin) + Waste (Borra + Refile)
        const totalWeight = producedWeight + borra + refile;

        if (totalWeight > 0) {
            // Check 1: Borra (Sludge/Loss) - HIGH SEVERITY
            const sludgeRate = borra / totalWeight;
            if (sludgeRate > limitSludge) {
                const alertId = crypto.randomUUID();
                await saveAlert({
                    id: alertId,
                    type: 'quality',
                    title: 'Perda Total (Borra) Crítica',
                    message: `Taxa de borra de ${(sludgeRate * 100).toFixed(1)}% na máquina ${entry.machineId} excede o limite de ${(limitSludge * 100)}%.`,
                    severity: 'high',
                    createdAt: Date.now(),
                    isRead: false,
                    relatedEntryId: entry.id
                });
            }

            // Check 2: Refile (Scrap/Return) - MEDIUM SEVERITY
            const scrapRate = refile / totalWeight;
            if (scrapRate > limitScrap) {
                const alertId = crypto.randomUUID();
                await saveAlert({
                    id: alertId,
                    type: 'quality',
                    title: 'Alto Volume de Retorno (Refile)',
                    message: `Taxa de refile de ${(scrapRate * 100).toFixed(1)}% na máquina ${entry.machineId} excede o limite de ${(limitScrap * 100)}%.`,
                    severity: 'medium',
                    createdAt: Date.now(),
                    isRead: false,
                    relatedEntryId: entry.id
                });
            }
        }
    } 
    // B) STANDARD LOGIC (Thermoforming etc)
    else if (entry.qtyDefect > 0) {
        const total = entry.qtyOK + entry.qtyDefect;
        if (total === 0) return;

        const defectRate = entry.qtyDefect / total;
        
        if (defectRate > limitScrap) {
            const alertId = crypto.randomUUID();
            await saveAlert({ 
                id: alertId, 
                type: 'quality', 
                title: 'Refugo Alto Detectado', 
                message: `Taxa de ${(defectRate * 100).toFixed(1)}% na máquina ${entry.machineId} excede o limite de ${(limitScrap * 100)}%.`, 
                severity: 'high', 
                createdAt: Date.now(), 
                isRead: false, 
                relatedEntryId: entry.id 
            });
        }
    }
};

/**
 * FACADE PATTERN: Orchestrates the production entry registration with ATOMICITY.
 * Calls a Database RPC (Stored Procedure) to handle Entry + Stock Deduction in a single transaction.
 */
export const registerProductionEntry = async (entry: ProductionEntry, isEditMode: boolean): Promise<void> => {
    
    const isDraft = entry.metaData?.is_draft === true;
    const wasDraft = entry.metaData?.was_draft === true;
    const shouldDeductStock = (!isEditMode && !isDraft) || (isEditMode && !isDraft && wasDraft);

    const dbEntry = mapEntryToDB(entry);
    
    if (entry.operatorId === SYSTEM_OPERATOR_ID) {
       const { data } = await supabase.from('operators').select('id').eq('id', SYSTEM_OPERATOR_ID).single();
       if (!data) await supabase.from('operators').insert([{ id: SYSTEM_OPERATOR_ID, name: 'SISTEMA (Inativo)' }]);
    }

    // ATOMIC TRANSACTION (RPC Call)
    let rpcSuccess = false;
    
    try {
        const { error } = await supabase.rpc('register_production_transaction', {
            p_entry_data: dbEntry,
            p_should_deduct_stock: shouldDeductStock
        });

        if (error) {
            // ERROR HANDLING SPECIFIC TO TYPE MISMATCH (Code 42804)
            // If DB procedure expects jsonb but gets text (or vice versa due to driver serialization),
            // we suppress this specific error and allow the Fallback to run, which works correctly.
            if (error.code === '42804') {
                // Silently ignore "column meta_data is of type jsonb but expression is of type text"
                // Proceed to fallback.
                rpcSuccess = false;
            } else {
                console.warn("RPC 'register_production_transaction' failed. Proceeding with legacy client-side fallback.", error);
                rpcSuccess = false; 
            }
        } else {
            rpcSuccess = true;
        }
    } catch (e: any) {
        console.warn("RPC Exception. Proceeding with legacy client-side fallback.", e);
        rpcSuccess = false;
    }

    // Fallback Logic (Legacy Non-Atomic)
    // Runs if RPC failed OR if specific type error was caught
    if (!rpcSuccess) {
        await saveEntry(entry);
        
        if (shouldDeductStock) {
            try {
                await processStockDeduction(entry);
            } catch (stockErr) {
                console.error("Stock deduction failed in fallback mode:", stockErr);
            }
        }
    }

    // --- NEW: SCRAP GENERATION LOGIC ---
    if (!isDraft && entry.productCode && (entry.qtyOK > 0 || entry.qtyDefect > 0)) {
        await processScrapGeneration(entry);
    }

    await handleQualitySideEffects(entry);
};

export const fetchEntries = async (): Promise<ProductionEntry[]> => {
  try {
    const { data, error } = await supabase.from('production_entries').select('*').order('created_at', { ascending: false });
    if (error) return [];
    return (data || []).map(mapEntryFromDB);
  } catch (e) { return []; }
};

export const fetchEntriesByDate = async (date: string): Promise<ProductionEntry[]> => {
  try {
    const { data, error } = await supabase.from('production_entries').select('*').eq('date', date).order('created_at', { ascending: false });
    if (error) return [];
    return (data || []).map(mapEntryFromDB);
  } catch (e) { return []; }
};

export const getMachineEntriesForDate = async (machineId: string, date: string): Promise<ProductionEntry[]> => {
    try {
        const { data, error } = await supabase
            .from('production_entries')
            .select('*')
            .eq('machine_id', machineId)
            .eq('date', date)
            .order('start_time', { ascending: false });
        
        if (error) throw error;
        return (data || []).map(mapEntryFromDB);
    } catch (e) { return []; }
};

export const deleteEntry = async (id: string): Promise<void> => {
  const { error, count } = await supabase.from('production_entries').delete({ count: 'exact' }).eq('id', id);
  if (error) throw error;
  if (count === 0) throw new Error("Falha na exclusão: Permissão Negada (RLS) ou Registro não encontrado.");
};

// --- VALIDATION & CONTINUITY ---

export const getLastMachineEntry = async (machineId: string, filterType: 'production' | 'downtime'): Promise<ProductionEntry | null> => {
    try {
        let query = supabase
            .from('production_entries')
            .select('*')
            .eq('machine_id', machineId);

        // Filter based on type
        if (filterType === 'downtime') {
            query = query.gt('downtime_minutes', 0);
        } else {
            query = query.or('downtime_minutes.eq.0,downtime_minutes.is.null');
        }
            
        const { data, error } = await query
            .order('date', { ascending: false })
            .order('end_time', { ascending: false })
            .limit(1)
            .single();
        
        if (error || !data) return null;
        return mapEntryFromDB(data);
    } catch { return null; }
};

export const checkTimeOverlap = async (
    machineId: string, 
    date: string, 
    start: string, 
    end: string, 
    isDowntime: boolean, // Ignorado na nova lógica (sobreposição é geral)
    excludeId?: string
): Promise<boolean> => {
    try {
        // Validação Simplificada: (StartA < EndB) AND (EndA > StartB)
        // Isso cobre qualquer tipo de intersecção de horário.
        // Uma máquina não pode ter Produção e Parada ao mesmo tempo.
        let query = supabase
            .from('production_entries')
            .select('id')
            .eq('machine_id', machineId)
            .eq('date', date)
            .lt('start_time', end)
            .gt('end_time', start);

        // Se estiver editando, exclui o ID do próprio registro da busca
        if (excludeId) {
            query = query.neq('id', excludeId);
        }

        const { data, error } = await query;
        if (error) {
            console.error("Erro na verificação de sobreposição:", error);
            // Em caso de erro técnico, não bloqueia (fail-open), mas loga o erro.
            return false; 
        }
        
        return data && data.length > 0;
    } catch (e) {
        return false; 
    }
};

// --- MACHINE STATUS ---

export const fetchMachineStatuses = async (): Promise<Record<string, MachineStatus>> => {
    try {
        const { data, error } = await supabase
            .from('production_entries')
            .select('machine_id, downtime_minutes, created_at, product_code, meta_data')
            .order('created_at', { ascending: false })
            .limit(1000); 

        if (error || !data) return {};

        const statusMap: Record<string, MachineStatus> = {};
        const today = new Date().setHours(0,0,0,0);

        data.forEach((entry: any) => {
            if (!statusMap[entry.machine_id]) {
                const entryDate = new Date(Number(entry.created_at));
                const isLongStop = entry.meta_data?.long_stop === true;
                
                if (isLongStop) {
                    statusMap[entry.machine_id] = { status: 'idle' };
                }
                else if (entryDate.getTime() < (today - 172800000)) { 
                    statusMap[entry.machine_id] = { status: 'idle' };
                } 
                else if (entry.downtime_minutes > 0) {
                    statusMap[entry.machine_id] = { status: 'stopped' };
                } 
                else {
                    statusMap[entry.machine_id] = { 
                        status: 'running',
                        productCode: entry.product_code
                    };
                }
            }
        });
        return statusMap;
    } catch (e) { return {}; }
};

// --- ALERTS ---

export const saveAlert = async (alert: AppAlert): Promise<void> => {
  await supabase.from('alerts').insert([mapAlertToDB(alert)]);
};

export const fetchAlerts = async (): Promise<AppAlert[]> => {
  try {
    const { data } = await supabase.from('alerts').select('*').order('created_at', { ascending: false });
    return (data || []).map(mapAlertFromDB);
  } catch (e) { return []; }
};

export const markAlertAsRead = async (id: string): Promise<void> => {
  await supabase.from('alerts').update({ is_read: true }).eq('id', id);
};

export const getUnreadAlertCount = async (): Promise<number> => {
  try {
    const { count } = await supabase.from('alerts').select('*', { count: 'exact', head: true }).eq('is_read', false);
    return count || 0;
  } catch (e) { return 0; }
};

// --- PRODUCTION PLANNING ---
const LOCAL_OPS_KEY = 'pplast_local_ops';
export const fetchProductionOrders = async (): Promise<ProductionOrder[]> => {
    try {
        const { data: orders, error } = await supabase.from('production_orders').select('*, product:products(*)').order('delivery_date', { ascending: true });
        if (error && error.code === '42P01') {
            const localData = localStorage.getItem(LOCAL_OPS_KEY);
            const parsedOrders = localData ? JSON.parse(localData) : [];
            const { data: allProds } = await supabase.from('products').select('*');
            return parsedOrders.map((o: any) => ({ ...o, product: allProds ? allProds.find((p:any) => p.code === o.productCode) : undefined }));
        }
        if (error) throw error;
        const orderIds = orders.map((o:any) => o.id);
        let summaries: any[] = [];
        try { const { data: sumData } = await supabase.from('production_entries').select('production_order_id, qty_ok').in('production_order_id', orderIds); summaries = sumData || []; } catch(e) { }
        
        return orders.map((d: any) => {
             const produced = summaries.filter((s:any) => s.production_order_id === d.id).reduce((acc: number, curr: any) => acc + curr.qty_ok, 0);
             return { 
                 id: d.id, 
                 productCode: d.product_code, 
                 machineId: d.machine_id, 
                 targetQuantity: d.target_quantity, 
                 producedQuantity: produced, 
                 customerName: d.customer_name, 
                 deliveryDate: d.delivery_date, 
                 status: d.status, 
                 priority: d.priority, 
                 notes: d.notes, 
                 createdAt: d.created_at, 
                 product: d.product ? { codigo: d.product.code, produto: d.product.name, descricao: d.product.description } : undefined,
                 metaData: d.meta_data || {} // Map metadata
             }
        });
    } catch (e) { return []; }
};

export const saveProductionOrder = async (order: Partial<ProductionOrder>): Promise<void> => {
    const dbOrder = { 
        id: order.id, 
        product_code: order.productCode, 
        machine_id: order.machineId, 
        target_quantity: order.targetQuantity, 
        customer_name: order.customerName, 
        delivery_date: order.deliveryDate, 
        status: order.status, 
        priority: order.priority, 
        notes: order.notes,
        meta_data: order.metaData || null
    };
    
    let { error } = await supabase.from('production_orders').upsert([dbOrder]);
    
    if (error && (error.code === 'PGRST204' || error.message.includes('meta_data'))) {
        delete dbOrder.meta_data;
        const retry = await supabase.from('production_orders').upsert([dbOrder]);
        if (retry.error) throw retry.error;
    } else if (error) {
        if (error.code === '42P01') {
            const localData = localStorage.getItem(LOCAL_OPS_KEY);
            const orders = localData ? JSON.parse(localData) : [];
            const existingIdx = orders.findIndex((o: any) => o.id === order.id);
            const newOrderObj = { ...order, createdAt: new Date().toISOString() };
            if (existingIdx >= 0) { orders[existingIdx] = { ...orders[existingIdx], ...newOrderObj }; } else { orders.push(newOrderObj); }
            localStorage.setItem(LOCAL_OPS_KEY, JSON.stringify(orders));
            return;
        }
        throw error;
    }
};

export const deleteProductionOrder = async (id: string): Promise<void> => {
    let linkedCount = 0;
    try { 
        const { count, error } = await supabase.from('production_entries').select('id', { count: 'exact', head: true }).eq('production_order_id', id); 
        if (!error && count) linkedCount = count;
    } catch(e) {}

    if (linkedCount > 0) throw new Error("Não é possível excluir OP com apontamentos vinculados.");

    const { error } = await supabase.from('production_orders').delete().eq('id', id);
    if (error) {
        if (error.code === '42P01') {
            const localData = localStorage.getItem(LOCAL_OPS_KEY);
            if (localData) { 
                const orders = JSON.parse(localData); 
                const filtered = orders.filter((o: any) => o.id !== id); 
                localStorage.setItem(LOCAL_OPS_KEY, JSON.stringify(filtered)); 
            }
            return;
        }
        if (error.code === '23503') throw new Error("Não é possível excluir OP com apontamentos vinculados (Restrição de Integridade).");
        throw error;
    }
};

// --- DASHBOARD AGGREGATION (CLIENT-SIDE ROBUST IMPLEMENTATION) ---

export const fetchDashboardStats = async (startDate: string, endDate: string): Promise<DashboardSummary | null> => {
    try {
        // Parallel Fetch for Performance & Robustness
        // We fetch raw entries and master data to aggregate locally, avoiding reliance on specific DB RPCs.
        const [entriesRes, productsRes, operatorsRes, downtimesRes, machinesRes] = await Promise.all([
            supabase.from('production_entries').select('*').gte('date', startDate).lte('date', endDate).order('start_time', { ascending: true }),
            supabase.from('products').select('code, name'),
            supabase.from('operators').select('id, name'),
            supabase.from('downtime_types').select('id, description'),
            supabase.from('machines').select('code, sector') // Fetch Machines for Sector Mapping
        ]);

        if (entriesRes.error) throw entriesRes.error;
        const entries = entriesRes.data || [];

        // Mappers
        const prodMap = new Map<any, string>(productsRes.data?.map((p: any) => [p.code, p.name]) || []);
        const opMap = new Map<any, string>(operatorsRes.data?.map((o: any) => [o.id, o.name]) || []);
        const dtMap = new Map<any, string>(downtimesRes.data?.map((d: any) => [d.id, d.description]) || []);
        const machineSectorMap = new Map<string, string>(machinesRes.data?.map((m: any) => [m.code, m.sector]) || []);

        // Aggregators (Global)
        const productStats: Record<string, {ok: number, defect: number}> = {};
        const operatorStats: Record<string, {ok: number, defect: number}> = {};
        const shiftStats: Record<string, {ok: number, defect: number}> = {};

        // Aggregators (Per Sector)
        const extStats = { producedKg: 0, scrapKg: 0, entriesCount: 0 };
        const tfStats = { producedUnits: 0, scrapUnits: 0, entriesCount: 0 };

        const processedEntries = entries.map((e: any) => {
            const qtyOK = Number(e.qty_ok) || 0;
            const qtyDefect = Number(e.qty_defect) || 0;
            
            const sector = machineSectorMap.get(e.machine_id) || 'Termoformagem'; // Default fallback

            // 1. Sector Specific Logic
            if (sector === 'Extrusão') {
                // Extrusion Production is mainly measured in Kg (bobbin_weight)
                const bobbinKg = e.meta_data?.bobbin_weight ? Number(e.meta_data.bobbin_weight) : 0;
                // If bobbin_weight exists use it, otherwise fallback to qtyOK (if misconfigured but unlikely)
                // Actually, Extrusion form saves Qty as Bobbins count, and Weight separately. 
                // Dashboard asks for "Quantity Produced" in Kg usually for Extrusion.
                extStats.producedKg += bobbinKg > 0 ? bobbinKg : 0; // Don't use qtyOK for Kg unless we assume 1unit=1kg? No.
                
                // Extrusion Scrap is Refile + Borra
                const refile = e.meta_data?.extrusion?.refile ? Number(e.meta_data.extrusion.refile) : 0;
                const borra = e.meta_data?.extrusion?.borra ? Number(e.meta_data.extrusion.borra) : 0;
                extStats.scrapKg += (refile + borra);
                extStats.entriesCount++;
            } else {
                // Termoformagem (Standard)
                tfStats.producedUnits += qtyOK;
                tfStats.scrapUnits += qtyDefect;
                tfStats.entriesCount++;
            }

            // 2. Ranking Logic (Global - Unit based for simplicity in charts)
            const prodName = prodMap.get(e.product_code) || (e.product_code ? `Prod ${e.product_code}` : 'N/A');
            if (e.product_code) { // Only count if production
                if (!productStats[prodName]) productStats[prodName] = { ok: 0, defect: 0 };
                productStats[prodName].ok += qtyOK;
                productStats[prodName].defect += qtyDefect;
            }

            // Operators
            const opName = opMap.get(e.operator_id) || `Op ${e.operator_id}`;
            if (!operatorStats[opName]) operatorStats[opName] = { ok: 0, defect: 0 };
            operatorStats[opName].ok += qtyOK;
            operatorStats[opName].defect += qtyDefect;

            // Shifts
            const shiftName = e.shift || 'Indefinido';
            if (!shiftStats[shiftName]) shiftStats[shiftName] = { ok: 0, defect: 0 };
            shiftStats[shiftName].ok += qtyOK;
            shiftStats[shiftName].defect += qtyDefect;

            return {
                ...e,
                downtime_desc: dtMap.get(e.downtime_type_id)
            };
        });

        // Determine View Mode
        const start = new Date(startDate);
        const end = new Date(endDate);
        const diffDays = Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)); 
        const isShortPeriod = diffDays <= 7; // Treat up to 7 days as short for Gantt

        let machinesPayload: any[] = [];

        if (isShortPeriod) {
            machinesPayload = processedEntries;
        } else {
            const machineAgg: Record<string, number> = {};
            processedEntries.forEach((e: any) => {
                const mid = e.machine_id;
                if (!machineAgg[mid]) machineAgg[mid] = 0;
                machineAgg[mid] += (Number(e.qty_ok) || 0);
            });
            machinesPayload = Object.entries(machineAgg).map(([name, total_qty]) => ({ name, total_qty }));
        }

        // Calculate Quality Rates (Avoid division by zero)
        const extTotal = extStats.producedKg + extStats.scrapKg;
        const extQuality = extTotal > 0 ? (1 - (extStats.scrapKg / extTotal)) * 100 : 100;

        const tfTotal = tfStats.producedUnits + tfStats.scrapUnits;
        const tfQuality = tfTotal > 0 ? (1 - (tfStats.scrapUnits / tfTotal)) * 100 : 100;

        return {
            sectorStats: {
                extrusion: {
                    producedKg: extStats.producedKg,
                    scrapKg: extStats.scrapKg,
                    entriesCount: extStats.entriesCount,
                    qualityRate: extQuality
                },
                thermoforming: {
                    producedUnits: tfStats.producedUnits,
                    scrapUnits: tfStats.scrapUnits,
                    entriesCount: tfStats.entriesCount,
                    qualityRate: tfQuality
                }
            },
            products: Object.entries(productStats).map(([name, s]) => ({ name, ...s })).sort((a,b) => b.ok - a.ok).slice(0, 10),
            operators: Object.entries(operatorStats).map(([name, s]) => ({ name, ...s })).sort((a,b) => b.ok - a.ok),
            shifts: Object.entries(shiftStats).map(([name, s]) => ({ name, ...s })),
            machines: machinesPayload,
            isShortPeriod
        };

    } catch (e) {
        console.error("Dashboard aggregation failed:", e);
        return null;
    }
};