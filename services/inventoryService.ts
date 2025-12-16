import { supabase } from './supabaseClient';
import { RawMaterial, ProductBOM, InventoryTransaction, Supplier, PurchaseOrder, PurchaseOrderItem, ShippingOrder, ShippingItem, ProductCostSummary, ProductionEntry } from '../types';
import { formatError } from './utils';

// --- INVENTORY & BOM ---

export const fetchMaterials = async (): Promise<RawMaterial[]> => {
    try {
        const { data, error } = await supabase.from('raw_materials').select('*').order('name');
        if(error) return [];
        return data.map((d: any) => ({
            id: d.id,
            code: d.code,
            name: d.name,
            unit: d.unit,
            currentStock: d.current_stock,
            minStock: d.min_stock,
            unitCost: d.unit_cost,
            category: d.category || 'raw_material',
            group: d.group_name || 'Diversos', // Map DB column group_name to frontend group
            active: d.active !== false // Default to true if null
        }));
    } catch(e) { return []; }
};

export const saveMaterial = async (mat: RawMaterial): Promise<void> => {
    const dbMat = { 
        code: mat.code, 
        name: mat.name, 
        unit: mat.unit, 
        current_stock: mat.currentStock, 
        min_stock: mat.minStock, 
        unit_cost: mat.unitCost, 
        category: mat.category,
        group_name: mat.group, // Save frontend group to DB column group_name
        active: mat.active !== undefined ? mat.active : true
    };

    // Payload com ID se for edição, ou sem ID se for criação
    const payload = mat.id ? { ...dbMat, id: mat.id } : dbMat;

    const { error } = await supabase.from('raw_materials').upsert([payload], { onConflict: 'code' });
    
    if (error) {
        // FALLBACK: Se o erro for de coluna inexistente (PGRST204 ou mensagem similar), alerta o usuário e tenta salvar sem o grupo
        if (error.code === 'PGRST204' || error.message.includes('Could not find') || error.message.includes('group_name') || error.message.includes('active')) {
            alert(`ATENÇÃO: O Banco de Dados precisa de atualização!\n\nColunas novas (group_name, active) não encontradas.\nExecute este comando no SQL Editor do Supabase:\n\nALTER TABLE raw_materials ADD COLUMN group_name TEXT;\nALTER TABLE raw_materials ADD COLUMN active BOOLEAN DEFAULT TRUE;\n\nO item será salvo provisoriamente.`);
            
            const legacyPayload = { ...payload };
            delete (legacyPayload as any).group_name;
            delete (legacyPayload as any).active;
            
            const { error: legacyError } = await supabase.from('raw_materials').upsert([legacyPayload], { onConflict: 'code' });
            
            if (legacyError) throw legacyError;
        } else {
            throw error;
        }
    }
};

export const renameMaterialGroup = async (oldName: string, newName: string): Promise<void> => {
    if (!oldName || !newName) return;
    // Update all materials that belong to the old group name
    const { error } = await supabase
        .from('raw_materials')
        .update({ group_name: newName })
        .eq('group_name', oldName);
    
    if (error) {
        // Se a coluna não existir, apenas ignora o erro para não travar a UI, logando um aviso
        if (error.code === 'PGRST204' || error.message.includes('Could not find')) {
             console.warn("Aviso: Não foi possível renomear o grupo pois a coluna 'group_name' não existe no banco.");
             return;
        }
        throw error;
    }
};

export const deleteMaterial = async (id: string): Promise<void> => {
    const { error, count } = await supabase.from('raw_materials').delete({ count: 'exact' }).eq('id', id);
    
    if (error) {
        // PostgreSQL foreign_key_violation code (23503)
        if (error.code === '23503') {
            const msg = `BLOQUEIO DE SEGURANÇA: Este item não pode ser excluído pois possui vínculos no sistema.\n\n` +
                        `MOTIVOS PROVÁVEIS:\n` +
                        `1. O material faz parte da Ficha Técnica (Receita) de um Produto.\n` +
                        `2. Existem registros históricos de movimentação (Entrada/Saída).\n` +
                        `3. O material está vinculado a um Pedido de Compra.\n\n` +
                        `COMO PROCEDER:\n` +
                        `- Para remover: Você deve primeiro desvincular o item de todas as receitas e excluir seus históricos.\n` +
                        `- Recomendação: Ao invés de excluir, edite o item e marque como INATIVO para ocultá-lo, mantendo o histórico fiscal.`;
            throw new Error(msg);
        }
        throw error;
    }
    
    if (count === 0) throw new Error("Erro: Material não encontrado ou já excluído.");
};

