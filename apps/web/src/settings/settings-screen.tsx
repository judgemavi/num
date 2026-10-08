import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CategoriesPanel } from "@/settings/categories-panel";
import { TagsPanel } from "@/settings/tags-panel";

export function SettingsScreen() {
  return (
    <>
      <PageHeader kicker="Book" title="Settings" />
      <Tabs defaultValue="categories">
        <TabsList className="h-11">
          <TabsTrigger value="categories" className="min-h-11 px-4">
            Categories
          </TabsTrigger>
          <TabsTrigger value="tags" className="min-h-11 px-4">
            Tags
          </TabsTrigger>
        </TabsList>
        <TabsContent value="categories">
          <CategoriesPanel />
        </TabsContent>
        <TabsContent value="tags">
          <TagsPanel />
        </TabsContent>
      </Tabs>
    </>
  );
}
