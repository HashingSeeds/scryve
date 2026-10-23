---
status: accepted
---

# Deck stats follow the deck, not its server row

Stats are a main reason players pick Scryve, and tournament play needs them to hold up. Today every result and stat row points at a server deck row and version, `decks._id` and `deckVersions._id`. So a local deck can't have stats, and deleting a deck hides its stats with it. #591 kept unsynced decks on the server and linked device copies back to them, and device testing of #595 found that link broken in four ways. We will give every deck a key that travels with it, pin the exact list each player brought when a game starts, and write every result through one function keyed by account and deck key. Syncing becomes copying deck content, and where a deck is stored stops mattering to its stats.

This ADR covers phase 1 only. `gameSummaries` and `matches` stay the game and match records, and history storage stays as it is. Replacing them with one record type is a separate, later decision.

## Decision

**Deck key.** The device that creates a deck gives it a random key, and the key never changes. It goes with the deck when the deck syncs, moves back to one device, or loads on a new device. Duplicating a deck makes a new key. An existing server deck takes the id clients already see, `syncId ?? _id`. A guest deck imported earlier also has a device id in `guestLocalId`, and the migration keeps that as an alias so a device's pending results find the same deck. Stats belong to an account and a deck key together, so another account syncing the same cards starts its own stats and never takes over the owner's.

**Decklist fingerprint.** One pure module, shared by the app and Convex, turns a list into a canonical form and hashes it with SHA-256. The canonical form has a format version and, for each card, the game, namespace, card identity, section, gameplay choices such as `commanderColor`, and quantity. Duplicate entries of a card in a section are summed before hashing. A card without a resolved identity uses its normalized original text. Printings and art stay out, so changing art doesn't fork a list, and the deck keeps its printing choices separately. The device computes the fingerprint offline when a game starts. Today's `deckVersions.fingerprint` includes printings and uses a 32-bit hash, so it can't be reused.

**Pinned list.** When a seat picks a deck, the game pins that deck's key and fingerprint for the rest of the game, and for every game of a match. Editing, syncing, or moving the deck mid-game doesn't change what the result points at. The device keeps a snapshot of every list it has pinned, so version comparison works for local decks. The server stores list contents only for Pro saved versions and tournament registrations. Everyone else's results carry the fingerprint alone.

**Results.** One writer adds and removes results and keeps totals beside them. Nothing else writes totals. A result is one seat's outcome in one game or match, and every path names it the same way:

- A game result's id is the client game id plus the device's player id for that seat. For a local or nearby game that's the id the device created and its `localId`. For a cloud game it's the game's `publicId` and the `gamePlayers` id. When nearby publishing rewrites a `publicId`, the server keeps the original client id on the summary, so the device and the server still agree.
- A match result's id, manual or connected, is the match `publicId` plus its seat number.
- Results already on the server when this ships can't be named that way, because publishing dropped each seat's `localId` and nearby publishing overwrote some game ids. They take a legacy id built from the summary id and its `gamePlayers` id. Only the backfill writes legacy ids, and every later upload carries the original client id.
- The backfill, every writer and remover, device reconciliation, claims, and account deletion all use these ids unchanged.

A result carries the account, deck key, fingerprint, source, outcome, and finish time. Totals are kept per account and deck key, and per account, deck key, and fingerprint. A match pins one fingerprint for its registered list, covering main deck, sideboard, and commander. Every game of the match carries it, and between-game sideboarding doesn't change it in phase 1. Rules carried over from today:

- One account in two seats gets two results. History groups them per account.
- An abandoned game stays in history and writes no result, except an untouched rematch, which stays out of history as it does now.
- A scored manual match adds its game tallies without game records, and its games are never counted twice.
- Only the owner can delete a manual match, and deleting it removes its results through the same writer.

Results from local and manual play are self-reported. Each summary and match stores who wrote it: the account, the device, and, for tournaments, the event authority from ADR 0001. Tournament standings count only records an authenticated event authority wrote, with token-backed seat claims. A cloud host is not a tournament authority.

