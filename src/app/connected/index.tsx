import { Redirect } from "expo-router"

export default function ConnectedIndex() {
  return <Redirect href="/game/new?mode=connected" />
}
