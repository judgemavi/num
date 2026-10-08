import { expect, test } from "bun:test";
import {
  fundingProposal,
  roundUpShare,
  unassigned,
  type FundingBucketInput,
  type FundingIncome,
} from "./funding";

function income(planId: string, dueDate: string): FundingIncome {
  return { planId, dueDate };
}

function spending(id: string, priority: number, balance: number, refillTo: number): FundingBucketInput {
  return {
    id,
    kind: "spending",
    priority,
    balance,
    archived: false,
    refillTo,
    amount: null,
    dueDate: null,
    target: null,
    targetDate: null,
    fixedAmount: null,
  };
}

function sinking(id: string, priority: number, balance: number, amount: number, dueDate: string): FundingBucketInput {
  return {
    id,
    kind: "sinking",
    priority,
    balance,
    archived: false,
    refillTo: null,
    amount,
    dueDate,
    target: null,
    targetDate: null,
    fixedAmount: null,
  };
}

function goal(
  id: string,
  priority: number,
  balance: number,
  target: number,
  targetDate: string | null,
  fixedAmount: number | null,
): FundingBucketInput {
  return {
    id,
    kind: "goal",
    priority,
    balance,
    archived: false,
    refillTo: null,
    amount: null,
    dueDate: null,
    target,
    targetDate,
    fixedAmount,
  };
}

const october = [income("pay", "2026-10-01"), income("pay", "2026-10-15"), income("pay", "2026-10-29")];

test("zero remaining paychecks proposes the whole shortfall", () => {
  expect(roundUpShare(900, 0)).toBe(900);
  const incomes = [income("pay", "2026-10-01")];
  const buckets = [sinking("tax", 1, 100, 1_000, "2026-10-01"), goal("trip", 2, 0, 500, "2026-10-01", null)];
  expect(
    fundingProposal({
      paycheckPlanId: "pay",
      paycheckDate: "2026-10-01",
      paycheckAmount: 10_000,
      unassigned: 10_000,
      incomes,
      buckets,
    }),
  ).toEqual([
    { bucketId: "tax", amount: 900 },
    { bucketId: "trip", amount: 500 },
  ]);
  expect(
    fundingProposal({
      paycheckPlanId: "pay",
      paycheckDate: "2026-10-01",
      paycheckAmount: 10_000,
      unassigned: 400,
      incomes,
      buckets: [buckets[0]!],
    }),
  ).toEqual([{ bucketId: "tax", amount: 400 }]);
});

test("a card purchase does not change Unassigned while the bucket stays positive", () => {
  const before = unassigned(20_000, 5_000, 0);
  const afterPurchase = unassigned(20_000 - 2_000, 5_000 - 2_000, 0);
  expect(afterPurchase).toBe(before);
  expect(unassigned(20_000, 5_000, 0) - unassigned(18_000, 5_000, 0)).toBe(2_000);
});

test("the proposal funds the lower priority number first", () => {
  const lines = fundingProposal({
    paycheckPlanId: "pay",
    paycheckDate: "2026-10-01",
    paycheckAmount: 10_000,
    unassigned: 10_000,
    incomes: october,
    buckets: [spending("later", 5, 0, 4_000), spending("sooner", 1, 0, 3_000), spending("tie-b", 1, 0, 1_000), spending("tie-a", 1, 0, 1_000)],
  });
  expect(lines.map((line) => line.bucketId)).toEqual(["sooner", "tie-a", "tie-b", "later"]);
});

test("sinking and goal amounts use the remaining paychecks and round up", () => {
  expect(roundUpShare(900, 3)).toBe(300);
  expect(roundUpShare(10, 3)).toBe(4);
  const first = fundingProposal({
    paycheckPlanId: "pay",
    paycheckDate: "2026-10-01",
    paycheckAmount: 100_000,
    unassigned: 100_000,
    incomes: october,
    buckets: [
      sinking("tax", 1, 100, 1_000, "2026-11-01"),
      goal("trip", 2, 1, 1_000, "2026-11-01", null),
      goal("steady", 3, 0, 5_000, null, 250),
    ],
  });
  expect(first).toEqual([
    { bucketId: "tax", amount: 300 },
    { bucketId: "trip", amount: 333 },
    { bucketId: "steady", amount: 250 },
  ]);
  const second = fundingProposal({
    paycheckPlanId: "pay",
    paycheckDate: "2026-10-15",
    paycheckAmount: 100_000,
    unassigned: 100_000,
    incomes: october,
    buckets: [
      spending("food", 0, 40, 100),
      sinking("tax", 1, 100, 1_000, "2026-11-01"),
      goal("trip", 2, 1, 1_000, "2026-11-01", null),
    ],
  });
  expect(second).toEqual([
    { bucketId: "tax", amount: 450 },
    { bucketId: "trip", amount: 500 },
  ]);
  expect(
    fundingProposal({
      paycheckPlanId: "pay",
      paycheckDate: "2026-10-01",
      paycheckAmount: 100_000,
      unassigned: 100_000,
      incomes: october,
      buckets: [spending("food", 0, 40, 100)],
    }),
  ).toEqual([{ bucketId: "food", amount: 60 }]);
});

test("the proposal stops at the smaller of the paycheck and Unassigned", () => {
  const buckets = [spending("food", 1, 0, 300), spending("fuel", 2, 0, 300)];
  const byPaycheck = fundingProposal({
    paycheckPlanId: "pay",
    paycheckDate: "2026-10-01",
    paycheckAmount: 400,
    unassigned: 1_000,
    incomes: october,
    buckets,
  });
  const byFree = fundingProposal({
    paycheckPlanId: "pay",
    paycheckDate: "2026-10-01",
    paycheckAmount: 1_000,
    unassigned: 400,
    incomes: october,
    buckets,
  });
  expect(byPaycheck).toEqual([
    { bucketId: "food", amount: 300 },
    { bucketId: "fuel", amount: 100 },
  ]);
  expect(byFree).toEqual(byPaycheck);
  expect(
    fundingProposal({
      paycheckPlanId: "pay",
      paycheckDate: "2026-10-01",
      paycheckAmount: 500,
      unassigned: 0,
      incomes: october,
      buckets,
    }),
  ).toEqual([]);
});
