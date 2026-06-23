import type {
  ActivityResponse,
  ActivityResultResponse,
  ListingTeam,
} from "@/client";

export type EvaluationResult = ActivityResultResponse & {
  activity?: ActivityResponse;
  team?: ListingTeam;
};

/** English ordinal suffix for a number (1 -> "st", 2 -> "nd", ...). */
export const nthNumber = (number: number): string => {
  if (number > 3 && number < 21) return "th";
  switch (number % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
};
