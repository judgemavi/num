import { mortgageTermsSchema } from "@num/shared";
import { apiRequest } from "@/request";

/** The saved terms of a mortgage account, or null when the account has none. */
export async function loadMortgageTerms(accountId: string) {
  const result = await apiRequest(`/api/accounts/${accountId}/mortgage-terms`, mortgageTermsSchema);
  if (!result.ok) {
    if (result.code === "mortgage_terms_not_found") {
      return null;
    }
    throw new Error(result.code);
  }
  return result.data;
}
