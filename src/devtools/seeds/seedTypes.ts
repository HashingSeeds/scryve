export type SeedParams = Readonly<Record<string, string | undefined>>

/** why: the message is shown on screen, so it says how to fix the link. */
export class SeedError extends Error {
  name = "SeedError"
}
