import { useMemo } from "react"
import { router, useLocalSearchParams } from "expo-router"

import { useBackToBoard } from "@/features/game/useBackToBoard"
import { LibraryTabs } from "@/features/library/LibraryTabs"
import { translate } from "@/i18n/translate"

export default function DecksRoute() {
  const { lobbyId, system } = useLocalSearchParams<{ lobbyId?: string; system?: string }>()
  const boardBack = useBackToBoard()
  const back = useMemo(
    () =>
      lobbyId
        ? {
            label: translate("common:appNavigation.lobby"),
            onPress: () =>
              router.dismissTo({
                pathname: "/connected/lobby/[gameId]",
                params: { gameId: lobbyId },
              }),
          }
        : boardBack,
    [boardBack, lobbyId],
  )
  return <LibraryTabs initial="decks" back={back} decksSystem={system} />
}