export const fetchBOM = async (productCode: number): Promise<ProductBOM[]> => {
    try {
        const { data, error } = await supabase.from('product_bom').select('*, material:raw_materials(*)').eq('product_code', productCode);
        if (error) return [];
        return data.map((d: any) => ({
            id: d.id,
            productCode: d.product_code,
            materialId: d.material_id,
            quantityRequired: d.quantity_required,
            material: d.material ? {
                id: d.material.id,
                code: d.material.code,
                name: d.material.name,
                unit: d.material.unit,
                currentStock: d.material.current_stock,
                minStock: d.material.min_stock,
                unitCost: d.material.unit_cost,
                category: d.material.category,
                group: d.material.group_name
            } : undefined
        }));
    } catch(e) { return []; }
};

export const fetchAllBOMs = async (): Promise<ProductBOM[]> => {
    try {
        const { data, error } = await supabase.from('product_bom').select('*, material:raw_materials(*)');
        if (error) return [];
        return data.map((d: any) => ({
            id: d.id,
            productCode: d.product_code,
            materialId: d.material_id,
            quantityRequired: d.quantity_required,
            material: d.material ? {
                id: d.material.id,
                code: d.material.code,
                name: d.material.name,
                unit: d.material.unit,
                currentStock: d.material.current_stock,
                minStock: d.material.min_stock,
                unitCost: d.material.unit_cost,
                category: d.material.category,
                group: d.material.group_name
            } : undefined
        }));
    } catch(e) { return []; }
};

export const saveBOM = async (bom: Omit<ProductBOM, 'material'>): Promise<void> => {
    if (bom.id) {
        const { error } = await supabase.from('product_bom').update({ quantity_required: bom.quantityRequired }).eq('id', bom.id);
        if(error) throw error;
    } else {
        const { error } = await supabase.from('product_bom').insert([{ product_code: bom.productCode, material_id: bom.materialId, quantity_required: bom.quantityRequired }]);
        if(error) throw error;
    }
};

export const deleteBOMItem = async (id: string): Promise<void> => {
    const { error } = await supabase.from('product_bom').delete().eq('id', id);
    if(error) throw error;
};

// --- PURCHASING / SUPPLIERS ---
export const fetchSuppliers = async (): Promise<Supplier[]> => {
    try {
        const { data, error } = await supabase.from('suppliers').select('*').order('name');
        if (error) { if (error.code === '42P01') return []; throw error; }
        return data.map((d: any) => ({ id: d.id, name: d.name, contactName: d.contact_name, email: d.email, phone: d.phone }));
    } catch (e) { return []; }
};
export const saveSupplier = async (supplier: Supplier): Promise<void> => {
    const dbSup = { name: supplier.name, contact_name: supplier.contactName, email: supplier.email, phone: supplier.phone };
    if (supplier.id) { const { error } = await supabase.from('suppliers').update(dbSup).eq('id', supplier.id); if (error) throw error; } 
    else { const { error } = await supabase.from('suppliers').insert([dbSup]); if (error) throw error; }
};
export const deleteSupplier = async (id: string): Promise<void> => { const { error } = await supabase.from('suppliers').delete().eq('id', id); if (error) throw error; };

