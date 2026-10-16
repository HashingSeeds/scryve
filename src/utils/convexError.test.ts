import { ConvexError } from "convex/values"

import { i18n } from "@/i18n"

import { convexErrorMessage } from "./convexError"

describe("convexErrorMessage", () => {
  it("translates a known code", async () => {
    const cause = new ConvexError({ code: "deck_not_found", message: "Deck not found" })
    expect(convexErrorMessage(cause, "fallback")).toBe("Deck not found")

    const language = i18n.language
    i18n.addResource("es", "errors", "deckNotFound", "Mazo no encontrado")
    await i18n.changeLanguage("es")
    try {
      expect(convexErrorMessage(cause, "fallback")).toBe("Mazo no encontrado")
    } finally {
      await i18n.changeLanguage(language)
    }
  })

  it("shows the server message for an unknown code or a changed message", () => {
    expect(
      convexErrorMessage(new ConvexError({ code: "new_code", message: "Brand new" }), "fallback"),
    ).toBe("Brand new")
    expect(
      convexErrorMessage(
        new ConvexError({ code: "deck_not_found", message: "Deck is gone" }),
        "fallback",
      ),
    ).toBe("Deck is gone")
  })

  it("uses the fallback for a non-Convex error", () => {
    expect(convexErrorMessage(new Error("Deck not found"), "fallback")).toBe("fallback")
  })
})
