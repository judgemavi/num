export const settingsAreas = [
  { to: "/settings/groups", label: "Groups" },
  { to: "/settings/categories", label: "Categories" },
  { to: "/settings/tags", label: "Tags" },
  { to: "/settings/backup", label: "Backup" },
] as const;

export const listSearch = { page: 1, pageSize: 50, archived: false } as const;
