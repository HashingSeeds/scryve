import { useState } from "react"
import { router } from "expo-router"

import { useAuthAccess } from "@/features/auth/AuthContext"
import { LocalDeckChoicesSource, type DeckChoices } from "@/features/decks/LocalDeckChoicesSource"
import { localGameRepository } from "@/features/game/localPersistence"
import { defaultLoggedGameDraft } from "@/features/game/loggedGame"
import { LogGameScreen } from "@/screens/LogGameScreen"

export default function LogGameRoute() {
  const auth = useAuthAccess()
  const ownerId = auth.configured && auth.isSignedIn ? auth.userId : undefined
  const [decks, setDecks] = useState<DeckChoices>()
  const [initialDraft] = useState(() => {
    const { defaultSystem, defaultFormat } = localGameRepository.loadSettings()
    return defaultLoggedGameDraft({ system: defaultSystem, format: defaultFormat })
  })
  const leave = () => (router.canGoBack() ? router.back() : router.replace("/history"))
  return (
    <>
      {ownerId ? <LocalDeckChoicesSource ownerId={ownerId} onChange={setDecks} /> : null}
      <LogGameScreen
        initialDraft={initialDraft}
        account={ownerId ? { ownerId, decks } : undefined}
        onBack={leave}
        onSave={(game) => {
          localGameRepository.archiveGame(game, "logged", ownerId)
          leave()
        }}
      />
    </>
  )
}
