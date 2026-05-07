import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect } from "react";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { ErrorBoundary } from "./components/error-boundary";

// Layout
import Layout from "./components/layout";

// Pages
import Login from "./pages/login";
import Dashboard from "./pages/dashboard";
import Settings from "./pages/settings";
import Kits from "./pages/kits";
import KitDetail from "./pages/kit-detail";
import SyncLogs from "./pages/sync-logs";
import Profile from "./pages/profile";
import AdminUsers from "./pages/admin-users";
import AuditLogs from "./pages/audit-logs";
import NotFound from "./pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

type Role = "owner" | "admin" | "viewer";

function ProtectedRoute({
  component: Component,
  minRole,
}: {
  component: any;
  minRole?: Role;
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
    const rank: Record<Role, number> = { viewer: 0, admin: 1, owner: 2 };
    const role = (user.role as Role) ?? "viewer";
    if (rank[role] < rank[minRole]) {
      return (
        <Layout>
          <div className="max-w-xl mx-auto mt-12 p-6 border border-border rounded-xl bg-card text-center space-y-2">
            <h1 className="text-base font-semibold">Erişim engellendi</h1>
            <p className="text-sm text-muted-foreground">
              Bu sayfayı görüntülemek için yetkiniz yok.
            </p>
          </div>
        </Layout>
      );
    }
  }

  return (
    <Layout>
      <Component />
    </Layout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/">{() => <ProtectedRoute component={Dashboard} />}</Route>
      <Route path="/kits">{() => <ProtectedRoute component={Kits} />}</Route>
      <Route path="/kits/:kitNo">{() => <ProtectedRoute component={KitDetail} />}</Route>
      <Route path="/sync-logs">{() => <ProtectedRoute component={SyncLogs} />}</Route>
      <Route path="/settings">{() => <ProtectedRoute component={Settings} minRole="admin" />}</Route>
      <Route path="/profile">{() => <ProtectedRoute component={Profile} />}</Route>
      <Route path="/admin/users">{() => <ProtectedRoute component={AdminUsers} minRole="admin" />}</Route>
      <Route path="/audit-logs">{() => <ProtectedRoute component={AuditLogs} minRole="admin" />}</Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
