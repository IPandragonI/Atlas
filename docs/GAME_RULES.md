# Game rules

Source of truth in code: `src/engine/rules.ts`, `game.ts`, `scoring.ts`, `difficulty.ts`, `hints.ts`.

## Entry point
Opening Atlas (`/`) goes straight into **today's Classic daily challenge** (UTC date; language from the saved choice or the
browser, FR default): no menu, mode, difficulty or confirmation step. If today's Classic daily was already completed, the
completed game (route, score, results, alternative routes) is shown instead of a new attempt. The home screen, free play,
other modes and difficulties stay in the navigation (a menu button on mobile).

## Core loop
Connect a start country to a destination through intermediate countries that you type. A guess is **accepted** if the
country is a valid next move; otherwise it is **rejected** and consumes exactly one attempt. Rejections never say why and
never reveal the optimal route.

**Victory:** after each accepted move, the game ends in victory as soon as the current country has a valid connection to the
destination under the active rules (land, or sea if enabled) **and** every route-level constraint is satisfied by the
completed route (route + destination). Otherwise the game simply continues, without saying which constraint is missing.
The destination is never typed and is never part of the player's route; typing it is just a wrong answer (it is not a valid
move). Defeat: no attempts left. (`rules.reachesDestination`, `game.submitGuess`)

A valid next move is: adjacent to the current country under the active connection rules, not already in the route, not
forbidden, not the start, not the destination, inside the allowed region, and (with `maxIntermediate`) within the
intermediate budget.

## Repeated wrong answers
Submitting a country that was already rejected earlier in the same game is "repeated": no attempt is used, no penalty, nothing
is added to the mistakes (`submitGuess` returns the same state), and a neutral toast says so. Only the first wrong submission
of a country counts. A country rejected earlier is still accepted normally once it has become a valid move.

## The game panel
Top to bottom: mode/difficulty chips, from → to with the remaining mistakes, the route so far, the country input, a one-line
row of the three hints with their costs (confirmation shows the penalty), the rules (collapsed unless the challenge has more
than the basic land/sea rule), and the "give up" action. On mobile the collapsed sheet shows only the input; the expanded sheet
shows everything.

## Changing direction (route branching)
A guess that is **not** adjacent to the last country is still accepted when it is adjacent to an **earlier** country of the
active route **and** strictly closer to the destination than that country (shortest-path distance in the active graph,
`rules.resolveMove`; the latest qualifying earlier country wins). The active route becomes *route up to that country + the
new country*; the abandoned tail leaves the route, the map highlight and the score, but its countries **stay discovered**
(`GameState.visited` is the discovery history, `GameState.route` the active route). All other rules still apply (forbidden,
region, intermediate budget, no repeats), and a change of direction may **not drop a mandatory country** from the route
(it would leave an unwinnable route): such a guess is an ordinary wrong answer. When the new country also touches the last
country but the intermediate budget is full, the change of direction is still tried. It costs nothing and is never reported as an error: a subtle toast
("New direction") and a short animation. A guess that is not closer is an ordinary wrong answer.

## Start next to the destination
If the start already touches the destination, a non-blocking notice is shown. No point is deducted, no attempt consumed, it is
not an error. Victory still requires at least one intermediate country (`reachesDestination` needs a route of 2+), so the
player cannot win by typing nothing or the destination.

## Resuming a game
One in-progress game is saved (IndexedDB `kv`) after every accepted or rejected move, keyed by the game URL parameters. Opening
Atlas, or the home screen's *Resume* card, restores route, discovery history, mistakes, hints and remaining attempts, and
re-validates the save (`isResumable`: same challenge, dataset/rules version). Finishing or abandoning clears it; starting a
different game replaces it (single slot).

## Starting a game: the configuration modal
There is no "Play" page. The home screen lists the three modes; each opens its own modal (`GameConfigModal`):
- **Difficulty**: Easy / Normal / Hard (unchanged behaviour) or **Custom**.
- **Custom only**: minimum route length (intermediate countries, ≥ 1 and ≤ the longest route of the chosen scope; the
  generated minimum is *at least* this value), number of attempts (1–30, replaces `min + margin`), and map appearance:
  starting country shown, borders shown, names shown, full map vs progressive discovery.
- **Playing area**: whole world or a continent (Classic / Constraints, routes stay inside it); in Regional mode any
  continent or subregion.
- **Without going through**: up to 10 countries (same autocomplete). They are never crossed and never picked as start or
  destination, in every mode.
