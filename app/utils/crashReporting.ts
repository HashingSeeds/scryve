import { emitTelemetry } from "./telemetry"

/** Vendor initialization remains intentionally empty until privacy/product approval. */
export const initCrashReporting = () => {
  // Install an approved adapter through app/utils/telemetry.ts; never inline credentials here.
}

/**
 * Error classifications used to sort errors on error reporting services.
 */
export enum ErrorType {
  /**
   * An error that would normally cause a red screen in dev
   * and force the user to sign out and restart.
   */
  FATAL = "Fatal",
  /**
   * An error caught by try/catch where defined using Reactotron.tron.error.
   */
  HANDLED = "Handled",
}

/**
 * Manually report a handled error.
 */
export const reportCrash = (_error: Error, type: ErrorType = ErrorType.FATAL) => {
  emitTelemetry("error.handled", {
    outcome: "rejected",
    errorCode: type === ErrorType.FATAL ? "FATAL" : "HANDLED",
  })
  if (__DEV__) {
    // Never print raw error text: it may contain auth, invite, or identity values.
    console.error(`[Count ${type}] Error details omitted by privacy policy`)
  } else {
    // In production, utilize crash reporting service of choice below:
    // RN
    // Sentry.captureException(error)
    // crashlytics().recordError(error)
    // Bugsnag.notify(error)
  }
}
