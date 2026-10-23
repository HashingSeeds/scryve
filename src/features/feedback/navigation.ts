import { router } from "expo-router"

export function leaveFeedback() {
  if (router.canGoBack()) router.back()
  else router.replace("/support")
}

export function openRequest(item: { _id: string; mine: boolean }) {
  router.push(item.mine ? `/feedback/${item._id}` : `/feedback/request/${item._id}`)
}
