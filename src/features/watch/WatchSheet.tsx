import { useEffect, useState } from "react"
import { ActivityIndicator, Share } from "react-native"
import { useMutation } from "convex/react"

import { AlertNote } from "@/components/AlertNote"
import { Button } from "@/components/Button"
import { $dialogText } from "@/components/DialogCard"
import { Sheet } from "@/components/Sheet"
import { Text } from "@/components/Text"
import { readPublicCloudConfig } from "@/features/auth/config"
import { InviteCard } from "@/features/connected/InviteCard"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import { convexErrorMessage } from "@/utils/convexError"

import { watchUrl } from "./watchLinks"
import { api } from "../../../convex/_generated/api"

export function WatchSheet({
  publicId,
  visible,
  onClose,
  onDismissed,
}: {
  publicId: string
  visible: boolean
  onClose: () => void
  onDismissed: () => void
}) {
  const { themed } = useAppTheme()
  const getCode = useMutation(api.games.watchCode)
  const [code, setCode] = useState<string>()
  const [error, setError] = useState<string>()
  useEffect(() => {
    let cancelled = false
    getCode({ publicId }).then(
      (found) => {
        if (!cancelled) setCode(found)
      },
      (cause: unknown) => {
        if (!cancelled) setError(convexErrorMessage(cause, translate("connected:watch.failed")))
      },
    )
    return () => {
      cancelled = true
    }
  }, [getCode, publicId])
  const origin = readPublicCloudConfig()
  const url = code && origin.configured ? watchUrl(origin.value.inviteOrigin, code) : null

  async function share() {
    if (!url) return
    try {
      // why: the message already holds the link; also passing `url` makes iOS Messages attach it twice.
      await Share.share({ message: translate("connected:watch.shareMessage", { url }) })
    } catch {
      setError(translate("connected:invite.shareFailed"))
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} onDismissed={onDismissed} testID="watch-dialog">
      <Text preset="subheading" tx="connected:watch.title" style={themed($dialogText)} />
      {code ? (
        <>
          <InviteCard
            qrPayload={url}
            manualCode={code}
            onShare={url ? () => void share() : undefined}
            copy={{ code: "connected:watch.code", share: "connected:watch.share" }}
          />
          {url ? (
            <Text
              size="xs"
              tone="dim"
              selectable
              text={translate("connected:watch.hint", { url: url.replace(/^https:\/\//, "") })}
            />
          ) : null}
        </>
      ) : error ? null : (
        <ActivityIndicator />
      )}
      {error ? <AlertNote text={error} /> : null}
      <Button tx="common:close" onPress={onClose} />
    </Sheet>
  )
}
