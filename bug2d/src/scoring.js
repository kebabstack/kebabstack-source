export const COIN_BONUS = 50;
export const scoreOf = run => Math.floor(run.d) + run.coins * COIN_BONUS;
// Arcade telemetry only. No tokens, prices or real canister cycle consumption.
export const burnRate = run => run.phase === 'flying' ? Math.round(8 + run.speed * .55 + Math.min(run.d, 20000) * .012 + (run.boostTime > 0 ? 35 : 0) + (run.flow?.active>0?45:0)) : 0;
export const burnMood = run => run.flow?.active>0 ? 'FLOW STATE · OVERDRIVE' : run.speed >= 115 ? 'PROOF OF ZOOM ↗' : run.d >= 2400 ? 'BULLISH ON BUILDERS' : run.speed >= 80 ? 'SHIPPING VELOCITY ↗' : 'COMPUTE WITH PURPOSE';
