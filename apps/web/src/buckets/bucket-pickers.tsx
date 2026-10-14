import { bucketColors, bucketIcons, type BucketColor, type BucketIcon } from "@num/shared";
import { colorLabel, iconLabel } from "@/buckets/format";
import { BucketGlyph } from "@/buckets/icons";
import { choiceIn } from "@/components/choice";
import { hueColor } from "@/components/hue";
import { IconTile } from "@/components/icon-tile";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type BucketPickersProps = {
  color: BucketColor;
  icon: BucketIcon;
  suggest: boolean;
  onColor: (color: BucketColor) => void;
  onIcon: (icon: BucketIcon) => void;
};

export function BucketPickers({ color, icon, suggest, onColor, onIcon }: BucketPickersProps) {
  return (
    <>
      <Field>
        <FieldLabel>Colour</FieldLabel>
        <ToggleGroup
          type="single"
          value={color}
          aria-label="Colour"
          className="flex-wrap"
          onValueChange={(value) => {
            const next = choiceIn(bucketColors, value);
            if (next) {
              onColor(next);
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
                borderColor: color === item ? hueColor[item].glyph : "transparent",
              }}
            />
          ))}
        </ToggleGroup>
        {suggest ? <FieldDescription>The suggested colour is the next one in the rotation.</FieldDescription> : null}
      </Field>
      <Field>
        <FieldLabel>Icon</FieldLabel>
        <ToggleGroup
          type="single"
          value={icon}
          aria-label="Icon"
          className="flex-wrap"
          onValueChange={(value) => {
            const next = choiceIn(bucketIcons, value);
            if (next) {
              onIcon(next);
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
    </>
  );
}
