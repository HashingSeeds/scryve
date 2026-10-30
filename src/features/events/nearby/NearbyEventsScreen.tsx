import { useState } from "react"
import { TouchableOpacity, View } from "react-native"
import type { Service } from "react-native-zeroconf"

import { AlertNote } from "@/components/AlertNote"
import { Button } from "@/components/Button"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"

import type { NearbyRejection } from "./nearbyEventProtocol"
import { nearbyEventCode, nearbyEventTitle } from "./nearbyEventProtocol"
import { $dim, $grow, $row, $section, EventFrame } from "../EventFrame"
import { eventErrorText } from "../eventLogic"

export function NearbyEventsScreen({
  hosted,
  events,
  denied,
  name,
  askName,
  onNameChange,
  onBack,
  onHost,
  onOpenHosted,
  onJoin,
}: {
  hosted: { name: string; detail: string; running: boolean; unsaved: boolean } | null
  events: readonly Service[]
  denied: boolean
  name: string
  askName: boolean
  onNameChange: (name: string) => void
  onBack: () => void
  onHost: () => void
  onOpenHosted: () => void
  onJoin: (service: Service) => Promise<"joined" | NearbyRejection>
}) {
  const { themed } = useAppTheme()
  const [joining, setJoining] = useState<string>()
  const [error, setError] = useState<string>()
  const [replacing, setReplacing] = useState(false)

  async function join(service: Service) {
    setJoining(service.name)
    setError(undefined)
    try {
      const outcome = await onJoin(service)
      if (outcome !== "joined") setError(translate(`events:nearby.rejected.${outcome}`))
    } catch (cause) {
      setError(eventErrorText(cause))
    } finally {
      setJoining(undefined)
    }
  }

  return (
    <EventFrame
      title={translate("events:nearby.title")}
      onBack={onBack}
      footer={
        <Button
          testID="host-nearby-event"
          tx="events:nearby.host"
          preset="primary"
          disabled={hosted?.running}
          onPress={() => (hosted?.unsaved ? setReplacing(true) : onHost())}
        />
      }
    >
      {hosted ? (
        <View style={themed($section)}>
          <Text preset="formLabel" tx="events:nearby.yourEvent" />
          <TouchableOpacity
            testID="hosted-event"
            accessibilityRole="button"
            style={themed($row)}
            onPress={onOpenHosted}
          >
            <Text style={$grow} weight="medium" numberOfLines={1} text={hosted.name} />
            <Text size="xs" text={hosted.detail} />
          </TouchableOpacity>
        </View>
      ) : null}
      {askName ? (
        <TextField
          testID="nearby-name-input"
          labelTx="events:nearby.name"
          value={name}
          maxLength={24}
          onChangeText={onNameChange}
        />
      ) : null}
      {error ? <AlertNote testID="nearby-error" text={error} /> : null}
      <View style={themed($section)}>
        {denied ? (
          <Text style={themed($dim)} tx="events:nearby.denied" />
        ) : events.length === 0 ? (
          <Text style={themed($dim)} tx="events:nearby.searching" />
        ) : (
          events.map((service) => (
            <View key={service.name} style={themed($row)}>
              <View style={$grow}>
                <Text weight="medium" numberOfLines={1} text={nearbyEventTitle(service.name)} />
                <Text size="xxs" style={themed($dim)} text={nearbyEventCode(service.name)} />
              </View>
              <Button
                testID={`join-${nearbyEventCode(service.name)}`}
                tx={joining === service.name ? "events:nearby.joining" : "events:nearby.join"}
                disabled={joining !== undefined || (askName && !name.trim())}
                onPress={() => void join(service)}
              />
            </View>
          ))
        )}
      </View>
      <ConfirmDialog
        visible={replacing}
        title={translate("events:nearby.replaceUnsaved.title")}
        message={translate("events:nearby.replaceUnsaved.message")}
        confirmText={translate("events:nearby.replaceUnsaved.confirm")}
        destructive
        confirmTestID="replace-hosted-event"
        backdropAccessibilityLabel={translate("common:cancel")}
        onConfirm={() => {
          setReplacing(false)
          onHost()
        }}
        onClose={() => setReplacing(false)}
      />
    </EventFrame>
  )
}
