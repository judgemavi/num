import { hueColor } from "@/components/hue";
import type { ReactNode } from "react";

const ink = "#17171C";
const paper = "#FFFFFF";
const gold = "#F4CD55";
const lilac = hueColor.lilac.fill;
const pink = hueColor.pink.fill;
const mint = hueColor.mint.fill;
const sky = hueColor.sky.fill;

function stroke(fill: string, width = 2.5) {
  return {
    fill,
    stroke: ink,
    strokeWidth: width,
    strokeLinejoin: "round" as const,
    strokeLinecap: "round" as const,
  };
}

function Art({ label, viewBox, children }: { label: string; viewBox: string; children: ReactNode }) {
  return (
    <svg className="block h-auto w-[132px] max-md:w-[88px]" viewBox={viewBox} role="img" aria-label={label}>
      {children}
    </svg>
  );
}

export function HomeIllustration() {
  return (
    <Art label="A wallet and a calendar" viewBox="0 0 220 160">
      <rect {...stroke(paper)} x="66" y="6" width="8" height="18" rx="4" />
      <rect {...stroke(paper)} x="146" y="6" width="8" height="18" rx="4" />
      <rect {...stroke(paper)} x="56" y="14" width="120" height="112" rx="12" />
      <path {...stroke(sky)} d="M56 42V26a12 12 0 0 1 12-12h96a12 12 0 0 1 12 12v16z" />
      <g fill={ink} opacity="0.22">
        <circle cx="76" cy="60" r="4" />
        <circle cx="98" cy="60" r="4" />
        <circle cx="120" cy="60" r="4" />
        <circle cx="142" cy="60" r="4" />
        <circle cx="160" cy="60" r="4" />
        <circle cx="120" cy="82" r="4" />
        <circle cx="142" cy="82" r="4" />
        <circle cx="160" cy="82" r="4" />
        <circle cx="160" cy="104" r="4" />
      </g>
      <circle {...stroke(gold)} cx="142" cy="104" r="13" />
      <text x="142" y="108.5" textAnchor="middle" fontFamily="Archivo Variable, sans-serif" fontSize="12" fontWeight="700" fill={ink}>
        21
      </text>
      <circle {...stroke(pink)} cx="34" cy="92" r="14" />
      <circle {...stroke(paper)} cx="58" cy="84" r="14" />
      <rect {...stroke(mint)} x="12" y="96" width="100" height="58" rx="12" />
      <path {...stroke("none")} d="M12 112h100" />
      <rect {...stroke(paper)} x="84" y="114" width="36" height="22" rx="8" />
      <circle fill={ink} cx="96" cy="125" r="4" />
    </Art>
  );
}

export function BalanceScaleIllustration() {
  return (
    <Art label="A balance scale" viewBox="0 0 220 160">
      <rect {...stroke(ink)} x="86" y="142" width="48" height="12" rx="6" />
      <path {...stroke("none", 4)} d="M110 46v96" />
      <path {...stroke("none", 4)} d="M40 58L180 34" />
      <circle {...stroke(lilac)} cx="110" cy="46" r="7" />
      <path {...stroke("none")} d="M40 58L16 112M40 58l24 54M180 34l-22 46M180 34l22 46" />
      <rect {...stroke(paper)} x="27" y="92" width="26" height="20" />
      <path {...stroke(pink)} d="M22 94l18-16 18 16z" />
      <rect fill={ink} x="36" y="100" width="8" height="12" />
      <circle {...stroke(gold)} cx="62" cy="104" r="8" />
      <path {...stroke(paper)} d="M10 112q30 28 60 0z" />
      <rect {...stroke(sky)} x="164" y="60" width="32" height="20" rx="4" transform="rotate(-8 180 70)" />
      <path {...stroke("none")} d="M166 68l30-4" />
      <path {...stroke(paper)} d="M152 80q28 26 56 0z" />
    </Art>
  );
}

export function JarsIllustration() {
  return (
    <Art label="Three jars filled to different levels and a coin waiting for a jar" viewBox="0 0 220 160">
      <circle {...stroke(gold)} cx="112" cy="18" r="10" />
      <path {...stroke("none")} d="M96 8l-6-4M128 8l6-4" />
      <rect {...stroke(ink)} x="22" y="46" width="48" height="12" rx="4" />
      <path {...stroke(paper)} d="M20 66q0-8 8-8h36q8 0 8 8v74q0 8-8 8H28q-8 0-8-8z" />
      <path fill={mint} d="M21.5 92h49v48q0 6.5-6.5 6.5H28q-6.5 0-6.5-6.5z" />
      <path {...stroke("none")} d="M20 66q0-8 8-8h36q8 0 8 8v74q0 8-8 8H28q-8 0-8-8z" />
      <rect {...stroke(paper)} x="88" y="46" width="48" height="12" rx="4" />
      <path {...stroke(paper)} d="M86 66q0-8 8-8h36q8 0 8 8v74q0 8-8 8H94q-8 0-8-8z" />
      <path fill={sky} d="M87.5 124h49v16q0 6.5-6.5 6.5H94q-6.5 0-6.5-6.5z" />
      <path {...stroke("none")} d="M86 66q0-8 8-8h36q8 0 8 8v74q0 8-8 8H94q-8 0-8-8z" />
      <rect {...stroke(ink)} x="154" y="46" width="48" height="12" rx="4" />
      <path {...stroke(paper)} d="M152 66q0-8 8-8h36q8 0 8 8v74q0 8-8 8h-36q-8 0-8-8z" />
      <path fill={lilac} d="M153.5 76h49v64q0 6.5-6.5 6.5h-36q-6.5 0-6.5-6.5z" />
      <path {...stroke("none")} d="M152 66q0-8 8-8h36q8 0 8 8v74q0 8-8 8h-36q-8 0-8-8z" />
    </Art>
  );
}
