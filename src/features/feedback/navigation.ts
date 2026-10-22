import { router } from "expo-router"

export function leaveFeedback() {
  if (router.canGoBack()) router.back()
  else router.replace("/support")
}
