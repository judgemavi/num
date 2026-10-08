import { CategoriesPanel } from "@/settings/categories-panel";
import { TagsPanel } from "@/settings/tags-panel";
import { Separator } from "@/components/ui/separator";

export function SettingsScreen() {
  return (
    <div className="flex flex-col gap-8">
      <CategoriesPanel />
      <Separator />
      <TagsPanel />
    </div>
  );
}
