import { router } from "expo-router"

import { cookiePolicyContent } from "@/content/cookiePolicy"
import { LegalDocumentScreen } from "@/screens/LegalDocumentScreen"

export default function CookiePolicyRoute() {
  return <LegalDocumentScreen document={cookiePolicyContent} onBack={() => router.back()} />
}
