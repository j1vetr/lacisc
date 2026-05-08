import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Suspense, lazy, useEffect } from "react";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { ErrorBoundary } from "./components/error-boundary";
import { ThemeProvider } from "./components/theme-provider";

// Layout (eager — needed for every authed page chrome)
import Layout from "./components/layout";
import CustomerLayout from "./components/customer-layout";

// Login is eager so the unauthed flow has no flash; everything else is
// route-split so vendor-charts / vendor-motion / heavy pages don't bloat the
// initial JS payload.
import Login from "./pages/login";
const Dashboard = lazy(() => import("./pages/dashboard"));
const CustomerPanel = lazy(() => import("./pages/customer-panel"));
const Kits = lazy(() => import("./pages/kits"));
const KitDetail = lazy(() => import("./pages/kit-detail"));
const SyncLogs = lazy(() => import("./pages/sync-logs"));
const SettingsAccounts = lazy(() => import("./pages/settings/accounts"));
const SettingsStarlink = lazy(() => import("./pages/settings/starlink"));
const SettingsNorway = lazy(() => import("./pages/settings/norway"));
const SettingsEmail = lazy(() => import("./pages/settings/email"));
const SettingsDanger = lazy(() => import("./pages/settings/danger"));
const Profile = lazy(() => import("./pages/profile"));
const AdminUsers = lazy(() => import("./pages/admin-users"));
const AuditLogs = lazy(() => import("./pages/audit-logs"));
const NotFound = lazy(() => import("./pages/not-found"));

// React Query defaults tuned for an ops dashboard:
//   - staleTime 30s: list/KPI screens don't refetch on every navigation, but
//     data is still fresh enough that an operator sees recent sync results
//     within half a minute. Per-query overrides (e.g. sync-progress polling
//     at 1.5s, /me at 60s) bypass this.
//   - refetchOnWindowFocus: false (kept) — operator tabbing back shouldn't
//     thrash the API.
//   - refetchOnReconnect "always" — coming back from a flaky link should
//     refresh data once.
//   - retry 1 + retry-delay backoff: avoids waterfall hammering.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      refetchOnWindowFocus: false,
      refetchOnReconnect: "always",
      staleTime: 30_000,
      gcTime: 5 * 60_000,
    },
    mutations: {
      retry: 0,
    },
  },
});

type Role = "owner" | "admin" | "viewer" | "customer";

function RoleRedirect() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/");
  }, [setLocation]);
  return null;
}

function PageFallback() {
  return (
    <div className="min-h-[40vh] flex items-center justify-center text-sm text-muted-foreground">
      Yükleniyor…
    </div>
  );
}

function ProtectedRoute({
  component: Component,
  minRole,
  bareLayout,
}: {
  component: any;
  minRole?: Role;
  bareLayout?: boolean;
}) {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { data: user, isLoading, isError } = useGetMe({
    query: { queryKey: getGetMeQueryKey(), retry: false, staleTime: 60_000 },
  });

  useEffect(() => {
    if (isError) {
      qc.clear();
      setLocation("/login");
    }
  }, [isError, qc, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Yükleniyor…
      </div>
    );
  }
  if (!user) return null;

  if (minRole) {
    const rank: Record<Role, number> = { customer: -1, viewer: 0, admin: 1, owner: 2 };
    const role = (user.role as Role) ?? "viewer";
    if (rank[role] < rank[minRole]) {
      // Yetersiz rol → Panel'e (kök) yönlendir. Customer doğrudan
      // /admin/users veya /sync-logs gibi bir URL'e gitse "Erişim
      // engellendi" boş paneli yerine olağan akışa geri döner.
      return <RoleRedirect />;
    }
  }

  const role = (user as { role?: Role } | undefined)?.role ?? "viewer";

  // Müşteri her zaman editöryel CustomerLayout içinde render edilir
  // (sidebar + topbar). bareLayout flag'i sadece operatör tarafı için
  // anlamlıdır.
  if (role === "customer") {
    return (
      <CustomerLayout>
        <Suspense fallback={<PageFallback />}>
          <Component />
        </Suspense>
      </CustomerLayout>
    );
  }

  if (bareLayout) {
    return (
      <Suspense fallback={<PageFallback />}>
        <Component />
      </Suspense>
    );
  }
  return (
    <Layout>
      <Suspense fallback={<PageFallback />}>
        <Component />
      </Suspense>
    </Layout>
  );
}

function RootRoute() {
  // Customer rolu için "/" editöryel müşteri panelini, diğerleri için
  // operasyon panelini render eder. Customer panel kendi tam-ekran chrome'unu
  // sağladığı için global Layout'u atlar (bareLayout).
  const { data: user, isLoading } = useGetMe({
    query: { queryKey: getGetMeQueryKey(), retry: false, staleTime: 60_000 },
  });
  if (isLoading) return <PageFallback />;
  const role = (user as { role?: Role } | undefined)?.role ?? "viewer";
  if (role === "customer") {
    return <ProtectedRoute component={CustomerPanel} />;
  }
  return <ProtectedRoute component={Dashboard} />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/">{() => <RootRoute />}</Route>
      <Route path="/kits">{() => <ProtectedRoute component={Kits} />}</Route>
      <Route path="/kits/:kitNo">{() => <ProtectedRoute component={KitDetail} />}</Route>
      <Route path="/sync-logs">{() => <ProtectedRoute component={SyncLogs} minRole="viewer" />}</Route>
      <Route path="/settings">{() => <ProtectedRoute component={SettingsAccounts} minRole="admin" />}</Route>
      <Route path="/settings/starlink">{() => <ProtectedRoute component={SettingsStarlink} minRole="admin" />}</Route>
      <Route path="/settings/norway">{() => <ProtectedRoute component={SettingsNorway} minRole="admin" />}</Route>
      <Route path="/settings/email">{() => <ProtectedRoute component={SettingsEmail} minRole="admin" />}</Route>
      <Route path="/settings/danger">{() => <ProtectedRoute component={SettingsDanger} minRole="admin" />}</Route>
      <Route path="/profile">{() => <ProtectedRoute component={Profile} />}</Route>
      <Route path="/admin/users">{() => <ProtectedRoute component={AdminUsers} minRole="admin" />}</Route>
      <Route path="/audit-logs">{() => <ProtectedRoute component={AuditLogs} minRole="admin" />}</Route>
      <Route>
        {() => (
          <Suspense fallback={<PageFallback />}>
            <NotFound />
          </Suspense>
        )}
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
