import { useEffect, useEffectEvent } from "react"
import { Redirect } from "expo-router"

import { useAddDeckFlow } from "@/screens/AddDeckScreen"

export default function AddDeckPreviewRoute() {
  const { review, leavePreview } = useAddDeckFlow()
  const leave = useEffectEvent(leavePreview)
  // why: every way out of this route (Back, swipe, Android Back, browser Back) unmounts it, so clearing here keeps the preview state in step with the stack.
  useEffect(() => () => leave(), [])
  return review ?? <Redirect href="/connected/decks/add" />
}
