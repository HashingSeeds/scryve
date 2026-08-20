export const USERNAME_MIN_LENGTH = 4
export const USERNAME_MAX_LENGTH = 64

const ALLOWED_USERNAME = /^[A-Za-z0-9_-]+$/
const NUMBERS_ONLY = /^[0-9]+$/

export interface UsernameRule {
  id: string
  label: string
  isMet: (username: string) => boolean
}

export const USERNAME_RULES: readonly UsernameRule[] = [
  {
    id: "minLength",
    label: `At least ${USERNAME_MIN_LENGTH} characters`,
    isMet: (username) => username.length >= USERNAME_MIN_LENGTH,
  },
  {
    id: "maxLength",
    label: `At most ${USERNAME_MAX_LENGTH} characters`,
    isMet: (username) => username.length <= USERNAME_MAX_LENGTH,
  },
  {
    id: "allowedCharacters",
    label: "Letters, numbers, dashes, and underscores only",
    isMet: (username) => ALLOWED_USERNAME.test(username),
  },
  {
    id: "notNumbersAlone",
    label: "At least one letter, dash, or underscore",
    isMet: (username) => !NUMBERS_ONLY.test(username),
  },
]

export interface UsernameRuleStatus {
  rule: UsernameRule
  isMet: boolean
}

export function usernameRuleStatuses(value: string): UsernameRuleStatus[] {
  const username = value.trim()
  const isUntouched = username.length === 0
  return USERNAME_RULES.map((rule) => ({
    rule,
    isMet: !isUntouched && rule.isMet(username),
  }))
}

export function isUsernameValid(value: string): boolean {
  return usernameRuleStatuses(value).every((status) => status.isMet)
}

const SUGGESTION_ADJECTIVES = [
  "brisk",
  "bright",
  "clever",
  "curious",
  "eager",
  "lucky",
  "quiet",
  "steady",
  "swift",
  "wily",
]

const SUGGESTION_NOUNS = [
  "badger",
  "comet",
  "falcon",
  "griffin",
  "hydra",
  "lantern",
  "otter",
  "phoenix",
  "sapling",
  "wyvern",
]

export function suggestUsername(random: () => number = Math.random): string {
  const pick = <T>(pool: readonly T[]) => pool[Math.floor(random() * pool.length) % pool.length]
  const digits = String(Math.floor(random() * 100) % 100).padStart(2, "0")
  return `${pick(SUGGESTION_ADJECTIVES)}-${pick(SUGGESTION_NOUNS)}-${digits}`
}

interface ClerkFieldError {
  code?: string
  message?: string
  longMessage?: string
}

export function describeUsernameFailure(cause: unknown): string {
  const failure = firstClerkError(cause)
  if (
    failure?.code === "form_param_unknown" ||
    /not a valid parameter/i.test(failure?.message ?? "")
  )
    return "Usernames are turned off for this app right now, so we could not save yours. Please try again later or contact support."
  if (failure?.code === "form_identifier_exists")
    return "That username is already taken. Try another one."
  const explanation = failure?.longMessage ?? failure?.message
  if (explanation) return explanation
  if (cause instanceof Error && cause.message) return cause.message
  return "Could not save username"
}

function firstClerkError(cause: unknown): ClerkFieldError | undefined {
  if (typeof cause !== "object" || cause === null) return undefined
  const errors = (cause as { errors?: unknown }).errors
  if (!Array.isArray(errors) || errors.length === 0) return undefined
  const [failure] = errors
  if (typeof failure !== "object" || failure === null) return undefined
  return failure as ClerkFieldError
}
