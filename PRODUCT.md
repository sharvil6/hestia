# Hestia — Design Reference

Family recipe management app. Home cooks use it to save, organize, and annotate recipes together as a family. Design register: **product** (design serves the task), **Committed** color strategy (warm amber palette carries 30–60% of surfaces).

**Scene:** A home cook settling at the kitchen counter with a tablet, Sunday afternoon, natural light, family cookbooks nearby.

---

## Design principles

**Warmth is structural, not decorative.** Every neutral surface carries a warm chroma tint (hue ~34°, chroma 0.005–0.01). The amber palette should feel cohesive even when the explicit brand color is absent.

**Typography carries personality.** Lora is reserved for headings and brand moments only — display sizes, section titles, step number badges. Inter handles all body text, labels, data, and UI controls. Never use Lora for buttons or form inputs.

**Consistent vocabulary across screens.** Every interactive element has exactly four states: rest, hover, focus, active. All transitions use `--duration-base` / `--ease-standard` unless urgency requires `--duration-fast`. A button that looks different in two places means one is wrong.

**Hierarchy through restraint.** The brand orange (`--color-brand`) is used sparingly: primary CTAs, active states, and brand-moment headings. It is not used to decorate every title. Warmth comes from surface tints, shadow warmth, and Lora typography — not from painting everything orange.

---

## Color tokens

| Token | OKLCH | Semantic role | Example usage |
|---|---|---|---|
| `--color-canvas` | `oklch(99% 0.007 34)` | Page background | `<main>` background |
| `--color-surface` | `oklch(97% 0.009 34)` | Default panels/cards | sidebars, secondary panels |
| `--color-surface-raised` | `oklch(100% 0.005 34)` | Elevated cards, modals | recipe cards, modals |
| `--color-surface-sunken` | `oklch(94% 0.012 34)` | Recessed areas | ingredient row hover, active inputs |
| `--color-border` | `oklch(88% 0.010 34)` | Default borders | card borders on hover |
| `--color-border-subtle` | `oklch(93% 0.008 34)` | Dividers, light borders | card borders at rest |
| `--color-brand` | `oklch(55% 0.16 34)` | Primary CTA, active states | FAB, primary buttons, brand headings |
| `--color-brand-hover` | `oklch(50% 0.16 34)` | Hover on brand elements | button hover state |
| `--color-brand-muted` | `oklch(91% 0.030 34)` | Tinted brand backgrounds | metadata row, step number badge bg |
| `--color-brand-text` | `oklch(40% 0.14 34)` | Accessible brand text on light | instruction section heading |
| `--color-sage` | `oklch(58% 0.085 128)` | Secondary accent | ingredient section heading border |
| `--color-sage-hover` | `oklch(53% 0.085 128)` | Hover on sage elements | sage link hover |
| `--color-sage-muted` | `oklch(93% 0.025 128)` | Sage tinted backgrounds | tag pills, checked ingredient rows |
| `--color-sage-text` | `oklch(42% 0.075 128)` | Accessible sage text | tag text, ingredient section heading |
| `--color-ink` | `oklch(18% 0.010 34)` | Headings, primary text | recipe title, step text |
| `--color-ink-secondary` | `oklch(42% 0.008 34)` | Labels, metadata | description, nav back link |
| `--color-ink-muted` | `oklch(62% 0.006 34)` | Placeholders, captions | search placeholder, annotation author |
| `--color-ink-disabled` | `oklch(75% 0.005 34)` | Disabled controls | icon button at rest |
| `--color-error` | `oklch(52% 0.18 20)` | Error states | error text, delete icon hover |
| `--color-error-muted` | `oklch(94% 0.04 20)` | Error backgrounds | inline error callouts |
| `--color-success` | `oklch(55% 0.14 145)` | Success states | success toast, confirmed actions |

---

## Typography rules

