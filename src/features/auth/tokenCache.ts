import { tokenCache as clerkTokenCache } from "@clerk/expo/token-cache"

const cache = clerkTokenCache

export const tokenCache = cache && {
  ...cache,
  saveToken: (key: string, token: string) => cache.saveToken(key, token).catch(() => undefined),
}
