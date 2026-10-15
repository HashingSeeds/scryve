# Connected games keep one authority, chosen up front

Connected games can now travel over Convex or over the local network, so we had to choose who decides a game's state. Every connected game has exactly one **authority**, fixed when the game is created: Convex for cloud games, the host device for nearby games. Both run the same pure game rules (life, commander damage, table), and clients reach either through one backend interface. An authority is never elected or swapped mid-game because a connection dropped.

The target is a store running a tournament on one device. That device is the event's authority, picked by a person before play starts. Convex mirrors it whenever the store is online and refuses direct writes from players for that event. When the device reconnects, its games are imported through a separate path rather than replayed as player writes. Because those results feed standings, seats must be owned: a host-issued seat token proves which device may write each seat.

## Considered Options

- **Elect a nearby host when Convex drops, then reconcile.** Rejected: a device still connected to Convex and a device that fell back would both accept writes, and their claims and resolutions conflict with no fair way to merge them.
- **Share queued changes between devices while Convex is unreachable.** Rejected: a commander claim that exists only in a local queue can't be confirmed, and Convex can later floor or decline changes the table already showed, so devices disagree when it returns.
- **Separate rules for nearby games.** Rejected: features would drift, and every system (Magic, Pokémon, Yu-Gi-Oh!) would need its rules written twice.

## Consequences

- Game rules live in shared pure code that Convex mutations call, so Convex keeps validating every write while a host device runs the same rules.
- A nearby game whose host leaves ends; a cloud game survives any device leaving.
- A cloud game that loses its connection behaves as today: each device queues its own changes until Convex returns.
- Tournament authority needs seat tokens, a Convex mode that refuses player writes for an event, and an import path for the host's games. None of that exists yet.
