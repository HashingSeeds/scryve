export type SeedParams = Readonly<Record<string, string | undefined>>

export class SeedError extends Error {
  name = "SeedError"
}
