import { supabase } from './supabaseClient';
import { Product, Machine, Operator, DowntimeType, AppSettings, FieldDefinition, ScrapReason, WorkShift, ProductCategory, Sector, RawMaterial, ProductBOM } from '../types';
import { PRODUCTS_DB, MACHINES_DB, OPERATORS, DYNAMIC_FIELDS_CONFIG, SYSTEM_OPERATOR_ID } from '../constants';
import { formatError } from './utils';

// --- System ---

export const checkConnection = async (): Promise<boolean> => {
  try {
    const { error } = await supabase.from('app_settings').select('id').limit(1).single();
    if (error && error.code !== 'PGRST116') return false; 
    return true;
  } catch (e) {
    return false;
  }
};

// --- APP SETTINGS ---

const DEFAULT_SETTINGS: AppSettings = {
    shiftHours: 8.8,
    efficiencyTarget: 85,
    maintenanceMode: false,
    requireScrapReason: true,
    blockExcessProduction: false,
    requireDowntimeNotes: false,
    enableProductionOrders: true
};

export const fetchSettings = async (): Promise<AppSettings> => {
  try {
    const { data, error } = await supabase.from('app_settings').select('*').single();
    if (error || !data) return DEFAULT_SETTINGS;
    return {
      shiftHours: data.shift_hours,
      efficiencyTarget: data.efficiency_target, 
      maintenanceMode: data.maintenance_mode || false,
      requireScrapReason: data.require_scrap_reason ?? true,
      blockExcessProduction: data.block_excess_production ?? false,
      requireDowntimeNotes: data.require_downtime_notes ?? false,
      enableProductionOrders: data.enable_production_orders ?? true
    };
  } catch (e) { return DEFAULT_SETTINGS; }
};

