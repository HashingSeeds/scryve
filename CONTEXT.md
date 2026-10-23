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

**Event**:
A tournament with rounds, pairings, and standings, run by an organizer at a store or a kitchen table.
_Avoid_: Tournament (in code), league

**Organizer**:
The account that created an event and runs it.
_Avoid_: TO, judge, admin

**Guest**:
An event player the organizer added by name, without an account.

**Round**:
One scheduled pairing period of an event, with its own clock.
_Avoid_: Rematch counter (the nearby lobby's `round` is unrelated)

**Table**:
The players paired together in one round: two in a Swiss event, three to five in a pod event, or one for a bye.
_Avoid_: Pairing (as a noun for the stored row), match (a match is the games played)

**Pod**:
A table of three to five players in a multiplayer event such as a Commander night.

**Standings**:
Players ranked by points and the system's tiebreakers.