export const fetchPurchaseOrders = async (): Promise<PurchaseOrder[]> => {
    try {
        const { data, error } = await supabase.from('purchase_orders').select('*, supplier:suppliers(*)').order('created_at', { ascending: false });
        if (error) { if (error.code === '42P01') return []; throw error; }
        return data.map((d: any) => ({ id: d.id, supplierId: d.supplier_id, status: d.status, dateCreated: d.created_at, dateExpected: d.date_expected, notes: d.notes, supplier: d.supplier ? { id: d.supplier.id, name: d.supplier.name, contactName: d.supplier.contact_name, email: d.supplier.email, phone: d.supplier.phone } : undefined }));
    } catch (e) { return []; }
};
export const fetchPurchaseItems = async (orderId: string): Promise<PurchaseOrderItem[]> => {
    try {
        const { data, error } = await supabase.from('purchase_order_items').select('*, material:raw_materials(*)').eq('order_id', orderId);
        if (error) return [];
        return data.map((d: any) => ({ id: d.id, orderId: d.order_id, materialId: d.material_id, quantity: d.quantity, unitCost: d.unit_cost, material: d.material ? { id: d.material.id, code: d.material.code, name: d.material.name, unit: d.material.unit, currentStock: d.material.current_stock, minStock: d.material.min_stock, unitCost: d.material.unit_cost, category: d.material.category } : undefined }));
    } catch (e) { return []; }
};
export const savePurchaseOrder = async (order: Partial<PurchaseOrder>): Promise<string> => {
    const dbOrder = { supplier_id: order.supplierId, status: order.status, date_expected: order.dateExpected, notes: order.notes };
    if (order.id) { const { error } = await supabase.from('purchase_orders').update(dbOrder).eq('id', order.id); if (error) throw error; return order.id; } 
    else { const { data, error } = await supabase.from('purchase_orders').insert([dbOrder]).select().single(); if (error) throw error; return data.id; }
};
export const savePurchaseItem = async (item: Partial<PurchaseOrderItem>): Promise<void> => {
    const dbItem = { order_id: item.orderId, material_id: item.materialId, quantity: item.quantity, unit_cost: item.unitCost };
    const { error } = await supabase.from('purchase_order_items').insert([dbItem]); if (error) throw error;
};
export const deletePurchaseItem = async (itemId: string): Promise<void> => { const { error } = await supabase.from('purchase_order_items').delete().eq('id', itemId); if (error) throw error; };
export const deletePurchaseOrder = async (orderId: string): Promise<void> => { const { error: itemError } = await supabase.from('purchase_order_items').delete().eq('order_id', orderId); if (itemError) throw itemError; const { error } = await supabase.from('purchase_orders').delete().eq('id', orderId); if (error) throw error; };
export const receivePurchaseOrder = async (orderId: string): Promise<void> => {
    const items = await fetchPurchaseItems(orderId);
    if (items.length === 0) throw new Error("Pedido sem itens.");
    for (const item of items) { await processStockTransaction({ materialId: item.materialId, type: 'IN', quantity: item.quantity, notes: `Recebimento Pedido #${orderId.slice(0,8)}` }); }
    const { error } = await supabase.from('purchase_orders').update({ status: 'RECEIVED' }).eq('id', orderId); if (error) throw error;
};

// --- STOCK TRANSACTIONS (CORE INVENTORY) ---

export const fetchInventoryTransactions = async (): Promise<InventoryTransaction[]> => {
    try {
        const { data: trxData, error: trxError } = await supabase.from('inventory_transactions').select('*').order('created_at', { ascending: false }).limit(100); 
        if (trxError) { if (trxError.code === '42P01') return []; throw trxError; }
        if (!trxData || trxData.length === 0) return [];
        const materialIds = [...new Set(trxData.map((t: any) => t.material_id).filter(Boolean))];
        let matData: any[] = [];
        if (materialIds.length > 0) { const { data } = await supabase.from('raw_materials').select('*').in('id', materialIds); if (data) matData = data; }
        return trxData.map((d: any) => {
            const material = matData.find((m: any) => m.id === d.material_id);
            return { id: d.id, materialId: d.material_id, type: d.type, quantity: d.quantity, notes: d.notes || '', relatedEntryId: d.related_entry_id, createdAt: d.created_at, material: material ? { id: material.id, code: material.code, name: material.name, unit: material.unit, currentStock: material.current_stock, minStock: material.min_stock, unitCost: material.unit_cost, category: material.category } : { name: 'Item Desconhecido' } as any };
        });
    } catch (e) { return []; }
};

export const fetchMaterialTransactions = async (materialId: string): Promise<InventoryTransaction[]> => {
    try {
        const { data: trxData, error: trxError } = await supabase.from('inventory_transactions').select('*').eq('material_id', materialId).order('created_at', { ascending: false }).limit(500);
        if (trxError) throw trxError;
        if (!trxData || trxData.length === 0) return [];
        return trxData.map((d: any) => ({ id: d.id, materialId: d.material_id, type: d.type, quantity: d.quantity, notes: d.notes || '', relatedEntryId: d.related_entry_id, createdAt: d.created_at }));
    } catch (e) { return []; }
};

