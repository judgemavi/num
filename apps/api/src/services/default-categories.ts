type CategorySeed = {
  name: string;
  kind: "income" | "expense";
};

export type CategoryGroupSeed = {
  name: string;
  categories: CategorySeed[];
};

function income(name: string): CategorySeed {
  return { name, kind: "income" };
}

function expense(name: string): CategorySeed {
  return { name, kind: "expense" };
}

export const defaultCategoryGroups: CategoryGroupSeed[] = [
  {
    name: "Income",
    categories: [income("Pay"), income("Interest and dividends"), income("Other income")],
  },
  {
    name: "Home",
    categories: [expense("Rent"), expense("Property tax"), expense("Home maintenance")],
  },
  {
    name: "Bills",
    categories: [
      expense("Utilities"),
      expense("Phone and internet"),
      expense("Insurance"),
      expense("Subscriptions"),
    ],
  },
  {
    name: "Food",
    categories: [expense("Groceries"), expense("Eating out")],
  },
  {
    name: "Transport",
    categories: [
      expense("Fuel"),
      expense("Public transit"),
      expense("Vehicle maintenance"),
      expense("Parking"),
    ],
  },
  {
    name: "Health",
    categories: [expense("Medical"), expense("Fitness")],
  },
  {
    name: "Family",
    categories: [expense("Childcare"), expense("Pets")],
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
    categories: [expense("Interest"), expense("Bank fees"), expense("Taxes")],
  },
  {
    name: "Other",
    categories: [expense("Miscellaneous")],
  },
];
