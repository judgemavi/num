import { identityColors, type IdentityColor } from "@num/shared";
import { choiceIn } from "@/components/choice";
import { hueColor, colorLabel } from "@/components/hue";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/**
 * The colour of a bucket, a schedule or a group. Use it inside `form.Field` (AGENTS: a picker gets
 * `field.state.value` and `field.handleChange`). `suggest` tells that the colour is the next one in the rotation.
 */
export function ColorPicker({ value, onChange, suggest }: { value: IdentityColor; onChange: (color: IdentityColor) => void; suggest: boolean }) {
  return (
    <Field>
      <FieldLabel>Colour</FieldLabel>
      <ToggleGroup
        type="single"
        value={value}
        aria-label="Colour"
        className="flex-wrap"
        onValueChange={(next) => {
          const color = choiceIn(identityColors, next);
          if (color) {
            onChange(color);
          }
        }}
      >
        {identityColors.map((item) => (
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
