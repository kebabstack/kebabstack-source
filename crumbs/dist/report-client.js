// Keep fast queries for small reports. Full methods run the same calculation
// atomically with update execution; they never sample or add daily uniques.
const methods = new Set(['report', 'reportBundle', 'goalRows', 'goalReport', 'funnel', 'journeys']);
const queues = new WeakMap();
const queryBudgetError = error => /instruction.*limit|limit.*instruction|IC0522/i.test(String(error?.message ?? error));
const bundleBudget = result => typeof result?.err?.capacity === 'string' && result.err.capacity.startsWith('Report bundle exceeds work budget.');
async function fullAttempt(actor, method, args) {
 let result, failure;
 try { result = await actor[method + 'Full'](...args); }
 catch (error) { if (!queryBudgetError(error)) throw error; failure = error; }
 const dimensions = args[2];
 if (method !== 'reportBundle' || (!failure && !bundleBudget(result)) || !Array.isArray(dimensions) || dimensions.length < 2) {
  if (failure) throw failure;
  return result;
 }
 // Split dimensions only, never the time interval or visitor population.
 // Each result still contains exact whole-period totals. Return no partial bundle.
 const middle = Math.ceil(dimensions.length / 2);
 const left = await fullAttempt(actor, method, [args[0], args[1], dimensions.slice(0, middle)]);
 if (!left?.ok) return left;
 const right = await fullAttempt(actor, method, [args[0], args[1], dimensions.slice(middle)]);
 if (!right?.ok) return right;
 return {ok: [...left.ok, ...right.ok]};
}
async function fullCall(actor, method, args) {
 // A dashboard has several breakdowns: serialize expensive fallback requests
 // per actor rather than submitting a burst of replicated computations.
 const previous = queues.get(actor) ?? Promise.resolve();
 const next = previous.catch(() => {}).then(() => fullAttempt(actor, method, args));
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
 if (bundleBudget(result) || (typeof result?.err?.capacity === 'string' && /^Report exceeds \d+ events\./.test(result.err.capacity))) {
  return fullCall(actor, method, args);
 }
 return result;
}
