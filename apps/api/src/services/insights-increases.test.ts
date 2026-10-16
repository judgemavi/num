import { expect, test } from "bun:test";
import { expense, saved } from "./bucket-test-book";
import { account, money } from "./funding-test-book";
import { createCategoryGroup, updateCategory } from "./categories";
import { createTag } from "./tags";
import { readInsights } from "./insights";
import { readNeedsYou } from "./needs-you";
import { createTransaction } from "./transactions";
import { tempDatabase } from "./test-support";

test("only the three largest increases are on this month's category rows, with no tag", () => {
  const { db, close } = tempDatabase();
  try {
    const cash = account(db, "Cash", "chequing", 1_000_000);
    const group = createCategoryGroup(db, { name: "Everyday", color: "olive", ...saved });
    const tag = createTag(db, { name: "Trip", ...saved });
    const categories = ["Food", "Travel", "Clothes", "Books"].map((name) => expense(db, name));
    for (const [index, category] of categories.entries()) {
      updateCategory(db, category.id, { groupId: group.id, ...saved });
      for (const [month, amount] of [["07", 10_000], ["08", 20_000], ["09", 90_000]] as const) {
        money(db, cash.id, category.id, `2026-${month}-02`, -amount, "Example shop");
      }
      const amount = -(60_000 - index * 10_000);
      createTransaction(db, { accountId: cash.id, date: "2026-10-02", payeeRaw: "Example shop", amount, lines: [{ categoryId: category.id, amount, tagIds: [tag.id] }], ...saved });
      // A later transaction must not change the comparison as of October 8.
      money(db, cash.id, category.id, "2026-10-20", -100_000, "Example shop");
    }
    const query = { asOf: "2026-10-08", window: "1" } as const;
    const report = readInsights(db, query);
    const rows = report.groups.flatMap((group) => group.categories);
    expect(rows.map((row) => row.increase)).toEqual([
      { delta: 40_000, median: 20_000 }, { delta: 30_000, median: 20_000 }, { delta: 20_000, median: 20_000 }, null,
    ]);
    expect(report.groups[0]?.color).toBe("olive");
    expect(readInsights(db, { ...query, tagId: tag.id }).groups.flatMap((group) => group.categories).map((row) => row.increase)).toEqual([null, null, null, null]);
    expect(readInsights(db, { ...query, category: categories[0]?.id }).groups).toEqual(report.groups);
    for (const period of [{ window: "3" }, { window: "3", month: "2026-10" }, { window: "custom", from: "2026-09-01", to: "2026-10-08" }] as const) {
      expect(readInsights(db, { asOf: query.asOf, ...period }).groups.flatMap((group) => group.categories).every((row) => row.increase === null)).toBe(true);
    }
    expect(readNeedsYou(db, query.asOf).items.map((item) => item.code)).not.toContain("spending_up");
  } finally {
    close();
  }
});
