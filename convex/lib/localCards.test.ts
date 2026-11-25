import { decodeLocalCard, encodeLocalCards, localCardsVersion } from "./localCards"

it("round-trips multiline card text and face details through the line format", () => {
  const card = {
    cardId: "delver",
    name: "Delver of Secrets // Insectile Aberration",
    rank: 3,
    oracleText: "Look at the top card.\n//\nFlying",
    faceDetails: JSON.stringify([{ name: "Insectile Aberration", oracleText: "Flying" }]),
  }
  const [header, ...lines] = encodeLocalCards("v1", [card]).split("\n")
  expect(localCardsVersion(header)).toBe("v1")
  expect(lines.map(decodeLocalCard)).toEqual([card])
})
