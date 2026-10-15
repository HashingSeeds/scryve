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
