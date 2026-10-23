import type { FunctionReturnType } from "convex/server"

import type { api } from "../../../convex/_generated/api"

export type FeedbackOwnItem = FunctionReturnType<typeof api.feedback.mine>[number]
export type FeedbackThread = NonNullable<FunctionReturnType<typeof api.feedback.thread>>
