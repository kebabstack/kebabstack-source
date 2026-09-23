# Ship the Bug 2D · v0.2.5

The interface follows the [shared Kebabstack standard](../design/README.md): canonical identity, semantic light/dark colours and common navigation/control sizes. Product access and workflow boundaries remain explicit.

**Legacy standalone installation.** The current game integrates this renderer into
[Bug 0.12.0](../bug/README.md), with a 2D/3D switch, shared profiles and separate boards.
Use recipe `bug` for new installations. This directory retains the prior deployment
for compatibility with its existing origin-bound profiles and private history.

A separate modern retro edition built from Ship the Bug 3D 0.11.0. It runs on
Canvas2D with smooth illustrated sprites, a layered Zürich sunset and ten ecosystem
chapters. Art is cached at device resolution (up to 2×); no WebGL is required.

Hold Space or the gold launch button, then release near full charge. A perfect
38° launch starts at 102 m/s (previously 70), with a quicker charge and a more direct
arc. The flight follows its trajectory automatically: Space boosts, F/J fires,
P pauses, R restarts and M toggles sound. Touch uses the same launch/boost and fire
buttons. Arrow, tilt and CRT controls are removed.

Five boosts, coins, pickups, heat, mines, shields and FLOW Overdrive carry over.
Motoko patrols 42–80 m ahead and 20–38 m above the bug, with a wider orbit and
predictive blaster aim. Its pulse can be evaded with a timed boost. The launch
building has a single street-aligned foundation; every window stays above it.

The 2D app has its own frontend, backend, browser identity namespace and leaderboard.
3D profiles and scores are never copied into it. Both games can coexist in one Hub.
Players can play publicly, optionally sign in through Kebapstack, choose a callsign
and publish individual flights. Scores remain private until publication.
Points are whole metres + 50 per coin. Server tickets, payload bounds, elapsed-time
checks, unique coin IDs and identity checks are retained. This is plausibility
validation, not a server replay or a prize-grade anti-cheat system.

## Local development

Use Node 22.22.2+ and the pinned lockfile: `npm ci`, `npm run build:backend`,
`npm run build`, `npm test`, `npm run test:backend`, `npm start`.
For a local public board, `npm run preview:backend` runs a disposable PocketIC instance.
See [INSTALL.md](INSTALL.md) for a fresh deployment alongside 3D.

Version 0.2.0 retains existing profiles and scores. Older flights remain on the same
board but used the slower 0.1.0 balance; an old open tab must reload before submitting.

### Public source artwork

The flight guide uses the canonical Bug mark. The supplied third-party mascot portrait is omitted from this distribution because its redistribution license was not documented. Code-drawn scenery and ecosystem references do not imply endorsement. See [third-party notices](../THIRD_PARTY_NOTICES.md).
