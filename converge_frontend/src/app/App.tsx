import React from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import ERPLayout from '../layouts/ERPLayout';
import LoginPage from '../auth/LoginPage';
import PurchaseRequestsPage from '../purchasing/PurchaseRequestsPage';
import CrmDashboardPage from '../sales/crm/CrmDashboardPage';
import ClientProfilePage from '../sales/crm/ClientProfilePage';
import QuotationsListPage from '../sales/quotation/QuotationsListPage';
import ProductsPage from '../inventory/ProductsPage';
import AdminSettingsPage from '../admin/AdminSettingsPage';
import RequireRole from './RequireRole';
import { useAuth } from './AuthContext';
import { roleHome } from './roleHome';

function HomeRedirect() {
  const { isAuthenticated, role } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Navigate to={roleHome(role!)} replace />;
}

function LegacyClientRedirect() {
  const { clientId } = useParams<{ clientId: string }>();
  return <Navigate to={`/sales/clients/${clientId}`} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ERPLayout />}>
        <Route path="/" element={<HomeRedirect />} />

        {/* Sales module: CRM (sales + admin oversight) */}
        <Route
          path="/sales/crm"
          element={
            <RequireRole role={['quotation', 'admin']}>
              <CrmDashboardPage />
            </RequireRole>
          }
        />
        <Route
          path="/sales/clients/:clientId"
          element={
            <RequireRole role={['quotation', 'admin']}>
              <ClientProfilePage />
            </RequireRole>
          }
        />

        {/* Sales module: quotations (sales staff only) */}
        <Route
          path="/sales/quotations"
          element={
            <RequireRole role="quotation">
              <QuotationsListPage />
            </RequireRole>
          }
        />

        {/* Inventory: viewable by every role; editing is gated to sales + admin in the UI/API */}
        <Route
          path="/inventory"
          element={
            <RequireRole role={['quotation', 'purchasing', 'admin']}>
              <ProductsPage />
            </RequireRole>
          }
        />

        {/* Purchasing module */}
        <Route
          path="/purchasing/purchase-requests"
          element={
            <RequireRole role="purchasing">
              <PurchaseRequestsPage />
            </RequireRole>
          }
        />
        <Route path="/purchasing/purchase-requests/create" element={<Navigate to="/purchasing/purchase-requests?tab=prs" replace />} />
        <Route path="/purchasing/bill-of-materials/:billOfMaterialId" element={<Navigate to="/purchasing/purchase-requests?tab=bom" replace />} />
        <Route path="/purchasing/process/:purchaseRequestId" element={<Navigate to="/purchasing/purchase-requests?tab=bom" replace />} />

        {/* Admin module (settings shared with sales so they can manage notification emails) */}
        <Route
          path="/admin/settings"
          element={
            <RequireRole role={['admin', 'quotation']}>
              <AdminSettingsPage />
            </RequireRole>
          }
        />

        {/* Legacy URLs from before the module split */}
        <Route path="/quotation/crm" element={<Navigate to="/sales/crm" replace />} />
        <Route path="/quotation/clients/:clientId" element={<LegacyClientRedirect />} />
        <Route path="/quotation/quotations" element={<Navigate to="/sales/quotations" replace />} />
        <Route path="/products" element={<Navigate to="/inventory" replace />} />

        <Route path="*" element={<HomeRedirect />} />
      </Route>
    </Routes>
  );
}
