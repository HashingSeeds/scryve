import {
  describeUsernameFailure,
  isUsernameValid,
  suggestUsername,
  USERNAME_MAX_LENGTH,
  usernameRuleStatuses,
} from "./username"

const unmetRuleIds = (value: string) =>
  usernameRuleStatuses(value)
    .filter((status) => !status.isMet)
    .map((status) => status.rule.id)

describe("usernameRuleStatuses", () => {
  it("reports every rule met for an acceptable username", () => {
    expect(unmetRuleIds("brisk-otter-07")).toEqual([])
    expect(unmetRuleIds("  padded_name  ")).toEqual([])
  })

  it("leaves every rule unmet for an untouched field", () => {
    expect(unmetRuleIds("")).toEqual([
      "minLength",
      "maxLength",
      "allowedCharacters",
      "notNumbersAlone",
    ])
    expect(unmetRuleIds("   ")).toHaveLength(4)
  })

  it("reports each rule independently rather than stopping at the first", () => {
    expect(unmetRuleIds("ab")).toEqual(["minLength"])
    expect(unmetRuleIds("a".repeat(USERNAME_MAX_LENGTH + 1))).toEqual(["maxLength"])
    expect(unmetRuleIds("has spaces")).toEqual(["allowedCharacters"])
    expect(unmetRuleIds("12345")).toEqual(["notNumbersAlone"])
  })

  it("surfaces several broken rules at once", () => {
    expect(unmetRuleIds("a!")).toEqual(["minLength", "allowedCharacters"])
    expect(unmetRuleIds("12")).toEqual(["minLength", "notNumbersAlone"])
  })
})

describe("isUsernameValid", () => {
  it("requires every rule", () => {
    expect(isUsernameValid("brisk-otter-07")).toBe(true)
    expect(isUsernameValid("")).toBe(false)
    expect(isUsernameValid("12")).toBe(false)
  })
})

describe("suggestUsername", () => {
  it("suggests something the rules accept", () => {
    for (let attempt = 0; attempt < 50; attempt++)
      expect(isUsernameValid(suggestUsername())).toBe(true)
  })

  it("stays inside the pools at the extremes of the random source", () => {
    expect(isUsernameValid(suggestUsername(() => 0))).toBe(true)
    expect(isUsernameValid(suggestUsername(() => 0.9999999))).toBe(true)
  })
})

describe("describeUsernameFailure", () => {
  it("explains that usernames are disabled rather than echoing Clerk's parameter error", () => {
    const cause = {
      errors: [{ code: "form_param_unknown", message: "username is not a valid parameter" }],
    }
    expect(describeUsernameFailure(cause)).toMatch(/turned off for this app/i)
  })

  it("names a taken username", () => {
    const cause = { errors: [{ code: "form_identifier_exists", message: "already exists" }] }
    expect(describeUsernameFailure(cause)).toBe("That username is already taken. Try another one.")
  })

  it("prefers Clerk's long message for anything else", () => {
    const cause = {
      errors: [{ code: "form_password_pwned", message: "short", longMessage: "the long reason" }],
    }
    expect(describeUsernameFailure(cause)).toBe("the long reason")
  })

  it("falls back to the error message, then to a default", () => {
    expect(describeUsernameFailure(new Error("network down"))).toBe("network down")
    expect(describeUsernameFailure(undefined)).toBe("Could not save username")
  })
})
