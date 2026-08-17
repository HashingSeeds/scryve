import { router } from "expo-router"

import { termsContent } from "@/content/terms"
import { LegalDocumentScreen } from "@/screens/LegalDocumentScreen"

export default function TermsRoute() {
  return <LegalDocumentScreen document={termsContent} onBack={() => router.back()} />
}
