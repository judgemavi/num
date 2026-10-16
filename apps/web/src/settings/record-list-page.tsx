import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { Boundary } from "@/components/boundary";
import { ListCard, ListEmpty } from "@/components/list-card";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { useEditors } from "@/editors/editor-api";
import { SettingsBack } from "@/settings/settings-nav";

export function RecordListPage({ title, kind, children }: {
  title: string;
  kind: "tag" | "merchant" | "group";
  children: ReactNode;
}) {
  const { openEditor } = useEditors();
  return (
    <>
      <SettingsBack />
      <PageHeader
        kicker="Settings"
        title={title}
        actions={
          <Button type="button" onClick={() => void openEditor(kind, { id: null })}>
            <Plus size={20} strokeWidth={1.8} aria-hidden="true" />
            New
          </Button>
        }
      />
      <Boundary loading={`Loading ${title.toLowerCase()}.`} failed={`The ${title.toLowerCase()} did not load.`}>
        {children}
      </Boundary>
    </>
  );
}

export function SettingsRows({ title, children }: { title: string; children: ReactNode }) {
  return <ListCard label={title}>{children}</ListCard>;
}

/** The archived lists use the same empty text. */
export function SettingsEmpty({ title, archived }: { title: string; archived: boolean }) {
  return (
    <ListEmpty>
      {archived ? `No archived ${title.toLowerCase()}.` : `No ${title.toLowerCase()} yet.`}
    </ListEmpty>
  );
}
