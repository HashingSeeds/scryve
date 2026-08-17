import { router } from "expo-router"

import { eulaContent } from "@/content/eula"
import { LegalDocumentScreen } from "@/screens/LegalDocumentScreen"

export default function EulaRoute() {
  return <LegalDocumentScreen document={eulaContent} onBack={() => router.back()} />
}
