import React from 'react';
import { MemoryRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import { EntryForm } from './pages/EntryForm';
import ProductionList from './pages/ProductionList';
import ProductionPlanPage from './pages/ProductionPlanPage'; 
import AlertsPage from './pages/AlertsPage';
import SettingsPage from './pages/SettingsPage';
import LoginPage from './pages/LoginPage';
import InventoryPage from './pages/InventoryPage'; 
import InventoryAuditPage from './pages/InventoryAuditPage';
import InventoryKardexPage from './pages/InventoryKardexPage';
import BOMPage from './pages/BOMPage'; 
import ProductTargetsPage from './pages/ProductTargetsPage'; 
import LogisticsPage from './pages/LogisticsPage';
import LegacyImportPage from './pages/LegacyImportPage';
import StructureImportPage from './pages/StructureImportPage'; // NEW IMPORT
import EngineeringRegistrations from './pages/EngineeringRegistrations';
import FinancialPage from './pages/FinancialPage';
import PurchasePage from './pages/PurchasePage';
import BatchEntryPage from './pages/BatchEntryPage';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Loader2 } from 'lucide-react';

const ProtectedRoute = ({ children, allowedRoles }: { children?: React.ReactNode, allowedRoles?: string[] }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
            <Loader2 className="animate-spin text-brand-600" size={48} />
        </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    if (user.role === 'operator') return <Navigate to="/entry" replace />;
    return <Navigate to="/" replace />;
  }

  return <Layout>{children}</Layout>;
};

const PublicOnlyRoute = ({ children }: { children?: React.ReactNode }) => {
    const { user, loading } = useAuth();
    if (loading) return null;
    if (user) {
        if (user.role === 'operator') return <Navigate to="/entry" replace />;
        return <Navigate to="/" replace />;
    }
    return <>{children}</>;
};

// ROLE CONSTANTS
const ALL_MANAGEMENT = ['admin', 'manager', 'supervisor'];
const FULL_ACCESS = ['admin', 'manager', 'supervisor', 'operator'];
const ADMIN_ONLY = ['admin', 'manager']; // Settings might be restricted for supervisor

function App() {
  return (
    <AuthProvider>
      <MemoryRouter>
        <Routes>
          <Route path="/login" element={
            <PublicOnlyRoute>
                <LoginPage />
            </PublicOnlyRoute>
          } />

          {/* PRODUCTION MODULE */}
          <Route path="/" element={
            <ProtectedRoute allowedRoles={ALL_MANAGEMENT}>
              <Dashboard />
            </ProtectedRoute>
          } />
          
          <Route path="/production-plan" element={
            <ProtectedRoute allowedRoles={ALL_MANAGEMENT}>
              <ProductionPlanPage />
            </ProtectedRoute>
          } />

          <Route path="/list" element={
            <ProtectedRoute allowedRoles={ALL_MANAGEMENT}>
              <ProductionList />
            </ProtectedRoute>
          } />
          
          <Route path="/alerts" element={
            <ProtectedRoute allowedRoles={ALL_MANAGEMENT}>
              <AlertsPage />
            </ProtectedRoute>
          } />
          
          <Route path="/settings" element={
            <ProtectedRoute allowedRoles={ADMIN_ONLY}>
              <SettingsPage />
            </ProtectedRoute>
          } />

          <Route path="/entry" element={
            <ProtectedRoute allowedRoles={FULL_ACCESS}>
              <EntryForm />
            </ProtectedRoute>
          } />

          {/* NEW: BATCH ENTRY ROUTE */}
          <Route path="/batch-entry" element={
            <ProtectedRoute allowedRoles={ALL_MANAGEMENT}>
              <BatchEntryPage />
            </ProtectedRoute>
          } />

          {/* INVENTORY MODULE */}
          <Route path="/inventory" element={
            <ProtectedRoute allowedRoles={FULL_ACCESS}>
              <InventoryPage />
            </ProtectedRoute>
          } />
          
          <Route path="/inventory/audit" element={
            <ProtectedRoute allowedRoles={ALL_MANAGEMENT}>
              <InventoryAuditPage />
            </ProtectedRoute>
          } />

          <Route path="/inventory/kardex" element={
            <ProtectedRoute allowedRoles={ALL_MANAGEMENT}>
              <InventoryKardexPage />
            </ProtectedRoute>
          } />

           <Route path="/purchasing" element={
            <ProtectedRoute allowedRoles={ALL_MANAGEMENT}>
              <PurchasePage />
            </ProtectedRoute>
          } />

          {/* ENGINEERING MODULE */}
          <Route path="/bom" element={
            <ProtectedRoute allowedRoles={ALL_MANAGEMENT}>
              <BOMPage />
            </ProtectedRoute>
          } />
          
          {/* NEW: STRUCTURE IMPORT (TXT) */}
          <Route path="/bom/import" element={
            <ProtectedRoute allowedRoles={ALL_MANAGEMENT}>
              <StructureImportPage />
            </ProtectedRoute>
          } />

          <Route path="/targets" element={
            <ProtectedRoute allowedRoles={ALL_MANAGEMENT}>
              <ProductTargetsPage />
            </ProtectedRoute>
          } />

          <Route path="/engineering/registrations" element={
            <ProtectedRoute allowedRoles={ALL_MANAGEMENT}>
              <EngineeringRegistrations />
            </ProtectedRoute>
          } />

          {/* LOGISTICS MODULE */}
          <Route path="/logistics" element={
            <ProtectedRoute allowedRoles={ALL_MANAGEMENT}>
              <LogisticsPage />
            </ProtectedRoute>
          } />
          
          <Route path="/logistics/import" element={
            <ProtectedRoute allowedRoles={ALL_MANAGEMENT}>
              <LegacyImportPage />
            </ProtectedRoute>
          } />

          {/* FINANCIAL MODULE */}
          <Route path="/financial" element={
            <ProtectedRoute allowedRoles={ADMIN_ONLY}>
              <FinancialPage />
            </ProtectedRoute>
          } />

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );
}

export default App;