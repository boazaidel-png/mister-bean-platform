// Signs in to Google as the Firebase service account, for the moments no
// administrator is signed in: an employee's payment arriving from iCredit.
// The key lives only in the FIREBASE_SERVICE_ACCOUNT secret of this server.

type ServiceAccount = { client_email: string; private_key: string };

let cached: { token: string; expiresAt: number } | null = null;

const base64url = (data: ArrayBuffer | string) =>
  btoa(typeof data === "string" ? data : String.fromCharCode(...new Uint8Array(data)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function signJwt(account: ServiceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(JSON.stringify({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const pem = account.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (char) => char.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claims}`));
  return `${header}.${claims}.${base64url(signature)}`;
}

/** A Google access token for Firestore, reused until shortly before it expires. */
export async function serviceAccountToken(serviceAccountJson: string) {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const account = JSON.parse(serviceAccountJson) as ServiceAccount;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: await signJwt(account) }),
  });
  if (!response.ok) throw new Error(`Google sign-in failed (${response.status})`);
  const result = (await response.json()) as { access_token: string; expires_in: number };
  cached = { token: result.access_token, expiresAt: Date.now() + result.expires_in * 1000 };
  return cached.token;
}