export const saveSettings = async (settings: AppSettings): Promise<void> => {
  const fullSettings = { 
    id: 1, 
    shift_hours: settings.shiftHours,
    efficiency_target: settings.efficiencyTarget,
    require_scrap_reason: settings.requireScrapReason,
    block_excess_production: settings.blockExcessProduction,
    require_downtime_notes: settings.requireDowntimeNotes,
    enable_production_orders: settings.enableProductionOrders,
    maintenance_mode: settings.maintenanceMode,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase.from('app_settings').upsert([fullSettings]);
  
  if (error) {
    if (error.code === 'PGRST204' || error.message.includes('Could not find')) {
        console.warn("Schema do banco desatualizado. Tentando salvar configurações legadas.");
        const legacySettings = {
            id: 1,
            shift_hours: settings.shiftHours,
            efficiency_target: settings.efficiencyTarget,
            require_scrap_reason: settings.requireScrapReason,
            updated_at: new Date().toISOString()
        };
        const { error: legacyError } = await supabase.from('app_settings').upsert([legacySettings]);
        if (legacyError) throw legacyError;
        throw new Error("AVISO_SCHEMA: Salvo parcialmente. Execute 'supabase_schema.sql' no banco para habilitar todos os recursos.");
    }
    throw error;
  }
};

// --- FLEXIBLE FIELDS ---

export const fetchFieldDefinitions = async (): Promise<FieldDefinition[]> => {
  try {
    const { data, error } = await supabase.from('custom_field_configs').select('*').eq('active', true);
    let fields = data || DYNAMIC_FIELDS_CONFIG;
    fields = fields.filter((f: any) => f.key !== 'lote_mp');
    return fields.map((d: any) => ({
        id: d.id,
        key: d.key,
        label: d.label,
        type: d.type,
        section: d.section,
        required: d.key === 'peso_produto' ? false : d.required, 
        options: d.options ? (typeof d.options === 'string' ? JSON.parse(d.options) : d.options) : undefined,
        active: d.active
    }));
  } catch (e) { return DYNAMIC_FIELDS_CONFIG; }
};

export const saveFieldDefinition = async (field: FieldDefinition): Promise<void> => {
    const dbField = { key: field.key, label: field.label, type: field.type, section: field.section, required: field.required, options: field.options, active: true };
    const { error } = await supabase.from('custom_field_configs').upsert([dbField], { onConflict: 'key' });
    if (error) throw error;
};

export const deleteFieldDefinition = async (key: string): Promise<void> => {
    const { error } = await supabase.from('custom_field_configs').update({ active: false }).eq('key', key);
    if (error) throw error;
};

// --- PRODUCTS ---

export const fetchProducts = async (): Promise<Product[]> => {
  try {
    const { data: productsData, error: prodError } = await supabase
        .from('products')
        .select('*')
        .order('name');

    if (prodError) throw prodError;
    if (!productsData || productsData.length === 0) return PRODUCTS_DB;

    const { data: relationsData } = await supabase.from('product_machines').select('*');

    return productsData.map((d: any) => {
      const currentProductCode = String(d.code);
      const relatedMachines = relationsData 
          ? relationsData
              .filter((r: any) => String(r.product_code) === currentProductCode)
              .map((r: any) => r.machine_code)
          : [];

      return {
          codigo: d.code,
          produto: d.name,
          descricao: d.description,
          pesoLiquido: d.net_weight,
          custoUnit: d.unit_cost,
          sellingPrice: d.selling_price || 0,
          itemsPerHour: d.items_per_hour || 0,
          category: d.category || 'ARTICULADO',
          type: d.type || 'FINISHED',
          unit: d.unit || 'un',
          scrapMaterialId: d.scrap_recycling_material_id,
          compatibleMachines: relatedMachines,
          currentStock: d.current_stock || 0
      };
    });
  } catch (e) { 
      return PRODUCTS_DB; 
  }
};

export const saveProduct = async (product: Product): Promise<void> => {
  const safeNumber = (val: any) => {
     if (val === null || val === undefined || val === '') return 0;
     const n = Number(val);
     return isNaN(n) ? 0 : n;
  };

  const productCode = Math.floor(safeNumber(product.codigo));
  if (productCode === 0) throw new Error("Código do produto inválido ou zero.");

  const fullProduct = {
    code: productCode,
    name: product.produto,
    description: product.descricao,
    net_weight: safeNumber(product.pesoLiquido),
    unit_cost: safeNumber(product.custoUnit),
    selling_price: safeNumber(product.sellingPrice), 
    items_per_hour: safeNumber(product.itemsPerHour), 
    category: product.category,
    type: product.type,
    unit: product.unit,
    scrap_recycling_material_id: product.scrapMaterialId,
    current_stock: safeNumber(product.currentStock)
  };

  const basicProduct = {
    code: productCode,
    name: product.produto,
    description: product.descricao,
    net_weight: safeNumber(product.pesoLiquido),
    unit_cost: safeNumber(product.custoUnit),
    unit: product.unit,
    type: product.type,
    category: product.category
  };
  
  const { error } = await supabase.from('products').upsert([fullProduct], { onConflict: 'code' });
  
  if (error) {
      if (error.code === 'PGRST204' || error.message.includes('Could not find')) {
          const { error: basicError } = await supabase.from('products').upsert([basicProduct], { onConflict: 'code' });
          if (basicError) throw basicError;
      } else {
          throw error;
      }
  }

  if (Array.isArray(product.compatibleMachines)) {
      const { error: delError } = await supabase.from('product_machines').delete().eq('product_code', productCode);
      if (delError && delError.code !== '42P01') { } 
      else {
          if (product.compatibleMachines.length > 0) {
              const links = product.compatibleMachines.map(mCode => ({ 
                  product_code: productCode, 
                  machine_code: mCode 
              }));
              await supabase.from('product_machines').insert(links);
          }
      }
  }
};

export const updateProductTarget = async (code: number, itemsPerHour: number): Promise<void> => {
    const target = isNaN(itemsPerHour) || itemsPerHour < 0 ? 0 : Number(itemsPerHour);
    const { error } = await supabase.from('products').update({ items_per_hour: target }).eq('code', code);
    if (error && (error.code === 'PGRST204' || error.message.includes('Could not find'))) return;
    if (error) throw error;
};

export const adjustProductStock = async (code: number, newQuantity: number): Promise<void> => {
    const qty = isNaN(newQuantity) ? 0 : Number(newQuantity);
    const { error } = await supabase.from('products').update({ current_stock: qty }).eq('code', code);
    if (error) throw error;
};

export const deleteProduct = async (code: number): Promise<void> => {
  const { error, count } = await supabase.from('products').delete({ count: 'exact' }).eq('code', code);
  if (error) throw error;
  if (count === 0) throw new Error("Falha na exclusão: Permissão Negada ou Não Encontrado.");
};

// --- IMPORT HELPER FUNCTIONS (BATCH) ---

export const getExistingMaterialsMap = async (): Promise<Map<string, RawMaterial>> => {
    const { data } = await supabase.from('raw_materials').select('*');
    const map = new Map<string, RawMaterial>();
    if (data) {
        data.forEach((m: any) => {
            // Map by CODE (from legacy)
            map.set(String(m.code), {
                id: m.id,
                code: m.code,
                name: m.name,
                unit: m.unit,
                category: m.category,
                group: m.group_name,
                unitCost: m.unit_cost,
                minStock: m.min_stock,
                currentStock: m.current_stock
            });
        });
    }
    return map;
};

export const upsertMaterialBatch = async (materials: Partial<RawMaterial>[]): Promise<void> => {
    // Supabase upsert handles "create if not exists, update if exists" based on unique constraint (code)
    const payload = materials.map(m => ({
        code: m.code,
        name: m.name,
        unit: m.unit,
        category: m.category,
        group_name: m.group,
        unit_cost: m.unitCost || 0,
        min_stock: m.minStock || 0,
        current_stock: m.currentStock || 0,
        active: true
    }));

    // Split into chunks of 100 to avoid request size limits
    const chunkSize = 100;
    for (let i = 0; i < payload.length; i += chunkSize) {
        const chunk = payload.slice(i, i + chunkSize);
        const { error } = await supabase.from('raw_materials').upsert(chunk, { onConflict: 'code' });
        if (error) throw error;
    }
};

export const upsertProductBatch = async (products: Partial<Product>[]): Promise<void> => {
    const payload = products.map(p => ({
        code: p.codigo,
        name: p.produto,
        description: p.descricao,
        net_weight: p.pesoLiquido || 0,
        unit_cost: p.custoUnit || 0,
        type: p.type || 'FINISHED',
        unit: p.unit || 'un',
        category: p.category || 'ARTICULADO'
    }));

    const chunkSize = 100;
    for (let i = 0; i < payload.length; i += chunkSize) {
        const chunk = payload.slice(i, i + chunkSize);
        const { error } = await supabase.from('products').upsert(chunk, { onConflict: 'code' });
        if (error) throw error;
    }
};

export const upsertBOMBatch = async (boms: {productCode: number, materialCode: string, qty: number}[]): Promise<void> => {
    // 1. We need Material UUIDs. 
    // Since we just upserted materials, we fetch the map again to get new IDs.
    const matMap = await getExistingMaterialsMap();
    
    // 2. Prepare payload
    const payload: any[] = [];
    
    for (const bom of boms) {
        const mat = matMap.get(String(bom.materialCode));
        if (mat && mat.id) {
            payload.push({
                product_code: bom.productCode,
                material_id: mat.id,
                quantity_required: bom.qty
            });
        }
    }

    // 3. Upsert BOMs (Requires a unique constraint on product_code + material_id in DB for pure upsert, 
    //    but we might not have it. Safer to delete existing for these products and re-insert or assume clean slate?)
    //    Better approach for "Import": Remove all BOMs for these products and re-insert to avoid duplicates.
    
    // Unique list of product codes involved
    const distinctProductCodes = [...new Set(boms.map(b => b.productCode))];
    
    // Delete existing BOMs for these products (Clean slate for imported structures)
    if (distinctProductCodes.length > 0) {
        const { error: delError } = await supabase.from('product_bom').delete().in('product_code', distinctProductCodes);
        if (delError && delError.code !== '42P01') throw delError;
    }

    // Insert new BOMs
    const chunkSize = 100;
    for (let i = 0; i < payload.length; i += chunkSize) {
        const chunk = payload.slice(i, i + chunkSize);
        const { error } = await supabase.from('product_bom').insert(chunk);
        if (error) throw error;
    }
};

// --- PRODUCT CATEGORIES ---

export const fetchProductCategories = async (): Promise<ProductCategory[]> => {
    try {
        const { data, error } = await supabase.from('product_categories').select('*').order('name');
        if (error || !data || data.length === 0) {
            return [ { id: 'ARTICULADO', name: 'ARTICULADO' }, { id: 'KIT', name: 'KIT' }, { id: 'INTERMEDIARIO', name: 'INTERMEDIÁRIO' } ];
        }
        return data.map((c: any) => {
            if (c.name === 'CONJUNTO') return { ...c, name: 'KIT' };
            if (c.name === 'COMPONENTE') return { ...c, name: 'INTERMEDIÁRIO' };
            return c;
        }) as ProductCategory[];
    } catch (e) { 
        return [ { id: 'ARTICULADO', name: 'ARTICULADO' }, { id: 'KIT', name: 'KIT' }, { id: 'INTERMEDIARIO', name: 'INTERMEDIÁRIO' } ];
    }
};

export const saveProductCategory = async (cat: ProductCategory): Promise<void> => {
    const payload = { id: cat.id || cat.name.toUpperCase().replace(/\s+/g, '_'), name: cat.name };
    const { error } = await supabase.from('product_categories').upsert([payload]);
    if (error) throw error;
};

export const deleteProductCategory = async (id: string): Promise<void> => {
    const { error } = await supabase.from('product_categories').delete().eq('id', id);
    if (error) throw error;
};

// --- SECTORS ---

export const fetchSectors = async (): Promise<Sector[]> => {
    try {
        const { data, error } = await supabase.from('sectors').select('*').eq('active', true).order('name');
        if (error || !data || data.length === 0) {
             return [
                { id: 'Extrusão', name: 'Extrusão', active: true },
                { id: 'Termoformagem', name: 'Termoformagem', active: true },
                { id: 'Montagem', name: 'Montagem', active: true }
            ];
        }
        return data as Sector[];
    } catch (e) { 
        return [
            { id: 'Extrusão', name: 'Extrusão', active: true },
            { id: 'Termoformagem', name: 'Termoformagem', active: true },
            { id: 'Montagem', name: 'Montagem', active: true }
        ];
    }
};

export const saveSector = async (sector: Sector): Promise<void> => {
    const dbSector = { 
        id: sector.id || sector.name.toUpperCase().replace(/\s+/g, '_'), 
        name: sector.name, 
        active: true 
    };
    const { error } = await supabase.from('sectors').upsert([dbSector]);
    if (error) throw error;
};

export const deleteSector = async (id: string): Promise<void> => {
    const { error } = await supabase.from('sectors').update({ active: false }).eq('id', id);
    if (error) throw error;
};

// --- MACHINES ---

const MACHINE_LAYOUT_KEY = 'pplast_machine_layout';

export const fetchMachines = async (): Promise<Machine[]> => {
  try {
    const { data, error } = await supabase.from('machines').select('*');
    let machines: Machine[] = [];

    if (error || !data || data.length === 0) {
        machines = MACHINES_DB;
    } else {
        machines = data.map((d: any) => ({
            code: d.code,
            name: d.name,
            group: d.group,
            acquisitionDate: d.acquisition_date,
            sector: d.sector,
            displayOrder: d.display_order || 0,
            productionCapacity: d.production_capacity || 0
        }));
    }

    try {
        const localLayoutJson = localStorage.getItem(MACHINE_LAYOUT_KEY);
        if (localLayoutJson) {
            const localLayout = JSON.parse(localLayoutJson) as Record<string, number>;
            machines = machines.map(m => ({
                ...m,
                displayOrder: localLayout[m.code] !== undefined ? localLayout[m.code] : (m.displayOrder || 9999)
            }));
        }
    } catch(e) { }

    return machines.sort((a, b) => {
        const orderA = a.displayOrder !== undefined ? a.displayOrder : 9999;
        const orderB = b.displayOrder !== undefined ? b.displayOrder : 9999;
        return orderA - orderB || a.code.localeCompare(b.code);
    });

  } catch (e) { return MACHINES_DB; }
};

export const saveMachine = async (machine: Machine): Promise<void> => {
  const dbMachine: any = {
    code: machine.code,
    name: machine.name,
    "group": machine.group || 0,
    acquisition_date: machine.acquisitionDate,
    sector: machine.sector,
    display_order: machine.displayOrder || 0,
    production_capacity: machine.productionCapacity || 0
  };
  
  let { error } = await supabase.from('machines').upsert([dbMachine], { onConflict: 'code' });
  
  if (error) {
      if (error.code === 'PGRST204' || error.message.includes('production_capacity') || error.message.includes('column')) {
          console.warn("Aviso: Colunas novas na tabela machines não encontradas. Salvando versão legada.");
          delete dbMachine.production_capacity;
          const retry = await supabase.from('machines').upsert([dbMachine], { onConflict: 'code' });
          if (retry.error) throw retry.error;
          throw new Error("AVISO_SCHEMA: Máquina salva, mas dados avançados (Capacidade) ignorados. Execute 'supabase_schema.sql'.");
      } else {
          throw error;
      }
  }
};

export const updateMachineBatch = async (machines: Machine[]): Promise<void> => {
    try {
        const layoutMap: Record<string, number> = {};
        machines.forEach(m => {
            if (m.displayOrder !== undefined) layoutMap[m.code] = m.displayOrder;
        });
        localStorage.setItem(MACHINE_LAYOUT_KEY, JSON.stringify(layoutMap));
    } catch (e) { }

    try {
        const updates = machines.map(m => ({
            code: m.code,
            display_order: m.displayOrder,
            sector: m.sector
        }));
        
        const { error } = await supabase.from('machines').upsert(updates, { onConflict: 'code' });
        if (error) console.warn("Layout server-sync failed", error.message);
    } catch (e) { }
};

export const deleteMachine = async (code: string): Promise<void> => {
  const { error, count } = await supabase.from('machines').delete({ count: 'exact' }).eq('code', code);
  if (error) throw error;
  if (count === 0) throw new Error("Falha na exclusão.");
};

// --- OPERATORS ---

export const fetchOperators = async (): Promise<Operator[]> => {
  try {
    const { data, error } = await supabase.from('operators').select('*').neq('id', SYSTEM_OPERATOR_ID).order('name');
    if (error || !data || data.length === 0) return OPERATORS;
    return data.map((d: any) => ({
        id: d.id,
        name: d.name,
        sector: d.sector || d.setor,
        defaultShift: d.default_shift || d.turno_padrao || null,
        role: d.role || d.funcao, 
        baseSalary: d.base_salary || d.salario_base,
        admissionDate: d.admission_date || d.data_admissao,
        terminationDate: d.termination_date || d.data_demissao,
        active: d.active !== undefined ? d.active : true
    }));
  } catch (e) { return OPERATORS; }
};

export const saveOperator = async (op: Operator): Promise<void> => {
    const dbOp: any = { 
        name: op.name,
        sector: op.sector || null, 
        default_shift: op.defaultShift || null, 
        role: op.role || null,
        base_salary: op.baseSalary || null,
        admission_date: op.admissionDate || null,
        termination_date: op.terminationDate || null,
        active: op.active
    };

    if (op.id) dbOp.id = op.id;

    const performSave = async (payload: any) => {
        if (payload.id) return await supabase.from('operators').upsert([payload]);
        return await supabase.from('operators').insert([payload]);
    };

    let { error } = await performSave(dbOp);

    if (error) {
        const missingCol = error.code === 'PGRST204' || 
                           error.message.includes('default_shift') || 
                           error.message.includes('sector') ||
                           error.message.includes('column');
        
        if (missingCol) {
            console.warn("Schema Drift: Colunas novas de Operador ausentes.");
            // Strip new fields
            delete dbOp.default_shift;
            delete dbOp.sector;
            
            const retry = await performSave(dbOp);
            if (retry.error) throw retry.error;
            
            throw new Error("AVISO_SCHEMA: Operador salvo, mas Setor/Turno ignorados. Execute 'supabase_schema.sql'.");
        }
        throw error;
    }
};

export const deleteOperator = async (id: number): Promise<void> => {
  const { error, count } = await supabase.from('operators').delete({ count: 'exact' }).eq('id', id);
  if (error) throw error;
  if (count === 0) throw new Error("Falha na exclusão.");
};

// --- DOWNTIME & SCRAP ---

export const fetchDowntimeTypes = async (): Promise<DowntimeType[]> => {
  try {
    const { data, error } = await supabase.from('downtime_types').select('*').order('description');
    if (error || !data) return [];
    return data.map((d: any) => ({
        id: d.id,
        description: d.description,
        exemptFromOperator: d.exempt_from_operator || false, 
        sector: d.sector || null
    }));
  } catch (e) { return []; }
};

export const saveDowntimeType = async (dt: DowntimeType): Promise<void> => {
  const payload = {
      id: dt.id,
      description: dt.description,
      exempt_from_operator: dt.exemptFromOperator,
      sector: dt.sector || null
  };
  
  const { error } = await supabase.from('downtime_types').upsert([payload]);
  
  if (error) {
      // Robust detection of missing columns (Supabase sometimes returns generic error for this)
      const missingColumn = error.code === 'PGRST204' || 
                            error.message.includes('column') || 
                            error.message.includes('exempt_from_operator') || 
                            error.message.includes('sector');
      
      if (missingColumn) {
          console.warn("Schema Drift: Colunas de Parada ausentes. Salvando legado.");
          
          const legacyPayload = { id: dt.id, description: dt.description };
          
          const { error: retryError } = await supabase.from('downtime_types').upsert([legacyPayload]);
          if (retryError) throw retryError;
          
          // Throw specific warning code that UI handles gracefully
          throw new Error("AVISO_SCHEMA: Registro salvo, mas Setor/Regra ignorados. Execute 'supabase_schema.sql'.");
      } else {
          throw error;
      }
  }
};

export const deleteDowntimeType = async (id: string): Promise<void> => {
  const { error, count } = await supabase.from('downtime_types').delete({ count: 'exact' }).eq('id', id);
  if (error) throw error;
  if (count === 0) throw new Error("Falha na exclusão.");
};

export const fetchScrapReasons = async (): Promise<ScrapReason[]> => {
    try {
        const { data, error } = await supabase.from('scrap_reasons').select('*').eq('active', true).order('description');
        if (error || !data) return [];
        return data as ScrapReason[];
    } catch (e) { return []; }
};

export const saveScrapReason = async (reason: {id?: string, description: string}): Promise<void> => {
    const { error } = await supabase.from('scrap_reasons').upsert([{ id: reason.id || undefined, description: reason.description }]);
    if (error) throw error;
};

export const deleteScrapReason = async (id: string): Promise<void> => {
    const { error } = await supabase.from('scrap_reasons').update({ active: false }).eq('id', id);
    if (error) throw error;
};

// --- WORK SHIFTS ---

export const fetchWorkShifts = async (): Promise<WorkShift[]> => {
    try {
        const { data, error } = await supabase.from('work_shifts').select('*').eq('active', true).order('start_time');
        if (error || !data) return [];
        
        return data.map((d: any) => ({
            id: d.id,
            name: d.name,
            startTime: d.start_time,
            endTime: d.end_time,
            active: d.active,
            sector: d.sector // NEW: Mapped from DB
        }));
    } catch(e) { return []; }
};

export const saveWorkShift = async (shift: WorkShift): Promise<void> => {
    const dbShift = { 
        name: shift.name, 
        start_time: shift.startTime, 
        end_time: shift.endTime, 
        active: shift.active,
        sector: shift.sector || null
    };
    
    try {
        if (shift.id && shift.id.trim() !== '') {
            await supabase.from('work_shifts').update(dbShift).eq('id', shift.id);
        } else {
            await supabase.from('work_shifts').insert([dbShift]);
        }
    } catch (e: any) {
        // Handle generic catch if supabase throws immediately (rare)
        throw e;
    }

    // Since we can't catch the promise rejection cleanly if wrapped in standard supabase call without {error} destructure above if we don't await properly:
    // Let's redo properly:
    
    let res;
    if (shift.id && shift.id.trim() !== '') {
        res = await supabase.from('work_shifts').update(dbShift).eq('id', shift.id);
    } else {
        res = await supabase.from('work_shifts').insert([dbShift]);
    }

    if (res.error) {
        if (res.error.code === 'PGRST204' || res.error.message.includes('sector') || res.error.message.includes('column')) {
             // Retry without sector
             const legacyShift = { ...dbShift };
             delete (legacyShift as any).sector;
             
             let retryRes;
             if (shift.id) retryRes = await supabase.from('work_shifts').update(legacyShift).eq('id', shift.id);
             else retryRes = await supabase.from('work_shifts').insert([legacyShift]);
             
             if (retryRes.error) throw retryRes.error;
             throw new Error("AVISO_SCHEMA: Turno salvo, mas vínculo com Setor ignorado. Execute 'supabase_schema.sql'.");
        }
        throw res.error;
    }
};

export const deleteWorkShift = async (id: string): Promise<void> => {
    const { error } = await supabase.from('work_shifts').update({ active: false }).eq('id', id);
    if (error) throw error;
};

export const determineCurrentShift = async (timeString: string): Promise<string> => {
    const shifts = await fetchWorkShifts();
    if (shifts.length === 0) return "Turno Único";
    const [h, m] = timeString.split(':').map(Number);
    const timeMinutes = h * 60 + m;
    for (const shift of shifts) {
        const [sh1, sm1] = shift.startTime.split(':').map(Number);
        const [sh2, sm2] = shift.endTime.split(':').map(Number);
        const startMin = sh1 * 60 + sm1;
        const endMin = sh2 * 60 + sm2;
        if (endMin > startMin) {
            if (timeMinutes >= startMin && timeMinutes < endMin) return shift.name;
        } else {
            if (timeMinutes >= startMin || timeMinutes < endMin) return shift.name;
        }
    }
    return "Extra";
};