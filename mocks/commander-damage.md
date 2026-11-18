# Commander damage assignment

Mock: `mocks/commander-damage.html`. Open it in a browser. The panel beside the phone has Reset, Replay first open, and a log of what each tap did. The log is only for reviewers and is not part of the UI.

Board: Ana (Atraxa, 4), Ben (partners Tymna 2 and Thrasios 4), Cleo (Edgar Markov 4), Dev (Krenko 3). Dev already has 13 from Atraxa, so two hits from Ana reach lethal. Cleo already has 12 from Krenko, so her corner map is showing.

## Flow

**1. Idle board.** Each seat's bottom corner reads `[mark] Name ⚔`. The sword is its own bare glyph, as large and as white as the − and +, with a 44pt target. The first time a Commander board opens, each sword slides out of its seat mark to that spot, one seat after another. Tapping the name still works, so players who already use it lose nothing. *Solves 1.*

**2. Tap your sword.** The shadow floods every other seat, the same as today.
- The attacker's card keeps its color and name. The sword turns to a raised angle, the central pentagon fills with the attacker's color and shows a check, and the card's own life shrinks into its corner.
- In the middle of the card, each commander gets `name`, then `− power +`. A partner seat shows two columns. The second partner starts at 0 and dims, and `+` brings it in.
- Every defender keeps their name. Their life disc gets a ring of 21 segments in the attacker's color, filled up to the damage that attacker has already dealt them. Under their life, `−4` breathes, and the ring segments the next hit would fill breathe with it. The corner map lights the attacker's cell and fades the others.
*Solves 2 and 3.*

**3. Raise power.** `+` and `−` change the number, and holding repeats. Every defender's `−N` and preview segments update live as the number changes, which shows how the power box and the targets connect. Today's keypad (tap the number) stays. The floor is 1 for a single commander and 0 for partners.

**4. Hit a defender.** Tap anywhere on their seat. `−4` flies from the power number to their disc and turns to face that player as it travels. Their life counts down, the preview segments go solid, and a coin with `4` appears beside the disc under a ↶. Tapping the same seat again adds a coin. If the next hit would reach 21, or take life to 0, the preview segments and the `−N` turn red before the tap. *Solves 3.*

**5. Fix a mistake.** Tap the `↶ 4 4` cluster on the defender. The newest coin flies back to the attacker as `+4`, and the life and ring step back. The coins are the hits, so a player can see what they're taking back. *Solves 4.*

**6. Partners.** Ben's Tymna starts in at 2 and Thrasios dims at 0. Ben taps Thrasios `+` to bring it in. Defenders then show two rings: Tymna outer, Thrasios inner. Each counts to 21 on its own, and the preview is the sum. Nothing toggles when a commander name is tapped, because power 0 is the only way to sit a commander out, and it's visible. *Solves 5.*

**7. Done.** Tap the checked pentagon, or the raised sword. Each defender's coins fly into the attacker's cell in their corner map, and the shadow drains. While an attack is open the pentagon *is* Done, so the menu can't open and nothing gets sent quietly. *Solves 6.*

**8. Fix after Done.** The attacker's sword keeps a thin ring. Tapping it reopens that attack with its coins, so any hit can still be taken back. The ring goes away as soon as anything else changes on the board. After that the Log is the only way back, the same as today. *Solves 4.*

Connected games use the same flow. Each hit lands when it's tapped, with no confirm step.

## Copy kept

There are no UI words. Everything visible is data the players already know:
- **Player names**: they say who is attacking and who is being hit (problem 2).
- **Commander names** above each power: with partners, the name is the only way to tell which number is which. With one commander it still says what the number is the power of.
- **Numbers**: power, `−N` previews, coin amounts, map totals.

Screen readers get labels: "Deal commander damage", "Reopen last attack", "Take back 4", "Done", and per-commander "power up/down".

## Behavior changes from today, for whoever builds this

- The `sit` action and `sitting` state go away. A partner sits out at power 0. `lowestPower` already allows 0 for partners.
- While armed, the pentagon calls `send` and does not open the menu.
- Reopen: `finish` keeps the last attack's `hits`. `press` on the same attacker restores them if no other board event has happened since.
- The idle sword renders in Commander whether or not any damage has been dealt.
