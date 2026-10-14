import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { settingsAreas } from "@/settings/settings-areas";

export function SettingsBack() {
  return (
    <Link to="/settings" className="inline-flex min-h-11 items-center gap-1 font-semibold text-muted-foreground md:hidden">
      <ChevronLeft size={18} aria-hidden="true" />
      Settings
    </Link>
  );
}

export function SettingsSubnav() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return (
    <nav aria-label="Settings" className="hidden content-start gap-1 md:grid">
      {settingsAreas.map((area) => {
        const current = pathname === area.to;
        return (
          <Link
            key={area.to}
            to={area.to}
            aria-current={current ? "page" : undefined}
            className={`flex min-h-11 items-center rounded-xl px-3 font-semibold ${current ? "bg-primary-soft text-primary" : "hover:bg-sunken"}`}
          >
            {area.label}
          </Link>
        );
      })}
    </nav>
  );
}
