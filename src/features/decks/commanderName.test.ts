import { commanderShortName, deckCommanderNames } from "./commanderName"

describe("commanderShortName", () => {
  it.each([
    ["Krenko, Mob Boss", "Krenko"],
    ["Tymna the Weaver", "Tymna"],
    ["The Ur-Dragon", "Ur-Dragon"],
    ["Edgar Markov", "Edgar"],
    ["Ob Nixilis, Captive Kingpin", "Ob Nixilis"],
    ["Grand Arbiter Augustin IV", "Augustin"],
    ['Henzie "Toolbox" Torre', "Henzie"],
    ["Rin and Seri, Inseparable", "Rin"],
    ["Esika, God of the Tree // The Prismatic Bridge", "Esika"],
    ["Elesh Norn, Grand Cenobite", "Norn"],
    ["Sliver Overlord", "Sliver Overlord"],
  ])("calls %s %s", (cardName, spoken) => {
    expect(commanderShortName(cardName)).toBe(spoken)
  })
})

it("names only the commander section of a deck", () => {
  expect(
    deckCommanderNames([
      { name: "Kraum, Ludevic's Opus", board: "commander", quantity: 1 },
      { name: "Sol Ring", board: "main", quantity: 1 },
      { name: "Tymna the Weaver", section: "commander", quantity: 1 },
    ]),
  ).toEqual(["Kraum", "Tymna"])
})
