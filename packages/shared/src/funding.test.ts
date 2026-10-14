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
  expect(roundUpShare(9_000, 0, 10)).toBe(9_000);
  const incomes = [income("pay", "2026-10-01")];
  const buckets = [sinking("tax", 1, 1_000, 10_000, "2026-10-01"), goal("trip", 2, 0, 5_000, "2026-10-01", null)];
  expect(
    fundingProposal({
      paycheckPlanId: "pay",
      step: 10,
      paycheckDate: "2026-10-01",
      paycheckAmount: 100_000,
      unassigned: 100_000,
      incomes,
      buckets,
    }),
  ).toEqual([
    { bucketId: "tax", amount: 9_000 },
    { bucketId: "trip", amount: 5_000 },
  ]);
  expect(
    fundingProposal({
      paycheckPlanId: "pay",
      step: 10,
      paycheckDate: "2026-10-01",
      paycheckAmount: 100_000,
      unassigned: 4_000,
      incomes,
      buckets: [buckets[0]!],
    }),
  ).toEqual([{ bucketId: "tax", amount: 4_000 }]);
});

test("a card purchase does not change Unassigned while the bucket stays positive", () => {
  const before = unassigned(200_000, 50_000, 0);
  const afterPurchase = unassigned(200_000 - 20_000, 50_000 - 20_000, 0);
  expect(afterPurchase).toBe(before);
  expect(unassigned(200_000, 50_000, 0) - unassigned(180_000, 50_000, 0)).toBe(20_000);
});

test("the proposal funds the lower priority number first", () => {
  const lines = fundingProposal({
    paycheckPlanId: "pay",
    step: 10,
    paycheckDate: "2026-10-01",
    paycheckAmount: 100_000,
    unassigned: 100_000,
    incomes: october,
    buckets: [spending("later", 5, 0, 40_000), spending("sooner", 1, 0, 30_000), spending("tie-b", 1, 0, 10_000), spending("tie-a", 1, 0, 10_000)],
  });
  expect(lines.map((line) => line.bucketId)).toEqual(["sooner", "tie-a", "tie-b", "later"]);
});

test("sinking and goal amounts use the remaining paychecks and round up", () => {
  expect(roundUpShare(9_000, 3, 10)).toBe(3_000);
  expect(roundUpShare(100, 3, 10)).toBe(40);
  const first = fundingProposal({
    paycheckPlanId: "pay",
    step: 10,
    paycheckDate: "2026-10-01",
    paycheckAmount: 1_000_000,
    unassigned: 1_000_000,
    incomes: october,
    buckets: [
      sinking("tax", 1, 1_000, 10_000, "2026-11-01"),
      goal("trip", 2, 10, 10_000, "2026-11-01", null),
      goal("steady", 3, 0, 50_000, null, 2_500),
    ],
  });
  expect(first).toEqual([
    { bucketId: "tax", amount: 3_000 },
    { bucketId: "trip", amount: 3_330 },
    { bucketId: "steady", amount: 2_500 },
  ]);
  const second = fundingProposal({
    paycheckPlanId: "pay",
    step: 10,
    paycheckDate: "2026-10-15",
    paycheckAmount: 1_000_000,
    unassigned: 1_000_000,
    incomes: october,
    buckets: [
      spending("food", 0, 400, 1_000),
      sinking("tax", 1, 1_000, 10_000, "2026-11-01"),
      goal("trip", 2, 10, 10_000, "2026-11-01", null),
    ],
  });
  expect(second).toEqual([
    { bucketId: "tax", amount: 4_500 },
    { bucketId: "trip", amount: 5_000 },
  ]);
  expect(
    fundingProposal({
      paycheckPlanId: "pay",
      step: 10,
      paycheckDate: "2026-10-01",
      paycheckAmount: 1_000_000,
      unassigned: 1_000_000,
      incomes: october,
      buckets: [spending("food", 0, 400, 1_000)],
    }),
  ).toEqual([{ bucketId: "food", amount: 600 }]);
});

test("the proposal stops at the smaller of the paycheck and Unassigned", () => {
  const buckets = [spending("food", 1, 0, 3_000), spending("fuel", 2, 0, 3_000)];
  const byPaycheck = fundingProposal({
    paycheckPlanId: "pay",
    step: 10,
    paycheckDate: "2026-10-01",
    paycheckAmount: 4_000,
    unassigned: 10_000,
    incomes: october,
    buckets,
  });
  const byFree = fundingProposal({
    paycheckPlanId: "pay",
    step: 10,
    paycheckDate: "2026-10-01",
    paycheckAmount: 10_000,
    unassigned: 4_000,
    incomes: october,
    buckets,
  });
  expect(byPaycheck).toEqual([
    { bucketId: "food", amount: 3_000 },
    { bucketId: "fuel", amount: 1_000 },
  ]);
  expect(byFree).toEqual(byPaycheck);
  expect(
    fundingProposal({
      paycheckPlanId: "pay",
      step: 10,
      paycheckDate: "2026-10-01",
      paycheckAmount: 5_000,
      unassigned: 0,
      incomes: october,
      buckets,
    }),
  ).toEqual([]);
});
