import { expect, test } from "bun:test";
import { accounts } from "@num/db";
import { eq } from "drizzle-orm";
import { tempDatabase } from "./test-support";
import { account, entry, requirePeer, saved } from "./transaction-test-book";
import { createAccount } from "./accounts";
import { createCategory } from "./categories";
import { expense } from "./bucket-test-book";
import { addSchedule, emergency, goal, money, spend } from "./funding-test-book";
import { readInsights } from "./insights";
import { needsYouChecks } from "./needs-you-checks";
import { createTag } from "./tags";
import { createTransaction, updateTransaction } from "./transactions";
import { forecastInput, readForecast } from "./forecast";
import { poolChecks } from "./pool-checks";
import { readEmergencyFund } from "./emergency-fund";
import { readFeasibility } from "./feasibility";

const query = { asOf: "2026-10-01", window: "custom", from: "2026-09-01", to: "2026-09-30" } as const;

test("principal and interest count once in spending, the timeline and the savings rate", () => {
  const { db, close } = tempDatabase();
  try {
    const cash = account(db, "Cash", "chequing");
    const mortgage = account(db, "Mortgage", "mortgage");
    const interest = expense(db, "Interest");
    const pay = createCategory(db, { name: "Pay", kind: "income", ...saved });
    money(db, cash.id, pay.id, "2026-09-01", 4_000_000, "Pay");
    const payment = createTransaction(db, entry(cash.id, -2_000_000, [
      { amount: -1_400_000, categoryId: interest.id },
      { amount: -600_000, transferAccountId: mortgage.id },
    ], "2026-09-15"));
    expect(requirePeer(db, payment).amount).toBe(600_000);
    const report = readInsights(db, query);
    expect(report).toMatchObject({ spending: 2_000_000, income: 4_000_000, savings: 2_000_000, savingsRateMilliPct: 50_000,
      debtPayments: [{ accountId: mortgage.id, amount: 600_000 }] });
    expect(report.groups.reduce((sum, row) => sum + row.amount, 0)).toBe(1_400_000);
    expect(report.timeline.months[0]?.actual).toEqual({ income: 4_000_000, spending: 2_000_000 });
    expect(readInsights(db, { ...query, category: interest.id }).timeline.months[0]?.actual?.spending).toBe(1_400_000);
    expect(needsYouChecks(db, query.asOf).find((row) => row.code === "savings_rate")).toMatchObject({ pass: true, savingsRateMilliPct: 50_000 });
  } finally { close(); }
});

test("principal can make the Needs you savings check fail", () => {
  const { db, close } = tempDatabase();
  try {
    const cash = account(db, "Cash", "chequing");
    const loan = account(db, "Loan", "loan");
    const interest = expense(db, "Interest");
    const pay = createCategory(db, { name: "Pay", kind: "income", ...saved });
    for (const month of ["07", "08", "09"]) {
      money(db, cash.id, pay.id, `2026-${month}-01`, 1_600_000, "Pay");
      createTransaction(db, entry(cash.id, -2_000_000, [
        { amount: -1_400_000, categoryId: interest.id }, { amount: -600_000, transferAccountId: loan.id },
      ], `2026-${month}-15`));
    }
    expect(needsYouChecks(db, query.asOf).find((row) => row.code === "savings_rate"))
      .toMatchObject({ pass: false, savingsRateMilliPct: -25_000 });
  } finally { close(); }
});

test("other transfers, loan advances and payments from an off-budget account do not count", () => {
  const { db, close } = tempDatabase();
  try {
    const cash = account(db, "Cash", "chequing");
    const loan = account(db, "Loan", "loan");
    const investment = account(db, "Investment", "investment");
    const card = createAccount(db, { asOf: query.asOf, name: "Card", kind: "credit_card", paymentPolicy: "manual", ...saved });
    for (const kind of ["savings", "property", "other_liability"] as const) {
      const target = createAccount(db, { asOf: query.asOf, name: kind, kind, ...saved });
      createTransaction(db, entry(cash.id, -500_000, [{ amount: -500_000, transferAccountId: target.id }], "2026-09-05"));
    }
    for (const target of [investment, card]) {
      createTransaction(db, entry(cash.id, -500_000, [{ amount: -500_000, transferAccountId: target.id }], "2026-09-05"));
    }
    createTransaction(db, entry(cash.id, 3_000_000, [{ amount: 3_000_000, transferAccountId: loan.id }], "2026-09-08"));
    createTransaction(db, entry(investment.id, -700_000, [{ amount: -700_000, transferAccountId: loan.id }], "2026-09-09"));
    expect(readInsights(db, query)).toMatchObject({ income: 0, spending: 0, debtPayments: [] });
    createTransaction(db, entry(cash.id, -200_000, [{ amount: -200_000, transferAccountId: loan.id }], "2026-09-10"));
    // Archived accounts retain their historical spending.
    db.update(accounts).set({ archivedAt: saved.at }).where(eq(accounts.id, cash.id)).run();
    expect(readInsights(db, query)).toMatchObject({ income: 0, spending: 200_000, debtPayments: [{ accountId: loan.id, amount: 200_000 }] });
  } finally { close(); }
});

