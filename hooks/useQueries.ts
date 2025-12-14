import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
    fetchProducts, fetchMachines, fetchOperators, fetchDowntimeTypes, fetchScrapReasons, 
    fetchFieldDefinitions, fetchMachineStatuses, fetchSettings, fetchSectors, fetchWorkShifts,
    registerProductionEntry, fetchDashboardStats, fetchProductionOrders, getLastMachineEntry,
    getMachineEntriesForDate, fetchMaterials
} from '../services/storage';
import { ProductionEntry } from '../types';

// --- KEYS ---
export const KEYS = {
    PRODUCTS: ['products'],
    MACHINES: ['machines'],
    OPERATORS: ['operators'],
    DOWNTIME_TYPES: ['downtimeTypes'],
    SCRAP_REASONS: ['scrapReasons'],
    CUSTOM_FIELDS: ['customFields'],
    MACHINE_STATUS: ['machineStatus'],
    SETTINGS: ['settings'],
    SECTORS: ['sectors'],
    SHIFTS: ['shifts'],
    DASHBOARD: 'dashboard',
    ENTRIES: 'entries',
    PRODUCTION_ORDERS: ['productionOrders'],
    LAST_ENTRY: ['lastEntry'],
    MACHINE_ENTRIES: ['machineEntries'],
    MATERIALS: ['materials']
};

// --- MASTER DATA HOOKS (Read-Heavy, Long Cache) ---

export const useProducts = () => useQuery({ 
    queryKey: KEYS.PRODUCTS, 
    queryFn: fetchProducts,
    staleTime: 1000 * 60 * 10 // 10 mins
});

export const useMachines = () => useQuery({ 
    queryKey: KEYS.MACHINES, 
    queryFn: fetchMachines 
});

export const useOperators = () => useQuery({ 
    queryKey: KEYS.OPERATORS, 
    queryFn: fetchOperators 
});

export const useDowntimeTypes = () => useQuery({ 
    queryKey: KEYS.DOWNTIME_TYPES, 
    queryFn: fetchDowntimeTypes 
});

export const useScrapReasons = () => useQuery({ 
    queryKey: KEYS.SCRAP_REASONS, 
    queryFn: fetchScrapReasons 
});

export const useSectors = () => useQuery({
    queryKey: KEYS.SECTORS,
    queryFn: fetchSectors
});

export const useWorkShifts = () => useQuery({
    queryKey: KEYS.SHIFTS,
    queryFn: fetchWorkShifts
});

export const useSettings = () => useQuery({
    queryKey: KEYS.SETTINGS,
    queryFn: fetchSettings
});

export const useCustomFields = () => useQuery({
    queryKey: KEYS.CUSTOM_FIELDS,
    queryFn: fetchFieldDefinitions
});

export const useProductionOrders = () => useQuery({
    queryKey: KEYS.PRODUCTION_ORDERS,
    queryFn: fetchProductionOrders
});

export const useMaterials = () => useQuery({
    queryKey: KEYS.MATERIALS,
    queryFn: fetchMaterials,
    staleTime: 1000 * 60 * 5
});

// --- OPERATIONAL DATA HOOKS (Frequent Updates) ---

export const useMachineStatuses = () => useQuery({
    queryKey: KEYS.MACHINE_STATUS,
    queryFn: fetchMachineStatuses,
    refetchInterval: 30000 // Auto-refresh status every 30s
});

export const useDashboardStats = (startDate: string, endDate: string) => useQuery({
    queryKey: [KEYS.DASHBOARD, startDate, endDate],
    queryFn: () => fetchDashboardStats(startDate, endDate),
    staleTime: 1000 * 60, // 1 min cache for dashboards
});

// Busca o último apontamento para exibir no formulário (AGORA GLOBAL, com filtro de tipo)
export const useLastMachineEntry = (machineId: string, isDowntime: boolean) => useQuery({
    queryKey: [KEYS.LAST_ENTRY, machineId, isDowntime], // Recarrega se mudar aba
    queryFn: () => getLastMachineEntry(machineId, isDowntime ? 'downtime' : 'production'),
    enabled: !!machineId, // Só busca se tiver máquina
});

// Busca histórico diário da máquina para listagem no formulário
export const useMachineEntries = (machineId: string, date: string) => useQuery({
    queryKey: [KEYS.MACHINE_ENTRIES, machineId, date],
    queryFn: () => getMachineEntriesForDate(machineId, date),
    enabled: !!machineId && !!date,
    staleTime: 0, // IMPORTANT: Do not cache history, force fresh fetch on mount
    refetchOnMount: true
});

// --- MUTATIONS (Write Operations) ---

export const useRegisterEntry = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ entry, isEdit }: { entry: ProductionEntry, isEdit: boolean }) => {
            return await registerProductionEntry(entry, isEdit);
        },
        onSuccess: (data, variables) => {
            // Invalidate relevant queries to force refresh
            queryClient.invalidateQueries({ queryKey: KEYS.MACHINE_STATUS });
            queryClient.invalidateQueries({ queryKey: [KEYS.DASHBOARD] }); 
            queryClient.invalidateQueries({ queryKey: KEYS.PRODUCTION_ORDERS });
            queryClient.invalidateQueries({ queryKey: [KEYS.LAST_ENTRY] }); 
            
            // Atualiza a lista de histórico da máquina na data do lançamento
            queryClient.invalidateQueries({ 
                queryKey: [KEYS.MACHINE_ENTRIES, variables.entry.machineId, variables.entry.date] 
            });
        }
    });
};