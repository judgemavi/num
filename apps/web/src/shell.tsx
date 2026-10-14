import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Ellipsis, type LucideIcon } from "lucide-react";
import { reviewSummaryQuery } from "@/api/review";
import { setupStatusQuery } from "@/api/setup";
import { localAsOf } from "@/as-of";
import { Boundary } from "@/components/boundary";
import { EditorHost } from "@/editors/editor-host";
import { useStartSharedLists } from "@/editors/lookups";
import { moreNav, phoneMoreNav, primaryNav, settingsNav, type NavPath } from "@/nav";
import { SetupScreen } from "@/setup-screen";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";

function isCurrent(pathname: string, to: NavPath) {
  if (to === "/") {
    return pathname === "/";
  }
  return pathname === to || pathname.startsWith(`${to}/`);
}

function NavItem({
  to,
  label,
  icon: Icon,
  pathname,
  badge,
  onClick,
}: {
  to: NavPath;
  label: string;
  icon: LucideIcon;
  pathname: string;
  /** A badge after the label, for example the number of Needs review items. */
  badge?: ReactNode;
  onClick?: () => void;
}) {
  const current = isCurrent(pathname, to);
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={current} tooltip={label}>
        <Link to={to} aria-current={current ? "page" : undefined} onClick={onClick}>
          <Icon strokeWidth={1.8} aria-hidden="true" />
          <span>{label}</span>
          {badge}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/**
 * The number of Needs review items. The count is a detail of the navigation: the navigation shows before the count is
 * known, and a read that fails shows no badge.
 */
function ReviewCount({ className }: { className: string }) {
  return (
    <Boundary loading={null} failed={() => null}>
      <ReviewCountBadge className={className} />
    </Boundary>
  );
}

function ReviewCountBadge({ className }: { className: string }) {
  const { data: review } = useSuspenseQuery(reviewSummaryQuery(localAsOf()));
  return review.total > 0 ? (
    <Badge variant="count" className={className}>
      {review.total}
    </Badge>
  ) : null;
}

function AppSidebar({ pathname }: { pathname: string }) {
  return (
    <Sidebar collapsible="icon" className="h-svh border-r bg-card">
      <SidebarHeader className="px-2 pt-4">
        <div className="flex items-center gap-1 group-data-[collapsible=icon]:flex-col">
          <Link to="/" aria-label="Num home" className="font-display flex min-w-0 flex-1 items-center gap-2.5 px-2 text-2xl leading-none font-extrabold [font-stretch:72%] group-data-[collapsible=icon]:flex-none group-data-[collapsible=icon]:px-0">
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-foreground text-base text-background" aria-hidden="true">
              N
            </span>
            <span className="group-data-[collapsible=icon]:hidden">Num</span>
          </Link>
          <SidebarTrigger />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {primaryNav.map((item) => (
                <NavItem
                  key={item.to}
                  {...item}
                  pathname={pathname}
                  badge={item.to === "/" ? <ReviewCount className="ml-auto group-data-[collapsible=icon]:hidden" /> : null}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel className="px-3 text-xs font-semibold text-muted-foreground">More</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {moreNav.map((item) => (
                <NavItem key={item.to} {...item} pathname={pathname} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <NavItem {...settingsNav} pathname={pathname} />
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function sidebarDefaultOpen() {
  const prefix = "sidebar_state=";
  const found = document.cookie.split("; ").find((part) => part.startsWith(prefix));
  if (!found) {
    return true;
  }
  return found.slice(prefix.length) === "true";
}

function PhoneTabs({ pathname }: { pathname: string }) {
  const moreCurrent = phoneMoreNav.some((item) => isCurrent(pathname, item.to));
  const tabs = primaryNav;
  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-card px-1 pt-1.5 pb-[calc(10px+env(safe-area-inset-bottom))] md:hidden"
        aria-label="Main"
      >
        {tabs.map((item) => {
          const current = isCurrent(pathname, item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-current={current ? "page" : undefined}
              className={`relative grid min-h-[52px] justify-items-center gap-0.5 pt-1.5 text-[11px] font-semibold ${current ? "text-primary" : "text-muted-foreground"}`}
            >
              <Icon size={24} strokeWidth={1.8} aria-hidden="true" />
              {item.label}
              {item.to === "/" ? <ReviewCount className="absolute top-0 left-[calc(50%+6px)]" /> : null}
            </Link>
          );
        })}
        <Sheet>
          <SheetTrigger asChild>
            <button
              type="button"
              aria-current={moreCurrent ? "page" : undefined}
              className={`grid min-h-[52px] justify-items-center gap-0.5 pt-1.5 text-[11px] font-semibold ${moreCurrent ? "text-primary" : "text-muted-foreground"}`}
            >
              <Ellipsis size={24} strokeWidth={1.8} aria-hidden="true" />
              More
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-[20px] pb-[calc(16px+env(safe-area-inset-bottom))]">
            <SheetHeader>
              <SheetTitle className="font-display text-2xl font-extrabold uppercase [font-stretch:72%]">More</SheetTitle>
            </SheetHeader>
            <nav aria-label="More" className="grid px-2">
              {phoneMoreNav.map((item) => {
                const Icon = item.icon;
                const current = isCurrent(pathname, item.to);
                return (
                  <SheetClose asChild key={item.to}>
                    <Link
                      to={item.to}
                      aria-current={current ? "page" : undefined}
                      className={`flex min-h-11 items-center gap-3 rounded-[10px] px-3 font-semibold ${current ? "bg-primary-soft text-primary" : ""}`}
                    >
                      <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
                      {item.label}
                    </Link>
                  </SheetClose>
                );
              })}
            </nav>
          </SheetContent>
        </Sheet>
      </nav>
    </>
  );
}

function AppShell() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  useStartSharedLists();
  return (
    <SidebarProvider defaultOpen={sidebarDefaultOpen()} className="h-svh overflow-hidden bg-background">
      <AppSidebar pathname={pathname} />
      <SidebarInset className="min-h-0 overflow-y-auto bg-background">
        <main className="grid content-start gap-5 px-4 pt-2 pb-[calc(96px+env(safe-area-inset-bottom))] md:px-8 md:py-7 md:pb-9">
          <Outlet />
        </main>
      </SidebarInset>
      <PhoneTabs pathname={pathname} />
    </SidebarProvider>
  );
}

function Book() {
  const setup = useSuspenseQuery(setupStatusQuery());
  if (!setup.data.complete) {
    return <SetupScreen onAlreadyComplete={() => void setup.refetch()} />;
  }
  return (
    <EditorHost>
      <AppShell />
    </EditorHost>
  );
}

export function RootLayout() {
  return (
    <Boundary look="screen" loading="Loading setup." failed="The setup status did not load.">
      <Book />
    </Boundary>
  );
}
