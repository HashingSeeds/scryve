import { router, type Href } from "expo-router"

export function goBack(fallback: Href = "/") {
  if (router.canGoBack()) router.back()
  else router.replace(fallback)
}
