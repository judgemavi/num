import { likelyMinimum, suggestionFloor } from "./matching";

export const reviewLevels = ["sure", "likely", "maybe", "none"] as const;

export type ReviewLevel = (typeof reviewLevels)[number];

/** Shown level. Sure is an applied automatic label only. A suggestion is Likely from 0.75 and Maybe below that. */
export function reviewLevel(automatic: boolean, confidence: number | null): ReviewLevel {
  if (automatic) {
    return "sure";
  }
  if (confidence === null || confidence < suggestionFloor) {
    return "none";
  }
  return confidence >= likelyMinimum ? "likely" : "maybe";
}
