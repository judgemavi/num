import { suggestionSchema, type Category, type Merchant, type SuggestionReason } from "@num/shared";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { FieldDescription } from "@/components/ui/field";
import { apiRequest } from "@/request";

type SuggestionHintProps = {
  accountId: string;
  payee: string;
  merchants: Merchant[];
  categories: Category[];
};

function reasonText(reason: SuggestionReason): string {
  switch (reason) {
    case "rule":
      return "This comes from a rule.";
    case "payee_history":
      return "This comes from past transactions.";
    case "merchant_default":
      return "This comes from the merchant.";
    case "none":
      return "";
  }
}

export function SuggestionHint({ accountId, payee, merchants, categories }: SuggestionHintProps) {
  const [debounced, setDebounced] = useState(payee);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(payee), 300);
    return () => clearTimeout(timer);
  }, [payee]);

  const suggestion = useQuery({
    queryKey: ["suggestion", accountId, debounced],
    enabled: accountId.length > 0 && debounced.trim().length > 0,
    queryFn: async () => {
      const params = new URLSearchParams({ accountId, payee: debounced });
      const result = await apiRequest(`/api/suggestions?${params.toString()}`, suggestionSchema);
      if (!result.ok) {
        throw new Error(result.code);
      }
      return result.data;
    },
  });

  const data = suggestion.data;
  if (!data || data.reason === "none") {
    return null;
  }
  const merchant = merchants.find((item) => item.id === data.merchantId)?.name;
  const category = categories.find((item) => item.id === data.categoryId)?.name;
  const parts = [merchant ? `Merchant: ${merchant}` : null, category ? `Category: ${category}` : null].filter(
    (part): part is string => part !== null,
  );
  if (parts.length === 0) {
    return null;
  }
  return (
    <FieldDescription role="status">
      Suggested. {parts.join(". ")}. {reasonText(data.reason)}
    </FieldDescription>
  );
}
