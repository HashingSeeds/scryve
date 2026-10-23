---
status: accepted
---

# Events run on one engine, with Convex as the first authority

ADR 0001 set the target: a store runs a tournament on one device, and that device is the event's authority. We are building events in two steps instead. Convex is the authority for every event in the first release. A host device on the store's Wi-Fi becomes the second authority right after, running the same engine. Most of the work is the event itself (pairings, pods, standings, results, the round clock), and none of it depends on where the authority lives. Nearby games already prove the host-device transport.

## Decision

**One engine.** Pairing, pod assignment, standings, tiebreakers, and every organizer and player command live in shared pure code under `convex/lib/events/`. A command takes the event's current state and returns changes, the way `convex/lib/gameEngine.ts` does for games. Convex mutations apply those changes to tables. A host device applies them to memory and disk. The screens read an event through one interface, so they don't know which authority is behind it.

**Two structures, not one per format.** An event is either 1v1 Swiss (best of 1, 3, or 5) or pods of 3 to 5 players, one game per round. The format is a label carried for history and stats. Standard, Modern, Pioneer, Pauper, Sealed, Draft, and Prerelease are all Swiss events, and Commander nights are pod events.

**Rules per system.** Tiebreakers, the win-percentage floor, whether draws exist, and whether a match can end as a double loss come from the event's system. Magic follows the Magic Tournament Rules: 3/1/0 points, then opponents' match-win %, game-win %, and opponents' game-win %, each floored at 33%, with a bye counted as a 2-0 win and left out of opponents' percentages. Pokémon and Yu-Gi-Oh! have rule entries too, but the first release only offers Magic in the app.

**Who does what.** The organizer is the account that created the event, and can do everything. A player is a registered account and can report a result for their own table, confirm their opponent's report, and drop. A guest is a name the organizer added; the organizer enters a guest's results. Guest results count in standings and never in anyone's deck stats until an account claims them.

**Results feed standings, not stats.** An event table's result is the organizer's record. A player's own match, started from their table, goes through the existing match path with the event name and round, so their deck stats work as they do today. Linking the two is a later decision.

**Free to run.** Organizers pay nothing. A cap on unfinished events per account and the existing name gate bound abuse.

## Considered options

- **Build the host-device authority first, as ADR 0001 describes.** Rejected for the first release: it needs seat tokens for every player, an import path into Convex, and offline auth before a single store can run an event, and the store's Wi-Fi (client isolation, guest networks) is the riskiest part to test. The engine doesn't change either way.
- **One structure per format.** Rejected: every Magic constructed and limited format pairs the same way, and the per-format differences that matter (starting life, the round clock) already live in `convex/lib/systems/`.
- **Embed players and rounds in one event document.** Rejected: every report would rewrite the whole event and resend it to every phone. Events, players, and tables are separate tables, so a report touches one row.

## Consequences

- The host-device authority adds a transport, persistence on the host, seat tokens issued at check-in, and an import mutation. It does not add rules.
- When it ships, Convex refuses player writes for an event a host device runs, as ADR 0001 requires.
- Top cuts, draft seating and pick timers, decklist registration, Pokémon age divisions, and EventLink export are out of the first release.
