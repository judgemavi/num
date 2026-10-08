import { Navigate, useNavigate } from "@tanstack/react-router";
import { usePhone } from "@/components/use-phone";
import { ListCard, ListRow, listName } from "@/components/list-card";
import { PageHeader } from "@/components/page-header";
import { listSearch, settingsAreas } from "@/settings/settings-areas";

export function SettingsIndex() {
  const phone = usePhone();
  const navigate = useNavigate();
  if (!phone) {
    return <Navigate to="/settings/categories" search={listSearch} />;
  }
  return (
    <>
      <PageHeader kicker="Book" title="Settings" />
      <ListCard label="Settings areas">
        {settingsAreas.map((area) => (
          <ListRow
            key={area.to}
            simple
            onOpen={() => {
              if (area.to === "/settings/categories" || area.to === "/settings/tags") {
                void navigate({ to: area.to, search: listSearch });
                return;
              }
              void navigate({ to: area.to });
            }}
          >
            <div className={listName}>{area.label}</div>
          </ListRow>
        ))}
      </ListCard>
    </>
  );
}
