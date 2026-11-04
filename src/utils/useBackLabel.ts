import { useContext, useMemo, useSyncExternalStore } from "react"
import { NavigationContext, NavigationRouteContext } from "expo-router/react-navigation"

import { localGameRepository } from "@/features/game/localPersistence"
import type { TxKeyPath } from "@/i18n"
import { translate } from "@/i18n/translate"

/** why: root stack routes whose title fits beside a back chevron; unlisted routes read "Back". A nested stack reuses names like "index", so its screens pass `label` instead. */
const BACK_LABELS = {
  "index": "common:appNavigation.play",
  "game/current": "common:appNavigation.game",
  "connected/game/[gameId]": "common:appNavigation.game",
  "lan/game": "common:appNavigation.game",
  "connected/lobby/[gameId]": "common:appNavigation.lobby",
  "lan/index": "common:appNavigation.lobby",
  "rules": "common:appNavigation.rules",
  "cards": "common:appNavigation.cards",
  "connected/decks/index": "common:appNavigation.decks",
  "settings/index": "common:appMenu.settings",
  "settings/about": "account:settings.about",
  "support": "common:appMenu.support",
  "account": "common:appMenu.account",
  "history/index": "common:appMenu.history",
  "events/index": "events:title",
} as const satisfies Record<string, TxKeyPath>

export type BackRoute = keyof typeof BACK_LABELS

const BACK_LABEL_KEYS: ReadonlyMap<string, TxKeyPath> = new Map(Object.entries(BACK_LABELS))

// why: past this a label crowds the centered title, so it reads "Back" as iOS does.
const MAX_BACK_LABEL_LENGTH = 12

/** why: names where back lands, as iOS does: the root stack route under this one, or `fallback` when nothing is under it (deep link, cold start). Reads context so it is safe outside a navigator, where expo-router's hooks throw. */
export function useBackLabel(fallback: BackRoute = "index") {
  const navigation = useContext(NavigationContext)
  const route = useContext(NavigationRouteContext)
  // why: a pushed screen's first render can read the stack before it holds this route, so subscribe instead of reading it once.
  const below = useSyncExternalStore(
    (onChange) => navigation?.addListener("state", onChange) ?? (() => {}),
    () => {
      const routes = navigation?.getState()?.routes ?? []
      return routes[routes.findIndex(({ key }) => key === route?.key) - 1]?.name
    },
  )
  return useMemo(() => {
    const name = below ?? fallback
    // why: Play's route shows the board while a local game runs.
    const key =
      name === "index" && localGameRepository.loadActiveGame()
        ? "common:appNavigation.game"
        : BACK_LABEL_KEYS.get(name)
    return fitBackLabel(key ? translate(key) : undefined)
  }, [below, fallback])
}

/** why: a label too long to sit beside the chevron reads "Back", as iOS does, whether it came from the stack or the caller. */
export function fitBackLabel(label: string | undefined) {
  return label && label.length <= MAX_BACK_LABEL_LENGTH ? label : translate("common:back")
}
