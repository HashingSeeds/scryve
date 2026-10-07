import { useEffect } from "react"
import { useClerk } from "@clerk/expo"
import { useQuery } from "convex/react"

import {
  isValidReceiptToken,
  loadAccountDeletionReceiptToken,
  saveAccountDeletionReceiptToken,
} from "@/features/auth/accountDeletionReceiptStore"
import { useAuthAccess } from "@/features/auth/AuthContext"
import { writeSessionHint } from "@/features/auth/sessionHint"
import { LocalGameRepository } from "@/features/game/localPersistence"

import { api } from "../../../convex/_generated/api"

export function AccountDeletionSessionGuard() {
  const auth = useAuthAccess()
  if (!auth.configured) return null
  return <SignedInDeletionGuard />
}

function SignedInDeletionGuard() {
  const auth = useAuthAccess()
  const clerk = useClerk()
  const deletion = useQuery(
    api.accountDeletion.currentAccountDeletion,
    auth.isSignedIn ? {} : "skip",
  )
  useEffect(() => {
    if (!auth.isSignedIn || !deletion || deletion.status === "failed") return
    if (
      deletion.receiptToken &&
      isValidReceiptToken(deletion.receiptToken) &&
      loadAccountDeletionReceiptToken() !== deletion.receiptToken
    ) {
      new LocalGameRepository().resetAnalyticsId()
      saveAccountDeletionReceiptToken(deletion.receiptToken)
    }
    writeSessionHint({ userId: null })
    void clerk.signOut().catch(() => undefined)
  }, [auth.isSignedIn, clerk, deletion])

  return null
}
