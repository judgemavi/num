import { setupStatusSchema } from "@num/shared";
import { useQuery } from "@tanstack/react-query";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { apiRequest } from "@/request";
import { SetupScreen } from "@/setup-screen";
import { navItems, type NavPath } from "@/nav";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

function isCurrent(pathname: string, to: NavPath) {
  if (to === "/") {
    return pathname === "/";
  }
  return pathname === to || pathname.startsWith(`${to}/`);
}

function AppSidebar() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { setOpenMobile } = useSidebar();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link to="/" aria-label="Num home" className="px-2 text-lg font-semibold">
          Num
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <nav aria-label="Main">
              <SidebarMenu>
                {navItems.map((item) => {
                  const current = isCurrent(pathname, item.to);
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton asChild isActive={current} tooltip={item.label}>
                        <Link
                          to={item.to}
                          aria-current={current ? "page" : undefined}
                          onClick={() => setOpenMobile(false)}
                        >
                          <Icon />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </nav>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

function AppShell() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const current = navItems.find((item) => isCurrent(pathname, item.to));

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="flex items-center gap-2 px-4 py-4">
            <SidebarTrigger />
            <h1 className="text-2xl font-semibold">{current?.label ?? "Num"}</h1>
          </header>
          <main className="px-4 pb-8">
            <Outlet />
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}

export function RootLayout() {
  const setup = useQuery({
    queryKey: ["setup"],
    queryFn: async () => {
      const result = await apiRequest("/api/setup", setupStatusSchema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data;
    },
  });

  if (setup.isPending) {
    return <p className="p-6 text-muted-foreground">Loading setup.</p>;
  }
  if (setup.isError) {
    return (
      <div className="flex flex-col items-start gap-4 p-6">
        <p>The setup status did not load.</p>
        <Button type="button" onClick={() => void setup.refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  if (!setup.data.complete) {
    return <SetupScreen onDone={() => void setup.refetch()} />;
  }
  return <AppShell />;
}
