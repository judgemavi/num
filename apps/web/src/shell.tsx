import { setupStatusSchema } from "@num/shared";
import { useQuery } from "@tanstack/react-query";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Ellipsis, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { moreNav, phoneMoreNav, primaryNav, settingsNav, type NavPath } from "@/nav";
import { apiRequest } from "@/request";
import { SetupScreen } from "@/setup-screen";
import { Button } from "@/components/button";
import { Count } from "@/components/count";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

function isCurrent(pathname: string, to: NavPath) {
  if (to === "/") {
    return pathname === "/";
  }
  return pathname === to || pathname.startsWith(`${to}/`);
}

function SideLink({
  to,
  label,
  icon: Icon,
  pathname,
  count,
  onClick,
}: {
  to: NavPath;
  label: string;
  icon: LucideIcon;
  pathname: string;
  count?: number;
  onClick?: () => void;
}) {
  const current = isCurrent(pathname, to);
  return (
    <Link to={to} className="nav-a" aria-current={current ? "page" : undefined} onClick={onClick}>
      <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
      <span>{label}</span>
      {count !== undefined && count > 0 ? <Count value={count} /> : null}
    </Link>
  );
}

function AppSidebar({ pathname, inboxCount }: { pathname: string; inboxCount?: number }) {
  return (
    <aside className="app-side">
      <Link to="/" className="brand" aria-label="Num home">
        <span className="brand-mark" aria-hidden="true">
          N
        </span>
        Num
      </Link>
      <nav aria-label="Main">
        {primaryNav.map((item) => (
          <SideLink key={item.to} {...item} pathname={pathname} count={item.to === "/" ? inboxCount : undefined} />
        ))}
        <div className="nav-group">More</div>
        {moreNav.map((item) => (
          <SideLink key={item.to} {...item} pathname={pathname} />
        ))}
      </nav>
      <div className="side-foot">
        <SideLink {...settingsNav} pathname={pathname} />
      </div>
    </aside>
  );
}

function PhoneTabs({ pathname, inboxCount }: { pathname: string; inboxCount?: number }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreCurrent = phoneMoreNav.some((item) => isCurrent(pathname, item.to));
  const tabs = primaryNav.filter((item) => item.to !== "/accounts");
  return (
    <>
      <nav className="app-tabs" aria-label="Main">
        {tabs.map((item) => {
          const current = isCurrent(pathname, item.to);
          const Icon = item.icon;
          return (
            <Link key={item.to} to={item.to} className="tab" aria-current={current ? "page" : undefined}>
              <Icon size={24} strokeWidth={1.8} aria-hidden="true" />
              {item.label}
              {item.to === "/" && inboxCount !== undefined && inboxCount > 0 ? <Count value={inboxCount} /> : null}
            </Link>
          );
        })}
        <button
          type="button"
          className="tab"
          aria-current={moreCurrent ? "page" : undefined}
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen(true)}
        >
          <Ellipsis size={24} strokeWidth={1.8} aria-hidden="true" />
          More
        </button>
      </nav>
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle className="display">More</SheetTitle>
          </SheetHeader>
          <nav aria-label="More">
            {phoneMoreNav.map((item) => (
              <SideLink key={item.to} {...item} pathname={pathname} onClick={() => setMoreOpen(false)} />
            ))}
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}

function AppShell() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return (
    <div className="app-shell">
      <AppSidebar pathname={pathname} />
      <main className="page">
        <Outlet />
      </main>
      <PhoneTabs pathname={pathname} />
    </div>
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
    return <p className="muted setup">Loading setup.</p>;
  }
  if (setup.isError) {
    return (
      <div className="setup">
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
