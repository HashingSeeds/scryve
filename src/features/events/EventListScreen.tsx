import { TouchableOpacity, View } from "react-native"

import { Button } from "@/components/Button"
import { Text } from "@/components/Text"
import type { CloudAccess } from "@/features/auth/CloudScreen"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"

import { $action, $actions, $dim, $grow, $row, $section, EventFrame } from "./EventFrame"
import { eventMeta, eventStatusText } from "./eventLogic"
import type { EventView } from "./eventSource"

export type EventListItem = Pick<
  EventView,
  "id" | "name" | "system" | "format" | "structure" | "status" | "round" | "isOrganizer"
> & { playerCount: number }

export function EventListScreen({
  access,
  events,
  onBack,
  onNew,
  onJoin,
  onOpen,
  onNearby,
}: {
  access: CloudAccess
  events: readonly EventListItem[] | undefined
  onBack: () => void
  onNew: () => void
  onJoin: () => void
  onOpen: (eventId: string) => void
  onNearby?: () => void
}) {
  const { themed } = useAppTheme()
  const nearby = onNearby ? (
    <Button testID="nearby-events-button" tx="events:nearby.title" onPress={onNearby} />
  ) : null
  return (
    <EventFrame
      blockedAction={nearby}
      title={translate("events:title")}
      access={access}
      loading={events === undefined}
      onBack={onBack}
      footer={
        <View style={themed($actions)}>
          <Button
            testID="join-event-button"
            tx="events:joinEvent"
            style={$action}
            onPress={onJoin}
          />
          <Button
            testID="new-event-button"
            tx="events:newEvent"
            preset="reversed"
            style={$action}
            onPress={onNew}
          />
        </View>
      }
    >
      {nearby}
      <View style={themed($section)}>
        {events?.length === 0 ? <Text style={themed($dim)} tx="events:list.empty" /> : null}
        {events?.map((event) => (
          <TouchableOpacity
            key={event.id}
            testID={`event-${event.id}`}
            accessibilityRole="button"
            activeOpacity={0.75}
            style={themed($row)}
            onPress={() => onOpen(event.id)}
          >
            <View style={$grow}>
              <Text weight="medium" numberOfLines={1} text={event.name} />
              <Text
                size="xxs"
                numberOfLines={1}
                style={themed($dim)}
                text={[
                  eventMeta(event),
                  translate("events:playerCount", { count: event.playerCount }),
                  ...(event.isOrganizer ? [translate("events:organizer")] : []),
                ].join(" · ")}
              />
            </View>
            <Text size="xs" text={eventStatusText(event)} />
          </TouchableOpacity>
        ))}
      </View>
    </EventFrame>
  )
}
