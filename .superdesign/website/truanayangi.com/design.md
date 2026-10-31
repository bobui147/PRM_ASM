---
version: "superdesign-alpha"
name: "Loot-crate tavern UI"
description: "Near-black gamified-loot aesthetic: a torch-lit square chest band, rarity-coded card borders, and a single warm-gold accent rationed to CTAs, chips, and corner glows."
colors:
  background: "#15120E"
  surface: "#201A12"
  surface-alt: "#202126"
  card: "#191A1E"
  text-primary: "#ECF1F3"
  text-secondary: "#ACBDC8"
  text-warm: "#F1E1C2"
  accent: "#DFC28B"
  accent-deep: "#4A3A24"
  rarity-epic: "#71A69A"
  rarity-legendary: "#9FB2BF"
typography:
  display-lg:
    fontFamily: "editorialFont"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: "1.15"
    letterSpacing: "3px"
  headline-md:
    fontFamily: "editorialFont"
    fontSize: "32px"
    fontWeight: 500
    lineHeight: "1.5"
  body-md:
    fontFamily: "Arial"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: "1.5"
  label-md:
    fontFamily: "editorialFont"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: "1.45"
  accent-serif:
    fontFamily: "Times New Roman"
    fontWeight: 400
    role: "rare rarity-label and legacy accent passages"
spacing:
  base: "4px"
  tight: "5px"
  gap-sm: "8px"
  gap: "12px"
  section-padding: "10px"
rounded:
  sharp: "1px"
  control: "3px"
  card: "4px"
  button-soft: "8px"
  button-rounded: "10px"
  pill: "28px"
  pill-lg: "50px"
components:
  button-primary:
    background: "#4A3A24"
    text-color: "#F1D29E"
    radius: "0px"
    height: "56px"
    padding: "6px 12px 6px 6px"
    shadow: "rgb(223, 194, 139) 0px -2px 0px 0px inset"
  button-gilded:
    background: "linear-gradient(rgb(181, 145, 84), rgb(119, 86, 44))"
    text-color: "#FFF0D4"
    radius: "1px"
    height: "56px"
    padding: "10px 14px"
    border: "1px solid rgb(212, 174, 106)"
    shadow: "rgba(255, 255, 255, 0.086) 0px 1px 0px 0px inset"
    hover-shadow: "rgba(255, 255, 255, 0.15) 0px 1px 0px 0px inset"
  button-glass:
    background: "linear-gradient(110deg, rgba(223, 194, 139, 0.125), rgba(223, 194, 139, 0.03))"
    text-color: "#EDF1F3"
    radius: "28px"
    height: "44px"
    padding: "8px 18px"
    border: "1px solid rgba(223, 194, 139, 0.467)"
    shadow: "rgb(223, 194, 139) 0px -2px 0px 0px inset"
  button-ghost:
    background: "transparent"
    text-color: "#ACBDC8"
    radius: "28px"
    height: "44px"
    padding: "8px 18px"
    border: "1px solid rgba(0, 0, 0, 0)"
  nav-cta:
    background: "#DFC28B"
    text-color: "#182630"
    radius: "10px"
    height: "44px"
  card-item:
    background: "radial-gradient(at 50% 20%, color(srgb 0.666667 0.54902 0.733333 / 0.16), rgba(0, 0, 0, 0) 80%), linear-gradient(145deg, rgb(48, 42, 32), rgb(20, 18, 14))"
    radius: "0px"
    padding: "0px"
    shadow: "rgba(16, 14, 11, 0.8) 0px 0px 0px 4px inset, color(srgb 0.666667 0.54902 0.733333 / 0.3) 0px 0px 0px 5px inset"
---
# Loot-crate tavern UI
Source: https://truanayangi.com/

## Overview
This is a dark-mode-default gamified-commerce system dressed as fantasy loot UI: a near-black ink field (`#15120E`/`#201A12`), small hits of warm gold (`#DFC28B`), and colored rarity borders standing in for a conventional tag system. It reads as RPG-inventory skeuomorphism crossed with Swiss-grid discipline — every card is a strict rectangle in a repeating grid, but each is framed by a top-edge rarity stripe (teal, red, violet, amber) borrowed straight from loot-tier game UI. Type is a tight, wide-tracked editorial display face for labels and headings paired with small-size Arial body copy, giving it a tavern-signage, carved-plate feel rather than a soft SaaS one.

