import { clear } from "@/utils/storage"

import { rememberCounterName, suggestedCounterNames } from "./recentCounterNames"

describe("counter name suggestions", () => {
  beforeEach(clear)

  it("offers starters until the player names a counter, then their own names, newest first", () => {
    expect(suggestedCounterNames()).toEqual(["Speed", "Rad", "Storm"])
    rememberCounterName("Ring")
    rememberCounterName("Tickets")
    rememberCounterName("ring")
    expect(suggestedCounterNames()).toEqual(["ring", "Tickets"])
  })
})
