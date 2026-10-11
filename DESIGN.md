# LifeOS Design

Warm, luxurious, calm. Cream marble, frosted cards, metallic champagne gold. Simple enough for any college student: one page, few words, no jargon.

## Colours

| Role | Name | Hex |
|---|---|---|
| Page | Cream Alabaster | #F2E9D8 |
| Panels, ask bar | Rich Espresso | #2A1F1A |
| Text | Deep Charcoal | #26231F |
| Secondary text | Soft Taupe | #7A6858 |
| Accent | Champagne Gold | #B8934A |
| Gold highlight (gradients only) | Light Gold | #E6D2A0 |
| Warning | Terracotta | #A5472F |

- Define each as a CSS variable once; never hard-code hex elsewhere.
- Metallic gold = gradient from #B8934A to #E6D2A0, used for borders, rules, buttons and the wordmark underline. Text on Espresso is Cream Alabaster.

## Surfaces

- **Page:** Cream Alabaster with soft marble veining drawn as inline SVG (thin, low-contrast, slightly blurred curves). No image files.
- **Cards:** translucent cream (about 60% opacity) with backdrop blur, 1px champagne gold border, 1px white highlight along the top edge, soft warm shadow.
- **Panels and ask bar:** solid Rich Espresso, same corner radius as cards.

## Type

- **Serif** (Georgia-style stack): wordmark, headings, big numbers.
- **Sans-serif** (system stack): body text.
- **Monospace**: dates and amounts.
- **Labels:** small, uppercase, wide letter spacing (about 0.12em), Soft Taupe.

## Layout

No sidebar. One page, top to bottom:
1. Header: LifeOS wordmark.
2. One headline sentence summarising the week (serif).
3. Week ribbon: 7 day columns, each showing that day's tasks, exams, bills and spending.
4. One-line money summary: spent this month, budget left.
5. AI ask bar docked at the bottom. Later version: reserve the space only, no function yet.

Phones: the week ribbon scrolls sideways, with one day mostly visible and the next peeking in. The ask bar stays docked.

## Rules

- Gold is never used for small text on cream (too low contrast). Gold is for borders, lines, icons and large text only.
- Text never sits on a marble vein. Keep veins in the margins and behind empty areas, or put text on a card.
- No emoji. Use simple line icons (SVG, 1.5px stroke, Charcoal or Taupe).
- Terracotta appears only for money problems (over budget, upcoming costs above what is left). Never for decoration or non-money errors.
- Soft Taupe only for text at 14px or larger.
- Every button and input is keyboard-reachable with a visible gold focus ring.
- Respect reduced-motion settings; any animation is slow and gentle.

## States

- **Empty:** a calm line in serif plus one plain next step, e.g. "Nothing due this week. Add a task to begin." Day columns with nothing show a faint dash.
- **Loading:** cards keep their shape and show a slow gold shimmer. No spinners, and no layout jump when data arrives.
- **Error:** a plain sentence on the card saying what failed and a "Try again" button. Charcoal text and a line icon, not terracotta, unless it is a money problem.
- **No budget set:** the money line reads "No budget set" with a "Set budget" link, not a warning.
