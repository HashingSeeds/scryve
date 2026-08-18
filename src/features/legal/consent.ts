import type { ConsentDocumentId } from "@/content/legal"
import { privacyContent } from "@/content/privacy"
import { termsContent } from "@/content/terms"

export const REQUIRED_CONSENT_VERSIONS: Record<ConsentDocumentId, string> = {
  terms: termsContent.version,
  privacy: privacyContent.version,
}
