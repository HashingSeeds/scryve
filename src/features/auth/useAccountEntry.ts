import { router } from "expo-router"

import type { AccountEntry } from "@/components/AppUtilityMenu"
import { loadAccountDeletionReceiptToken } from "@/features/auth/accountDeletionReceiptStore"
import { useAuthAccess } from "@/features/auth/AuthContext"

export function useAccountEntry() {
  const auth = useAuthAccess()
  const opensAccount =
    auth.isSignedIn || (auth.configured && loadAccountDeletionReceiptToken() !== undefined)
  return {
    accountEntry: opensAccount ? "account" : "signIn",
    onAccount: () => (opensAccount ? router.push("/account") : auth.openAuth()),
  } satisfies { accountEntry: AccountEntry; onAccount: () => void }
}
