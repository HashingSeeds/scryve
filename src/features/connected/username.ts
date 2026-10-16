import { translate } from "@/i18n/translate"

import { suggestUsername } from "../../../convex/lib/usernameSuggestions"

export { suggestUsername }

export const USERNAME_MIN_LENGTH = 4
export const USERNAME_MAX_LENGTH = 64

const ALLOWED_USERNAME = /^[A-Za-z0-9_-]+$/
const NUMBERS_ONLY = /^[0-9]+$/

export interface UsernameRule {
  id: string
  label: () => string
  isMet: (username: string) => boolean
}

export const USERNAME_RULES: readonly UsernameRule[] = [
  {
    id: "minLength",
    label: () => translate("connected:username.rules.minLength", { count: USERNAME_MIN_LENGTH }),
    isMet: (username) => username.length >= USERNAME_MIN_LENGTH,
  },
  {
    id: "maxLength",
    label: () => translate("connected:username.rules.maxLength", { count: USERNAME_MAX_LENGTH }),
    isMet: (username) => username.length <= USERNAME_MAX_LENGTH,
  },
  {
    id: "allowedCharacters",
    label: () => translate("connected:username.rules.allowedCharacters"),
    isMet: (username) => ALLOWED_USERNAME.test(username),
  },
  {
    id: "notNumbersAlone",
    label: () => translate("connected:username.rules.notNumbersAlone"),
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
    return translate("connected:username.errors.disabled")
  if (failure?.code === "form_identifier_exists")
    return translate("connected:username.errors.taken")
  const explanation = failure?.longMessage ?? failure?.message
  if (explanation) return explanation
  if (cause instanceof Error && cause.message) return cause.message
  return translate("connected:username.errors.saveFailed")
}

function firstClerkError(cause: unknown): ClerkFieldError | undefined {
  if (typeof cause !== "object" || cause === null) return undefined
  const errors = (cause as { errors?: unknown }).errors
  if (!Array.isArray(errors) || errors.length === 0) return undefined
  const [failure] = errors
  if (typeof failure !== "object" || failure === null) return undefined
  return failure as ClerkFieldError
}
