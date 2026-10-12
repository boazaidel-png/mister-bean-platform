import assert from "node:assert/strict";
import test from "node:test";
import { DANGER_FAULT_TYPE, IMPACT_OPTIONS, isSafetyHazard, missingIntake, needsSafetyReview, SAFETY_NONE, SAFETY_OPTIONS, SAFETY_UNSURE, SCREEN_YES, TICKET_FAULT_TYPES, urgencyForIntake } from "./ticket-intake.ts";

const complete = { safety: SAFETY_NONE, impact: IMPACT_OPTIONS[2], startedWhen: "אתמול", screen: "לא", recurrence: "זו הפעם הראשונה" };

test("the fault list has the 18 agreed types", () => {
  assert.equal(TICKET_FAULT_TYPES.length, 18);
  assert.equal(TICKET_FAULT_TYPES[0], "המכונה לא נדלקת או נכבית");
});

test("every question must be answered; nothing is answered for the customer", () => {
  assert.deepEqual(missingIntake({}, ""), ["סוג התקלה", "האם יש סימן לסכנה", "השפעה על הפעילות", "מתי התחילה התקלה", "האם מופיעה הודעה על המסך", "האם התקלה חזרה"]);
  assert.deepEqual(missingIntake(complete, TICKET_FAULT_TYPES[0]), []);
  assert.deepEqual(missingIntake({ ...complete, screen: SCREEN_YES }, TICKET_FAULT_TYPES[2]), ["נוסח ההודעה שעל המסך"]);
});

test("any danger sign, or the danger fault type, is a safety case; 'not sure' is reviewed too", () => {
  for (const sign of SAFETY_OPTIONS.slice(1, -1)) assert.equal(isSafetyHazard({ safety: sign }), true, sign);
  assert.equal(isSafetyHazard({ safety: SAFETY_NONE }), false);
  assert.equal(isSafetyHazard({ safety: SAFETY_NONE }, DANGER_FAULT_TYPE), true);
  assert.equal(isSafetyHazard({ safety: SAFETY_UNSURE }), false);
  assert.equal(needsSafetyReview({ safety: SAFETY_UNSURE }), true);
});

test("internal urgency follows safety and how much the machine can still do", () => {
  assert.equal(urgencyForIntake({ safety: SAFETY_OPTIONS[1], impact: IMPACT_OPTIONS[4] }), "דחופה");
  assert.equal(urgencyForIntake({ safety: SAFETY_NONE, impact: IMPACT_OPTIONS[0] }), "דחופה");
  assert.equal(urgencyForIntake({ safety: SAFETY_NONE, impact: IMPACT_OPTIONS[1] }), "גבוהה");
  assert.equal(urgencyForIntake({ safety: SAFETY_NONE, impact: IMPACT_OPTIONS[3] }), "רגילה");
});
