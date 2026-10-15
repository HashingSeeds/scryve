import { Redirect } from "expo-router"

// why: LAN play needs native Bonjour and TCP modules, so web must never import the native route.
export default function LanWebRoute() {
  return <Redirect href="/" />
}
