import assert from "node:assert/strict";
import test from "node:test";
import { blendRatioLabel, cleanTastingRatings, DEFAULT_TASTING_BLENDS, summarizeTasting } from "./tasting-engine.ts";
import type { TastingResponse } from "./platform-types.ts";

const blends = DEFAULT_TASTING_BLENDS.slice(0, 3);
const [espresso, emerald, dx] = blends;
const response = (id: string, ratings: Record<string, number>, favoriteBlendId = "", comment = ""): TastingResponse => ({
  id, sessionId: "s-1", ratings, favoriteBlendId, comment, createdAt: `2026-10-07T10:0${id}:00Z`,
});

test("blends are ranked by average, with hell-yes count breaking ties", () => {
  const summary = summarizeTasting(blends, [
    response("1", { [espresso.id]: 3, [emerald.id]: 4, [dx.id]: 5 }, dx.id),
    response("2", { [espresso.id]: 5, [emerald.id]: 4, [dx.id]: 3 }, dx.id),
  ]);
  assert.equal(summary.participants, 2);
  assert.deepEqual(summary.results.map((result) => result.blend.id), [espresso.id, dx.id, emerald.id]);
  assert.equal(summary.results[0].average, 4);
  assert.equal(summary.results[0].hellYes, 1);
  assert.equal(summary.results[2].hellYes, 0);
  assert.deepEqual(summary.results[2].distribution, [0, 0, 0, 2, 0]);
  assert.equal(summary.topFavoriteBlendId, dx.id);
});

test("anonymous junk values and unknown blends are ignored", () => {
  const summary = summarizeTasting(blends, [
    response("1", { [espresso.id]: 9, [emerald.id]: 2.5, unknown: 5 } as Record<string, number>, "unknown"),
    response("2", { [espresso.id]: 2 }),
  ]);
  assert.equal(summary.participants, 1);
  assert.equal(summary.results[0].blend.id, espresso.id);
  assert.equal(summary.results[0].votes, 1);
  assert.equal(summary.topFavoriteBlendId, "");
});

test("blends without votes are listed last and comments are kept in order", () => {
  const summary = summarizeTasting(blends, [response("2", { [dx.id]: 1 }, "", " מעולה "), response("1", {}, "", "טעים")]);
  assert.equal(summary.results[0].blend.id, dx.id);
  assert.deepEqual(summary.comments.map((comment) => comment.text), ["טעים", "מעולה"]);
});

test("ratings are cleaned before they are sent", () => {
  assert.deepEqual(cleanTastingRatings(blends, { [espresso.id]: 4, [emerald.id]: 0, gone: 3 }), { [espresso.id]: 4 });
  assert.equal(blendRatioLabel(70), "70% ערביקה · 30% רובוסטה");
});
