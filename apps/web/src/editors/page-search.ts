/**
 * The `edit` value of the URL. It names the open editor of one record. The root route validates it, thus each route
 * has it in its search. The parameter type is the input of a link: text. The router reads the URL as JSON, thus a
 * value that is not text can arrive. It is ignored.
 */
export function editSearch(search: { edit?: string }): { edit?: string } {
  return typeof search.edit === "string" && search.edit.length > 0 ? { edit: search.edit } : {};
}

/** The search of a page without `edit`. The open editor is not a part of the query of the page. */
export function pageQuery<Search extends { edit?: string }>(search: Search) {
  const { edit: _edit, ...query } = search;
  return query;
}
