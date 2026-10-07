export type SessionHint = { userId: string | null }

// why: browsers are shared and their Clerk session can change in another tab, so web always waits for Clerk.
export function readSessionHint(): SessionHint | undefined {
  return undefined
}

export function writeSessionHint(_hint: SessionHint): void {}

export function useSessionHint(_session: {
  isLoaded: boolean
  isSignedIn: boolean
  userId: string | undefined
}): SessionHint | undefined {
  return undefined
}
