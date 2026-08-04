import type { Customer, Ticket } from "./platform-types";

export function calculateTicketDeadlines(
  customer: Pick<Customer, "slaResponseHours" | "slaResolutionHours">,
  urgency: string,
  openedAt: Date,
) {
  const baseResolution = customer.slaResolutionHours || 24;
  const resolutionHours =
    urgency === "דחופה"
      ? Math.min(baseResolution, 4)
      : urgency === "גבוהה"
        ? Math.min(baseResolution, 12)
        : baseResolution;
  const responseHours = customer.slaResponseHours || 4;
  return {
    responseDueAt: new Date(
      openedAt.getTime() + responseHours * 3_600_000,
    ).toISOString(),
    resolutionDueAt: new Date(
      openedAt.getTime() + resolutionHours * 3_600_000,
    ).toISOString(),
  };
}

export function isTicketSlaBreached(ticket: Ticket, timestamp: number) {
  if (["נסגרה", "בוטלה"].includes(ticket.status)) return false;
  if (ticket.resolutionDueAt) {
    return timestamp > new Date(ticket.resolutionDueAt).getTime();
  }
  const fallbackHours =
    ticket.urgency === "דחופה" ? 4 : ticket.urgency === "גבוהה" ? 24 : 72;
  return timestamp - new Date(ticket.openedAt).getTime() > fallbackHours * 3_600_000;
}

export function nextTechnicianStatus(status: string) {
  if (status === "תואם ביקור") return "בדרך";
  if (status === "בדרך") return "הגעה ללקוח";
  if (status === "הגעה ללקוח") return "בטיפול";
  return "בטיפול";
}
