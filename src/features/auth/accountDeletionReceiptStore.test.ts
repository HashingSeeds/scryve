import { storage } from "@/utils/storage"

import {
  clearAccountDeletionReceiptToken,
  loadAccountDeletionReceiptToken,
  saveAccountDeletionReceiptToken,
} from "./accountDeletionReceiptStore"

describe("account deletion receipt store", () => {
  beforeEach(() => storage.clearAll())

  it("persists a server-issued receipt across app restarts", () => {
    const token = "a".repeat(64)

    expect(saveAccountDeletionReceiptToken(token)).toBe(true)
    expect(loadAccountDeletionReceiptToken()).toBe(token)

    clearAccountDeletionReceiptToken()
    expect(loadAccountDeletionReceiptToken()).toBeUndefined()
  })

  it.each(["", "short", "z".repeat(64)])("rejects malformed receipt token %p", (token) => {
    expect(saveAccountDeletionReceiptToken(token)).toBe(false)
    expect(loadAccountDeletionReceiptToken()).toBeUndefined()
  })
})
