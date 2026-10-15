import { bucketColors, bucketIcons, type BucketColor, type BucketIcon } from "@num/shared";
import { colorLabel, iconLabel } from "@/buckets/format";
import { BucketGlyph } from "@/buckets/icons";
import { choiceIn } from "@/components/choice";
import { hueColor } from "@/components/hue";
import { IconTile } from "@/components/icon-tile";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/**
 * The colour of a bucket, a commitment or an income. Use it inside `form.Field` (AGENTS: a picker gets
 * `field.state.value` and `field.handleChange`). `suggest` tells that the colour is the next one in the rotation.
 */
export function ColorPicker({ value, onChange, suggest }: { value: BucketColor; onChange: (color: BucketColor) => void; suggest: boolean }) {
  return (
    <Field>
      <FieldLabel>Colour</FieldLabel>
      <ToggleGroup
        type="single"
        value={value}
        aria-label="Colour"
        className="flex-wrap"
        onValueChange={(next) => {
          const color = choiceIn(bucketColors, next);
          if (color) {
            onChange(color);
          }
        }}
      >
        {bucketColors.map((item) => (
          <ToggleGroupItem
            key={item}
            value={item}
            aria-label={colorLabel(item)}
            className="size-11 rounded-full border-2 p-0"
            style={{
              background: hueColor[item].fill,
              borderColor: value === item ? hueColor[item].glyph : "transparent",
            }}
          />
        ))}
      </ToggleGroup>
      {suggest ? <FieldDescription>The suggested colour is the next one in the rotation.</FieldDescription> : null}
    </Field>
  );
}

/** The icon of a bucket, a commitment or an income, drawn in the chosen colour. Use it inside `form.Field`. */
export function IconPicker({ value, color, onChange }: { value: BucketIcon; color: BucketColor; onChange: (icon: BucketIcon) => void }) {
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
