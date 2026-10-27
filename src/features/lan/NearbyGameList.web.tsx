// why: browsing for nearby games needs native Bonjour and TCP modules; Metro picks this file on web so they never ship there.
export function NearbyGameList(_props: { code?: string; onJoin: () => void }) {
  return null
}
