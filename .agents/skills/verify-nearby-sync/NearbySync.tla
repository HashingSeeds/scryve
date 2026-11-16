------------------------------ MODULE NearbySync ------------------------------
(* Life changes in a nearby game: the host device is the authority, and two
   guests edit any seat over TCP that can drop at any moment. Each step names
   the code it stands for. SKILL.md lists the files and the commit this was
   last checked against. *)
EXTENDS Integers, Sequences, FiniteSets

CONSTANTS
  Team,         \* the two seats share one life total (withSharedTeam)
  Claims,       \* owner mode: g2 claims commander damage on g1, g1 confirms or
                \* declines, and guests write only their own seat. FALSE is
                \* anyone mode (lanGame.ts:559), where guests write any seat.
  MaxTaps,      \* taps per guest
  MaxUndos,     \* undos per guest
  MaxDrops,     \* connection drops in one run
  MaxHostTaps,  \* edits the host makes on g1's seat
  Window,       \* length of the host's recent operation list (100 in the app)
  \* Each flag is TRUE in the app. check.sh turns one off to show a rule catch it.
  HostDedupes,           \* writeLife acks a retried id without applying it
  ResolveReplays,        \* writeResolution acks a retry of a settled claim
  UndoEndsMerge,         \* undoLife clears lastQueuedLifeChange
  OverlaySkipsConfirmed, \* overlayPendingDeltas skips ids in recentOperationIds
  StateOnRejoin          \* the host publishes after it welcomes a rejoining guest

Guests == {"g1", "g2"}
Seats == Guests
StartLife == 20
None == [by |-> "none", n |-> 0]
Decisions == {"confirmed", "declined"}

VARIABLES
  life,        \* host: each seat's total
  log,         \* host: applied events, one record per operation id
  undone,      \* host: ids that were taken back
  claim,       \* host: "none", "pending", "confirmed" or "declined"
  recent,      \* host: the last Window operation ids, from every device
  hostTaps,
  outbox,      \* guest: queued operations, oldest first
  sending,     \* guest: the outbox head is in flight
  mergeInto,   \* guest: lastQueuedLifeChange, as [id, seat]
  nextId,
  undoable,    \* guest: own taps the log offers to take back
  conn,
  toHost,      \* one TCP connection per guest: in order, lost only on a drop
  toGuest,
  screen,      \* guest: the last state the host sent it
  intent,      \* ghost: start plus every change a person made and kept
  taps, undos, drops, claimSent, resolveSent

vars == <<life, log, undone, claim, recent, hostTaps, outbox, sending, mergeInto,
          nextId, undoable, conn, toHost, toGuest, screen, intent, taps, undos,
          drops, claimSent, resolveSent>>
hostVars == <<life, log, undone, claim, recent, hostTaps>>

RECURSIVE SumDelta(_)
SumDelta(S) == IF S = {} THEN 0
               ELSE LET x == CHOOSE x \in S : TRUE IN x.delta + SumDelta(S \ {x})

Touches(seat, s) == Team \/ seat = s
Moved(d, seat) == [s \in Seats |-> IF Touches(seat, s) THEN d ELSE 0]
Plus(f, g) == [s \in Seats |-> f[s] + g[s]]
Ids(L) == {r.id : r \in L}
Elems(q) == {q[i] : i \in DOMAIN q}
Keep(q) == IF Len(q) > Window THEN SubSeq(q, Len(q) - Window + 1, Len(q)) ELSE q

\* lanProjection: a viewer gets only its own ids from the shared recent list.
\* `applied` is a ghost: what the host had applied when it sent this state.
StateFor(g, lf, rec, L, cl) ==
  [type |-> "state", id |-> None, life |-> lf, claim |-> cl, applied |-> Ids(L),
   recent |-> {i \in Elems(rec) : i.by = g}]
Ack(id) == [type |-> "ack", id |-> id, life |-> life, claim |-> "none",
            applied |-> {}, recent |-> {}]

\* flush: every connected guest gets the new state; the sender also gets its ack.
Broadcast(lf, rec, L, cl, sender, id) ==
  toGuest' = [h \in Guests |->
               IF conn[h]
               THEN toGuest[h] \o <<StateFor(h, lf, rec, L, cl)>>
                      \o (IF h = sender THEN <<Ack(id)>> ELSE <<>>)
               ELSE toGuest[h]]

Op(id, kind, seat, delta, undoOf, decision) ==
  [id |-> id, kind |-> kind, seat |-> seat, delta |-> delta, undoOf |-> undoOf,
   decision |-> decision, attempted |-> FALSE]
