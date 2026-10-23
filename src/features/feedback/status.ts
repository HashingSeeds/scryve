import type { FunctionReturnType } from "convex/server"

import { translate } from "@/i18n/translate"

import type { api } from "../../../convex/_generated/api"

export type FeedbackBoardItem = FunctionReturnType<typeof api.feedback.board>[number]
export type FeedbackOwnItem = FunctionReturnType<typeof api.feedback.mine>[number]
export type FeedbackThread = NonNullable<FunctionReturnType<typeof api.feedback.thread>>

export function statusLabel({
  status,
  shippedIn,
}: Pick<FeedbackBoardItem, "status" | "shippedIn">) {
  return status === "shipped" && shippedIn
    ? translate("feedback:status.shippedIn", { version: shippedIn })
    : translate(`feedback:status.${status}`)
}