- The configuration is validated, then a challenge is generated *before* the game opens: an impossible combination (e.g. a
  land-only game in Oceania, a route longer than any that exists, too many avoided countries) is explained in the modal.
  The last settings of each mode are remembered.

## Replay and what comes next
A finished game offers **"Replay with the same settings"**: same mode, difficulty, area, forbidden countries and custom
settings (the whole configuration travels in the game URL), a new seed, and the previous start/destination pair excluded.
(In a scope with a single possible pair the exclusion is dropped rather than failing.) After a **daily** challenge the first
suggestion is another daily not yet completed today (classic → constraints → regional); once all three are done a
**new Classic game** (opens its modal) is suggested instead. A completed daily is never restarted or overwritten: reopening
it shows the saved result, and replaying it launches a free game.

## Autocomplete
A name-search aid only. It searches **all 195 countries** from the typed text alone (French + English names, aliases,
accents/case/spacing ignored) and shows nothing until something is typed. It knows nothing about the route, adjacency,
visited, forbidden or constrained countries and never prioritises neighbours. Any country can be submitted; the engine
(`rules.validateMove`) decides. Code: `engine/search.ts`, `components/game/CountryCombobox.tsx`.

## Map visibility (visual only)
Rule in `lib/visibility.ts`; the GeoJSON, the graph, validation and generation never see it.
- **Easy**: the full map during the game (`full: true`).
- **Normal / Hard**: the map is hidden while playing, except the **departure and arrival countries, which are always
  displayed** (highlighted, with the A / B pins and names). A further country (shape, border, name) appears the moment it
  is correctly entered. Wrong guesses are never drawn. The camera frames only what is displayed.
- **Custom**: the player chooses `full` (full map or progressive), `start` (departure country displayed), `borders` and
  `names`. These only change presentation. After the game everything is revealed regardless of these switches.
- **Win or loss**: the whole map fades in (~1 s), discovered countries stay highlighted, and the route plus the optimal and
  alternative routes are drawn through the results panel.

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

## Hints (never consume attempts)
Three hints, in this order, once each: first letter (−75), borders (−150), **full name of a valid next country (−300)**. The
penalty is shown before confirming. They all describe the same country while it stays a valid candidate. Candidates come
from the solver on prefixes of the active route and are filtered through `resolveMove`, so a hint always points at a move
the player can make right now (including a change of direction out of a dead end) and never at the destination. A hint whose
country is no longer a valid move (the route changed) is shown as *outdated*, a followed one as *followed*; the penalty is
not refunded. (`engine/hints.ts`, `game.useHint`)

1. **First letter (−75)**: the first letter of a valid next country.
2. **Borders (−150)**, available once hint 1 was used: the shape and borders of the *same* country are drawn on the map (own
   "hint" colour), **without its name**. On a hidden map this is the only extra information revealed; it is shown only while
   that country is still a valid next step.

3. **Country name (−300)**, available once hint 2 was used: the full name of the same country. It is never entered for the
   player.

The penalty is displayed on the button and again in a confirmation step, and is applied only when confirmed. The hinted
country always comes from the real solver, so it belongs to an actual optimal solution and respects every constraint
(forbidden, mandatory, region, coastal…). Selection is
deterministic for a given state. If nothing can be determined (e.g. the intermediate budget is exhausted), no hint is given,
**no penalty is applied**, and a message says so.

## Victory feedback
A victory (never a defeat) plays one synthesized jingle (`lib/sound.ts`, no audio file, works offline) and a ~3.5 s particle
burst (`VictoryBurst`, canvas, `pointer-events: none`, skipped with `prefers-reduced-motion`). Both fire once per win. The
*Sound effects* setting (Settings, persisted) mutes the jingle and the other effects; the visual burst is independent.

## Score (0–1000)
Victory +500, optimal route +300, no mistakes +100, no hints +100; −25 per mistake; hints −75 / −150. Clamped to
[0, 1000]. All optimal routes earn the bonus. **A defeat scores 0** (every bonus is conditional on victory; the breakdown
still lists penalties). Time is a statistic only.

## Discovery policy
A country is discovered the moment the player correctly enters it, even if the game is lost later. The **start country** and
the **destination** are never entered by the player, so neither is discovered by playing. Visits count each correct entry.

## Alternatives
After the game only: the player's route, the shortest route(s), and alternatives up to +2 hops (capped), selectable and
drawn on the map.
