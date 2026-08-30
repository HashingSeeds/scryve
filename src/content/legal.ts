export type LegalDocumentBlock =
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] }
  | { type: "table"; rows: string[] }

export type LegalDocumentId = "terms" | "privacy" | "cookiePolicy" | "gameContentNotices"

export interface LegalDocumentContent {
  id: LegalDocumentId
  title: string
  version: string
  effectiveDate: string
  sections: Array<{
    heading?: string
    blocks: LegalDocumentBlock[]
  }>
}

export const CONSENT_DOCUMENT_IDS = ["terms", "privacy"] as const

export type ConsentDocumentId = (typeof CONSENT_DOCUMENT_IDS)[number]

export function isConsentDocumentId(value: string): value is ConsentDocumentId {
  return (CONSENT_DOCUMENT_IDS as readonly string[]).includes(value)
}
