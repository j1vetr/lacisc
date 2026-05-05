import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect } from "react";

// Layout
import Layout from "./components/layout";

// Pages
import Login from "./pages/login";
import Dashboard from "./pages/dashboard";
import Settings from "./pages/settings";
import CdrRecords from "./pages/cdr-records";
import Kits from "./pages/kits";
import SyncLogs from "./pages/sync-logs";
import NotFound from "./pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoute({ component: Component }: { component: any }) {
  const [, setLocation] = useLocation();
  const token = localStorage.getItem("auth_token");

  if (!token) {
    setLocation("/login");
    return null;
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
      <Route path="/" render={() => <ProtectedRoute component={Dashboard} />} />
      <Route path="/cdr-records" render={() => <ProtectedRoute component={CdrRecords} />} />
      <Route path="/kits" render={() => <ProtectedRoute component={Kits} />} />
      <Route path="/sync-logs" render={() => <ProtectedRoute component={SyncLogs} />} />
      <Route path="/settings" render={() => <ProtectedRoute component={Settings} />} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  // Always dark mode
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
