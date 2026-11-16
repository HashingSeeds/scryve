import { CODE_ALPHABET } from "@/features/connected/identifiers"
import { normalizeManualCode } from "@/features/connected/inviteLinks"

const CODE_LENGTH = 6
// why: Bonjour renames a clashing advert to "Name (2)", which must not hide the code.
const CODE_SUFFIX = / ([A-Z0-9]{6})(?: \(\d+\))?$/

// why: deriving the code from the random game id keeps it stable when a suspended host restores its game.
export function nearbyCodeFor(gameId: string) {
  const hex = gameId.slice(-CODE_LENGTH * 2)
  return Array.from(
    { length: CODE_LENGTH },
    (_, index) =>
      CODE_ALPHABET[parseInt(hex.slice(index * 2, index * 2 + 2), 16) % CODE_ALPHABET.length],
  ).join("")
}

/** why: the code rides in the advertised name, so guests find the game by code with no server and older builds still list it. */
export const nearbyServiceName = (name: string, code: string) => `${name} ${code}`

export const nearbyGameCode = (serviceName: string) => CODE_SUFFIX.exec(serviceName)?.[1]

export const nearbyGameHost = (serviceName: string) => serviceName.replace(CODE_SUFFIX, "")

/** why: a test link names a game by its code, which sits at the end of the advertised name. A host name works only when the link is not a code, so a code never joins a stranger whose name starts with it. */
export function findNearbyGame<Service extends { name: string }>(
  games: readonly Service[],
  wanted: string,
) {
  const code = normalizeManualCode(wanted)
  return games.find((service) =>
    code ? nearbyGameCode(service.name) === code : service.name.startsWith(wanted),
  )
}
