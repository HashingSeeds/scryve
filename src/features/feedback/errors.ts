import { translate } from "@/i18n/translate"
import { convexErrorCode, convexErrorMessage, convexRetryAfterMs } from "@/utils/convexError"

const MINUTE_MS = 60_000

export function feedbackErrorMessage(cause: unknown, fallback: string) {
  if (convexErrorCode(cause) === "rate_limited")
    return translate("feedback:suggest.rateLimited", {
      count: Math.max(1, Math.ceil((convexRetryAfterMs(cause) ?? MINUTE_MS) / MINUTE_MS)),
    })
  return convexErrorMessage(cause, fallback)
}
