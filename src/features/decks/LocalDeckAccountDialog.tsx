import { useState } from "react"

import { ConfirmDialog } from "@/components/ConfirmDialog"
import { Text } from "@/components/Text"
import { translate } from "@/i18n/translate"
import { convexErrorMessage } from "@/utils/convexError"

import type { LocalDeckSyncResult } from "./localDeckSync"
import type { Id } from "../../../convex/_generated/dataModel"

export function LocalDeckAccountDialog({
  result,
  onClose,
  onSynced,
  onSyncingChange,
}: {
  result: Extract<LocalDeckSyncResult, { status: "other_account" }>
  onClose: () => void
  onSynced: (deckId: Id<"decks">) => void
  onSyncingChange?: (busy: boolean) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  async function addAsNew() {
    setBusy(true)
    onSyncingChange?.(true)
    setError(undefined)
    try {
      const imported = await result.addAsNew()
      if (imported.status === "synced") onSynced(imported.deckId)
      else
        setError(
          translate(
            `decks:localSync.${imported.status === "other_account" ? "conflict" : imported.status}`,
          ),
        )
    } catch (cause) {
      setError(convexErrorMessage(cause, translate("decks:localSync.failed")))
    } finally {
      setBusy(false)
      onSyncingChange?.(false)
    }
  }

  return (
    <ConfirmDialog
      visible
      title={translate("decks:localSync.addAsNew")}
      message={translate("decks:localSync.otherAccount")}
      confirmText={translate("decks:localSync.addAsNewConfirm")}
      backdropAccessibilityLabel={translate("common:close")}
      confirmTestID="local-deck-add-as-new"
      cancelTestID="local-deck-add-as-new-cancel"
      busy={busy}
      notice={error ? <Text accessibilityRole="alert" text={error} /> : undefined}
      onConfirm={() => void addAsNew()}
      onClose={onClose}
    />
  )
}
