# Scryve

A life counter for trading card games, played on one device or across several.

## Language

**Local game**:
A game played on a single device that shows every player.
_Avoid_: Offline game, pass-and-play game

**Connected game**:
A game where each player uses their own device.
_Avoid_: Online game, multiplayer game

**Cloud game**:
A connected game whose authority is Convex, so players can be anywhere.
_Avoid_: Convex game, online game

**Nearby game**:
A connected game whose authority is the host device, played by devices on the same network. Code may call its transport `lan`; players only ever see "Nearby".
_Avoid_ (in copy): LAN game, local game, offline game

**Authority**:
The one place that decides a connected game's state: Convex or the host device.
_Avoid_: Server, source of truth

**Host**:
The player who creates a connected game; in a nearby game, also its authority.

**Seat**:
A player's place in a game; in a connected game, owned by one device.
_Avoid_: Slot, player position

**Synced deck**:
A deck stored on the server that syncs to every device and tracks versions and stats. Counts toward the deck limit.

**Local deck**:
A deck stored only on one device. Unlimited, with no versions or stats.
_Avoid_: Guest deck (in copy)

**Unsynced deck**:
A synced deck moved to one device to free a spot under the limit. The server keeps its versions and stats until it is synced again. Code: `decks.unsyncedAt`.

**Deleted deck**:
A deck the player removed. Code calls this `archive` and `decks.archivedAt`; players only ever see "Delete".
_Avoid_: Archived deck (in copy)
