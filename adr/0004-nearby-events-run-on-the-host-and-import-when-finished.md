---
status: accepted
---

# Nearby events run on the host device and reach Convex once, when finished

ADR 0003 made a host device on store Wi-Fi the second authority for events. This records the smallest version that works without internet.

## Decision

**The host holds the event.** The organizer's device keeps the whole event in memory and on disk, and applies the same engine Convex does (`convex/lib/events/`). Players' devices send commands and receive their own view; the event screen reads both through `EventSource`.

**Guests get one whole view, then patches.** A guest whose hello says `patches: true` gets the whole view and standings on join, then a numbered patch per change: the view's own fields, the players and tables that changed or left, and standings only when they changed. A guest that sees a number skip reconnects for a whole view. Guests without the flag keep getting whole views, and hosts that predate it ignore it, so the protocol version stays 1.

**Check-in is a name and a token.** Nearby check-in has no accounts. A player types a name; the host keeps a random token for that device and hands its player back whenever the token returns, so a dropped connection never makes a second player. The token never leaves the host.

**One service type.** Events publish under the existing `_scryve._tcp` Bonjour type with an `event-<CODE> <name>` service name, because a new type needs a native build. Nearby game lists skip `event-` names.

**Convex sees the event once, finished.** When the organizer finishes and is signed in, the host sends the whole event to `events.importNearby`, which writes it as records rather than replaying player writes. A `nearbyId` makes a repeat import return the first copy. Everyone arrives by name, like guests, so nothing counts toward deck stats. A finished event already refuses player writes, so no separate authority flag is needed yet.

## Considered options

- **Mirror a running nearby event to Convex.** Rejected for now: it needs an authority flag on every write path and a merge rule for what changed offline. Importing the finished record is enough for history.
- **Bump the protocol for patches.** Rejected: hosts and guests update unevenly, and an old host refuses any other version, so new guests could not join it.
- **Longer-lived Clerk tokens for offline identity.** Rejected in earlier research; a host-issued token does the job without touching auth.

## Consequences

- Installed builds from before this change show `event-` services in their nearby games list; joining one fails because the host ignores game messages.
- An iOS host must stay in the foreground; an Android tablet is the better host.
- Guest Wi-Fi that isolates clients hides the host; a travel router fixes it.
