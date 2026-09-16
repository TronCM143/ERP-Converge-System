import React, { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import ERPLayout from '../layouts/ERPLayout';
import LoginPage from '../auth/LoginPage';
import RequireRole from './RequireRole';
import { useAuth } from './AuthContext';
import { roleHome } from './roleHome';

/* Every page below this line is a separate chunk, fetched the first time it is
   visited.

   The whole app used to ship as one 1.1 MB bundle: a purchasing user downloaded
   and parsed the CRM board, the quotation generator, recharts, dnd-kit and the
   approval dashboard before the login form appeared, and none of it was for
   them. Roles here use disjoint parts of the app — the engineer only ever opens
   one page — so splitting by route is the split that matches how it is actually
   used.

   ERPLayout and LoginPage stay eagerly imported: the layout wraps every route,
   and login is the first thing everyone sees, so deferring either would only add
   a round trip. */
const PurchaseRequestsPage = lazy(() => import('../purchasing/PurchaseRequestsPage'));
const PurchaseOrderDetailPage = lazy(() => import('../purchasing/PurchaseOrderDetailPage'));
const CrmDashboardPage = lazy(() => import('../sales/crm/CrmDashboardPage'));
const ClientProfilePage = lazy(() => import('../sales/crm/ClientProfilePage'));
const SalesHistoryPage = lazy(() => import('../sales/SalesHistoryPage'));
const AdminHomePage = lazy(() => import('../admin/AdminHomePage'));
const QuotationsListPage = lazy(() => import('../sales/quotation/QuotationsListPage'));
const ApprovalDashboardPage = lazy(() => import('../engineer/ApprovalDashboardPage'));
const ProductsPage = lazy(() => import('../inventory/ProductsPage'));
const AdminSettingsPage = lazy(() => import('../admin/AdminSettingsPage'));
const SuppliersPage = lazy(() => import('../purchasing/SuppliersPage'));

/* Shown while a route's chunk downloads. Deliberately plain: a spinner that
   appears for 80ms on a warm cache is worse than a quiet pause. */
function RouteFallback() {
  return <div className="p-10 text-center text-[13px] italic text-zinc-500">Loading…</div>;
}

function HomeRedirect() {
  const { isAuthenticated, isRestoring, role } = useAuth();
  if (isRestoring) return <RouteFallback />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Navigate to={roleHome(role!)} replace />;
}

function LegacyClientRedirect() {
  const { clientId } = useParams<{ clientId: string }>();
  return <Navigate to={`/sales/clients/${clientId}`} replace />;
}

export default function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
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

        {/* The supplier master. Purchasing owns it; admin can reach it too. */}
        <Route
          path="/purchasing/suppliers"
          element={
            <RequireRole role={['purchasing', 'admin']}>
              <SuppliersPage />
            </RequireRole>
          }
        />

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

        /* Settings is open to every signed-in role, and the PAGE decides what
           each of them sees: everyone gets their own account (password, email,
           SMS number), admins additionally get the organisation-wide sections.

           It was admin-only for a while because the shared version showed sales
           a page whose every control 403'd. Hiding the sections rather than the
           page is the right fix — a user who cannot change their own password
           has to ask an admin to do it for them. */
        <Route
          path="/admin/settings"
          element={
            <RequireRole role={['admin', 'quotation', 'purchasing', 'engineer']}>
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
    </Suspense>
  );
}
