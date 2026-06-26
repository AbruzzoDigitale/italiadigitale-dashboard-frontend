import React from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { ThemeProvider } from "./context/ThemeContext";
import { ToastProvider } from "./context/ToastContext";
import { AuthProvider } from "./context/AuthContext";
import { BrandProvider } from "./context/BrandContext";
import { useAuth } from "./hooks/useAuth";
import { FullPageSpinner } from "./components/ui/Spinner";
import { LoginPage } from "./pages/LoginPage";
import { CompanyPickerPage } from "./pages/CompanyPickerPage";
import { DashboardLayout } from "./layouts/DashboardLayout";
import { DashboardHome } from "./pages/DashboardHome";
import { UsersPage } from "./pages/UsersPage";
import { CompaniesPage } from "./pages/CompaniesPage";
import { CompanyBrandPage } from "./pages/CompanyBrandPage";
import { ProfilePage } from "./pages/ProfilePage";
import { ClientsPage } from "./pages/ClientsPage";
import { ClientDetailPage } from "./pages/ClientDetailPage";
import { ClientsSituationPage } from "./pages/ClientsSituationPage";
import { QuotesPage } from "./pages/QuotesPage";
import { RequestsPage } from "./pages/RequestsPage";
import { QuoteEditorPage } from "./pages/QuoteEditorPage";
import { CatalogPage } from "./pages/CatalogPage";
import { ConfiguratorModularPage } from "./pages/ConfiguratorModularPage";
import { SocialPackagesPage } from "./pages/SocialPackagesPage";
import { SocialPackagesPresentationPage } from "./pages/SocialPackagesPresentationPage";
import { ForbiddenPage } from "./pages/ForbiddenPage";
import { WorkItemsPage } from "./pages/WorkItemsPage";
import { WorkloadPage } from "./pages/WorkloadPage";
import { DailyTasksPage } from "./pages/DailyTasksPage";
import { ContractsPipelinePage } from "./pages/ContractsPipelinePage";
import { canAccessRoute, getFallbackRoute } from "./utils/access";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <FullPageSpinner />;
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <FullPageSpinner />;
  return isAuthenticated ? <Navigate to="/choose-company" replace /> : <>{children}</>;
}

function RouteAccess({ routeKey, children }: { routeKey: Parameters<typeof canAccessRoute>[1]; children: React.ReactNode }) {
  const { permissions, isLoading, isAuthenticated } = useAuth();
  const location = useLocation();
  if (isLoading) return <FullPageSpinner />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (canAccessRoute(permissions, routeKey)) return <>{children}</>;
  // La dashboard non è una pagina "vietata": chi non può vederla (es. operatore)
  // viene portato alla propria vista di partenza invece di un "accesso negato".
  if (routeKey === "dashboard") {
    const fallback = getFallbackRoute(permissions);
    if (fallback !== "/") return <Navigate to={`${fallback}${location.search}`} replace />;
  }
  return <ForbiddenPage />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicOnlyRoute>
            <LoginPage />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/choose-company"
        element={
          <ProtectedRoute>
            <CompanyPickerPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<RouteAccess routeKey="dashboard"><DashboardHome /></RouteAccess>} />
        <Route path="users" element={<RouteAccess routeKey="admin"><UsersPage /></RouteAccess>} />
        <Route path="companies" element={<RouteAccess routeKey="admin"><CompaniesPage /></RouteAccess>} />
        <Route path="companies/:id/brand" element={<RouteAccess routeKey="admin"><CompanyBrandPage /></RouteAccess>} />
        <Route path="clients" element={<RouteAccess routeKey="clients"><ClientsPage /></RouteAccess>} />
        <Route path="clients/:id" element={<RouteAccess routeKey="clients"><ClientDetailPage /></RouteAccess>} />
        <Route path="clients-situation" element={<RouteAccess routeKey="clients-situation"><ClientsSituationPage /></RouteAccess>} />
        <Route path="quotes" element={<RouteAccess routeKey="quotes"><QuotesPage /></RouteAccess>} />
        <Route path="preventivo" element={<RouteAccess routeKey="preventivo"><QuoteEditorPage /></RouteAccess>} />
        <Route path="requests" element={<RouteAccess routeKey="requests"><RequestsPage /></RouteAccess>} />
        <Route path="requests/edit" element={<RouteAccess routeKey="requests"><QuoteEditorPage /></RouteAccess>} />
        <Route path="catalog" element={<RouteAccess routeKey="catalog"><CatalogPage /></RouteAccess>} />
        <Route path="configuratore" element={<RouteAccess routeKey="configurator"><ConfiguratorModularPage /></RouteAccess>} />
        <Route path="social-packages" element={<RouteAccess routeKey="social"><SocialPackagesPage /></RouteAccess>} />
        <Route path="social-packages-presentation" element={<RouteAccess routeKey="social"><SocialPackagesPresentationPage /></RouteAccess>} />
        <Route path="profile" element={<RouteAccess routeKey="profile"><ProfilePage /></RouteAccess>} />
        <Route path="work-items" element={<RouteAccess routeKey="work-items"><WorkItemsPage /></RouteAccess>} />
        <Route path="contracts-pipeline" element={<RouteAccess routeKey="contracts"><ContractsPipelinePage /></RouteAccess>} />
        <Route path="workload" element={<RouteAccess routeKey="workload"><WorkloadPage /></RouteAccess>} />
        <Route path="daily-tasks" element={<RouteAccess routeKey="daily-tasks"><DailyTasksPage /></RouteAccess>} />
        <Route path="forbidden" element={<ForbiddenPage />} />
      </Route>
      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <BrandProvider>
            <AppRoutes />
          </BrandProvider>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