export const processStockTransaction = async (trx: Omit<InventoryTransaction, 'id' | 'createdAt' | 'material'>): Promise<void> => {
    const qty = Number(trx.quantity);
    if (isNaN(qty)) throw new Error("Quantidade inválida.");
    if (trx.type !== 'ADJ' && qty <= 0) throw new Error("Quantidade deve ser maior que zero.");
    if (trx.type === 'ADJ' && qty < 0) throw new Error("Estoque não pode ser negativo.");

    const { data: mat, error: fetchError } = await supabase.from('raw_materials').select('id, current_stock, name').eq('id', trx.materialId).single();
    if (fetchError || !mat) throw new Error("Material não encontrado ou erro de conexão.");

    let currentStock = Number(mat.current_stock) || 0;
    let newStock = currentStock;

    if (trx.type === 'IN') newStock = currentStock + qty;
    else if (trx.type === 'OUT') {
        if (currentStock < qty && !trx.relatedEntryId) throw new Error(`Saldo insuficiente (${currentStock}) para saída de ${qty} em ${mat.name}.`);
        newStock = currentStock - qty;
    } else if (trx.type === 'ADJ') newStock = qty; 

    // TRANSACTION ATTEMPT (MANUAL ROLLBACK PATTERN)
    // 1. Log Transaction
    const payload = {
        material_id: trx.materialId,
        type: trx.type,
        quantity: trx.quantity,
        related_entry_id: trx.relatedEntryId,
        notes: trx.notes || null 
    };

    // Initial insert attempt
    let insertResult = await supabase.from('inventory_transactions').insert([payload]).select('id').single();

    // Robust Fallback: Schema Drift Check
    if (insertResult.error) {
        // CODE 42703: Undefined Column (Fix for "notes" error)
        const isColumnError = insertResult.error.code === 'PGRST204' || 
                              insertResult.error.code === '42703' || 
                              insertResult.error.message.includes('notes') || 
                              insertResult.error.message.includes('column');
        
        if (isColumnError) {
            console.warn("Schema Drift: Coluna 'notes' ausente. Tentando salvar sem ela.", insertResult.error.message);
            const legacyPayload = { ...payload };
            delete (legacyPayload as any).notes;
            insertResult = await supabase.from('inventory_transactions').insert([legacyPayload]).select('id').single();
        }
    }

    const { data: insertedTrx, error: trxError } = insertResult;

    if (trxError || !insertedTrx) {
        // Fallback error detail
        const errMsg = formatError(trxError);
        console.error("Falha ao registrar transação no estoque:", errMsg);
        throw new Error(`Erro ao registrar histórico: ${errMsg}`);
    }

    // 2. Update Stock
    try {
        const { error: updError } = await supabase.from('raw_materials').update({ current_stock: newStock }).eq('id', trx.materialId);
        if (updError) throw updError;
    } catch (e: any) {
        // ROLLBACK: Delete the transaction log if stock update failed
        console.error("Transação falhou na atualização de saldo, revertendo...", e);
        await supabase.from('inventory_transactions').delete().eq('id', insertedTrx.id);
        throw new Error(`Erro ao atualizar saldo: ${formatError(e)}`); 
    }
};

/**
 * CLIENT-SIDE FALLBACK / MANUAL DEDUCTION
 * Note: This function is deprecated for main production entries as we now use RPC.
 * It remains here for manual adjustments or legacy support.
 */
export const processStockDeduction = async (entry: { productCode?: number | null, qtyOK: number, id: string }): Promise<void> => {
    // This function is now used internally by registerProductionEntry
    if (!entry.productCode || entry.qtyOK <= 0) return;
    const bomItems = await fetchBOM(entry.productCode);
    if (bomItems.length === 0) return;

    for (const item of bomItems) {
        const consumed = item.quantityRequired * entry.qtyOK;
        // Don't stop process on stock error, but log it. Real-world requirement: Don't block production if stock data is bad.
        try {
            await processStockTransaction({
                materialId: item.materialId,
                type: 'OUT',
                quantity: consumed,
                notes: `Produção Auto: ${entry.qtyOK}un Prod ${entry.productCode}`,
                relatedEntryId: entry.id
            });
        } catch(e) {
            console.warn(`Falha na baixa de material ${item.materialId} para produção ${entry.id}:`, e);
        }
    }
};

/**
 * AUTOMATED SCRAP GENERATION (Aparas)
 * Calculates and returns scrap to inventory based on production process.
 * - Extrusion: Uses EXPLICIT 'refile' input. 'Borra' is ignored (Loss).
 * - Thermoforming: 35% of Processed Material (Skeleton/Web).
 */
