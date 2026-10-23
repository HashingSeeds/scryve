import { useState } from "react"
import type { TextStyle } from "react-native"

import { AlertNote } from "@/components/AlertNote"
import { Button } from "@/components/Button"
import { TextField } from "@/components/TextField"
import type { CloudAccess } from "@/features/auth/CloudScreen"
import { normalizeManualCode } from "@/features/connected/inviteLinks"
import { translate } from "@/i18n/translate"
import { InviteScannerScreen } from "@/screens/InviteScannerScreen"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { EventFrame } from "./EventFrame"
import { eventErrorText } from "./eventLogic"

const CODE_EXAMPLE = "ABC123"

export type JoinOutcome = "joined" | "notFound"

export function JoinEventScreen({
  access,
  initialCode = "",
  onBack,
  onJoin,
}: {
  access: CloudAccess
  initialCode?: string
  onBack: () => void
  onJoin: (code: string) => Promise<JoinOutcome>
}) {
  const { themed } = useAppTheme()
  const [code, setCode] = useState(initialCode)
  const [scanning, setScanning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const valid = normalizeManualCode(code)

  async function join(raw: string) {
    const normalized = normalizeManualCode(raw)
    if (!normalized) {
      setError(translate("events:join.invalidCode"))
      return
    }
    setBusy(true)
    setError(undefined)
    try {
      if ((await onJoin(normalized)) === "notFound") setError(translate("events:join.notFound"))
    } catch (cause) {
      setError(eventErrorText(cause))
    } finally {
      setBusy(false)
    }
  }

  if (scanning)
    return (
      <InviteScannerScreen
        onCancel={() => setScanning(false)}
        onInvite={(invite) => {
          setScanning(false)
          if (invite.kind !== "code") {
            setError(translate("events:join.notFound"))
            return
          }
          setCode(invite.code)
          void join(invite.code)
        }}
      />
    )

  return (
    <EventFrame
      title={translate("events:join.title")}
      access={access}
      onBack={onBack}
      footer={
        <>
          {error ? <AlertNote testID="join-event-error" text={error} /> : null}
          <Button
            testID="join-event-submit"
            preset="reversed"
            disabled={busy || !valid}
            text={translate(busy ? "events:join.joining" : "events:join.join")}
            onPress={() => void join(code)}
          />
        </>
      }
    >
      <TextField
        testID="event-code-input"
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={7}
        labelTx="events:join.code"
        placeholder={CODE_EXAMPLE}
        value={code}
        onChangeText={(value) => {
          setCode(value)
          setError(undefined)
        }}
        style={themed($codeInput)}
      />
      <Button testID="scan-event-button" tx="events:join.scan" onPress={() => setScanning(true)} />
    </EventFrame>
  )
}

const $codeInput: ThemedStyle<TextStyle> = () => ({ letterSpacing: 4 })
