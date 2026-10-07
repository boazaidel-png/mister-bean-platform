import type { TastingBlend, TastingResponse, TastingSessionBlend } from "./platform-types";

export const TASTING_SCALE = [1, 2, 3, 4, 5] as const;
export const TASTING_LOW_LABEL = "Not my cup of coffee";
export const TASTING_HIGH_LABEL = "Hell yes";
export const MAX_TASTING_BLENDS = 30;
export const MAX_TASTING_COMMENT = 1000;

export const DEFAULT_TASTING_BLENDS: Array<Pick<TastingBlend, "id" | "name" | "arabicaPercent" | "profile">> = [
  { id: "blend-espresso", name: "תערובת אספרסו", arabicaPercent: 30, profile: "חזק ועוצמתי. מרירות גבוהה, חמיצות נמוכה, קפאין גבוה. התאמה גבוהה לאספרסו." },
  { id: "blend-emerald", name: "אמרלד", arabicaPercent: 50, profile: "דומה לתערובת האספרסו, אבל עם טעמים מורכבים יותר: נגיעה אגוזית ומתיקות גבוהה יותר." },
  { id: "blend-dx-plus", name: "DX+", arabicaPercent: 70, profile: "מאוזן מאוד. חמיצות ומרירות נמוכות, טעמי פירות ואגוזים. מתאים לאספרסו ולמשקאות חלב." },
  { id: "blend-amber", name: "Amber", arabicaPercent: 70, profile: "חמיצות מעט יותר מורגשת. מתאים במיוחד למשקאות מבוססי חלב." },
  { id: "blend-hb-plus", name: "HB+", arabicaPercent: 92, profile: "טעמים מורכבים ועשירים, חמיצות בינונית. התאמה גבוהה מאוד למשקאות מבוססי חלב." },
];

export function blendRatioLabel(arabicaPercent: number) {
  const arabica = clampPercent(arabicaPercent);
  return `${arabica}% ערביקה · ${100 - arabica}% רובוסטה`;
}

export function clampPercent(value: number) {
  return Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value))) : 0;
}

export function isValidRating(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5;
}

export type TastingBlendResult = {
  blend: TastingSessionBlend;
  votes: number;
  average: number;
  hellYes: number;
  favorites: number;
  /** Count of votes per scale level, index 0 is rating 1. */
  distribution: [number, number, number, number, number];
};

export type TastingSummary = {
  participants: number;
  /** Ranked best first: by average, then hell-yes count, then votes. Blends without votes come last. */
  results: TastingBlendResult[];
  topFavoriteBlendId: string;
  comments: Array<{ id: string; text: string; createdAt: string }>;
};

/**
 * Responses are written anonymously, so every value is re-checked here
 * and anything outside the 1-5 scale or for an unknown blend is ignored.
 */
export function summarizeTasting(blends: TastingSessionBlend[], responses: TastingResponse[]): TastingSummary {
  const known = new Set(blends.map((blend) => blend.id));
  const results = blends.map<TastingBlendResult>((blend) => ({
    blend, votes: 0, average: 0, hellYes: 0, favorites: 0, distribution: [0, 0, 0, 0, 0],
  }));
  const byId = new Map(results.map((result) => [result.blend.id, result]));
  let participants = 0;

  for (const response of responses) {
    let counted = false;
    for (const [blendId, rating] of Object.entries(response.ratings || {})) {
      const result = byId.get(blendId);
      if (!result || !isValidRating(rating)) continue;
      result.votes += 1;
      result.distribution[rating - 1] += 1;
      if (rating === 5) result.hellYes += 1;
      counted = true;
    }
    if (response.favoriteBlendId && known.has(response.favoriteBlendId)) {
      byId.get(response.favoriteBlendId)!.favorites += 1;
      counted = true;
    }
    if (counted) participants += 1;
  }

  for (const result of results) {
    const total = result.distribution.reduce((sum, count, index) => sum + count * (index + 1), 0);
    result.average = result.votes ? total / result.votes : 0;
  }

  results.sort((left, right) =>
    Number(right.votes > 0) - Number(left.votes > 0)
    || right.average - left.average
    || right.hellYes - left.hellYes
    || right.votes - left.votes,
  );

  const topFavorite = [...results].sort((left, right) => right.favorites - left.favorites)[0];
  const comments = responses
    .filter((response) => typeof response.comment === "string" && response.comment.trim())
    .map((response) => ({ id: response.id, text: response.comment.trim().slice(0, MAX_TASTING_COMMENT), createdAt: response.createdAt }))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));

  return {
    participants,
    results,
    topFavoriteBlendId: topFavorite?.favorites ? topFavorite.blend.id : "",
    comments,
  };
}

/** Keeps only valid ratings for blends that are still in the session. */
export function cleanTastingRatings(blends: TastingSessionBlend[], ratings: Record<string, number>) {
  const known = new Set(blends.map((blend) => blend.id));
  return Object.fromEntries(Object.entries(ratings).filter(([blendId, rating]) => known.has(blendId) && isValidRating(rating)));
}