Event(op, g, delta) ==
  [id |-> op.id, kind |-> op.kind, seat |-> op.seat, delta |-> delta,
   actor |-> g, undoOf |-> op.undoOf]

Init ==
  /\ life = [s \in Seats |-> StartLife]
  /\ log = {} /\ undone = {} /\ claim = "none" /\ recent = <<>> /\ hostTaps = 0
  /\ outbox = [g \in Guests |-> <<>>]
  /\ sending = [g \in Guests |-> FALSE]
  /\ mergeInto = [g \in Guests |-> [id |-> None, seat |-> "none"]]
  /\ nextId = [g \in Guests |-> 1]
  /\ undoable = [g \in Guests |-> {}]
  /\ conn = [g \in Guests |-> TRUE]
  /\ toHost = [g \in Guests |-> <<>>]
  /\ toGuest = [g \in Guests |-> <<>>]
  /\ screen = [g \in Guests |-> StateFor(g, life, <<>>, {}, "none")]
  /\ intent = [s \in Seats |-> StartLife]
  /\ taps = [g \in Guests |-> 0] /\ undos = [g \in Guests |-> 0]
  /\ drops = 0 /\ claimSent = FALSE /\ resolveSent = FALSE

-----------------------------------------------------------------------------
(* Guests *)

\* changeLife: a tap merges into the last queued change for that seat while it
\* is unsent (addToLastQueuedLifeChange), or queues a new operation. In owner
\* mode, editableSeat rejects another seat's life.
Tap(g, s) ==
  /\ taps[g] < MaxTaps
  /\ Claims => s = g
  /\ taps' = [taps EXCEPT ![g] = @ + 1]
  /\ intent' = Plus(intent, Moved(-1, s))
  /\ LET m == mergeInto[g]
         at == {i \in DOMAIN outbox[g] :
                  outbox[g][i].id = m.id /\ ~outbox[g][i].attempted}
     IN IF m.seat = s /\ at # {}
        THEN LET i == CHOOSE i \in at : TRUE IN
             /\ outbox' = [outbox EXCEPT ![g][i].delta = @ - 1]
             /\ UNCHANGED <<mergeInto, nextId, undoable>>
        ELSE LET id == [by |-> g, n |-> nextId[g]] IN
             /\ outbox' = [outbox EXCEPT ![g] = Append(@, Op(id, "life", s, -1, None, "none"))]
             /\ mergeInto' = [mergeInto EXCEPT ![g] = [id |-> id, seat |-> s]]
             /\ nextId' = [nextId EXCEPT ![g] = @ + 1]
             /\ undoable' = [undoable EXCEPT ![g] = @ \cup {[id |-> id, seat |-> s]}]
  /\ UNCHANGED <<hostVars, sending, conn, toHost, toGuest, screen, undos, drops,
                 claimSent, resolveSent>>

\* undoLife: queue the opposite of a change the log shows.
Undo(g) ==
  /\ undos[g] < MaxUndos
  /\ \E t \in undoable[g] :
       LET queued == {i \in DOMAIN outbox[g] : outbox[g][i].id = t.id}
           d == IF queued # {} THEN outbox[g][CHOOSE i \in queued : TRUE].delta
                ELSE (CHOOSE r \in log : r.id = t.id).delta
           id == [by |-> g, n |-> nextId[g]]
       IN /\ queued # {} \/ t.id \in screen[g].applied
          /\ outbox' = [outbox EXCEPT ![g] = Append(@, Op(id, "life", t.seat, -d, t.id, "none"))]
          /\ intent' = Plus(intent, Moved(-d, t.seat))
          /\ undoable' = [undoable EXCEPT ![g] = @ \ {t}]
          /\ nextId' = [nextId EXCEPT ![g] = @ + 1]
  /\ undos' = [undos EXCEPT ![g] = @ + 1]
  /\ mergeInto' = IF UndoEndsMerge
                  THEN [mergeInto EXCEPT ![g] = [id |-> None, seat |-> "none"]]
                  ELSE mergeInto
  /\ UNCHANGED <<hostVars, sending, conn, toHost, toGuest, screen, taps, drops,
                 claimSent, resolveSent>>

\* submitCommanderDamage: g2 says it dealt 1 commander damage to g1. It ends
\* the merge group, as resolveCommanderDamage does.
ClaimDamage ==
  /\ Claims /\ ~claimSent
  /\ claimSent' = TRUE
  /\ outbox' = [outbox EXCEPT !["g2"] =
                 Append(@, Op([by |-> "g2", n |-> nextId["g2"]], "claim", "g1", 0, None, "none"))]
  /\ nextId' = [nextId EXCEPT !["g2"] = @ + 1]
  /\ mergeInto' = [mergeInto EXCEPT !["g2"] = [id |-> None, seat |-> "none"]]
  /\ UNCHANGED <<hostVars, sending, undoable, conn, toHost, toGuest,
                 screen, intent, taps, undos, drops, resolveSent>>

