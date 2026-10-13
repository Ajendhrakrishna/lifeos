# LifeOS Design

Warm, luxurious, calm. Cream marble, frosted cards, metallic champagne gold. Simple enough for any college student: few words, no jargon, one section at a time.

## Colours

| Role | Name | Hex |
|---|---|---|
| Page | Cream Alabaster | #F2E9D8 |
| Panels, menus, dialogs, ask bar | Rich Espresso | #2A1F1A |
| Text | Deep Charcoal | #26231F |
| Secondary text | Soft Taupe | #7A6858 |
| Accent | Champagne Gold | #B8934A |
| Gold highlight | Light Gold | #E6D2A0 |
| Money warning | Terracotta | #A5472F |
| Deadline warning | Warm Amber | #B36A00 |

- Define each as a CSS variable once; never hard-code hex elsewhere.
- Metallic gold = gradient between #B8934A and #E6D2A0, used for borders, rules, buttons and the active nav underline.
- On Espresso, text is Cream Alabaster and labels are Light Gold (Taupe is too dim there).

## Surfaces

- **Page:** Cream Alabaster with soft marble veining drawn as inline SVG (thin, low-contrast, slightly blurred curves). No image files.
- **Cards:** translucent cream (about 60% opacity) with backdrop blur, 1px champagne gold border, 1px white highlight along the top edge, soft warm shadow.
- **Panels, menus, dialogs and ask bar:** solid Rich Espresso, same corner radius as cards. Dialogs dim the page behind them with a blurred espresso veil.

## Type

- **Serif** (Georgia-style stack): wordmark, headings, big numbers.
- **Sans-serif** (system stack): body text, nav, buttons.
- **Monospace**: dates and amounts.
- **Labels:** small, uppercase, wide letter spacing (about 0.12em), Soft Taupe.

## Header and navigation

- **Wordmark**, top left, large serif: "Life" in Rich Espresso, extra heavy (bold plus a thin espresso stroke); "OS" in a rich metallic gold (gradient #C9A24F to #8F6E2E). Both share one soft drop shadow so they read clearly on cream.
- **Nav**, top right: "Home", "Tasks" and "Money" as plain text links, Charcoal, uppercase labels. The active one has a 2px metallic gold underline and `aria-current="page"`.
- Only one section shows at a time. The URL hash picks it (#home, #tasks, #money), so a refresh stays put. Default is Home; an unknown hash falls back to Home.
- On phones the header wraps: wordmark first, nav beneath if it does not fit.

## Layout

No sidebar. Header and content share one centred column up to 1040px wide. Home uses the full width; Tasks and Money cards stay 720px, centred. The AI ask bar (later version) docks at the bottom; nothing is built for it yet.

## Home

Top to bottom, every piece of text on a card or banner (never on bare marble):
1. **Warnings**, only when there is a problem. Each is a banner: frosted cream tinted with its colour, a 4px left bar and a line warning icon in that colour, Charcoal text. Overdue tasks first, in Warm Amber ("2 tasks are overdue: Lab record (2 days), ..."). Then one money banner in Terracotta: "You're ₹X over budget this month", or else "Upcoming dues cost ₹X, ₹Y more than you have left".
2. **Week card**: one serif headline sentence summarising the week, then the **week ribbon**: 7 day tiles from today. Each tile shows the day and date, that day's tasks (kind label above each title), and that day's spending if any. Today's tile is Rich Espresso. Phones: the ribbon scrolls sideways, one day mostly visible and the next peeking in; it is keyboard-scrollable.
3. **Money line card**: "Left to spend" as a big serif number, "₹X spent of ₹Y", and a metallic gold progress bar. Over budget: the bar is full and Terracotta.

## Menus and dialogs

- A three-dot line icon button opens a small espresso menu beside the thing it controls (e.g. the budget figure). It has `aria-haspopup`, `aria-expanded`, and role="menu" items.
- Menu keys: Enter, Space or Down opens; Esc closes and returns focus to the button; clicking elsewhere or tabbing away closes it.
- Dialogs use the native `<dialog>` so focus is trapped and Esc closes. Focus returns to the button that opened it. Errors show inside the dialog, never behind it.

## Rules

- Gold is never used for small text on cream (too low contrast). Gold is for borders, lines, icons, large text and the wordmark only.
- Text never sits on a marble vein. Keep veins in the margins and behind empty areas, or put text on a card.
- No emoji. Use simple line icons (SVG, 1.5px stroke, Charcoal or Taupe).
- Terracotta appears only for money problems (over budget, upcoming costs above what is left). Never for decoration or non-money errors.
- Warm Amber appears only for deadline warnings (overdue tasks). It is not gold and never replaces gold.
- Soft Taupe only for text at 14px or larger.
- Every button, link and input is keyboard-reachable with a visible gold focus ring.
- Respect reduced-motion settings; any animation is slow and gentle.

## States

- **Empty:** a calm line in serif plus one plain next step, e.g. "Nothing due this week. Add a task to begin." Day columns with nothing show a faint dash.
- **Loading:** cards keep their shape and show a slow gold shimmer. No spinners, and no layout jump when data arrives.
- **Error:** a plain sentence on the card saying what failed and a "Try again" button. Charcoal text and a line icon, not terracotta, unless it is a money problem.
- **No budget set:** the budget figure reads "No budget set", and "Edit budget" in its three-dot menu sets one. On Home the money line says "No budget set" with a link to Money. Not a warning.
