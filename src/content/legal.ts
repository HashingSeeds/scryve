export type LegalDocumentBlock =
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] }
  | { type: "table"; rows: string[] }

export interface LegalDocumentContent {
  title: string
  sections: Array<{
    heading?: string
    blocks: LegalDocumentBlock[]
  }>
}
