// One radio reply per chapter and run. Relay progress stays on the player's device.
export const TOKENS_TO_LINK = 3;

const fields = {
  canister: 'magnet', fusion: 'magnet', oisy: 'magnet',
  compiler: 'vent', coffee: 'vent', portal: 'vent',
  neuron: 'lift', identity: 'lift',
};
const signals = {
  magnet: 'Attract nearby tokens for 2 seconds',
  vent: 'Vent blaster heat and gain forward speed',
  lift: 'Catch a short updraft',
};

export function relaySignal(zone) {
  return signals[fields[zone.pickup]];
}

export function linkToken(run, index, zone, power) {
  if (run.relayTokens[index] === TOKENS_TO_LINK) return;
  run.relayTokens[index]++;
  if (run.relayTokens[index] < TOKENS_TO_LINK) return;

  switch (fields[zone.pickup]) {
    case 'magnet':
      run.magnetTime = Math.max(run.magnetTime, 2);
      break;
    case 'vent':
      run.weaponHeat = Math.max(0, run.weaponHeat - .5);
      run.speed = Math.min(150, run.speed + 5 * power);
      break;
    case 'lift':
      run.vy = Math.max(run.vy, 8 * power);
      break;
  }
  run.effects.push({kind: 'relay', label: zone.name + ' linked', sub: relaySignal(zone)});
}
