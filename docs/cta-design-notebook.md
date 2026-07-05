# CTA Card Design Notebook

Working notes on designing OpenCX Chat CTA cards — what the component gives you,
what great cards do with it, and lessons learned iterating on 10 real-brand
examples (Stripe, Notion, Airbnb, Nike, Shopify, Spotify, Linear, Mailchimp,
Allbirds, Netflix). Living document; updated per design round.

## The anatomy (what you're composing)

```
[imageUrl]        — full-bleed header, rounds with the card
title             — the only required field
body              — one supporting line (restyles well: coupon chip, presence line)
avatarUrls[]      — overlapping team row
buttons[]         — open-chat | ask | prefill | url, primary/secondary
composer          — inline input, submits into a fresh chat
```
Everything except `title` is opt-in. Restyle any slot via
`cssOverrides` + `[data-component="cta/*"]`.

---

## Round 1 — critique of the first 10 (lead-designer pass)

### Component-level findings (fix once, every card improves)

1. **Flat vertical rhythm.** A uniform gap between every section made cards read
   as a stack of parts, not a composed message. Title+body are one thought —
   4-6px apart; groups (text / social proof / actions / composer) need 12-14px.
   *Rule: spacing encodes grouping. Two spacing values minimum.*
2. **Underweight title.** 16px/semibold reads like a list item. A teaser lives
   or dies on its headline: 17px/bold/snug tracking.
3. **The button wall.** Three identical full-width buttons = 130px of
   undifferentiated chrome. Primary must dominate (weight, fill); secondaries
   recede. Also: card 16px radius, buttons 12px, composer 999px — three radius
   languages in one 360px card. Pick a family.
4. **Avatars as afterthought.** 28px + timid overlap reads decorative. Crisp's
   works because avatars are ≥32px, tightly overlapped, adjacent to the
   presence line ("team is online") so they *prove* the claim.
5. **Dismiss X has no home on imagery.** Fine on white; invisible on photo
   headers (Netflix tiles). Over an image it needs a scrim (black/25 circle +
   white glyph). Also grew the hit area.
6. **Wireframe composer.** Border-only input on white looks like a mockup.
   Filled input (secondary token), border appears only on focus — now it reads
   as a real, inviting control.
7. **Generic elevation.** Tailwind `shadow-xl` = tight dropdown shadow. A
   floating teaser wants soft, wide, low-opacity ambient shadow
   (`0 12px 40px -8px rgba(0,0,0,.18)`) + hairline `black/5` border so it
   holds an edge on both white and busy pages.
