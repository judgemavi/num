import { Link, Navigate } from "@tanstack/react-router";
import { usePhone } from "@/components/use-phone";
import { ListCard, ListRow, listName } from "@/components/list-card";
import { PageHeader } from "@/components/page-header";
import { settingsAreas } from "@/settings/settings-areas";

export function SettingsIndex() {
  const phone = usePhone();
  if (!phone) {
    return <Navigate to="/settings/categories" />;
  }
  return (
    <>
      <PageHeader kicker="Book" title="Settings" />
      <ListCard label="Settings areas">
        {settingsAreas.map((area) => (
          <ListRow key={area.to} size="simple" label={area.label} link={<Link to={area.to} />}>
            <div className={listName}>{area.label}</div>
          </ListRow>
        ))}
      </ListCard>
    </>
  );
}
