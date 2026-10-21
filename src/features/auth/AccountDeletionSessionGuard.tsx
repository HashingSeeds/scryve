import { useEffect } from "react"
import { useClerk } from "@clerk/expo"
import { useQuery_experimental } from "convex/react"

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
  const deletionQuery = useQuery_experimental({
    query: api.accountDeletion.currentAccountDeletion,
    args: auth.isSignedIn ? {} : "skip",
  })
  const deletion = deletionQuery.status === "success" ? deletionQuery.data : undefined
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
