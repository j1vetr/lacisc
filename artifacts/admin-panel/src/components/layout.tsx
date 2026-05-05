import React from "react";
import { Link, useLocation } from "wouter";
import { Activity, Database, LayoutDashboard, Settings, List, LogOut } from "lucide-react";
import { useLogout, useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "CDR Records", url: "/cdr-records", icon: Database },
  { title: "KIT Summary", url: "/kits", icon: List },
  { title: "Sync Logs", url: "/sync-logs", icon: Activity },
  { title: "Settings", url: "/settings", icon: Settings },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const logout = useLogout();
  const { data: user, isLoading: userLoading } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        localStorage.removeItem("auth_token");
        window.location.href = "/login";
      },
    });
  };

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden selection:bg-primary/30">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-card/30 flex flex-col shrink-0">
        <div className="h-16 flex items-center px-6 border-b border-border/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold tracking-tighter text-sm shadow-[0_0_15px_rgba(6,182,212,0.3)]">
              SS
            </div>
            <div className="flex flex-col">
              <span className="font-semibold text-sm tracking-tight leading-tight">Station Satcom</span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Operations</span>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-1">
          <div className="px-3 text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider mb-2">Menu</div>
          {navItems.map((item) => {
            const isActive = location === item.url;
            return (
              <Link key={item.title} href={item.url}>
                <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer ${isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"}`}>
                  <item.icon className={`w-4 h-4 ${isActive ? "text-primary" : ""}`} />
                  {item.title}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border/50 shrink-0">
          <div className="flex items-center gap-3 px-2 py-2 rounded-xl bg-secondary/20 border border-border/30">
            {userLoading ? (
              <Skeleton className="h-9 w-9 rounded-full" />
            ) : (
              <Avatar className="h-9 w-9 border border-border/50">
                <AvatarFallback className="bg-background text-xs text-muted-foreground">
                  {user?.name?.substring(0, 2).toUpperCase() || "AD"}
                </AvatarFallback>
              </Avatar>
            )}
            <div className="flex flex-col flex-1 min-w-0">
              {userLoading ? (
                <>
                  <Skeleton className="h-3 w-16 mb-1" />
                  <Skeleton className="h-3 w-24" />
                </>
              ) : (
                <>
                  <span className="text-xs font-semibold truncate">{user?.name || "Admin User"}</span>
                  <span className="text-[10px] text-muted-foreground truncate">{user?.email || "admin@example.com"}</span>
                </>
              )}
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={handleLogout}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-border/50 flex items-center px-8 shrink-0 bg-background/80 backdrop-blur-md sticky top-0 z-20">
          <div className="flex-1" />
          <div className="flex items-center gap-4 text-xs font-mono text-muted-foreground">
            {new Date().toISOString().split('T')[0]} • OP-CENTER
          </div>
        </header>
        <main className="flex-1 overflow-y-auto bg-[url('/noise.png')] bg-repeat opacity-[0.99]">
          <div className="p-8 max-w-[1400px] mx-auto w-full min-h-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
