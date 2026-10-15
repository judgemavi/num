import { Search } from "lucide-react";
import { useEffect } from "react";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { useAppForm } from "@/forms/form-hook";
import { queryText, searchDelayMs } from "@/lists/list-search";

type SearchBoxProps = {
  id: string;
  placeholder: string;
  label: string;
  /** The search text in the URL. */
  query: string | undefined;
  /** Write a new search text to the URL. */
  onQuery: (query: string | undefined) => void;
};

/**
 * The search box of a list. The text is a form field: it changes only on the screen while the person types. The
 * field writes the text to the URL when the person stops typing for 300 ms. When the URL changes for another reason
 * (Back, Forward, a link), the box shows the text of the URL.
 */
export function SearchBox({ id, placeholder, label, query, onQuery }: SearchBoxProps) {
  const form = useAppForm({ defaultValues: { q: query ?? "" } });

  // The URL is outside the form. The box follows a new search text that the box did not write.
  useEffect(() => {
    if (queryText(form.getFieldValue("q")) !== query) {
      form.setFieldValue("q", query ?? "", { dontRunListeners: true });
    }
  }, [query, form]);

  return (
    <form.Field
      name="q"
      listeners={{
        onChangeDebounceMs: searchDelayMs,
        onChange: ({ value }) => {
          if (queryText(value) !== query) {
            onQuery(queryText(value));
          }
        },
      }}
    >
      {(field) => (
        <InputGroup className="max-w-80 min-w-0 flex-1">
          <InputGroupAddon>
            <Search size={18} aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            id={id}
            name={field.name}
            value={field.state.value}
            placeholder={placeholder}
            aria-label={label}
            onChange={(event) => field.handleChange(event.target.value)}
            onBlur={field.handleBlur}
          />
        </InputGroup>
      )}
    </form.Field>
  );
}
