import { Redirect } from "expo-router"

// why: LAN play needs native Bonjour and TCP modules; Metro picks this file on web so the native route never ships there.
export default function LanWebRoute() {
  return <Redirect href="/" />
}
