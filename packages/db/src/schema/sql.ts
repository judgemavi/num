import { sql, type SQL, type SQLWrapper } from "drizzle-orm";

export function oneOf(column: SQLWrapper, values: readonly string[]): SQL {
  const list = values.map((value) => `'${value}'`).join(", ");
  return sql`${column} in (${sql.raw(list)})`;
}

export function nullOrOneOf(column: SQLWrapper, values: readonly string[]): SQL {
  return sql`(${column} is null or ${oneOf(column, values)})`;
}

export function isoDate(column: SQLWrapper): SQL {
  return sql`${column} glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`;
}

export function nullOrIsoDate(column: SQLWrapper): SQL {
  return sql`(${column} is null or ${isoDate(column)})`;
}

export function nullOrDayOfMonth(column: SQLWrapper): SQL {
  return sql`(${column} is null or (${column} between 1 and 31))`;
}
