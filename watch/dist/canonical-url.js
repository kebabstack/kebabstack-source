// Only public routes travel to the configured origin. Never forward a Hub ticket,
// browser session, query string or legacy device link containing an agent key.
export function canonicalDestination(appAddress, currentAddress) {
  try {
    const target = new URL(appAddress), current = new URL(currentAddress);
    if (target.protocol !== "https:" || target.username || target.password || target.search || target.hash || target.pathname !== "/" || target.origin === current.origin) return "";
    if (/^#\/(?:overview|activity|evidence|add|settings|docs|d\/[1-9][0-9]*)$/.test(current.hash)) target.hash = current.hash;
    return target.href;
  } catch (_) { return ""; }
}
