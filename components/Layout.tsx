import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, PlusCircle, List, Box, Bell, Settings as SettingsIcon, LogOut, User, 
  Wifi, WifiOff, AlertTriangle, Cuboid, Wrench, Menu, X, Layers, Package, Target, Truck, Database, DollarSign, ShoppingCart, ClipboardCheck, ClipboardList, FileText, Upload, Zap
} from 'lucide-react';
import { getUnreadAlertCount, checkConnection, fetchSettings } from '../services/storage';
import { useAuth } from '../contexts/AuthContext';

interface LayoutProps {
  children: React.ReactNode;
}

type ModuleType = 'production' | 'inventory' | 'engineering' | 'logistics' | 'financial';

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAdmin, logout } = useAuth();
  
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const [activeModule, setActiveModule] = useState<ModuleType>('production');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [enableProductionOrders, setEnableProductionOrders] = useState(true);

  // Sync Active Module based on URL
  useEffect(() => {
    if (location.pathname.startsWith('/inventory') || location.pathname.startsWith('/purchasing')) setActiveModule('inventory');
    else if (location.pathname.startsWith('/bom') || location.pathname.startsWith('/targets') || location.pathname.startsWith('/engineering')) setActiveModule('engineering');
    else if (location.pathname.startsWith('/logistics')) setActiveModule('logistics');
    else if (location.pathname.startsWith('/financial')) setActiveModule('financial');
    else setActiveModule('production');
  }, [location.pathname]);

  const fetchStatus = async () => {
    const online = await checkConnection();
    setIsOnline(online);
    if (online) {
      const count = await getUnreadAlertCount();
      setUnreadCount(count);
      const settings = await fetchSettings();
      setMaintenanceMode(settings.maintenanceMode);
      setEnableProductionOrders(settings.enableProductionOrders);
    }
  };

  useEffect(() => {
    fetchStatus();
    const handleAlertUpdate = () => fetchStatus();
    window.addEventListener('alert-update', handleAlertUpdate);
    const interval = setInterval(fetchStatus, 30000);
    return () => {
      window.removeEventListener('alert-update', handleAlertUpdate);
      clearInterval(interval);
    };
  }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
  };

  // Roles helpers
  const ALL_MGMT = ['admin', 'manager', 'supervisor'];
  const ALL_ACCESS = ['admin', 'manager', 'supervisor', 'operator'];
  const ADMIN_MGMT = ['admin', 'manager'];

  const navItems = {
    production: [
      { to: '/', label: 'Painel Geral', icon: <LayoutDashboard size={20} />, roles: ALL_MGMT },
      ...(enableProductionOrders ? [{ to: '/production-plan', label: 'Ordens de Produção', icon: <ClipboardList size={20} />, roles: ALL_MGMT }] : []),
      { to: '/entry', label: 'Apontamento', icon: <PlusCircle size={20} />, roles: ALL_ACCESS },
      { to: '/batch-entry', label: 'Digitação Rápida (Beta)', icon: <Zap size={20} className="text-yellow-400" />, roles: ALL_MGMT }, // NEW BUTTON
      { to: '/list', label: 'Registros', icon: <List size={20} />, roles: ALL_MGMT },
      { to: '/settings', label: 'Configurações', icon: <SettingsIcon size={20} />, roles: ADMIN_MGMT },
    ],
    inventory: [
       { to: '/inventory', label: 'Gestão de Estoque', icon: <Cuboid size={20} />, roles: ALL_ACCESS },
       { to: '/inventory/audit', label: 'Conferência / Audit', icon: <ClipboardCheck size={20} />, roles: ALL_MGMT },
       { to: '/inventory/kardex', label: 'Extrato / Kardex', icon: <FileText size={20} />, roles: ALL_MGMT },
       { to: '/purchasing', label: 'Compras & Fornecedores', icon: <ShoppingCart size={20} />, roles: ALL_MGMT },
    ],
    engineering: [
       { to: '/bom', label: 'Fichas Técnicas', icon: <Wrench size={20} />, roles: ALL_MGMT },
       { to: '/bom/import', label: 'Importar TXT', icon: <Upload size={20} />, roles: ALL_MGMT }, // NEW ITEM
       { to: '/targets', label: 'Metas de Produção', icon: <Target size={20} />, roles: ALL_MGMT },
       { to: '/engineering/registrations', label: 'Cadastros Gerais', icon: <Database size={20} />, roles: ALL_MGMT },
    ],
    logistics: [
       { to: '/logistics', label: 'Expedição', icon: <Truck size={20} />, roles: ALL_MGMT },
       { to: '/logistics/import', label: 'Conf. Relatórios', icon: <FileText size={20} />, roles: ALL_MGMT },
    ],
    financial: [
        { to: '/financial', label: 'Custo Industrial', icon: <DollarSign size={20} />, roles: ADMIN_MGMT },
    ]
  };

  const currentNavItems = navItems[activeModule].filter(item => user && item.roles.includes(user.role));

  const handleModuleChange = (mod: ModuleType) => {
    setActiveModule(mod);
    // Redirect to default page for that module
    if (mod === 'production') navigate('/');
    if (mod === 'inventory') navigate('/inventory');
    if (mod === 'engineering') navigate('/bom');
    if (mod === 'logistics') navigate('/logistics');
    if (mod === 'financial') navigate('/financial');
    setMobileMenuOpen(false);
  };

  // --- RENDER HELPERS ---

  const ModuleIcon = ({ id, icon, label, active }: { id: ModuleType, icon: React.ReactNode, label: string, active: boolean }) => (
    <button
        onClick={() => handleModuleChange(id)}
        className={`w-full aspect-square flex flex-col items-center justify-center transition-all duration-200 group relative ${
            active 
            ? 'bg-brand-900 text-white' 
            : 'text-slate-400 hover:bg-slate-800 hover:text-white'
        }`}
        title={label}
    >
        {active && <div className="absolute left-0 top-2 bottom-2 w-1 bg-brand-500 rounded-r-full" />}
        <div className={`p-2 rounded-xl transition-all ${active ? 'bg-brand-800' : 'bg-slate-800/50 group-hover:bg-slate-700'}`}>
            {icon}
        </div>
        <span className="text-[9px] mt-1 font-medium tracking-wide opacity-80">{label}</span>
    </button>
  );

  return (
    <div className="flex h-screen w-full bg-slate-50 overflow-hidden relative">
      
      {/* MAINTENANCE OVERLAY BANNER */}
      {maintenanceMode && (
        <div className="absolute top-0 left-0 w-full z-50 bg-red-600 text-white text-center py-1 px-4 text-xs font-bold uppercase tracking-widest shadow-lg flex items-center justify-center">
            <AlertTriangle size={14} className="mr-2" />
            SISTEMA EM MANUTENÇÃO - NOVOS APONTAMENTOS BLOQUEADOS
        </div>
      )}

      {/* 1. RAIL (Módulos) - Desktop Only */}
      <aside className={`hidden md:flex flex-col w-20 bg-slate-900 border-r border-slate-800 z-30 shadow-xl shrink-0 ${maintenanceMode ? 'mt-6' : ''}`}>
        <div className="h-16 flex items-center justify-center border-b border-slate-800">
            <Box className="text-brand-500" size={28} />
        </div>
        
        <div className="flex-1 flex flex-col gap-2 py-4 overflow-y-auto">
            <ModuleIcon 
                id="production" 
                icon={<Layers size={22} />} 
                label="PCP" 
                active={activeModule === 'production'} 
            />
            <ModuleIcon 
                id="inventory" 
                icon={<Package size={22} />} 
                label="WMS" 
                active={activeModule === 'inventory'} 
            />
            <ModuleIcon 
                id="engineering" 
                icon={<Wrench size={22} />} 
                label="ENG" 
                active={activeModule === 'engineering'} 
            />
            <ModuleIcon 
                id="logistics" 
                icon={<Truck size={22} />} 
                label="LOG" 
                active={activeModule === 'logistics'} 
            />
            <ModuleIcon 
                id="financial" 
                icon={<DollarSign size={22} />} 
                label="FIN" 
                active={activeModule === 'financial'} 
            />
        </div>

        <div className="p-4 flex flex-col items-center border-t border-slate-800 text-slate-500">
            <div title={isOnline ? "Online" : "Offline"}>
                {isOnline ? <Wifi size={16} className="text-green-500" /> : <WifiOff size={16} className="text-red-500" />}
            </div>
        </div>
      </aside>

      {/* 2. DRAWER (Menu Secundário) */}
      <aside className={`
        fixed inset-y-0 left-0 z-20 w-64 bg-brand-900 text-white transform transition-transform duration-300 ease-in-out flex flex-col shadow-2xl
        md:relative md:translate-x-0
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:ml-0'}
        ${maintenanceMode ? 'mt-6' : ''}
      `}>
        {/* Mobile Header inside Drawer */}
        <div className="h-16 flex items-center px-6 border-b border-brand-800 justify-between md:justify-start">
            <div className="flex flex-col">
                <span className="text-[10px] font-bold text-brand-400 uppercase tracking-widest">Módulo</span>
                <h2 className="text-lg font-bold text-white leading-tight">
                    {activeModule === 'production' ? 'Produção' : activeModule === 'inventory' ? 'Estoque' : activeModule === 'logistics' ? 'Logística' : activeModule === 'financial' ? 'Financeiro' : 'Engenharia'}
                </h2>
            </div>
            <button onClick={() => setMobileMenuOpen(false)} className="md:hidden text-brand-300"><X size={24} /></button>
        </div>

        {/* Mobile Module Switcher (Visible only on mobile) */}
        <div className="md:hidden grid grid-cols-5 gap-1 p-2 border-b border-brand-800 bg-brand-950/30">
             <button onClick={() => handleModuleChange('production')} className={`p-2 rounded text-center text-xs ${activeModule === 'production' ? 'bg-brand-700 text-white' : 'text-brand-400'}`}>PCP</button>
             <button onClick={() => handleModuleChange('inventory')} className={`p-2 rounded text-center text-xs ${activeModule === 'inventory' ? 'bg-brand-700 text-white' : 'text-brand-400'}`}>Estq</button>
             <button onClick={() => handleModuleChange('engineering')} className={`p-2 rounded text-center text-xs ${activeModule === 'engineering' ? 'bg-brand-700 text-white' : 'text-brand-400'}`}>Eng</button>
             <button onClick={() => handleModuleChange('logistics')} className={`p-2 rounded text-center text-xs ${activeModule === 'logistics' ? 'bg-brand-700 text-white' : 'text-brand-400'}`}>Log</button>
             <button onClick={() => handleModuleChange('financial')} className={`p-2 rounded text-center text-xs ${activeModule === 'financial' ? 'bg-brand-700 text-white' : 'text-brand-400'}`}>Fin</button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
            {currentNavItems.map((item) => {
                const isActive = location.pathname === item.to;
                return (
                <button
                    key={item.to}
                    onClick={() => { navigate(item.to); setMobileMenuOpen(false); }}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-lg transition-all duration-200 text-left group ${
                    isActive
                        ? 'bg-brand-700 text-white shadow-lg ring-1 ring-brand-600'
                        : 'text-brand-100 hover:bg-brand-800 hover:text-white'
                    }`}
                >
                    <div className="flex items-center space-x-3">
                    <span className={isActive ? 'text-brand-200' : 'text-brand-400 group-hover:text-brand-200'}>{item.icon}</span>
                    <span className="font-medium">{item.label}</span>
                    </div>
                </button>
                );
            })}
        </nav>

        {/* Footer Info */}
        <div className="p-4 text-xs text-brand-300/50 text-center border-t border-brand-800/50">
            <p>PPlast ERP System</p>
            <p>&copy; 2024</p>
        </div>
      </aside>


      {/* 3. MAIN CONTENT AREA */}
      <div className={`flex-1 flex flex-col h-full min-w-0 ${maintenanceMode ? 'mt-6' : ''}`}>
        
        {/* Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shadow-sm z-10 shrink-0">
            <div className="flex items-center md:hidden">
                <button onClick={() => setMobileMenuOpen(true)} className="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-lg">
                    <Menu size={24} />
                </button>
                <span className="ml-3 font-bold text-slate-700">PPlast ERP</span>
            </div>
            
            {/* DEV MODE INDICATOR */}
            <div className="hidden md:flex items-center">
                {user?.id === 'dev-mode-user' && (
                    <div className="flex items-center space-x-2 bg-orange-50 border border-orange-200 text-orange-700 px-3 py-1.5 rounded-full shadow-sm">
                        <AlertTriangle size={14} className="animate-pulse" />
                        <span className="text-xs font-bold tracking-wide">MODO DEV v8.0.0 (Active)</span>
                    </div>
                )}
            </div>

            {/* Right Actions */}
            <div className="flex items-center space-x-4 md:space-x-6">
                {isAdmin && (
                    <button 
                        onClick={() => navigate('/alerts')}
                        className="relative p-2 rounded-full hover:bg-slate-100 text-slate-500 transition-colors"
                        title="Notificações"
                    >
                        <Bell size={20} />
                        {unreadCount > 0 && (
                        <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-white"></span>
                        )}
                    </button>
                )}
                
                <div className="h-6 w-px bg-slate-200 hidden md:block"></div>

                <div className="flex items-center pl-2">
                    <div className="text-right hidden sm:block mr-3">
                        <p className="text-sm font-bold text-slate-800 leading-tight">{user?.fullName || user?.email}</p>
                        <p className="text-sm text-slate-500 uppercase tracking-wider font-bold">
                            {user?.role === 'admin' ? 'Administrador' : user?.role === 'manager' ? 'Gerente' : user?.role === 'supervisor' ? 'Supervisor' : 'Operador'}
                        </p>
                    </div>
                    <div className="w-9 h-9 bg-brand-100 rounded-full flex items-center justify-center text-brand-700 border border-brand-200 shadow-sm">
                        <User size={18} />
                    </div>
                    <button 
                        onClick={handleLogout}
                        className="ml-3 p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                        title="Sair"
                    >
                        <LogOut size={18} />
                    </button>
                </div>
            </div>
        </header>

        {/* Content Scrollable */}
        <main className="flex-1 overflow-auto p-4 md:p-8 bg-slate-50/50">
            <div className="max-w-7xl mx-auto pb-10">
                {children}
            </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;