import { commanderShortName } from "./commanderName"

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
    ["Lord of Tresserhorn", "Lord of Tresserhorn"],
  ])("calls %s %s", (cardName, spoken) => {
    expect(commanderShortName(cardName)).toBe(spoken)
  })
})
