# Connected games keep one authority, whatever carries them

Connected games can now travel over Convex or over the local network, so we had to choose who decides a game's state. Every connected game has exactly one **authority**: Convex for cloud games, the host device for nearby games. Both run the same pure game core (life, commander damage, table), and clients reach either through one backend interface. When a cloud game loses Convex, devices on the same network share their queued changes with each other so the table stays in sync. They never elect a stand-in authority, and every queue still drains to Convex when it returns.

## Considered Options

- **Elect a nearby host when Convex drops, then reconcile.** Rejected: a device that keeps its connection to Convex and a device that falls back would both accept writes, and their claims and resolutions can conflict with no fair way to merge them.
- **Separate rules for nearby games.** Rejected: features would drift between the two, and every system (Magic, Pokémon, Yu-Gi-Oh!) would need its rules written twice.

## Consequences

- Game rules live in shared pure code that Convex mutations call, so Convex keeps validating every write while a host device can run the same rules.
- A nearby game whose host leaves ends. A cloud game survives any device leaving.
- A future tournament organizer's device may become the authority for its event, chosen up front by a person, with Convex mirroring it. That keeps one authority per game and needs no change to this decision.
