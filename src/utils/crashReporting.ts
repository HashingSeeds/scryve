import * as Sentry from "@sentry/react-native"

import { emitTelemetry } from "./telemetry"

export enum ErrorType {
  FATAL = "Fatal",
  HANDLED = "Handled",
}

export const reportCrash = (error: Error, type: ErrorType = ErrorType.FATAL) => {
  emitTelemetry("error.handled", {
    outcome: "rejected",
    errorCode: type === ErrorType.FATAL ? "FATAL" : "HANDLED",
  })
  if (__DEV__) {
    // Never print raw error text: it may contain auth, invite, or identity values.
    console.error(`[Scryve ${type}] Error details omitted by privacy policy`)
  } else {
    Sentry.captureException(error, { tags: { errorType: type } })
  }
}