\* The defender answers the claim its screen shows. Only a confirm moves life.
Resolve(dec) ==
  /\ Claims /\ ~resolveSent /\ screen["g1"].claim = "pending"
  /\ resolveSent' = TRUE
  /\ outbox' = [outbox EXCEPT !["g1"] =
                 Append(@, Op([by |-> "g1", n |-> nextId["g1"]], "resolve", "g1",
                              IF dec = "confirmed" THEN -1 ELSE 0, None, dec))]
  /\ nextId' = [nextId EXCEPT !["g1"] = @ + 1]
  /\ intent' = IF dec = "confirmed" THEN Plus(intent, Moved(-1, "g1")) ELSE intent
  /\ mergeInto' = [mergeInto EXCEPT !["g1"] = [id |-> None, seat |-> "none"]]
  /\ UNCHANGED <<hostVars, sending, undoable, conn, toHost, toGuest,
                 screen, taps, undos, drops, claimSent>>

\* drainOutbox sends the head and waits for its answer before the next.
Send(g) ==
  /\ conn[g] /\ ~sending[g] /\ outbox[g] # <<>>
  /\ sending' = [sending EXCEPT ![g] = TRUE]
  /\ outbox' = [outbox EXCEPT ![g][1].attempted = TRUE]
  /\ toHost' = [toHost EXCEPT ![g] = Append(@, outbox[g][1])]
  /\ UNCHANGED <<hostVars, mergeInto, nextId, undoable, conn, toGuest, screen,
                 intent, taps, undos, drops, claimSent, resolveSent>>

\* A state replaces the screen and settles queued ids it lists (acknowledge
\* skips the one being sent). An ack settles the head.
Receive(g) ==
  /\ toGuest[g] # <<>>
  /\ LET msg == Head(toGuest[g]) IN
     IF msg.type = "state"
     THEN /\ screen' = [screen EXCEPT ![g] = msg]
          /\ outbox' = [outbox EXCEPT ![g] =
               SelectSeq(@, LAMBDA o : ~(o.id \in msg.recent /\ ~(sending[g] /\ o.id = outbox[g][1].id)))]
          /\ UNCHANGED sending
     ELSE /\ outbox' = [outbox EXCEPT ![g] = SelectSeq(@, LAMBDA o : o.id # msg.id)]
          /\ sending' = [sending EXCEPT ![g] = FALSE]
          /\ UNCHANGED screen
  /\ toGuest' = [toGuest EXCEPT ![g] = Tail(@)]
  /\ UNCHANGED <<hostVars, mergeInto, nextId, undoable, conn, toHost, intent,
                 taps, undos, drops, claimSent, resolveSent>>

\* The connection drops. In-flight messages are gone and the pending write is
\* rejected with "Lost the host", which the outbox retries (lanSession.ts:598).
Drop(g) ==
  /\ conn[g] /\ drops < MaxDrops
  /\ drops' = drops + 1
  /\ conn' = [conn EXCEPT ![g] = FALSE]
  /\ sending' = [sending EXCEPT ![g] = FALSE]
  /\ toHost' = [toHost EXCEPT ![g] = <<>>]
  /\ toGuest' = [toGuest EXCEPT ![g] = <<>>]
  /\ UNCHANGED <<hostVars, outbox, mergeInto, nextId, undoable, screen, intent,
                 taps, undos, claimSent, resolveSent>>

\* A rejoin gets a welcome, and its publish sends the current state
\* (acceptPeer in lanSession.ts).
Rejoin(g) ==
  /\ ~conn[g]
  /\ conn' = [conn EXCEPT ![g] = TRUE]
  /\ toGuest' = [toGuest EXCEPT ![g] =
                 IF StateOnRejoin THEN <<StateFor(g, life, recent, log, claim)>> ELSE <<>>]
  /\ UNCHANGED <<hostVars, outbox, sending, mergeInto, nextId, undoable, toHost,
                 screen, intent, taps, undos, drops, claimSent, resolveSent>>

-----------------------------------------------------------------------------
(* Host *)