8. **Emoji tax.** 10/10 titles ended with an emoji → instant template smell.
   Emoji is seasoning: use when it carries voice (Spotify's "cancel… 👀"),
   drop otherwise.

### Per-brand findings

- **Stripe** — strongest baseline. Copy trimmed: body shouldn't repeat what the
  primary button says.
- **Notion** — white card fought the dark hero AND the white product screenshot
  behind it. Verdict: on dark heroes, the card goes dark (`#191919`), primary
  button inverts to white. Match the surface you float over.
- **Airbnb** — avatars too small to sell "team is online"; primary button
  should use the brand's actual gradient (`#E61E4D→#D70466`) — brands with a
  signature gradient should keep it in the card. Presence dot added via
  `body::before` trick (see recipes).
- **Nike** — "minimal" read as "unfinished". Minimal needs conviction: their
  voice is loud — uppercase condensed bold italic title, composer-only. A
  one-liner + input IS a strong variant when the type carries it.
- **Shopify** — image→copy→actions→composer is the canonical full stack; keep.
- **Spotify** — best dark execution; secondary fills needed one step more
  separation from the card (#242424 → #2A2A2A on #121212).
- **Linear** — the purple gradient card was *my* idea of Linear, not Linear's.
  Their world is near-black + hairline borders + restrained purple accents.
  Authenticity beats variety: derive the card from the brand's own surfaces.
- **Mailchimp** — neo-brutalist quiz (hard offset shadow, 2px peppercorn
  border) is the keeper of the set. Push further: cream card (#FBF6EC).
- **Allbirds** — the coupon chip (dashed border, monospace, letterspaced code)
  works; anchor of the card.
- **Netflix** — raw og/hero art is too noisy at full height behind a card;
  constrain image headers (`aspect-ratio` + `object-fit: cover`) into a banner
  strip.

### Principles distilled (v1)

- **Match the surface you float over.** Light page → light card; dark hero →
  dark card. The card is a guest on the host page.
- **One primary action.** Everything else recedes. If every button shouts,
  none does.
- **The body line is a power slot.** It restyles into a coupon chip, a
  presence line, a punchline — one field, many jobs.
- **Brand color goes on the primary button + launcher, not the card canvas** —
  unless the brand owns a canvas (Spotify black, Mailchimp cream).
- **Copy: say the action, not the vibe.** "Talk to sales", "Claim my
  discount", "Recommend me a thriller" — verb-first, specific, sentence case.
- **Questions make the best secondaries.** An `ask` button phrased as the
  visitor's own words ("How do refunds work?") converts curiosity into a
  qualified first message.

---

## cssOverrides recipes (tested)

```css
/* Dark card */
[data-component="cta/root"]  { background:#121212; }
[data-component="cta/title"] { color:#fff; }
[data-component="cta/body"]  { color:#b3b3b3; }
[data-component="cta/btn"][data-variant="secondary"] { background:#2a2a2a; color:#fff; }
[data-component="cta/composer/input"] { background:#242424; border-color:#333; color:#fff; }
[data-component="cta/dismiss_btn"] { color:#b3b3b3; }

/* Coupon chip out of the body slot */
[data-component="cta/body"] { font-family:ui-monospace,monospace; border:2px dashed #212A2F;
  border-radius:10px; padding:10px 12px; text-align:center; font-weight:700;
  letter-spacing:.14em; background:#F4F2EF; }

/* Presence dot before the body line */
[data-component="cta/body"]::before { content:''; display:inline-block; width:8px; height:8px;
  border-radius:50%; background:#23A566; margin-right:6px; }

/* Neo-brutalist */
[data-component="cta/root"] { border-radius:24px; border:2px solid #241C15; box-shadow:6px 6px 0 #241C15; }
[data-component="cta/btn"]  { border-radius:14px; border:2px solid #241C15; font-weight:700; }

/* Tame a noisy image header into a banner strip */
[data-component="cta/image"] { aspect-ratio:16/7; object-fit:cover; }

/* Brand-gradient primary */
[data-component="cta/btn"][data-variant="primary"] { background:linear-gradient(90deg,#E61E4D,#E31C5F,#D70466); }
```

---

## Round 2 — re-review after the component pass (verdicts)

All 10 re-rendered with the new defaults + v2 configs. Verdict: **converged.**

- **Notion** — biggest transformation. The dark card now reads as part of the
  hero instead of a sticker on it. Confirms: *match the surface you float over*
  is the highest-leverage rule in the whole system.
- **Nike** — proof that "minimal" works when type carries conviction: uppercase
  italic 900-weight title + composer + nothing else reads unmistakably Nike.
  A title override is the cheapest way to inject brand voice.
- **Airbnb** — presence dot (body `::before`) + 32px avatars + the brand's real
  gradient on the primary changed it from "widget with buttons" to "support is
  right here". Social proof needs to *prove*, not decorate.
- **Spotify / Linear / Netflix** — the three dark cards each read native
  because the darks are the *brands' own* darks (#121212 / #0F1011 / #141414)
  with matching hairline borders — never a generic "dark mode".
- **Netflix** — `aspect-ratio: 16/7` banner crop tamed the noisy tile art;
  image headers should be a strip, not a poster.
- **Stripe / Shopify** — the light-card baseline: filled composer input +
  grouped rhythm + soft ambient shadow carried both with zero overrides.
- **Mailchimp / Allbirds** — the two "art direction" cards (neo-brutalist quiz,
  coupon chip) survived the pass intact; distinctiveness lives in one signature
  element per card, everything else stays quiet.

Remaining nits consciously accepted: none visible at 1x. Stopping here —
further rounds would optimize pixels the visitor never perceives.

## The system, distilled (what shipped into component defaults)

1. **Two-tier rhythm**: title+body 4px apart; groups 12-14px apart. Spacing IS
   grouping.
2. **17px/bold/snug title** — the headline is the card.
3. **One primary** (semibold, brand fill); secondaries recede (muted fill,
   medium weight). Radius family: card 16 / buttons 14 / composer & avatars
   round.
4. **Filled composer input** (secondary token, border only on focus) — an
   invitation, not a wireframe.
5. **Ambient elevation**: `0 12px 40px -8px rgba(0,0,0,.18)` + hairline
   `black/5` border — floats on white, holds an edge on photos.
6. **Dismiss X earns a scrim on imagery** (black/25 + white glyph +
   backdrop-blur), stays quiet on flat cards.
7. **Image headers are banners**: `max-h-44` + `object-cover` by default;
   crop tighter per-brand with `aspect-ratio`.
8. **Emoji ≤1 per card, only when it carries voice.**

## Iteration log

- **Round 0** — first 10 shipped with component defaults + naive per-brand
  overrides. Screenshots reviewed; critique above.
- **Round 1** — component design pass (rhythm, title scale, button hierarchy,
  avatar presence, dismiss scrim on imagery, filled composer, ambient shadow)
  + per-brand v2 configs (dark Notion, authentic Linear, Nike voice, Airbnb
  gradient+presence, Netflix banner crop, copy de-emojied).
- **Round 2** — full re-render + re-review. Converged; verdicts above.
  Component changes committed to `aziz/feat/chat-cta`.
