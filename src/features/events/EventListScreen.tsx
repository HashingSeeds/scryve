import { TouchableOpacity, View } from "react-native"

import { Button, PlusAccessory } from "@/components/Button"
import { EmptyState } from "@/components/EmptyState"
import { SectionHeader } from "@/components/NumberLane"
import { Text } from "@/components/Text"
import type { CloudAccess } from "@/features/auth/CloudScreen"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"

import { $action, $actions, $grow, $row, $section, EventFrame } from "./EventFrame"
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
  const sections = [
    {
      id: "current",
      label: translate("events:list.current"),
      rows: events?.filter((event) => event.status !== "finished") ?? [],
    },
    {
      id: "finished",
      label: translate("events:status.finished"),
      rows: events?.filter((event) => event.status === "finished") ?? [],
    },
  ]
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
            LeftAccessory={PlusAccessory}
            style={$action}
            onPress={onNew}
          />
        </View>
      }
    >
      {nearby}
      {events?.length === 0 ? (
        <EmptyState
          imageSource={null}
          headingTx="events:list.empty"
          contentTx="events:list.emptyHint"
        />
      ) : null}
      {sections.map((section) =>
        section.rows.length > 0 ? (
          <View key={section.id} testID={`events-${section.id}`} style={themed($section)}>
            <SectionHeader label={section.label} count={section.rows.length} />
            {section.rows.map((event) => (
              <EventRow key={event.id} event={event} onPress={() => onOpen(event.id)} />
            ))}
          </View>
        ) : null,
      )}
    </EventFrame>
  )
}

function EventRow({ event, onPress }: { event: EventListItem; onPress: () => void }) {
  const { themed } = useAppTheme()
  return (
    <TouchableOpacity
      testID={`event-${event.id}`}
      accessibilityRole="button"
      activeOpacity={0.75}
      style={themed($row)}
      onPress={onPress}
    >
      <View style={$grow}>
        <Text weight="medium" numberOfLines={1} text={event.name} />
        <Text
          size="meta"
          numberOfLines={1}
          tone="dim"
          text={[
            eventMeta(event),
            translate("events:playerCount", { count: event.playerCount }),
            ...(event.isOrganizer ? [translate("events:organizer")] : []),
          ].join(" · ")}
        />
      </View>
      <Text size="xs" text={eventStatusText(event)} />
    </TouchableOpacity>
  )
}
