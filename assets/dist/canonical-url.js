// The administrator's App address is also the canonical frontend origin.
// Move route names/IDs only; never carry tickets, query strings or browser sessions.
export function canonicalDestination(appAddress, currentAddress) {
  try {
    const target = new URL(appAddress), current = new URL(currentAddress);
    if (target.protocol !== "https:" || target.username || target.password || target.search || target.hash || target.pathname !== "/" || target.origin === current.origin) return "";
    if (/^#\/(?:intake|devices|apple|sales|offers|import|settings|docs|d|sale)(?:\/[1-9][0-9]*)?$/.test(current.hash)) target.hash = current.hash;
    return target.href;
  } catch (_) { return ""; }
}