**Old clients.** A result can carry a deck key without any stored deck version. When an older client uploads a game that points at a deck version, the server maps it to that deck's key and records an unknown fingerprint, since an unpinned client can't prove which list it played. If the version no longer resolves, the server records the game without a deck key instead of rejecting it, so an installed client never reaches its fallback that strips the deck. A result without a deck key counts in history and never in any deck's totals, so unrelated decks can't merge into one bucket. Its deck name is kept when the payload or a retained marker has one, and left unknown otherwise, since older uploads send only the version id. The app's own fallback (`LocalGamePublishSession.tsx`) also stops stripping the deck and sends the deck key and name.

**What a game records.** Captured automatically, never through a required prompt:

- The first player the game settled on, saved when the roll, coin, or choice resolves, not just the roll winner. Today it lives only in transient dice state.
- Eliminations, saved as they happen. When an accepted action takes a seat past a threshold the system tracks (life, commander damage, poison), the game stores the order, time, cause, and the causing seat when known: the commander for commander damage, the prize-taker for a Pokémon knockout. An undo, or a correction that brings the seat back, removes that elimination. Seats eliminated by the same action share an order. Local games use the device clock and cloud games use server time. These observations travel with the archived game and its upload. Concessions and losses the app can't see stay unknown.
- How the game ended, when a tracked threshold decided it: last seat standing, commander damage, poison, prizes, or lore. A race win such as prizes or lore can end the game for several opponents at once. Choosing winners by hand records an unknown ending. An optional prompt at the end covers alternate wins and concessions.
- The Commander bracket, as a new optional deck field, copied onto each result.
- An optional opponent deck label per seat, a commander or deck name and never a full list. A seat that picked a deck fills it in automatically. Each result keeps a copy of its opponents and their labels. Matchups count a player's newest 500 results instead of keeping totals, because their groups have no fixed keys and an opponent can change after a result is written: a nearby guest claims their seat, or an account is deleted.

Turns stay out until a turn tracker exists.

**Guests.** A guest gets a known-player id kept in a list on the device, separate from the per-game player id. Setup and rematches carry it forward. Claims work per seat: an account claims the seat it played, and the device that holds the guest list can let an account take a guest's past seats only through an explicit choice on that device. A matching name or a guest id sent from another device never moves results. Merging guests across devices is not part of phase 1.

**Synced deck.** A synced deck is a deck whose content the server stores. The free limit counts synced decks and nothing else. Syncing writes content under the deck key. Moving a deck to one device saves the device copy first, then deletes the server content at the exact revision the device last saw. It leaves a small removal marker with a new revision, because clients merge incoming decks and never drop ones that disappear. See `mergeMetadata` in `src/features/decks/decksSync.ts`. Deleting again after a lost reply is harmless. Results and totals never change. Deleting a deck hides it and its stats, and the results stay in history.

**Signed-out play.** A local game played signed out stores its results on the device, apart from the 30-game history detail cap, so they survive it. After sign-in, the account claims its seat in each game, or skips the game, using the claim flow in `localGameClaims.ts` extended to seats. The claim is saved once. Uploads use the result id, so the server keeps each result once.

**Retention and abuse limits.** Deck content a free account leaves on the server is bounded by the deck limit and by time. Results are the exception:

- A deleted or moved deck's card rows and version receipts are purged 30 days later. Its deck and version rows shrink to markers holding the deck key and name, so late uploads from old clients still resolve. Markers expire after 90 days. A device offline longer than that does a full deck resync, and an old client's upload after that records no deck key.
- Version-sync receipts keep a hash of the canonical request in `requestKey`, where the serialized cards live today, and keep the result metadata replay needs. Existing receipts get the same hash in a backfill. Each new deck version records the operation id that created it, so a retry finds the version even after its receipt is gone. Once that guard and the backfill are in place, these receipts join the existing pruning cron.
- Free accounts get 50 manual results a day, counted by unique result id at upload time on the server, so a replayed upload costs nothing. `recordManualMatch` and `publishFinishedLocalGame` also get rate limits, which neither has today. An upload is checked for an existing result id before any limit applies. Installed clients treat a `rate_limited` error from `publishFinishedLocalGame` as permanent and give up on the game, so only clients that say they retry throttled uploads get throttled. Older clients keep today's behavior.
- Results and totals are small rows without card lists, but they are not bounded. A player who logs one result per throwaway deck adds a result and a totals row each time, up to the daily limits. Keeping them forever is an owner decision, listed below.

