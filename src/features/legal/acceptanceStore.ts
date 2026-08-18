import { CONSENT_DOCUMENT_IDS, type ConsentDocumentId } from "@/content/legal"
import type { StringStorage } from "@/features/game/localPersistence"
import { storage as mmkvStorage } from "@/utils/storage"

export const LEGAL_ACCEPTANCE_KEY = "count.local.legal.v1"

export type AcceptedVersions = Partial<Record<ConsentDocumentId, string>>

export class DeviceAcceptanceStore {
  constructor(private readonly storage: StringStorage = mmkvStorage) {}

  read(): AcceptedVersions {
    const raw = this.storage.getString(LEGAL_ACCEPTANCE_KEY)
    if (!raw) return {}
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return {}
    }
    if (typeof parsed !== "object" || parsed === null) return {}
    const record = parsed as Record<string, unknown>
    const accepted: AcceptedVersions = {}
    for (const id of CONSENT_DOCUMENT_IDS) {
      const value = record[id]
      if (typeof value === "string" && value) accepted[id] = value
    }
    return accepted
  }

  write(accepted: AcceptedVersions): void {
    this.storage.set(LEGAL_ACCEPTANCE_KEY, JSON.stringify(accepted))
  }
}

export const deviceAcceptanceStore = new DeviceAcceptanceStore()

export function missingConsent(
  required: Record<ConsentDocumentId, string>,
  accepted: AcceptedVersions,
): ConsentDocumentId[] {
  return CONSENT_DOCUMENT_IDS.filter((id) => accepted[id] !== required[id])
}
