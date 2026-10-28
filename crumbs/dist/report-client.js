// Keep fast queries for small reports. Full methods run the same calculation
// atomically with update execution; they never sample or add daily uniques.
const methods = new Set(['report', 'goalRows', 'goalReport', 'funnel', 'journeys']);
const queues = new WeakMap();
const queryBudgetError = error => /instruction.*limit|limit.*instruction|IC0522/i.test(String(error?.message ?? error));
async function fullCall(actor, method, args) {
 // A dashboard has several breakdowns: serialize expensive fallback requests
 // per actor rather than submitting a burst of replicated computations.
 const previous = queues.get(actor) ?? Promise.resolve();
 const next = previous.catch(() => {}).then(() => actor[method + 'Full'](...args));
 queues.set(actor, next);
 try { return await next; }
 finally { if (queues.get(actor) === next) queues.delete(actor); }
}
export async function analyticsCall(actor, method, ...args) {
 if (!methods.has(method)) return actor[method](...args);
 let result;
 try { result = await actor[method](...args); }
 catch (error) {
  if (!queryBudgetError(error)) throw error;
  return fullCall(actor, method, args);
 }
 if (typeof result?.err?.capacity === 'string' && /^Report exceeds \d+ events\./.test(result.err.capacity)) {
  return fullCall(actor, method, args);
 }
 return result;
}
