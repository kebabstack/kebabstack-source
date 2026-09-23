// The public API returns at most 100 pilots, ordered by points then earlier submission.
// A private flight is a preview, never a second official entry for the same pilot.
export function compareFlight(rows, flight, ownName = '', published = false) {
  const sameName = name => Boolean(ownName) && name.toLowerCase() === ownName.toLowerCase();
  const board = rows.map((row, i) => ({ ...row, score: Number(row.score), meters: Number(row.meters), coins: Number(row.coins), rank: i + 1, own: sameName(row.name) }));
  const previous = board.find(row => row.own);
  const retained = previous && previous.score >= flight.score;
  let entries, rank, note;
  if (retained) {
    rank = '#' + previous.rank;
    note = flight.score < previous.score
      ? `Your published best stays here. This flight is ${(previous.score - flight.score).toLocaleString('en-US')} points behind it.`
      : published ? 'Your published best is on the board.' : 'You matched your published best. Its earlier time keeps the place.';
    entries = board;
    if (!published || flight.score < previous.score) {
      entries = [...board];
      const below = entries.findIndex(row => row.score < flight.score);
      entries.splice(below < 0 ? entries.length : below, 0, { ...flight, rank: '—', preview: true, submitted: published });
    }
  } else {
    const others = board.filter(row => !row.own);
    const place = others.findIndex(row => row.score < flight.score);
    const index = place < 0 ? others.length : place;
    const outside = rows.length >= 100 && index >= 100;
    rank = outside ? '100+' : '#' + (index + 1);
    note = outside ? 'Outside the visible top 100. Keep collecting coins to climb.'
      : published ? 'Your published best is on the board.' : 'Your place if published now. Earlier equal scores rank first.';
    entries = [...others];
    entries.splice(index, 0, { ...flight, own: published, preview: !published });
    entries = entries.map((row, i) => ({ ...row, rank: i >= 100 ? '100+' : i + 1 }));
  }
  const preview = entries.findIndex(row => row.preview);
  const focus = preview < 0 ? entries.findIndex(row => row.own) : preview;
  // Leaders plus the current flight's neighbours, with no extra dialog or scroll box.
  const selected = new Set([0, 1, 2, focus - 1, focus, focus + 1]);
  entries.forEach((row, i) => { if (row.preview || row.own) selected.add(i); });
  const visible = entries.flatMap((row, i) => selected.has(i) ? [{ ...row, gapBefore: i > 0 && !selected.has(i - 1) }] : []);
  return { rank, note, retained: Boolean(retained), entries: visible, condensed: visible.length < entries.length };
}
