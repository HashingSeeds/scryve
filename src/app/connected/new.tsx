import { Redirect } from "expo-router"

export default function NewConnectedGameRoute() {
  return <Redirect href="/game/new?mode=connected" />
}
