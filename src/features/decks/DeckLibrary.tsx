import type { ComponentProps } from "react"

import { useAuthAccess } from "@/features/auth/AuthContext"
import { CloudScreen, type CloudAccess } from "@/features/auth/CloudScreen"
import { translate } from "@/i18n/translate"
import { DecksScreen } from "@/screens/DecksScreen"

export function DeckLibrary(
  props: Omit<ComponentProps<typeof DecksScreen>, "access" | "unavailableMessage">,
) {
  const auth = useAuthAccess()
  const screen = (access?: CloudAccess) => (
    <DecksScreen
      {...props}
      access={access}
      unavailableMessage={
        !auth.configured
          ? auth.configurationMessage || translate("decks:shelf.syncUnavailable")
          : undefined
      }
    />
  )
  if (!auth.configured) return screen()
  return <CloudScreen onBack={props.back.onPress}>{screen}</CloudScreen>
}
