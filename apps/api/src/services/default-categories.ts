export type CategorySeed = {
  name: string;
  kind: "income" | "expense";
  essential: boolean;
};

export type CategoryGroupSeed = {
  name: string;
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
    categories: [income("Pay"), income("Interest and dividends"), income("Other income")],
  },
  {
    name: "Home",
    categories: [expense("Rent", true), expense("Property tax", true), expense("Home maintenance")],
  },
  {
    name: "Bills",
    categories: [
      expense("Utilities", true),
      expense("Phone and internet", true),
      expense("Insurance", true),
      expense("Subscriptions"),
    ],
  },
  {
    name: "Food",
    categories: [expense("Groceries", true), expense("Eating out")],
  },
  {
    name: "Transport",
    categories: [
      expense("Fuel", true),
      expense("Public transit", true),
      expense("Vehicle maintenance"),
      expense("Parking"),
    ],
  },
  {
    name: "Health",
    categories: [expense("Medical", true), expense("Fitness")],
  },
  {
    name: "Family",
    categories: [expense("Childcare", true), expense("Pets")],
  },
  {
    name: "Lifestyle",
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
    categories: [expense("Interest", true), expense("Bank fees"), expense("Taxes", true)],
  },
  {
    name: "Other",
    categories: [expense("Miscellaneous")],
  },
];
