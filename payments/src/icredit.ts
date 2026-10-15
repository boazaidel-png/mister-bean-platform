// iCredit (Rivhit's card clearing). The base URL decides test or production:
// https://testicredit.rivhit.co.il or https://icredit.rivhit.co.il.

export type PaymentPage = { URL: string; PrivateSaleToken: string; PublicSaleToken: string };

export type SaleDetails = {
  Status: number;
  SaleId: string;
  Amount: number | null;
  TransactionAmount: number | null;
  Custom1: string | null;
  Custom2: string | null;
  AuthNum: string | null;
  DocumentNum: string | number | null;
  DocumentURL: string | null;
  TransactionStatus: number | null;
};

async function post<T>(base: string, method: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${base}/API/PaymentPageRequest.svc/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`iCredit ${method} failed (${response.status})`);
  return (await response.json()) as T;
}

export async function createPaymentPage(base: string, groupToken: string, request: Record<string, unknown>) {
  const result = await post<PaymentPage & { Status: number; DebugMessage: string | null }>(base, "GetUrl", { GroupPrivateToken: groupToken, ...request });
  if (result.Status !== 0 || !result.URL) throw new Error(result.DebugMessage || "iCredit לא יצר דף תשלום");
  return result;
}

/** The sale as iCredit knows it. Status 0 with an amount means it was paid. */
export function saleDetails(base: string, salePrivateToken: string) {
  return post<SaleDetails>(base, "SaleDetails", { SalePrivateToken: salePrivateToken });
}

/** Confirms that a payment notification really came from iCredit, for this amount. */
export async function verifySale(base: string, groupToken: string, saleId: string, amount: number) {
  const result = await post<{ Status: string }>(base, "Verify", { GroupPrivateToken: groupToken, SaleId: saleId, TotalAmount: amount });
  return result.Status === "VERIFIED";
}