export const processScrapGeneration = async (entry: ProductionEntry): Promise<void> => {
    // 1. Validate
    if (!entry.productCode || !entry.machineId) return;

    // 2. Fetch Context (Product & Machine)
    const { data: product } = await supabase.from('products').select('*').eq('code', entry.productCode).single();
    const { data: machine } = await supabase.from('machines').select('sector').eq('code', entry.machineId).single();

    if (!product || !product.scrap_recycling_material_id || !machine) return;

    // 3. Determine Amount to Return
    let scrapQty = 0;

    if (machine.sector === 'Extrusão') {
        // EXTRUSION LOGIC: Explicit Refile Input
        const extData = entry.metaData?.extrusion;
        if (extData && extData.refile > 0) {
            scrapQty = Number(extData.refile);
            // Note: 'Borra' (Dregs) is considered total loss/waste, so it is NOT returned to inventory.
        }
    } 
    else if (machine.sector === 'Termoformagem') {
        // THERMOFORMING LOGIC: Calculated Percentage
        const totalQty = (entry.qtyOK || 0) + (entry.qtyDefect || 0);
        if (totalQty > 0) {
            const unitWeight = entry.metaData?.measuredWeight || product.net_weight || 0;
            const factor = 0.35; // 35% Return (Skeleton/Web)
            // In TF, unit is 'un', weight is grams. Convert to kg.
            const weightKg = (totalQty * unitWeight) / 1000;
            scrapQty = weightKg * factor;
        }
    } 

    if (scrapQty <= 0) return;

    // 4. Execute Transaction
    try {
        await processStockTransaction({
            materialId: product.scrap_recycling_material_id,
            type: 'IN',
            quantity: parseFloat(scrapQty.toFixed(3)),
            notes: `Retorno ${machine.sector} - OP/Reg #${entry.id.substring(0, 8)}`,
            relatedEntryId: entry.id
        });
        console.log(`[System] Aparas geradas: ${scrapQty.toFixed(2)}kg (${product.scrap_recycling_material_id})`);
    } catch (e) {
        console.warn("Erro ao gerar aparas automáticas:", e);
        // Do not throw, as this is a background process
    }
};

// --- LOGISTICS ---
export const fetchShippingOrders = async (): Promise<ShippingOrder[]> => {
    try {
        const { data, error } = await supabase.from('shipping_orders').select('*').order('created_at', { ascending: false });
        if (error) return [];
        return data.map((d: any) => ({ id: d.id, customerName: d.customer_name, orderNumber: d.order_number, status: d.status, scheduledDate: d.scheduled_date }));
    } catch(e) { return []; }
};
export const saveShippingOrder = async (order: ShippingOrder): Promise<string> => {
    const dbOrder = { customer_name: order.customerName, order_number: order.orderNumber, status: order.status, scheduled_date: order.scheduledDate };
    if (order.id) { const { error } = await supabase.from('shipping_orders').update(dbOrder).eq('id', order.id); if (error) throw error; return order.id; } 
    else { const { data, error } = await supabase.from('shipping_orders').insert([dbOrder]).select().single(); if (error) throw error; return data.id; }
};
export const deleteShippingOrder = async (id: string): Promise<void> => { const { error } = await supabase.from('shipping_orders').delete().eq('id', id); if (error) throw error; };
export const fetchShippingItems = async (orderId: string): Promise<ShippingItem[]> => {
    try {
        const { data, error } = await supabase.from('shipping_items').select('*, product:products(*)').eq('order_id', orderId);
        if (error) return [];
        return data.map((d: any) => ({ id: d.id, orderId: d.order_id, productCode: d.product_code, quantity: d.quantity, product: d.product ? { codigo: d.product.code, produto: d.product.name, descricao: d.product.description, pesoLiquido: d.product.net_weight, custoUnit: d.product.unit_cost } : undefined }));
    } catch(e) { return []; }
};
export const saveShippingItem = async (item: Omit<ShippingItem, 'product'>): Promise<void> => { const { error } = await supabase.from('shipping_items').insert([{ order_id: item.orderId, product_code: item.productCode, quantity: item.quantity }]); if(error) throw error; };
export const deleteShippingItem = async (id: string): Promise<void> => { const { error } = await supabase.from('shipping_items').delete().eq('id', id); if (error) throw error; };

// --- PRODUCT COSTS SUMMARY (MATERIALIZED VIEW) ---

export const fetchProductCosts = async (): Promise<ProductCostSummary[]> => {
    try {
        const { data, error } = await supabase
            .from('product_costs_summary')
            .select('*');
        
        if (error) {
            // Handle table not found (view not created yet)
            if (error.code === '42P01') {
                console.warn("View product_costs_summary not found. Run database_setup.sql");
                return [];
            }
            throw error;
        }

        return data.map((d: any) => {
            const total = d.material_cost + d.packaging_cost + d.operational_cost;
            return {
                productCode: d.product_code,
                productName: d.product_name,
                sellingPrice: d.selling_price || 0,
                materialCost: d.material_cost || 0,
                packagingCost: d.packaging_cost || 0,
                operationalCost: d.operational_cost || 0,
                totalCost: total
            };
        });
    } catch (e) {
        console.error("Error fetching cost view:", formatError(e));
        return [];
    }
};