import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { backLink } from "@/components/page-header";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { settingsAreas } from "@/settings/settings-areas";

export function SettingsBack() {
  return (
    <Link to="/settings" className={`${backLink} md:hidden`}>
      <ChevronLeft size={18} aria-hidden="true" />
      Settings
    </Link>
  );
}

export function SettingsSubnav() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return (
    <nav aria-label="Settings" className="hidden md:block">
      <SidebarMenu>
        {settingsAreas.map((area) => {
          const current = pathname === area.to;
          return (
            <SidebarMenuItem key={area.to}>
              <SidebarMenuButton asChild isActive={current}>
                <Link to={area.to} aria-current={current ? "page" : undefined}>
                  {area.label}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </nav>
  );
}
