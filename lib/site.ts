/** Where the system is published. Links sent out (sales, tastings) always use it. */
export const SITE_ORIGIN = "https://app.misterbean.co.il";

/**
 * The address to build a shared link on: the published site, so a link made
 * from an old address or a saved copy of the app still carries the real
 * domain; on a developer's machine, the local server.
 */
export function publicOrigin() {
  const { hostname, origin } = window.location;
  return hostname === "localhost" || hostname === "127.0.0.1" ? origin : SITE_ORIGIN;
}
