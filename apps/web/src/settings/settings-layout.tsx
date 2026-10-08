import { Outlet } from "@tanstack/react-router";
import { SettingsSubnav } from "@/settings/settings-nav";

export function SettingsLayout() {
  return (
    <div className="grid items-start gap-5 md:grid-cols-[12rem_minmax(0,1fr)]">
      <SettingsSubnav />
      <div className="grid min-w-0 content-start gap-5">
        <Outlet />
      </div>
    </div>
  );
}
