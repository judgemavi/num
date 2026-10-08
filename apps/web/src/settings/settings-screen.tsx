import { PageHeader } from "@/components/page-header";
import { CategoriesPanel } from "@/settings/categories-panel";
import { TagsPanel } from "@/settings/tags-panel";

export function SettingsScreen() {
  return (
    <>
      <PageHeader kicker="Book" title="Settings" />
      <div className="grid content-start gap-5">
        <CategoriesPanel />
        <TagsPanel />
      </div>
    </>
  );
}
