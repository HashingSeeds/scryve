/** why: paced Scryfall and TCGdex requests sleep on real timers until their slot opens. Moving `Date.now()` a second per read finds every slot already open. */
export function stepClock(stepMs = 1_000) {
  let now = Date.now()
  return jest.spyOn(Date, "now").mockImplementation(() => (now += stepMs))
}
