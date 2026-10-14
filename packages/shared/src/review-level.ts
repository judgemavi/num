import { likelyMinimum, suggestionFloor } from "./matching";

export const reviewLevels = ["sure", "likely", "maybe", "none"] as const;

export type ReviewLevel = (typeof reviewLevels)[number];

/** Shown level. Sure is an applied automatic label only. A suggestion is Likely from 750 thousandths and Maybe below that. */
export function reviewLevel(automatic: boolean, confidenceMilli: number | null): ReviewLevel {
  if (automatic) {
    return "sure";
  }
  if (confidenceMilli === null || confidenceMilli < suggestionFloor) {
    return "none";
  }
  return confidenceMilli >= likelyMinimum ? "likely" : "maybe";
}