test("a tag counts only the principal lines with that tag, in the selected month", () => {
  const { db, close } = tempDatabase();
  try {
    const cash = account(db, "Cash", "chequing");
    const mortgage = account(db, "Mortgage", "mortgage");
    const loan = account(db, "Loan", "loan");
    const interest = expense(db, "Interest");
    const tag = createTag(db, { name: "Tagged", ...saved });
    createTransaction(db, entry(cash.id, -2_000_000, [
      { amount: -1_400_000, categoryId: interest.id },
      { amount: -600_000, transferAccountId: mortgage.id, tagIds: [tag.id] },
    ], "2026-09-15"));
    createTransaction(db, entry(cash.id, -500_000, [{ amount: -500_000, transferAccountId: mortgage.id }], "2026-09-16"));
    createTransaction(db, entry(cash.id, -100_000, [{ amount: -100_000, transferAccountId: loan.id, tagIds: [tag.id] }], "2026-08-15"));
    const report = readInsights(db, { ...query, tagId: tag.id });
    expect(report).toMatchObject({ spending: 600_000, income: null, savings: null, groups: [], debtPayments: [{ accountId: mortgage.id, amount: 600_000 }] });
    expect(report.timeline.months[0]?.actual?.spending).toBe(600_000);
    expect(report.timeline.forecastEnd).toBeNull();
    expect(readInsights(db, { ...query, from: "2026-08-01", tagId: tag.id }).debtPayments).toEqual([
      { accountId: mortgage.id, amount: 600_000 }, { accountId: loan.id, amount: 100_000 },
    ]);
    expect(readInsights(db, { ...query, from: "2026-08-01", month: "2026-08", tagId: tag.id }).spending).toBe(100_000);
  } finally { close(); }
});

test("loan and mortgage commitments add spending; investments leave the pool once; internal transfers do neither", () => {
  const { db, close } = tempDatabase();
  try {
    const cash = account(db, "Cash", "chequing");
    const targets = [account(db, "Loan", "loan"), account(db, "Mortgage", "mortgage"),
      account(db, "Investment", "investment"), account(db, "Savings", "savings")];
    for (const target of targets) {
      addSchedule(db, { name: target.name, kind: "commitment", accountId: cash.id, transferAccountId: target.id,
        expectedAmount: -100_000, startDate: "2026-10-15", freq: "monthly", interval: 1, monthDay: 15 });
    }
    const forecast = readForecast(db, query.asOf);
    expect(forecast.months[0]?.spending).toBe(200_000);
    expect(forecast.total[forecast.dates.indexOf("2026-10-15")]).toBe(-300_000);
    const input = forecastInput(db, query.asOf);
    expect(input.flows.filter((row) => row.date === "2026-10-15").reduce((sum, row) => sum + row.spending, 0)).toBe(200_000);
    expect(input.transfersOut.filter((row) => row.date === "2026-10-15").reduce((sum, row) => sum + row.spending, 0)).toBe(100_000);
    expect(poolChecks(db, query.asOf).find((row) => row.code === "pool_short")).toMatchObject({ date: "2026-10-15", short: 900_000 });
  } finally { close(); }
});

test("mortgage payments retain the category based emergency target and the planned goal surplus", () => {
  const { db, close } = tempDatabase();
  try {
    const cash = account(db, "Cash", "chequing");
    const mortgage = account(db, "Mortgage", "mortgage");
    const interest = expense(db, "Interest");
    const pay = createCategory(db, { name: "Pay", kind: "income", ...saved });
    spend(db, "Interest", 1_400_000, { essential: true, categoryIds: [interest.id] });
    emergency(db, 3);
    goal(db, "Goal", 10_000_000, 100_000);
    addSchedule(db, { name: "Pay", kind: "income", accountId: cash.id, categoryId: pay.id, expectedAmount: 4_000_000,
      startDate: "2026-01-01", freq: "monthly", interval: 1, monthDay: 1 });
    const payments = ["07", "08", "09"].map((month) => createTransaction(db,
      entry(cash.id, -1_400_000, [{ amount: -1_400_000, categoryId: interest.id }], `2026-${month}-15`)));
    const before = readFeasibility(db, query.asOf);
    const fundBefore = readEmergencyFund(db, query.asOf);
    expect(before.feasibility).toMatchObject({ income: 4_000_000, refills: 5_600_000, surplus: -1_600_000, need: 100_000 });
    expect(fundBefore).toMatchObject({ basis: "history", monthly: 1_400_000, target: 4_200_000 });
    for (const payment of payments) {
      updateTransaction(db, payment.id, { amount: -2_000_000, lines: [
        { amount: -1_400_000, categoryId: interest.id }, { amount: -600_000, transferAccountId: mortgage.id },
      ], ...saved });
    }
    expect(readEmergencyFund(db, query.asOf)).toEqual(fundBefore);
    expect(readFeasibility(db, query.asOf)).toEqual(before);
    expect(readInsights(db, query).spending).toBe(2_000_000);
  } finally { close(); }
});

test("a linked loan payment is actual spending and is not forecast again", () => {
  const { db, close } = tempDatabase();
  try {
    const cash = account(db, "Cash", "chequing");
    const loan = account(db, "Loan", "loan");
    addSchedule(db, { name: "Loan bill", kind: "commitment", accountId: cash.id, transferAccountId: loan.id,
      expectedAmount: -100_000, startDate: "2026-10-15", freq: "monthly", interval: 1, monthDay: 15 });
    createTransaction(db, entry(cash.id, -100_000, [{ amount: -100_000, transferAccountId: loan.id }], "2026-10-15"));
    const forecast = readForecast(db, "2026-10-16");
    expect(forecast.months[0]?.spending).toBe(0);
    expect(forecast.months[1]?.spending).toBe(100_000);
    expect(readInsights(db, { asOf: "2026-10-16" }).timeline.months[0]).toMatchObject({ actual: { spending: 100_000 }, forecast: { spending: 0 } });
  } finally { close(); }
});
