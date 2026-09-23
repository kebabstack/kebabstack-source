# Persistent global navigation — scroll correction

Standard 1.1.2 · NAVIGATION-06 · 22 September 2026

## Reproduction and cause

In the Desk queue at 1280 × 720, scrolling the document by 134 CSS pixels moved the
67-pixel global bar to top −134. The sticky header was confined to a host exactly
its own height. Static page screenshots and DOM route smokes had missed this.

The shared SDK now makes the mount host sticky, keeps its normal-flow space and
prevents flex compression. Desk uses the shared header offset, including the border
and safe-area inset, for its independently scrollable desktop rail. In-page
navigation gets header clearance. Destroying the component releases the host class.

## Browser evidence (synthetic records only)

- Desk queue: actual wheel scrolling keeps the complete 61-pixel bar at top 0;
  the side rail starts at 61 and ends at the viewport bottom.
- At 390 × 760, scroll and open the Apps menu: bar and menu remain visible; no
  horizontal document overflow. At 1280 × 360 the rail has 299 pixels of space
  for 620 pixels of content and is independently scrollable.
- At 640 × 360 (the effective CSS viewport of 1280 × 720 at 200% zoom), long Desk
  content scrolls under the visible bar. This is a reflow check, not a native
  browser text-zoom or assistive-technology certification.
- Hub overview: actual content scrolling in a short viewport keeps the bar at 0.
  The mobile side drawer stays below global menus and lists its destinations
  vertically. An overlap discovered during final testing was corrected before
  publication.
- Assets, Contracts, Forms, Trust, Watch and Crumbs: real keyboard scrolling in
  narrow viewports keeps the complete shared bar at 0. Desktop checks also cover
  the long sample workspaces; Forms has no document overflow in its short desktop
  sample and is exercised at narrow width instead.
- Regression test checks mount-host positioning, non-compression, child layout and
  destroy cleanup. This complements real-browser verification; jsdom cannot prove
  sticky scrolling.

## Scope

Business workflow, access and directory code are unchanged. Bug receives the same
SDK while retaining its existing embedded account panel/immersive game exception.
Lunch is excluded. Release execution, populated upgrade and preservation evidence
are retained with the private release artifact; no real requests or records are
created for this review.