## What ships first

The first release (#607 to #617) builds deck keys, list fingerprints, pinned lists, the results writer and its backfills, devices keeping decks, the stats screen, and the first player. The rest of this decision comes in later phases:

- retention, purging, and receipt hashing and pruning;
- removal markers. Moving a deck to one device archives its row for now, cards included. Until purging ships, those cards stay on the server, the same growth #591 had;
- the daily manual result limit and the upload rate limits;
- guest known-player ids and per-seat claims;
- writer provenance and tournament authority checks;
- eliminations, how a game ended, the Commander bracket, and opponent deck labels.

**Archived decks keep their row.** When a device copy of a moved deck syncs, the server looks for that account's row with the deck's key, archived ones included. Finding none means the copy came from another account. So any future purge of archived decks must keep the deck row and drop only its cards, or a player's own copy reads as someone else's.

## Rollout

Expand and contract, so installed clients keep working at every step.

1. Add optional fields: `deckKey` on decks with an index, the original client game id and the new seat and record fields on `gameSummaries`, `gamePlayers`, and `matches`, the bracket on decks, plus the results and totals tables.
2. Route every current writer and remover through the new writer as well as the old tables: `recordGameResults`, `recordMatchResult`, `removeMatchResult`, the abandoned-game cleanup, and nearby seat claims. Old queries keep returning today's shapes and ids, and receipts replay unchanged.
3. Backfill deck keys and results with the canonical result ids. Old results get an unknown fingerprint, because versions are edited in place and the list a game used can't be recovered. Rebuild totals and compare them with `deckStats` and `deckVersionStats`, including the manual and connected tallies, before any client reads the new totals.
4. Ship clients that pin lists, compute fingerprints, send deck keys, record the new fields, keep durable device results, and read the new totals.
5. Turn on purging and receipt pruning once no supported client depends on the purged rows.
6. After the adoption window, stop writing `deckGameResults`, `deckMatchResults`, `deckStats`, and `deckVersionStats`, then drop them. Remove the `unsyncedAt` field and index that #590 staged.

## Considered options

- **Keep #591, where unsync keeps the server deck and the device copy links back.** Device testing found resync broken by an extra `ownerId` argument, interrupted unsyncs leaving copies behind, another account's sync stranding the owner's stats, and a limit dialog that grabs slots freed by other devices. Unsynced decks also keep every card row on the server, so a free player can grow storage forever.
- **Moving a deck to one device deletes the server deck and its stats.** Simple, but stats reset on every round trip, and stats matter too much for that.
- **Archive, where the server keeps a read-only deck and frees the slot.** Same unbounded storage as #591.
- **Replace summaries, history, and matches with one record type now.** It may still be the right end state. Making stats independent of deck storage doesn't need it, and doing both at once doubles what old clients depend on during the migration.

## Consequences

- Every deck can have stats, local or synced, signed in or out. The glossary's "local deck, with no versions or stats" changes once this ships.
- #591 and #595 don't merge as written. #595's local deck screens get rebuilt on this model.
- Account deletion removes results and totals by account and keeps the membership-first traversal it uses today. Its scrubbers clear the new fields by name, because they copy stored objects and clear known fields: deck key, fingerprint, guest known-player id, opponent deck label, original client game id, and writer provenance.
- Pro saved versions become bounded name and note entries pointing at stored lists, separate from the editable current list. A downgrade keeps them read-only.
- Version comparison, tap-through from a number to its games, and win rates shown against pod size need no new data beyond this.

## Open questions

- Do results and totals stay on the server forever for free accounts? The daily limits cap the rate, not the lifetime size. The alternative is a server retention window for free accounts, with lifetime stats kept on the device.
