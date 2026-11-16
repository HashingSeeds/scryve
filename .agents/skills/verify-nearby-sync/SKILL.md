---
name: verify-nearby-sync
description: Use when a change touches how nearby games sync life, undo, or commander damage between the host and guests, or edits any file listed under Coverage. Model-checks every order of taps, retries, and dropped connections.
---

# Verify nearby sync

`NearbySync.tla` is a small model of a nearby game: the host device is the
authority, and two guests edit over connections that can drop at any moment.
The `claims` run is owner mode, the default: guests write only their own seat,
and the defender confirms commander damage. The other runs are anyone mode,
where every seat allows edits from anyone and guests write any seat. TLC, the TLA+ model checker, tries every order of those steps
within the bounds in `check.sh` and checks four rules in every state:

1. **CountedOnce.** Every change moves life once, however often it was resent.
2. **BoardsHonest.** No guest's board counts a tap twice or leaves one out.
3. **BoardsAgree.** Once everything is sent and answered, every board shows
   the host's totals.
4. **IntentKept.** Once quiet, each total is the start plus every change
   people made and did not take back.

## Run it

```bash
.agents/skills/verify-nearby-sync/check.sh        # every run, 1 to 4 minutes
.agents/skills/verify-nearby-sync/check.sh drops  # one run, with TLC's full output
```

It takes about 80 seconds on an 18-core Mac and 4 minutes on a 12-core Linux
box, and needs Java 11 or newer. The first run downloads TLC 1.7.4 into
`~/.cache/scryve` and checks its sha256.

Each `ok` line is a run that went as expected. The app runs (`edits`, `seats`,
`drops`, `claims`, `window`) must pass. Each break turns off one thing the app does and
must fail on the rule it names, which proves that rule can still catch a bug:

| Break | Turns off | Must fail |
| --- | --- | --- |
| `no-dedupe` | `writeLife` acking a retried id without applying it | CountedOnce |
| `claim-twice` | `writeResolution` acking a retry of a settled claim | CountedOnce |
| `double-board` | `overlayPendingDeltas` skipping ids in `recentOperationIds` | BoardsHonest |
| `stale-rejoin` | the host publishing state after it welcomes a rejoining guest | BoardsAgree |
| `merge-undo` | `undoLife` clearing `lastQueuedLifeChange` | IntentKept |
| `shared-trim` | `keepRecentAndNewestPerActor` keeping each device's newest id | BoardsHonest |

`window` shrinks the host's shared recent operation list from 100 to 1. A
guest whose ack was lost in a drop rejoins after other devices' edits, and the
rejoin state must still list its applied write, or its board counts that tap
twice until the resend is acked. `keepRecentAndNewestPerActor` keeps each
device's newest id for that, since a write still waiting for its ack is always
its sender's newest. `shared-trim` runs the same bounds without it.

## When it fails

`check.sh <run>` prints the shortest sequence of steps that breaks the rule.
Each step is a named action in `NearbySync.tla`, and each action's comment
names the code it stands for. Read the trace against that code:

- If the code does what the trace says, the change has a real bug. Fix the code.
- If the model does something the code cannot do, the model is wrong. Fix the
  action, and cite the code that rules the step out.

Never weaken a rule or shrink a bound to make a run pass.

## When you change covered code on purpose

Update the matching action in `NearbySync.tla` so it still describes the code,
run `check.sh`, and commit the model with the code. If the code changed but the
model still describes it, update the date under Coverage instead. Covered code
that changed after the last commit to this folder has not been checked against
the model:

```bash
git log --oneline "$(git log -1 --format=%H -- .agents/skills/verify-nearby-sync)..HEAD" -- \
  src/features/lan/lanSession.ts src/features/lan/lanGame.ts \
  convex/lib/gameEngine.ts src/features/sync/outbox.ts \
  src/features/connected/OutboxSyncController.ts \
  src/features/connected/reconciliation.ts src/features/connected/model.ts
```

## Coverage

Last checked against the covered code on 2026-11-16.

| File | What the model stands for |
| --- | --- |
| `src/features/lan/lanSession.ts` | `acceptPeer` (applying ops, replies, rejoin), `flush`, `guestWrite`, `rejectPendingWrites` on a drop |
| `src/features/lan/lanGame.ts` | `applyLanWrite` and `keepRecentAndNewestPerActor`, `lanProjection` filtering that list per viewer |
| `convex/lib/gameEngine.ts` | `writeLife` (retries, undo), `writeClaim`, `writeResolution`, `withSharedTeam` |
| `src/features/sync/outbox.ts` | one write in flight, `acknowledge`, `rewriteUnattempted` |
| `src/features/connected/OutboxSyncController.ts` | merging taps (`addToLastQueuedLifeChange`), `undoLife` |
| `src/features/connected/reconciliation.ts` | `overlayPendingDeltas`, and `classifyWriteFailure` retrying "Lost the host" |
| `src/features/connected/model.ts` | `CONNECTED_RECENT_OPERATION_LIMIT` (the 100) |

## Not covered

Life floors and clamping, table actions and counters, undoing commander
damage, the "anyone" editing mode where a claim lands at once, partner
commanders, the host batching several writes into one flush, rate limits, the
host leaving, and cloud games on Convex. Each run's bounds are in `check.sh`.
A pass covers those bounds, not every game.
