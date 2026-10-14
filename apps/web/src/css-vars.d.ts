import "react";

declare module "react" {
  /** A style can set a CSS custom property. The design uses them for the colours of an icon tile and of a bar. */
  interface CSSProperties {
    [property: `--${string}`]: string | number;
  }
}
