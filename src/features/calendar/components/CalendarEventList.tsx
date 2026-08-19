import { Badge } from '@astryxdesign/core/Badge'
import { HStack } from '@astryxdesign/core/HStack'
import { IconButton } from '@astryxdesign/core/IconButton'
import { List, ListItem } from '@astryxdesign/core/List'
import { Pencil, Trash2 } from 'lucide-react'

import { canEditEvent, formatEventDate, formatEventTime } from '../schedule'
import type { CalendarEvent } from '../types'

interface CalendarEventListProps {
  header: string
  events: CalendarEvent[]
  userId: string
  onEdit: (event: CalendarEvent) => void
  onDelete: (event: CalendarEvent) => void
}

/**
 * 일정 목록 한 묶음 (다가오는 일정 / 지난 일정을 각각 부른다).
 *
 * 수정·삭제 버튼은 `canEditEvent`가 허락하는 사람에게만 뜬다 — "우리 약속"이면
 * 누구나, 아니면 등록한 사람만. DB RLS가 같은 규칙으로 실제 쓰기를 막으므로,
 * 여기서 버튼을 숨기지 않으면 누르고 나서야 실패를 알게 된다.
 */
export function CalendarEventList({
  header,
  events,
  userId,
  onEdit,
  onDelete,
}: CalendarEventListProps) {
  return (
    <List header={header} hasDividers density="balanced">
      {events.map((event) => (
        <CalendarEventRow
          key={event.id}
          event={event}
          canEdit={canEditEvent(event, userId)}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </List>
  )
}

function CalendarEventRow({
  event,
  canEdit,
  onEdit,
  onDelete,
}: {
  event: CalendarEvent
  canEdit: boolean
} & Pick<CalendarEventListProps, 'onEdit' | 'onDelete'>) {
  const description = [formatEventDate(event.event_date), formatEventTime(event.event_time), event.location]
    .filter(Boolean)
    .join(' · ')

  return (
    <ListItem
      label={event.title}
      description={description}
      endContent={
        <HStack gap={1} vAlign="center">
          {event.is_shared && <Badge variant="info" label="우리 약속" />}
          {canEdit && (
            <>
              <IconButton
                label={`${event.title} 수정`}
                tooltip="수정"
                variant="ghost"
                size="sm"
                icon={<Pencil className="size-4" />}
                onClick={() => onEdit(event)}
              />
              <IconButton
                label={`${event.title} 삭제`}
                tooltip="삭제"
                variant="ghost"
                size="sm"
                icon={<Trash2 className="size-4" />}
                onClick={() => onDelete(event)}
              />
            </>
          )}
        </HStack>
      }
    />
  )
}
