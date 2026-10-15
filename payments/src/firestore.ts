// A small Firestore REST client that acts as the signed-in user: every request
// carries the caller's Firebase ID token, so the security rules decide what it
// may read and write, exactly as in the browser. No service account is needed.

type FirestoreValue =
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { nullValue: null }
  | { timestampValue: string }
  | { mapValue: { fields?: Record<string, FirestoreValue> } }
  | { arrayValue: { values?: FirestoreValue[] } };

export class FirestoreError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function decode(value: FirestoreValue): unknown {
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("mapValue" in value) return decodeFields(value.mapValue.fields || {});
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(decode);
  return null;
}

function decodeFields(fields: Record<string, FirestoreValue>) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decode(value)]));
}

function encode(value: string | number | boolean): FirestoreValue {
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  return { stringValue: value };
}

export function firestore(projectId: string, idToken: string, appCheckToken = "") {
  const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  const headers: Record<string, string> = { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" };
  // Needed once App Check is enforced for Firestore (see docs/operations.md).
  if (appCheckToken) headers["X-Firebase-AppCheck"] = appCheckToken;
  const path = (segments: string[]) => segments.map(encodeURIComponent).join("/");

  return {
    async get<T>(...segments: string[]): Promise<T> {
      const response = await fetch(`${base}/${path(segments)}`, { headers });
      if (!response.ok) throw new FirestoreError(response.status, await response.text());
      const document = (await response.json()) as { fields?: Record<string, FirestoreValue> };
      return decodeFields(document.fields || {}) as T;
    },
    /** Sets only the given fields; the document must exist. */
    async update(segments: string[], data: Record<string, string | number | boolean>) {
      const mask = Object.keys(data).map((key) => `updateMask.fieldPaths=${encodeURIComponent(key)}`).join("&");
      const response = await fetch(`${base}/${path(segments)}?${mask}&currentDocument.exists=true`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, encode(value)])) }),
      });
      if (!response.ok) throw new FirestoreError(response.status, await response.text());
    },
  };
}

/** The email in a Firebase ID token, for the "updated by" field. Firestore has already checked the token. */
export function tokenEmail(idToken: string) {
  try {
    const payload = JSON.parse(atob(idToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))) as { email?: string };
    return payload.email || "";
  } catch {
    return "";
  }
}
