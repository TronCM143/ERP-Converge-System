import React from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import ERPLayout from '../layouts/ERPLayout';
import LoginPage from '../auth/LoginPage';
import PurchaseRequestsPage from '../purchasing/PurchaseRequestsPage';
import PurchaseOrderDetailPage from '../purchasing/PurchaseOrderDetailPage';
import CrmDashboardPage from '../sales/crm/CrmDashboardPage';
import ClientProfilePage from '../sales/crm/ClientProfilePage';
import SalesHistoryPage from '../sales/SalesHistoryPage';
import AdminHomePage from '../admin/AdminHomePage';
import QuotationsListPage from '../sales/quotation/QuotationsListPage';
import ApprovalDashboardPage from '../engineer/ApprovalDashboardPage';
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

        {/* Admin module picker. Admin is the only role with access to every
            area, so it has no single natural home — it used to land in the
            Sales CRM, which hid Inventory and Purchasing entirely. */}
        <Route
          path="/admin"
          element={
            <RequireRole role="admin">
              <AdminHomePage />
            </RequireRole>
          }
        />

        {/* Sales module: CRM (sales + admin oversight) */}
        <Route
          path="/sales/crm"
          element={
            <RequireRole role={['quotation', 'admin']}>
              <CrmDashboardPage />
            </RequireRole>
          }
        />
        {/* A client profile needs an id. `/sales/clients` and `/sales/clients/`
            match no route at all (the :clientId segment cannot be empty), so
            without this they fell through to the catch-all — which is why
            landing on the bare path showed nothing useful. Send them to the
            board, which is the list this page belongs to. */}
        <Route path="/sales/clients" element={<Navigate to="/sales/crm" replace />} />
        <Route
          path="/sales/clients/:clientId"
          element={
            <RequireRole role={['quotation', 'admin']}>
              <ClientProfilePage />
            </RequireRole>
          }
        />

        {/* Engineer: the quotation approval dashboard. Admin can reach it too as
            an escalation path when no engineer is available — the API allows the
            same pair, so the guard and the endpoint agree. */}
        <Route
          path="/engineer/approvals"
          element={
            <RequireRole role={['engineer', 'admin']}>
              <ApprovalDashboardPage />
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

        {/* /sales/analytics is gone. Its whole job — the year's won vs lost —
            is now the chart in the CRM header (SalesTrendChart), and the
            month-by-month detail below still lives at /sales/history. */}

        {/* Detailed sales reporting, split off the CRM dashboard so that page
            can stay a workspace. Reached from the analytics page. */}
        <Route
          path="/sales/history"
          element={
            <RequireRole role={['quotation', 'admin']}>
              <SalesHistoryPage />
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
            <RequireRole role={['purchasing', 'admin']}>
              <PurchaseRequestsPage />
            </RequireRole>
          }
        />
        {/* One order's products. Ranked below the static /create redirect by
            React Router, so that legacy path still wins over this param. */}
        <Route
          path="/purchasing/purchase-requests/:purchaseRequestId"
          element={
            <RequireRole role={['purchasing', 'admin']}>
              <PurchaseOrderDetailPage />
            </RequireRole>
          }
        />
        <Route path="/purchasing/purchase-requests/create" element={<Navigate to="/purchasing/purchase-requests?tab=prs" replace />} />
        <Route path="/purchasing/bill-of-materials/:billOfMaterialId" element={<Navigate to="/purchasing/purchase-requests?tab=bom" replace />} />
        <Route path="/purchasing/process/:purchaseRequestId" element={<Navigate to="/purchasing/purchase-requests?tab=bom" replace />} />

        /* Settings is admin-only. It was shared with sales so they could manage
           the department notification emails — that section no longer exists,
           having been merged into Users, and everything left on the page (users,
           the approval threshold, the Google account, product images) is backed
           by admin-only endpoints. Sales could open it and then get a 403 from
           every control on it, including an empty Users table. */
        <Route
          path="/admin/settings"
          element={
            <RequireRole role="admin">
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
