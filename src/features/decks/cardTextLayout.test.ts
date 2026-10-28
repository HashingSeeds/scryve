import { framedLinesFromCardTop } from "./cardTextLayout"

const framing = {
  view: { width: 400, height: 600 },
  frame: { x: 50, y: 100, width: 300, height: 400 },
}

function line(text: string, centerX: number, centerY: number, angle = 0) {
  return { text, x: centerX - 50, y: centerY - 10, width: 100, height: 20, angle, confidence: 1 }
}

describe("framedLinesFromCardTop", () => {
  it("drops text from neighboring cards outside the frame", () => {
    const photo = {
      width: 800,
      height: 1200,
      lines: [line("Mortify", 40, 300), line("Martial Coup", 400, 250), line("Sorcery", 400, 700)],
    }
    expect(framedLinesFromCardTop(photo, framing)).toEqual(["Martial Coup", "Sorcery"])
  })

  it("reads an upside-down card from its own top", () => {
    const photo = {
      width: 800,
      height: 1200,
      lines: [
        line("157/168 R", 400, 300, 180),
        line("Legendary Artifact", 400, 700, 180),
        line("The Golden Throne", 400, 900, 180),
      ],
    }
    expect(framedLinesFromCardTop(photo, framing)).toEqual([
      "The Golden Throne",
      "Legendary Artifact",
      "157/168 R",
    ])
  })

  it("reads a photo saved sideways when the phone lay flat", () => {
    const photo = {
      width: 1200,
      height: 800,
      lines: [
        line("Sorcery", 500, 400, 90),
        line("Martial Coup", 900, 400, 90),
        line("Mortify", 600, 30, 90),
      ],
    }
    expect(framedLinesFromCardTop(photo, framing)).toEqual(["Martial Coup", "Sorcery"])
  })
})
