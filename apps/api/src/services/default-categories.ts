export type CategorySeed = {
  name: string;
  kind: "income" | "expense";
  essential: boolean;
};

export type CategoryGroupSeed = {
  name: string;
  sortOrder: number;
  categories: CategorySeed[];
};

function income(name: string): CategorySeed {
  return { name, kind: "income", essential: false };
}

function expense(name: string, essential = false): CategorySeed {
  return { name, kind: "expense", essential };
}

export const defaultCategoryGroups: CategoryGroupSeed[] = [
  {
    name: "Income",
    sortOrder: 1,
    categories: [income("Pay"), income("Interest and dividends"), income("Other income")],
  },
  {
    name: "Home",
    sortOrder: 2,
    categories: [expense("Rent", true), expense("Property tax", true), expense("Home maintenance")],
  },
  {
    name: "Bills",
    sortOrder: 3,
    categories: [
      expense("Utilities", true),
      expense("Phone and internet", true),
      expense("Insurance", true),
      expense("Subscriptions"),
    ],
  },
  {
    name: "Food",
    sortOrder: 4,
    categories: [expense("Groceries", true), expense("Eating out")],
  },
  {
    name: "Transport",
    sortOrder: 5,
    categories: [
      expense("Fuel", true),
      expense("Public transit", true),
      expense("Vehicle maintenance"),
      expense("Parking"),
    ],
  },
  {
    name: "Health",
    sortOrder: 6,
    categories: [expense("Medical", true), expense("Fitness")],
  },
  {
    name: "Family",
    sortOrder: 7,
    categories: [expense("Childcare", true), expense("Pets")],
  },
  {
    name: "Lifestyle",
    sortOrder: 8,
    categories: [
      expense("Clothing"),
      expense("Personal care"),
      expense("Shopping"),
      expense("Entertainment"),
      expense("Travel"),
      expense("Gifts and donations"),
      expense("Education"),
    ],
  },
  {
    name: "Financial",
    sortOrder: 9,
    categories: [expense("Interest", true), expense("Bank fees"), expense("Taxes", true)],
  },
  {
    name: "Other",
    sortOrder: 10,
    categories: [expense("Miscellaneous")],
  },
];
