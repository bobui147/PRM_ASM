# Hôm Nay Ăn Gì? — Mobile loot-crate design system

## Product context

Offline Flutter Android demo for randomly choosing food. One vertically scrollable mobile screen contains a compact header, category and budget filters, a horizontal loot-style food reel, one primary spin action, and a two-column filtered inventory. Finishing a spin opens a result dialog. No account, backend, ordering, maps, sharing, or payments.

The visual direction is inspired by the public Trưa Nay Ăn Gì loot-crate UI, but this app must use its own title, Material icons, local demo data, and original layout. Do not reproduce the source site's logo, imagery, audio, or proprietary assets.

## Mobile layout

- Target viewport: Android phone, designed first at 390x844 logical pixels.
- Entire page scrolls vertically; no horizontal page overflow.
- Horizontal reel is clipped inside a full-width framed viewport.
- Page padding: 16px. Section gaps: 16–24px. Internal mechanical rhythm: 4, 8, 12px.
- Header is compact: chest icon, `HÔM NAY ĂN GÌ?`, and one short Vietnamese subtitle.
- Filters appear before the reel: four horizontally scrollable category chips, followed by a full-width budget selector.
- Reel shows roughly 2.3 cards at once on a phone, making horizontal motion obvious.
- Primary spin CTA is the only full-width solid-gold control.
- Inventory section title: `TRONG KHO CÓ GÌ?`; use a strict two-column equal-card grid.
- Result dialog fits inside the viewport with internal scrolling when needed.

## Color tokens

- Page background: `#15120E`.
- Elevated dark surface: `#201A12`.
- Chrome surface: `#202126`.
- Card base: `#191A1E`.
- Card warm gradient: `#302A20` -> `#14120E`.
- Primary text: `#ECF1F3`.
- Warm title text: `#F1E1C2`.
- Secondary text: `#ACBDC8`.
- Primary gold: `#DFC28B`.
- Deep gold/brown: `#4A3A24`.
- Gold CTA gradient: `#B59154` -> `#77562C`.
- Hairline border: `rgba(223, 194, 139, 0.32)`.
- Ambient glow: `rgba(223, 194, 139, 0.12)`.
- Modal scrim: black at 78% opacity.

## Rarity system

Rarity is communicated by a 2px top edge, small uppercase label, and restrained icon/border tint. Do not flood the card body with rarity color.

- `THƯỜNG`: stone `#A9A39A`.
- `HIẾM`: teal `#71A69A`.
- `SỬ THI`: violet `#A98CB8`.
- `HUYỀN THOẠI`: red/coral `#D55D68`.
- `CỔ VẬT`: antique gold `#D6B552`.

## Typography

- Display/title: readable editorial serif such as Georgia/system serif, medium-to-bold, warm text, slightly expanded tracking.
- Body/control text: system sans/Arial, high contrast.
- App title: 24–28px, weight 700, tracking 1.5px.
- Section title: 20–22px serif, weight 700.
- Card title: 14–16px, max two lines.
- Meta/category/rarity: 10–12px, uppercase where appropriate.
- Button label: 14–16px, bold, tracking 0.8px.
- Keep all Vietnamese accents legible; avoid tiny decorative type.

## Shape, border, and elevation

- Inventory and reel cards: hard rectangular silhouette, 2–4px corner radius maximum.
- Main reel frame and filter panels: 4px radius maximum.
- Filter chips may be pill-shaped for touch comfort.
- Use 1px warm-gold hairline borders and subtle inset rings.
- Ambient shadows are dark and compact; gold glow is low-opacity and restricted to the reel focus line, winning card, CTA, and modal border.
- Avoid soft SaaS cards, large rounded containers, neon gradients, or saturated full-screen backgrounds.

## Components

### Category chips

Four options: `Ăn trưa`, `Đồ uống`, `Ăn vặt`, `Món nhậu`. Active chip uses deep-gold fill and warm text; inactive chips are dark/transparent with secondary text. Minimum 44px touch height. Disabled during spin.

### Budget selector

Options: `50.000đ`, `100.000đ`, `150.000đ`, `Không giới hạn`. Full-width dark bordered control with gold dropdown indicator. Disabled during spin.

### Reel card

Fixed-size dark rectangle with rarity stripe at top, centered Material icon illustration in a subtle radial glow, rarity label, food name, and price. No remote image. Winning card gains a gold outer border and quiet glow only after motion completes.

### Fixed center indicator

Gold downward triangle at the top and a thin vertical gold line through the reel viewport. It never moves. The center of the winning card must land exactly on this line.

### Primary CTA

Full-width 56px gilded rectangle. Label `KHAI MỞ HÒM` or `ĐANG MỞ HÒM...`. This is the only solid-gold full-width surface. Disabled state is visibly dimmed.

### Inventory card

Equal-height two-column card. Top region is a consistent Material-icon illustration; lower region shows category, two-line name, formatted demo price, and rarity label. Rarity stripe remains visible. Cards reflect current filters.

### Result dialog

Dark near-square panel with 1px antique-gold border over a heavy black scrim. Content order: rarity, food name, price, large Material-icon illustration, one full-width `TIẾP TỤC` button. Dialog scrolls internally if necessary. No external-service buttons.

## Motion

- Reel duration: 4–5 seconds.
- Travel starts fast and decelerates smoothly to zero; no bounce.
- Result dialog appears only after the reel reaches its exact final slot.
- Winning card highlight transitions in 180–240ms.
- Filter state changes are crisp, about 150ms.
- Button and filter controls remain disabled throughout the spin.

## Content and behavior guardrails

- Vietnamese UI only.
- Data is local demo content across all four categories.
- Filtering uses selected category and maximum budget; unlimited budget has no price ceiling.
- Empty filtered state explains that no matching item exists and disables spinning.
- Do not add a desktop navigation bar, progress/XP system, account controls, ordering services, or sharing actions.
- Do not add packages, web-loaded images, copied logos, sounds, or reference-site assets.
- Use only Material icons as consistent placeholders for food imagery.
- Use only the colors, typography, spacing, and component styles defined here.
