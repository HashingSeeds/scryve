import { loadString, remove, saveString } from "@/utils/storage"

const ACCOUNT_DELETION_RECEIPT_KEY = "accountDeletion.receipt.v1"
const RECEIPT_TOKEN_PATTERN = /^[0-9a-f]{64}$/

export function isValidReceiptToken(token: string) {
  return RECEIPT_TOKEN_PATTERN.test(token)
}

export function loadAccountDeletionReceiptToken() {
  const token = loadString(ACCOUNT_DELETION_RECEIPT_KEY)
  if (!token || !RECEIPT_TOKEN_PATTERN.test(token)) return undefined
  return token
}

export function saveAccountDeletionReceiptToken(token: string) {
  if (!RECEIPT_TOKEN_PATTERN.test(token)) return false
  return saveString(ACCOUNT_DELETION_RECEIPT_KEY, token)
}

export function clearAccountDeletionReceiptToken() {
  remove(ACCOUNT_DELETION_RECEIPT_KEY)
}
