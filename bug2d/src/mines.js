// Five lanes, with two adjoining openings plus one extra opening. Successive rows share a
// lane: the floor gets dangerous without demanding impossible last-second turns.
export const MINE_LANES = [-28, -14, 0, 14, 28];
const corridor = [0, 1, 2, 3, 2, 1];
export function makeMines(seed, chunk) {
  if (chunk < 1) return [];
  let state = (Math.imul(seed + 7, 1540483477) ^ Math.imul(chunk + 3, 668265263)) >>> 0;
  const random = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; };
  const mines = [], offset = (seed >>> 0) % corridor.length;
  for (let row = 0; row < 2; row++) {
    const gap = corridor[(chunk * 2 + row + offset) % corridor.length];
    const candidates = MINE_LANES.map((x, lane) => ({ x, lane })).filter(({lane}) => lane !== gap && lane !== gap + 1);
    const spare = Math.floor(random() * candidates.length);
    const occupied = candidates.filter((_, index) => index !== spare);
    const d = chunk * 200 + 25 + row * 100;
    for (const { x, lane } of occupied) mines.push({ id: `mine:${seed}:${chunk}:${row}:${lane}`, kind: 'mine', airborne: false, x, y: 1.05, d, radius: 3.3, hp: 1 });
    if (chunk >= 2 && row === (chunk + offset) % 2) {
      const { x, lane } = occupied[Math.floor(random() * occupied.length)];
      mines.push({ id: `mine:${seed}:${chunk}:${row}:${lane}:air`, kind: 'mine', airborne: true,
        x, y: 12 + random() * Math.min(40, 15 + chunk * 2), d, radius: 3.1, hp: 1 });
    }
  }
  return mines;
}
