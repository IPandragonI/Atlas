# Game rules

Source of truth in code: `src/engine/rules.ts`, `game.ts`, `scoring.ts`, `difficulty.ts`, `hints.ts`.

## Core loop
Connect a start country to a destination through intermediate countries. A guess is **accepted** if the country is a
valid next move; otherwise it is **rejected** and consumes exactly one attempt. Rejections never say why and never reveal
the optimal route. Reaching the destination wins; running out of attempts loses.

A valid next move is: adjacent to the current country under the active connection rules, not already in the route, not
forbidden, not the start, inside the allowed region, and (with `maxIntermediate`) within the intermediate budget.

The autocomplete lists **only** valid next moves. Free text matching any country can still be submitted and, if invalid,
costs an attempt. The destination is suggested whenever adjacent; if a route-level constraint (mandatory country, coastal
minimum…) is not yet met, entering it is rejected *without explanation* (no leak of which constraint is missing).

## Modes
| Mode | Rules |
|---|---|
| Classic | Land borders only, no extra rules, start/destination in the same land component. |
| Constraints | 2–3 rules (maritime counts as one): forbidden, mandatory, min coastal, min island, max intermediates, require region, avoid region, maritime links. Every constraint must be *active* (it changes the optimum or excludes an otherwise-optimal route). |
| Regional | Only countries of a region (6 continents + 9 subregions) are usable. Region size scales difficulty; Caribbean and Oceania always allow sea links. |

"Coastal" constraints count countries *with a coastline* on the route; they do not require following a coast.

## Attempts and difficulty
`attempts = minIntermediate + margin` — Easy +5, Normal +3, Hard +1. `minIntermediate` is computed under the active rules by
`solve()`. Classic/Constraints use absolute bands (easy 2–3, normal 4–6, hard 7–12 intermediates); Regional scales bands by
the region diameter. Difficulty is chosen before the game and never changes mid-game.

## Hints (never consume attempts, shown with penalty before use)
- Geographic (−50): subregion of one valid continuation.
- Connectivity (−75): land-border count of one valid continuation.
- Discovery (−125): first letter of one valid continuation.

Candidates are all *optimal continuations of the current partial route* (fallback: all valid moves). Texts say "a valid next
country…", never "the".

## Score (0–1000)
Victory +500, optimal route +300, no mistakes +100, no hints +100; −25 per mistake; hints −50/−75/−125. Clamped to
[0, 1000]. All optimal routes earn the bonus. **A defeat scores 0** (every bonus is conditional on victory; the breakdown
still lists penalties). Time is a statistic only.

## Discovery policy
A country is discovered the moment the player correctly enters it, even if the game is lost later. The **start country is
not** discovered (it is given); the **destination is** (the player enters it). Visits count each correct entry.

## Alternatives
After the game only: the player's route, the shortest route(s), and alternatives up to +2 hops (capped), selectable and
drawn on the map.
