// The configured Desk address is the canonical origin. Carry only known routes,
// never Hub tickets, query strings, or browser sessions across origins.
export function canonicalDestination(appAddress, currentAddress) {
  try {
    const target = new URL(appAddress), current = new URL(currentAddress);
    if (target.protocol !== "https:" || target.username || target.password || target.search || target.hash || target.pathname !== "/" || target.origin === current.origin) return "";
    if (/^#\/(?:(?:me|new|queue|agent-new|docs)|(?:new|t)\/[1-9][0-9]*|settings(?:\/(?:general|catalog|ai|slack|log))?|reporting(?:\/(?:[1-9][0-9]*|(?:project|policy|new)-[1-9][0-9]*))?|oncall(?:\/(?:new|[1-9][0-9]*)(?:\/(?:new|[1-9][0-9]*|incidents|incident-new|incident-[1-9][0-9]*|sources|source-new|source-[1-9][0-9]*))?)?)$/.test(current.hash)) target.hash = current.hash;
    return target.href;
  } catch (_) { return ""; }
}
