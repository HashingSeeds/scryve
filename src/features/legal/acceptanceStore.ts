import { CONSENT_DOCUMENT_IDS, type ConsentDocumentId } from "@/content/legal"
import type { StringStorage } from "@/features/game/localPersistence"
import { storage as mmkvStorage } from "@/utils/storage"

export const LEGAL_ACCEPTANCE_KEY = "count.local.legal.v1"
export const LEGAL_ACCOUNT_ACCEPTANCE_KEY = "count.local.legal.accounts.v1"
export const LEGAL_ACCOUNT_PENDING_CONSENT_KEY = "count.local.legal.accounts.pending.v1"

export type AcceptedVersions = Partial<Record<ConsentDocumentId, string>>

export class DeviceAcceptanceStore {
  constructor(private readonly storage: StringStorage = mmkvStorage) {}

  read(): AcceptedVersions {
    return pickVersions(parseRecord(this.storage.getString(LEGAL_ACCEPTANCE_KEY)))
  }

  write(accepted: AcceptedVersions): void {
    this.storage.set(LEGAL_ACCEPTANCE_KEY, JSON.stringify(accepted))
  }
}

export const deviceAcceptanceStore = new DeviceAcceptanceStore()

export class AccountAcceptanceCache {
  constructor(private readonly storage: StringStorage = mmkvStorage) {}

  private all(): Record<string, AcceptedVersions> {
    const parsed = parseRecord(this.storage.getString(LEGAL_ACCOUNT_ACCEPTANCE_KEY))
    if (!parsed) return {}
    const accounts: Record<string, AcceptedVersions> = {}
    for (const [userId, value] of Object.entries(parsed))
      accounts[userId] = pickVersions(value as Record<string, unknown>)
    return accounts
  }

  read(userId: string): AcceptedVersions {
    return this.all()[userId] ?? {}
  }

  hasAccountsOtherThan(userId: string | undefined): boolean {
    return Object.keys(this.all()).some((id) => id !== userId)
  }

  write(userId: string, accepted: AcceptedVersions): void {
    this.storage.set(
      LEGAL_ACCOUNT_ACCEPTANCE_KEY,
      JSON.stringify({ ...this.all(), [userId]: accepted }),
    )
  }
}

export const accountAcceptanceCache = new AccountAcceptanceCache()

export class AccountConsentSyncStore {
  constructor(private readonly storage: StringStorage = mmkvStorage) {}

  private all(): Record<string, AcceptedVersions> {
    const parsed = parseRecord(this.storage.getString(LEGAL_ACCOUNT_PENDING_CONSENT_KEY))
    if (!parsed) return {}
    const accounts: Record<string, AcceptedVersions> = {}
    for (const [userId, value] of Object.entries(parsed))
      accounts[userId] = pickVersions(value as Record<string, unknown>)
    return accounts
  }

  read(userId: string): AcceptedVersions {
    return this.all()[userId] ?? {}
  }

  write(userId: string, accepted: AcceptedVersions): void {
    this.storage.set(
      LEGAL_ACCOUNT_PENDING_CONSENT_KEY,
      JSON.stringify({ ...this.all(), [userId]: accepted }),
    )
  }

  clear(userId: string): void {
    const accounts = this.all()
    delete accounts[userId]
    if (Object.keys(accounts).length === 0) {
      this.storage.delete(LEGAL_ACCOUNT_PENDING_CONSENT_KEY)
      return
    }
    this.storage.set(LEGAL_ACCOUNT_PENDING_CONSENT_KEY, JSON.stringify(accounts))
  }
}

export const accountConsentSyncStore = new AccountConsentSyncStore()

function parseRecord(raw: string | undefined): Record<string, unknown> | undefined {
  if (!raw) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return undefined
  }
  if (typeof parsed !== "object" || parsed === null) return undefined
  return parsed as Record<string, unknown>
}

function pickVersions(record: Record<string, unknown> | undefined): AcceptedVersions {
  const accepted: AcceptedVersions = {}
  if (!record) return accepted
  for (const id of CONSENT_DOCUMENT_IDS) {
    const value = record[id]
    if (typeof value === "string" && value) accepted[id] = value
  }
  return accepted
}

export function missingConsent(
  required: Record<ConsentDocumentId, string>,
  accepted: AcceptedVersions,
): ConsentDocumentId[] {
  return CONSENT_DOCUMENT_IDS.filter((id) => accepted[id] !== required[id])
}
