import {
  describeUsernameMatches,
  usernameFailsGate,
  usernameFailsReportThreshold,
} from "./nameFilter"
import { assertUsername } from "./policy"

/**
 * Two thresholds, deliberately different: the gate runs on every name arriving from Clerk and a
 * false rejection locks someone out of their own handle, while the report threshold only runs once
 * a human has already complained, so it can chase evasions the gate leaves alone.
 */
describe("username filter", () => {
  describe("the signup gate", () => {
    it("allows ordinary handles", () => {
      for (const username of [
        "matt-c",
        "clever-otter-01",
        "classic_player",
        "grass-master",
        "counterspell",
        "glass-cannon",
        "brassman",
        "passenger",
        "titan-slayer",
        "blackjack",
        "magic-mike",
        "hellscape",
        "damnation",
        "assassin-42",
        "analyst",
        "therapist",
        "specialist",
        "document",
        "assumption",
        "cumberland",
        "hancock",
        "dickens",
      ]) {
        expect({ username, blocked: usernameFailsGate(username) }).toEqual({
          username,
          blocked: false,
        })
      }
    })

    it("rejects profanity, including leetspeak, padding, and casing", () => {
      for (const username of [
        "sh1t-lord",
        "b-i-t-c-h",
        "f4ggot",
        "fuuuuck-you",
        "FUCK",
        "Sh1T",
        "fu_ck",
        "f_u_c_k",
        "xxfuckxx",
        "a55hole",
        "wh0re",
        "d1ck-head",
        "n1gger",
        "c-u-n-t",
      ]) {
        expect({ username, blocked: usernameFailsGate(username) }).toEqual({
          username,
          blocked: true,
        })
      }
    })

    it("only has to cover names Clerk can actually issue", () => {
      // The gate is ASCII-only by design. Homoglyph and whitespace evasions ("fuc k", "𝓯𝓾𝓬𝓴")
      // never reach it because the username charset rejects them first.
      for (const evasion of ["fuc k", "𝓯𝓾𝓬𝓴", "ʇɔnɟ", "fùck", "fuck🖕"])
        expect(() => assertUsername(evasion)).toThrow()
    })

    /**
     * Known false rejections. The obscenity dataset whitelists "dickens" and "analyst" but not
     * these, so real surnames and place names are refused at signup. Listed rather than fixed so
     * the cost of the current threshold is visible: widening the whitelist is a policy change, and
     * a support path exists because a rejected name never reaches an account.
     */
    it("documents the surnames the dataset does not whitelist", () => {
      for (const username of ["dickinson", "dickson", "cummings", "penistone", "shiitake"])
        expect(usernameFailsGate(username)).toBe(true)
    })
  })

  describe("the report threshold", () => {
    it("keeps the dataset whitelist, so a malicious report cannot hold an innocent name", () => {
      for (const username of ["assassin-42", "analyst", "classic_player", "dickens"])
        expect(usernameFailsReportThreshold(username)).toBe(false)
    })

    it("catches digit padding the gate deliberately lets through", () => {
      // This is the whole reason for the second threshold. A digit wedged mid-word defeats the
      // leetspeak transformer, and stripping digits at signup would reject "classic7".
      for (const username of ["fu3ck", "sh4it", "b2itch", "c9unt"]) {
        expect({ username, gate: usernameFailsGate(username) }).toEqual({ username, gate: false })
        expect({ username, held: usernameFailsReportThreshold(username) }).toEqual({
          username,
          held: true,
        })
      }
      for (const username of ["classic7", "cumberland9", "assassin-42", "hancock3"])
        expect({ username, held: usernameFailsReportThreshold(username) }).toEqual({
          username,
          held: false,
        })
    })
  })

  describe("the hate-term list the profanity dataset does not cover", () => {
    it("rejects slurs and extremist references at signup", () => {
      for (const username of [
        "hitler88",
        "adolf-hitler",
        "KKK-grand",
        "1488-crew",
        "nazi",
        "n-a-z-i",
        "pedo",
        "pedo42",
        "kys-loser",
        "spic",
        "beaner",
        "chink",
        "gook",
        "tranny",
        "wetback",
        "pedophile-hunter",
      ]) {
        expect({ username, blocked: usernameFailsGate(username) }).toEqual({
          username,
          blocked: true,
        })
        expect(usernameFailsReportThreshold(username)).toBe(true)
      }
    })

    it("does not fire on ordinary words the short terms sit inside", () => {
      for (const username of [
        "raccoon",
        "cocoon",
        "tycoon",
        "torpedo",
        "pedometer",
        "spice-master",
        "auspicious",
        "suspicious",
        "skyscraper",
        "monkeys",
        "gooky",
        "banzai",
        "wetbackpack",
      ]) {
        expect({ username, blocked: usernameFailsGate(username) }).toEqual({
          username,
          blocked: false,
        })
      }
    })

    it("names the matched term for the operator queue", () => {
      expect(describeUsernameMatches("hitler88")).toEqual(["hitler"])
      expect(describeUsernameMatches("kys-loser")).toEqual(["kys"])
      expect(describeUsernameMatches("sh1t-nazi")).toEqual(["shit", "nazi"])
    })
  })

  describe("what the operator queue is told", () => {
    it("reports the matched dataset words", () => {
      expect(describeUsernameMatches("sh1t-lord")).toContain("shit")
      expect(describeUsernameMatches("clever-otter-01")).toEqual([])
    })

    it("deduplicates a word padded into several variants", () => {
      expect(describeUsernameMatches("fuuuck-f4ck")).toEqual(["fuck"])
    })

    it("says nothing for an account that has no username yet", () => {
      expect(describeUsernameMatches("")).toEqual([])
      expect(usernameFailsGate("")).toBe(false)
    })
  })
})
