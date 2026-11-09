import { cardNameIndex } from "./cardNameMatch"
import { namesInSpread } from "./cardSpread"

const index = cardNameIndex(["Swamp", "Island", "Watery Grasp", "Pretending Poxbearers"])

const line = (text: string) => ({ text, x: 0, y: 0, width: 1, height: 1, angle: 0, confidence: 1 })

describe("namesInSpread", () => {
  it("counts every name bar as a card and skips type lines", () => {
    const photo = {
      width: 100,
      height: 100,
      lines: [
        "Swamp",
        "Pretending Poxbearers {1}{B}",
        "Swamp",
        "Basic Land — Swamp",
        "Watery Grasp",
      ].map(line),
    }

    expect(namesInSpread(index, photo).map(({ match }) => match?.name)).toEqual([
      "Swamp",
      "Pretending Poxbearers",
      "Swamp",
      undefined,
      "Watery Grasp",
    ])
  })
})