## Composition
The first screen stacks: an edge-to-edge square navbar, a centered pill-tab row, a single-line counter, a dark bordered "progress/quest" banner, a five-up horizontal card carousel with one item pulled into focus by a bright vertical tick, a meal-type pill-tab row, a quantity selector plus one dominant gold CTA bar, then a dense uniform grid of inventory cards beginning under a short label line. Scrolling further is pure repetition of that 6-column card grid for several rows, closing on a centered outline "more" control and a minimal link footer. Density is high and deliberate: the grid rhythm (12px gaps, 6 equal columns) is the dominant structural idea, rejecting a looser editorial/bento layout in favor of inventory-grid uniformity — every item gets equal visual weight, and hierarchy is carried entirely by the rarity border color and the one hero-focused carousel card, not by card size.

## Colors
Background is a near-black warm charcoal (`#15120E`/`#201A12`, together >35% declared area and matching the ~79% `#181818` pixel-field reading) — this is the true page field, not any of the captured gradients. Card fill is a slightly lighter warm-brown gradient panel (`#201A12`-family, `#202126` for a few UI chrome surfaces) sitting just above background value, giving faint elevation without a lit backdrop. `#DFC28B` (gold) is the single rationed accent: it appears only on the CTA bar, the nav CTA, active-tab fill, progress-banner accents, and a couple of glass-button borders/strokes — never as a field fill. Text runs `#ECF1F3`/`#E8DDC9` for primary and `#ACBDC8`/`#9FB2BF` for secondary/muted labels. Rarity stripes borrow extra hues outside the core palette (teal `#71A69A`, violet, red, amber) purely as category coding on card edges — these are left out of the main palette and used only as 1-2px top borders, keeping the field itself monochrome.

## Typography
`editorialFont` carries all display and label roles: a compressed, wide-tracked 13px/500 caps-like display token (`letter-spacing: 3px`) for eyebrow/logo-type marks, a 32px/500 headline for section titles, and a 14px/500 label face for card titles and tab labels — this is the system's dominant voice, closer to carved signage than UI sans. Arial at 11px/400 is reserved for small body/meta copy (category tags, fine print) where legibility at tiny size matters more than character. Times New Roman appears as an occasional accent serif on rarity/legacy labeling — treat it as a rare textural flourish, not a body face.

## Layout
Content is capped at 1120px max-width and centered. The primary inventory section is a strict 6-column grid, 12px gap, uniform 16%-width cards repeated across four full rows (24 items total) — a uniform card grid, not bento or masonry: every cell is equal. A secondary carousel-style band above it uses 5 visible cards at roughly equal width with one pulled forward via a bright accent divider. A 2-column, 12px-gap row (3 items) appears for the quest/progress module area, and a 4-column 8px-gap grid (5 items, uniform 24% rows) governs a compact meta strip. Spacing throughout is tight and mechanical — 12px/8px/5px/4px increments — with almost no generous whitespace; density is the governing value, consistent with the inventory-grid metaphor rather than a breathing marketing layout.

