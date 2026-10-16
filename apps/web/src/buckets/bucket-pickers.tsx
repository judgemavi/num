import { bucketIcons, type IdentityColor, type BucketIcon } from "@num/shared";
import { iconLabel } from "@/buckets/format";
import { BucketGlyph } from "@/buckets/icons";
import { choiceIn } from "@/components/choice";
import { IconTile } from "@/components/icon-tile";
import { Field, FieldLabel } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/** The icon of a bucket, a commitment or an income, drawn in the chosen colour. Use it inside `form.Field`. */
export function IconPicker({ value, color, onChange }: { value: BucketIcon; color: IdentityColor; onChange: (icon: BucketIcon) => void }) {
  return (
    <Field>
      <FieldLabel>Icon</FieldLabel>
      <ToggleGroup
        type="single"
        value={value}
        aria-label="Icon"
        className="flex-wrap"
        onValueChange={(next) => {
          const icon = choiceIn(bucketIcons, next);
          if (icon) {
            onChange(icon);
          }
        }}
      >
        {bucketIcons.map((item) => (
          <ToggleGroupItem
            key={item}
            value={item}
            aria-label={iconLabel(item)}
            className="size-11 rounded-[10px] p-0 data-[state=on]:ring-3 data-[state=on]:ring-primary"
          >
            <IconTile hue={color}>
              <BucketGlyph name={item} />
            </IconTile>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </Field>
  );
}
