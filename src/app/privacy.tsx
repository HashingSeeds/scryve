import { router } from "expo-router"

import { privacyContent } from "@/content/privacy"
import { LegalDocumentScreen } from "@/screens/LegalDocumentScreen"

export default function PrivacyRoute() {
  return <LegalDocumentScreen document={privacyContent} onBack={() => router.back()} />
}
