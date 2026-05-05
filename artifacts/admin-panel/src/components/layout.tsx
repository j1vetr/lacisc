import React from "react";
import { Link, useLocation } from "wouter";
import { Activity, Database, LayoutDashboard, Settings, List, LogOut, Menu } from "lucide-react";
import { useLogout, useGetMe } from "@workspace/api-client-react";
import { 
  Sidebar, 
  SidebarContent, 
  SidebarFooter, 
  SidebarGroup, 
  SidebarGroupContent, 
  SidebarHeader, 
  SidebarMenu, 
  SidebarMenuButton, 
  SidebarMenuItem, 
  SidebarProvider, 
  SidebarTrigger,
  useSidebar
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "CDR Records", url: "/cdr-records", icon: Database },
  { title: "KIT Summary", url: "/kits", icon: List },
  { title: "Sync Logs", url: "/sync-logs", icon: Activity },
  { title: "Settings", url: "/settings", icon: Settings },
];

function AppSidebar() {
  const [location] = useLocation();
  const logout = useLogout();
  const { data: user } = useGetMe();

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        localStorage.removeItem("auth_token");
        window.location.href = "/login";
      },
    });
  };

  return (
    <Sidebar variant="sidebar" collapsible="icon">
      <SidebarHeader className="py-4">
        <div className="flex items-center px-4 space-x-2">
          <div className="h-8 w-8 bg-primary rounded flex items-center justify-center text-primary-foreground font-bold font-mono">
            SS
          </div>
          <div className="flex flex-col overflow-hidden group-data-[collapsible=icon]:hidden">
            <span className="font-semibold text-sm leading-tight text-foreground truncate">Station Satcom</span>
            <span className="text-xs text-muted-foreground truncate">Admin Panel</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location === item.url} tooltip={item.title}>
                    <Link href={item.url} className="flex items-center">
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="py-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-3 px-4 py-2 group-data-[collapsible=icon]:justify-center">
              <Avatar className="h-8 w-8 rounded-sm bg-muted text-muted-foreground font-mono">
                <AvatarFallback>{user?.name?.substring(0, 2).toUpperCase() || "AD"}</AvatarFallback>
              </Avatar>
              <div className="flex flex-col flex-1 overflow-hidden group-data-[collapsible=icon]:hidden">
                <span className="text-sm font-medium leading-none truncate">{user?.name || "Admin User"}</span>
                <span className="text-xs text-muted-foreground mt-1 truncate">{user?.email || "admin@example.com"}</span>
              </div>
            </div>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleLogout} tooltip="Logout" className="text-muted-foreground hover:text-destructive">
              <LogOut className="h-4 w-4" />
              <span>Logout</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider defaultOpen>
      <div className="flex min-h-screen w-full bg-background overflow-hidden text-foreground">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <header className="h-14 border-b border-border flex items-center px-4 shrink-0 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
            <SidebarTrigger className="mr-4" />
            <div className="flex-1" />
          </header>
          <main className="flex-1 overflow-auto p-6 md:p-8">
            <div className="mx-auto max-w-7xl w-full">
              {children}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