\* writeLife dedupes by id (gameEngine.ts:462). writeClaim and writeResolution
\* dedupe by the claim's status. An invalid undo gets a nack, which the outbox
\* drops like an ack.
HostApply(g, op) ==
  LET dup == HostDedupes /\ op.id \in Ids(log)
      target == {r \in log : r.id = op.undoOf}
      t == CHOOSE r \in target : TRUE
      validUndo == target # {} /\ t.actor = g /\ t.kind = "life"
                   /\ t.undoOf = None /\ t.seat = op.seat /\ op.undoOf \notin undone
      fresh == CASE op.kind = "life" /\ op.undoOf = None -> ~dup
                 [] op.kind = "life" -> ~dup /\ validUndo
                 [] op.kind = "claim" -> claim = "none"
                 [] op.kind = "resolve" -> claim = "pending"
      d == CASE fresh /\ op.kind = "life" /\ op.undoOf # None -> -t.delta
             [] fresh -> op.delta
             [] op.kind = "resolve" /\ ~ResolveReplays /\ claim = op.decision -> op.delta
             [] OTHER -> 0
      lf == Plus(life, Moved(d, op.seat))
      L == IF fresh THEN log \cup {Event(op, g, d)} ELSE log
      rec == IF fresh THEN Keep(Append(recent, op.id)) ELSE recent
      cl == CASE op.kind = "claim" /\ claim = "none" -> "pending"
              [] op.kind = "resolve" /\ claim = "pending" -> op.decision
              [] OTHER -> claim
  IN /\ life' = lf /\ log' = L /\ recent' = rec /\ claim' = cl
     /\ undone' = IF fresh /\ op.undoOf # None THEN undone \cup {op.undoOf} ELSE undone
     /\ Broadcast(lf, rec, L, cl, g, op.id)

\* applyLanWrite answers each op in arrival order.
HostReceive(g) ==
  /\ toHost[g] # <<>>
  /\ toHost' = [toHost EXCEPT ![g] = Tail(@)]
  /\ HostApply(g, Head(toHost[g]))
  /\ UNCHANGED <<hostTaps, outbox, sending, mergeInto, nextId, undoable, conn,
                 screen, intent, taps, undos, drops, claimSent, resolveSent>>

\* hostWrite: the host edits g1's seat and applies it at once.
HostTap ==
  /\ hostTaps < MaxHostTaps
  /\ hostTaps' = hostTaps + 1
  /\ LET op == Op([by |-> "host", n |-> hostTaps + 1], "life", "g1", -1, None, "none")
         lf == Plus(life, Moved(-1, "g1"))
         L == log \cup {Event(op, "host", -1)}
         rec == Keep(Append(recent, op.id))
     IN /\ life' = lf /\ log' = L /\ recent' = rec
        /\ Broadcast(lf, rec, L, claim, "host", None)
  /\ intent' = Plus(intent, Moved(-1, "g1"))
  /\ UNCHANGED <<undone, claim, outbox, sending, mergeInto, nextId, undoable, conn,
                 toHost, screen, taps, undos, drops, claimSent, resolveSent>>

Next ==
  \/ \E g \in Guests : \/ \E s \in Seats : Tap(g, s)
                       \/ Undo(g) \/ Send(g) \/ Receive(g) \/ Drop(g) \/ Rejoin(g)
                       \/ HostReceive(g)
  \/ ClaimDamage \/ \E dec \in Decisions : Resolve(dec)
  \/ HostTap

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
(* Rules *)

PendingLife(g) == {outbox[g][i] : i \in {j \in DOMAIN outbox[g] : outbox[g][j].kind = "life"}}

\* What the guest's board shows: the host's state plus its own unconfirmed taps.
Displayed(g, s) ==
  screen[g].life[s]
    + SumDelta({o \in PendingLife(g) :
                  Touches(o.seat, s) /\ ~(OverlaySkipsConfirmed /\ o.id \in screen[g].recent)})

\* What it should show: the host's state plus the taps that state did not count.
Truth(g, s) ==
  screen[g].life[s]
    + SumDelta({o \in PendingLife(g) : Touches(o.seat, s) /\ o.id \notin screen[g].applied})

Quiet == \A g \in Guests : conn[g] /\ outbox[g] = <<>> /\ toHost[g] = <<>> /\ toGuest[g] = <<>>

\* 1. Every applied change moved life once, however often it was resent.
CountedOnce == \A s \in Seats :
  life[s] = StartLife + SumDelta({r \in log : Touches(r.seat, s)})

\* 2. No board ever counts a tap twice or drops one.
BoardsHonest == \A g \in Guests, s \in Seats : Displayed(g, s) = Truth(g, s)

\* 3. Once everything is sent and answered, every board shows the host's totals.
BoardsAgree == Quiet => \A g \in Guests, s \in Seats : Displayed(g, s) = life[s]

\* 4. Once quiet, each total is the start plus every change people kept.
IntentKept == Quiet => \A s \in Seats : life[s] = intent[s]
=============================================================================
