import { router } from "expo-router"

import { gameContentNotices } from "@/content/gameContentNotices"
import { LegalDocumentScreen } from "@/screens/LegalDocumentScreen"

export default function GameContentNoticesRoute() {
  return <LegalDocumentScreen document={gameContentNotices} onBack={() => router.back()} />
}
