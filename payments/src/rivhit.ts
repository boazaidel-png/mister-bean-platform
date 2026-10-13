const RIVHIT_API = "https://api.rivhit.co.il/online/RivhitOnlineAPI.svc";

type RivhitResponse<T> = { error_code: number; client_message: string; debug_message: string; data: T | null };

export class RivhitError extends Error {
  constructor(public code: number, message: string) {
    super(message);
  }
}

async function call<T>(method: string, token: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${RIVHIT_API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_token: token, ...body }),
  });
  if (!response.ok) throw new RivhitError(response.status, `רווחית לא זמינה כרגע (${response.status})`);
  const result = (await response.json()) as RivhitResponse<T>;
  if (result.error_code !== 0) throw new RivhitError(result.error_code, result.client_message || result.debug_message || "רווחית החזירה שגיאה");
  return result.data as T;
}

let invoiceReceiptType: number | null = null;

/** The account's tax invoice-receipt document type, looked up once. */
export async function invoiceReceiptDocumentType(token: string) {
  if (invoiceReceiptType !== null) return invoiceReceiptType;
  const data = await call<{ document_type_list: Array<{ document_type: number; is_invoice_receipt: boolean; is_accounting: boolean }> }>("Document.TypeList", token, {});
  const type = data.document_type_list.find((item) => item.is_invoice_receipt && item.is_accounting)?.document_type;
  if (!type) throw new RivhitError(-1, "לא נמצא ברווחית סוג מסמך של חשבונית מס קבלה");
  invoiceReceiptType = type;
  return type;
}

export type RivhitDocument = { document_type: number; document_number: number; document_link: string; amount: number };

export function newDocument(token: string, request: Record<string, unknown>) {
  return call<RivhitDocument>("Document.New", token, request);
}