| Element | Font | Size | Weight | Notes |
|---|---|---|---|---|
| Display heading (login) | Lora | 3rem | 600 | `--tracking-tight` |
| Recipe title (h1) | Lora | 2.25rem | 600 | `--tracking-tight` |
| Section headings (h2) | Lora | 1.5rem | 600 | With left-border accent |
| Wordmark | Lora | 28px | 600 | `--tracking-tight` |
| Step number badge | Lora | 15px | 600 | In brand-muted circle |
| Metadata values | Lora | 18px | 600 | In metadata row |
| Body prose | Inter | 1.0625rem | 400 | Step text, description |
| UI labels | Inter | 13–14px | 500 | Buttons, nav, micro-labels |
| Captions / micro | Inter | 11–12px | 500–600 | Uppercase `--tracking-label` |
| Data / lists | Inter | 15px | 400/600 | Ingredient quantities bold |

**Rule:** Lora only appears at heading level. Never use `--font-display` on buttons, form inputs, tags, or inline labels.

---

## Shadows

All shadows are warm-tinted (hue 34). Never use cold grey (`rgba(0,0,0,...)`) shadows.

| Token | Use |
|---|---|
| `--shadow-xs` | Subtle lift: edit button, skeleton cards |
| `--shadow-sm` | Default card elevation |
| `--shadow-md` | Hover state, modals, cover images |
| `--shadow-lg` | Floating panels, high-elevation overlays |
| `--shadow-brand` | FAB — warm amber glow |

---

## Prohibited patterns

- **Side-stripe decorative borders.** `border-left` wider than 1px as a colored accent on *cards* or *list items*. The section heading left-accent is allowed (it's on the heading element itself, not a container). Rewrite with tinted backgrounds or leading icons.
- **Gradient text.** `background-clip: text` with gradient. Use a single solid OKLCH color.
- **Identical card grids.** CSS Grid where every card is forced to the same height. Use CSS columns masonry on the home page.
- **Hardcoded hex or RGB in component files.** Always use CSS variables (`var(--color-brand)`). No `text-[#CC5500]`, `bg-red-100`, or `style={{ color: '#8A9A5B' }}`.
- **Spinners for page-level loading.** Use skeleton shimmer cards/blocks. `Loader2` is allowed only inside small inline buttons (mutation pending state).
- **`alert()` / `confirm()` for user feedback.** Replace with inline state. The annotation delete `confirm()` is a known exception until a proper modal is built.
- **Pure `#000` or `#fff`.** Tint all neutrals. Use `--color-canvas` and `--color-surface-raised` instead.
- **Orange on every heading.** `--color-brand` on titles looks garish. Use `--color-ink` for recipe titles; reserve brand color for the wordmark and brand-moment headings only.

---

## Icon conventions

| Icon | Concept |
|---|---|
| `Flame` | Brand identity, cook time, FAB alternative (login lockup) |
| `ChevronLeft` | Back navigation |
| `ChevronDown` | User switcher / dropdown hint |
| `NotebookPen` | Add annotation to a step |
| `BookOpen` | Empty state (recipe library) |
| `Users` | Yield / serving count |
| `Clock` | Total or prep time |
| `Plus` | Add action (FAB, CTA) |
| `Check` | Ingredient checked off |
| `ExternalLink` | Original recipe source link |
| `Search` | Search input prefix |
| `PenLine` | Edit recipe action |
| `ImageIcon` | Photo upload attachment |

---

## Transition guide

| Duration | Use |
|---|---|
| `--duration-fast` (150ms) | Hover color changes, icon toggles, border color shifts, checkbox state |
| `--duration-base` (200ms) | Card shadow/border on hover, button background, translateY lift |
| `--duration-slow` (300ms) | Modal/panel open-close, skeleton fade-out |

Always pair with `--ease-standard` (`cubic-bezier(0.2, 0, 0, 1)`). Use `--ease-spring` only on the FAB scale transforms.
