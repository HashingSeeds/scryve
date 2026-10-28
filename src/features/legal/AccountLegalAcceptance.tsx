import { useEffect } from "react"
import { Platform } from "react-native"
import { useConvexAuth, useMutation, useQuery } from "convex/react"

import { CONSENT_DOCUMENT_IDS } from "@/content/legal"
import { useAuthAccess } from "@/features/auth/AuthContext"

import { REQUIRED_CONSENT_VERSIONS } from "./consent"
import { api } from "../../../convex/_generated/api"

export function AccountLegalAcceptance() {
  const auth = useAuthAccess()
  return auth.configured && auth.userId ? <RecordSignUpAgreement userId={auth.userId} /> : null
}

function RecordSignUpAgreement({ userId }: { userId: string }) {
  const { isAuthenticated } = useConvexAuth()
  const acceptances = useQuery(api.legal.currentAcceptances, isAuthenticated ? {} : "skip")
  const recordAcceptance = useMutation(api.legal.recordAcceptance)

  useEffect(() => {
    if (!acceptances) return
    // why: an account that agreed to an older version keeps that record; only documents it never agreed to are recorded.
    const unrecorded = CONSENT_DOCUMENT_IDS.filter(
      (id) => !acceptances.some(({ document }) => document === id),
    )
    // why: a failed save retries on the next launch, and the backend rejects a save for an account that switched mid-flight.
    void Promise.all(
      unrecorded.map((document) =>
        recordAcceptance({
          document,
          version: REQUIRED_CONSENT_VERSIONS[document],
          platform: Platform.OS,
          intendedAccount: userId,
        }),
      ),
    ).catch(() => undefined)
  }, [acceptances, recordAcceptance, userId])

  return null
}
