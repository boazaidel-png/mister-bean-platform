import type { TicketIntake } from "./platform-types";

export const EMERGENCY_PHONE = "052-4475821";
export const EMERGENCY_PHONE_LINK = "tel:+972524475821";

export const TICKET_FAULT_TYPES = [
  "המכונה לא נדלקת או נכבית",
  "המסך תקוע או לא מגיב",
  "מופיעה הודעת שגיאה או קוד",
  "אין מים או מופיעה התראת מים",
  "קפה לא יוצא או יוצא מעט / לאט",
  "הפולים לא נטחנים או לא נכנסים לטחינה",
  "הקפה חלש או הטעם השתנה",
  "המשקה לא חם או המכונה לא מסיימת להתחמם",
  "אין חלב או שההקצפה לא תקינה",
  "החלב לא קר / מקרר החלב לא מקרר",
  "נזילה מהמכונה או מסביב לה",
  "התראה על מגש הטפטוף או מיכל הפסולת",
  "התראת ניקוי / אבנית או תהליך ניקוי שנתקע",
  "רעש חריג מהמכונה",
  "חלק שבור, תקוע או לא יושב במקום",
  "סכנה: עשן, ריח שרוף, ניצוצות או התחממות חריגה",
  "בקשה לתחזוקה",
  "אחר / לא בטוח מה התקלה",
] as const;

/** The fault type that is itself a danger sign. */
export const DANGER_FAULT_TYPE = TICKET_FAULT_TYPES[15];

export const SAFETY_NONE = "לא";
export const SAFETY_UNSURE = "לא בטוח/ה";
export const SAFETY_OPTIONS = [
  SAFETY_NONE,
  "עשן, ניצוצות או ריח שרוף",
  "תחושת התחשמלות",
  "נזילה בסביבת חיבור חשמלי",
  "התחממות חריגה או יציאת מים/אדים באופן מסוכן",
  SAFETY_UNSURE,
] as const;

export const IMPACT_OPTIONS = [
  "המכונה אינה שמישה כלל",
  "אפשר להכין רק חלק מהמשקאות",
  "המכונה עובדת, אבל התוצאה אינה תקינה",
  "התקלה מופיעה ונעלמת",
  "בקשת תחזוקה או הדרכה, ללא השבתה",
] as const;

export const STARTED_OPTIONS = ["עכשיו / היום", "אתמול", "לפני כמה ימים או יותר", "לא ידוע"] as const;

export const SCREEN_YES = "כן";
export const SCREEN_OPTIONS = [SCREEN_YES, "לא", "המסך אינו נדלק / לא ניתן לקרוא"] as const;

export const RECURRENCE_OPTIONS = ["זו הפעם הראשונה", "קרה בעבר", "חזר לאחר טיפול", "לא ידוע"] as const;

/** A danger sign was reported: in the safety question or as the fault type itself. */
export function isSafetyHazard(intake: Pick<TicketIntake, "safety">, type = "") {
  return (Boolean(intake.safety) && intake.safety !== SAFETY_NONE && intake.safety !== SAFETY_UNSURE)
    || type === DANGER_FAULT_TYPE;
}

/** Needs a safety check before any normal handling: a danger sign, or the customer is not sure. */
export const needsSafetyReview = (intake: Pick<TicketIntake, "safety">, type = "") =>
  isSafetyHazard(intake, type) || intake.safety === SAFETY_UNSURE;

/**
 * The internal urgency that sets the service deadlines. The customer
 * describes the situation; this is the office's starting point and can be
 * changed on the ticket. It is not shown to the customer as a promise.
 */
export function urgencyForIntake(intake: Pick<TicketIntake, "safety" | "impact">, type = "") {
  if (needsSafetyReview(intake, type) || intake.impact === IMPACT_OPTIONS[0]) return "דחופה";
  if (intake.impact === IMPACT_OPTIONS[1]) return "גבוהה";
  return "רגילה";
}

/** The questions a ticket must answer before it can be sent; empty when complete. */
export function missingIntake(intake: Partial<TicketIntake>, type: string) {
  const missing: string[] = [];
  if (!type) missing.push("סוג התקלה");
  if (!intake.safety) missing.push("האם יש סימן לסכנה");
  if (!intake.impact) missing.push("השפעה על הפעילות");
  if (!intake.startedWhen) missing.push("מתי התחילה התקלה");
  if (!intake.screen) missing.push("האם מופיעה הודעה על המסך");
  if (intake.screen === SCREEN_YES && !intake.screenMessage?.trim()) missing.push("נוסח ההודעה שעל המסך");
  if (!intake.recurrence) missing.push("האם התקלה חזרה");
  return missing;
}
