// The configured Desk address is the canonical origin. Carry only known routes,
// never Hub tickets, query strings, or browser sessions across origins.
export function canonicalDestination(appAddress, currentAddress) {
  try {
    const target = new URL(appAddress), current = new URL(currentAddress);
    if (target.protocol !== "https:" || target.username || target.password || target.search || target.hash || target.pathname !== "/" || target.origin === current.origin) return "";
    // Keep this list in step with route()'s known views and the module sub-routes (workboard, customers, on-call, reporting).
    if (/^#\/(?:(?:me|new|queue|agent-new|docs|service-status)|(?:new|t|offboarding)\/[1-9][0-9]*|settings(?:\/(?:general|catalog|assignment|ai|slack|log))?|workboard(?:\/(?:[1-9][0-9]*|projects|project\/(?:new|[1-9][0-9]*)|task\/(?:new|[1-9][0-9]*)|link\/[1-9][0-9]*))?|customers(?:\/(?:new|[1-9][0-9]*(?:\/(?:types|settings))?))?|reporting(?:\/(?:[1-9][0-9]*|(?:project|policy|new)-[1-9][0-9]*))?|oncall(?:\/(?:new|[1-9][0-9]*)(?:\/(?:new|[1-9][0-9]*|incidents|incident-new|incident-[1-9][0-9]*|sources|source-new|source-[1-9][0-9]*))?)?)$/.test(current.hash)) target.hash = current.hash;
    return target.href;
  } catch (_) { return ""; }
}
