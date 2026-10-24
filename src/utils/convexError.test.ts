import { ConvexError } from "convex/values"

import { i18n } from "@/i18n"

import { convexErrorMessage, isGameUnavailableError } from "./convexError"

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

describe("isGameUnavailableError", () => {
  const redacted = (data: { code: string; message: string }) =>
    Object.assign(new ConvexError(data), { message: "[Request ID: 1] Server Error" })

  it.each(["forbidden", "game_not_found", "game_membership_required"])(
    "treats a redacted %s error as a gone game",
    (code) => {
      expect(isGameUnavailableError(redacted({ code, message: "Game unavailable" }))).toBe(true)
    },
  )

  it.each(["rate_limited", "unauthenticated", "game_full", "seat_taken", "game_not_active"])(
    "keeps the game for %s even when the message says unavailable",
    (code) => {
      expect(isGameUnavailableError(new ConvexError({ code, message: "Game unavailable" }))).toBe(
        false,
      )
    },
  )

  it("reads the message from backends without error codes", () => {
    expect(isGameUnavailableError(new Error("Server Error Uncaught Error: Game unavailable"))).toBe(
      true,
    )
    expect(isGameUnavailableError(new Error("[Request ID: 1] Server Error"))).toBe(false)
  })
})