## Components
- **Navbar**: edge-to-edge square bar, 72px tall, full viewport width (0px left inset, 15px right), all four corners 0px radius — a hard rectangular strip, not a capsule or inset bar. Background `#15120E`. Carries 4 primary nav items plus a right-aligned cluster of 3 icon-only utility buttons (circular, dark fill) and a logo/title lockup at left (two-line stacked wordmark, large tracked caps + small subtitle).
- **Hero carousel card row**: appears directly below navbar/progress banner; 5 cards visible per row, near-equal width, one brought into visual focus by a bright vertical accent tick on its border. Surface: dark card body topped by a full-bleed square photographic image (~65% of card height), a small rarity-tier chip top-left over the image, and a title label beneath in `editorialFont`.
- **Progress/quest banner**: one full-width bordered bar under the hero tabs; dark fill, left icon badge + tier label, center progress bar track, right-aligned small gold pill button. Border roughly `1px` gold-toned, radius ~4px.
- **Tab/pill selector (×2 rows)**: meal-category row and secondary filter row, each a cluster of pill buttons (`radius: 28px`, `height: 44px`) — one active pill filled solid gold-brown with dark text, remaining pills transparent/ghost with `#ACBDC8` text and transparent border.
- **Quantity + CTA bar**: one dropdown-style selector beside one full-width dominant gold CTA button — the single most emphasized control on the page, a solid warm-gold rectangle with dark ink text, soft rounding (~8px observed), sitting directly under the tab rows.
- **Hero primary CTA**: the gold "open/unlock" bar is the true primary — observed solid gold fill (`#DFC28B`-family) with dark ink text, ~8px corner radius, full-width rectangle, NOT the glass button (`rgba(223,194,139,.125)` gradient) which is a secondary nav/utility control, and NOT the dark `#4A3A24` sharp-corner button which functions as a section/tab-level action.
- **Inventory item card (×24, repeated ×6 per row)**: background `radial-gradient(at 50% 20%, color(srgb .667 .549 .733 / .16), transparent 80%), linear-gradient(145deg, rgb(48,42,32), rgb(20,18,14))`, `radius: 0px`, `padding: 0px`, double inset ring `rgba(16,14,11,.8) 0 0 0 4px inset, color(srgb .667 .549 .733 / .3) 0 0 0 5px inset` layered under a colored 1-2px top rarity stripe. Anatomy top to bottom: square product photo (~60% of card), small gray category label, `editorialFont` item title, price line in warm ink with a right-aligned rarity-tier word in small caps.
- **Secondary outline button** ("show more" pattern): transparent fill, thin gold-toned border, small pill/rounded rectangle, centered below the grid.
- **Footer**: transparent background, 6 plain text links in a single row, no dividers, minimal vertical padding — the quietest element on the page.

## Graphics & Effects
The dominant background treatment is a near-opaque dark wash, `linear-gradient(rgba(17,14,11,.91), rgba(17,14,11,.96))`, covering effectively the full page — this is a darkening scrim over a faint torch-lit photographic backdrop visible only at page edges, not a colored hero gradient; color stays rationed to small elements. A warm brass gradient, `linear-gradient(rgb(60,48,33), rgb(22,19,14) 14%, rgb(32,25,15) 86%, rgb(77,59,36))`, covers only the progress-banner strip (~6.5% of page area). A left-to-right fade, `linear-gradient(90deg, rgba(16,12,8,.96), rgba(16,12,8,.5) 45%, rgba(16,12,8,.125))`, is a small directional scrim used on a single focused carousel card (~2.3% of page), fading the photo into the card's dark ground for title legibility. Card-level accents use a tiny radial violet-tinted bloom (`color(srgb .667 .549 .733 / .16)`) at top-center of each card plus the `linear-gradient(145deg, rgb(48,42,32), rgb(20,18,14))` base panel — both confined to card bodies (~1% each of page area), never the page background. Soft ambient ember-glow texture (visible faintly behind the navbar and card edges) reads as a subtle warm vignette/noise rather than a hard pattern — treat as a low-opacity grain/glow layer, not a gradient hero.

## Motion
Interactive color/background/border transitions run at `0.15s` using `cubic-bezier(0.4, 0, 0.2, 1)` — fast, crisp, non-bouncy state changes typical of hover/focus feedback on buttons and tabs. Named keyframe animations (`reveal`, `unlock-case`, `gold-sheen`, `location-spin`, `diamond-sheen`, `diamond-edge`) signal a themed "unboxing" motion language: sheen sweeps across gold surfaces, a spin cue on location/selection changes, and a reveal/unlock sequence tied to the chest-opening CTA. CSS scroll-driven animation is present, implying card or section reveal tied to scroll position rather than pure on-load animation.

## Guardrails
- Never fill the full hero background with a saturated or brass gradient — background stays near-black; gradients are confined to the banner strip, a single focused card, and card-internal blooms only.
- Do not round the inventory cards — they are hard 0px rectangles with inset double-ring borders, not soft cards.
- Keep the gold-fill CTA bar as the only solid-gold full-width element; glass and ghost buttons must stay translucent/outline, never solid gold.
- Preserve the top-edge rarity-color stripe system on item cards; do not replace it with uniform neutral borders.
- Navbar must stay a hard-cornered, edge-to-edge rectangle — never convert it into a centered, pill, or heavily inset bar.
- Keep editorialFont for all titles/labels and Arial confined to small meta/body text; do not swap body copy into the display face.