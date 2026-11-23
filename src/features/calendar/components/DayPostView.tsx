import { Avatar } from '@astryxdesign/core/Avatar'
import { AvatarGroup } from '@astryxdesign/core/AvatarGroup'
import { Button } from '@astryxdesign/core/Button'
import { Carousel } from '@astryxdesign/core/Carousel'
import { DropdownMenu } from '@astryxdesign/core/DropdownMenu'
import { Heading } from '@astryxdesign/core/Heading'
import { HStack } from '@astryxdesign/core/HStack'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Text } from '@astryxdesign/core/Text'
import { TextArea } from '@astryxdesign/core/TextArea'
import { TextInput } from '@astryxdesign/core/TextInput'
import { VStack } from '@astryxdesign/core/VStack'
import { MoreHorizontal, PenLine, X } from 'lucide-react'
import { useEffect, useRef, useState, type UIEvent } from 'react'

import { cn } from '@/lib/utils'
import {
  DAY_CONTENT_MAX,
  DAY_PHOTO_MAX,
  DAY_TITLE_MAX,
  type DayPhoto,
  type DayRecord,
} from '../api/dayPhotos'
import { formatEventDate, parseDateKey } from '../schedule'
import { DayPhotoViewer } from './DayPhotoViewer'

export interface DayPostPerson {
  name: string | null
  avatarUrl: string | null
}

interface DayPostViewProps {
  record: DayRecord
  me: DayPostPerson
  partner: DayPostPerson | null
  startInEdit: boolean
  isSaving: boolean
  isUploading: boolean
  onClose: () => void
  onAddPhotos: () => void
  onSetCover: (photo: DayPhoto) => void
  onDeletePhoto: (photo: DayPhoto) => void
  /** 저장에 성공하면 true. 실패하면 쓰던 글을 그대로 둔다. */
  onSave: (title: string | null, content: string | null) => Promise<boolean>
}

/**
 * 하루를 한 장의 게시물로 보여준다. 위에서부터 두 사람, 사진, 제목과 내용 순서다.
 * 좋아요·댓글 같은 반응 없이 사진과 글만 남긴다.
 */
export function DayPostView({
  record,
  me,
  partner,
  startInEdit,
  isSaving,
  isUploading,
  onClose,
  onAddPhotos,
  onSetCover,
  onDeletePhoto,
  onSave,
}: DayPostViewProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [isEditing, setIsEditing] = useState(startInEdit)

  const { photos } = record
  // 사진을 지운 직후 인덱스가 끝을 넘을 수 있다.
  const currentIndex = Math.min(activeIndex, photos.length - 1)
  const current = photos[currentIndex]
  const coverId = record.coverPhotoId ?? photos[0]?.id
  const isCover = current?.id === coverId
  const names = [me.name, partner?.name].filter(Boolean).join(' · ')
  const year = parseDateKey(record.date).getFullYear()

  function handleScroll(event: UIEvent<HTMLElement>) {
    const scroller = event.target as HTMLElement
    if (scroller.clientWidth === 0) return
    setActiveIndex(Math.round(scroller.scrollLeft / scroller.clientWidth))
  }

  return (
    // isolate: 버튼 배경은 z-index가 음수인 층이라, 없으면 이 배경 뒤로 숨는다.
    <VStack width="100%" height="100dvh" className="isolate overflow-y-auto bg-body outline-none">
      {/* 홈 화면 앱에서는 기기가 상태바 아래까지 화면 위쪽을 흐리게 덮는다.
          안전 영역만 비우면 헤더가 그 흐린 띠에 걸려서 더 내려 둔다. */}
      <HStack
        gap={2}
        vAlign="center"
        width="100%"
        className="sticky top-0 z-10 shrink-0 bg-body px-2 pt-[calc(var(--spacing-6)+env(safe-area-inset-top))] pb-2"
      >
        <IconButton
          label="닫기"
          variant="ghost"
          icon={<X className="size-5" />}
          onClick={onClose}
        />
        <AvatarGroup size="sm">
          <Avatar src={me.avatarUrl ?? undefined} name={me.name || '나'} />
          {partner && (
            <Avatar src={partner.avatarUrl ?? undefined} name={partner.name || '상대방'} />
          )}
        </AvatarGroup>
        <VStack gap={0} className="min-w-0 flex-1">
          <Text weight="semibold" maxLines={1}>
            {names || '우리'}
          </Text>
          <Text type="supporting" size="sm">
            {year}년 {formatEventDate(record.date)}
          </Text>
        </VStack>
        <DropdownMenu
          button={{
            label: '게시물 메뉴',
            isIconOnly: true,
            variant: 'ghost',
            icon: <MoreHorizontal className="size-5" />,
          }}
          hasChevron={false}
          menuWidth={180}
          items={[
            {
              label: photos.length >= DAY_PHOTO_MAX ? `${DAY_PHOTO_MAX}장까지 올렸어요` : '사진 추가',
              isDisabled: photos.length >= DAY_PHOTO_MAX || isUploading,
              onClick: onAddPhotos,
            },
            {
              label: isCover ? '달력 대표 사진이에요' : '달력 대표 사진으로',
              isDisabled: isCover,
              onClick: () => current && onSetCover(current),
            },
            { type: 'divider' },
            { label: '이 사진 삭제', onClick: () => current && onDeletePhoto(current) },
          ]}
        />
      </HStack>

      <VStack width="100%" maxWidth={560} className="mx-auto shrink-0">
        <HStack width="100%" className="relative">
          <Carousel
            gap={0}
            hasSnap
            hasButtons={false}
            hasEdgeFade={false}
            aria-label="그날의 사진"
            className="w-full"
            onScrollCapture={handleScroll}
          >
            {photos.map((photo, index) => (
              <button
                key={photo.id}
                type="button"
                aria-label={`사진 ${index + 1} 크게 보기`}
                className="block aspect-4/5 w-[min(100dvw,35rem)] cursor-zoom-in border-0 bg-muted p-0"
                onClick={() => setViewerIndex(index)}
              >
                <img
                  src={photo.fullUrl}
                  alt={`${formatEventDate(record.date)} 사진 ${index + 1}`}
                  loading={index === 0 ? 'eager' : 'lazy'}
                  draggable={false}
                  className="size-full object-cover"
                />
              </button>
            ))}
          </Carousel>
          {photos.length > 1 && (
            <Text
              size="sm"
              weight="medium"
              className="pointer-events-none absolute top-3 right-3 rounded-full bg-overlay px-2 py-0.5 text-on-dark"
            >
              {currentIndex + 1}/{photos.length}
            </Text>
          )}
        </HStack>

        {photos.length > 1 && (
          <HStack gap={1} hAlign="center" width="100%" className="pt-3" aria-hidden="true">
            {photos.map((photo, index) => (
              <span
                key={photo.id}
                className={cn(
                  'size-1.5 rounded-full transition-colors',
                  index === currentIndex ? 'bg-accent' : 'bg-border-strong opacity-40',
                )}
              />
            ))}
          </HStack>
        )}

        <VStack
          gap={3}
          width="100%"
          className="px-4 pt-4 pb-[calc(var(--spacing-8)+env(safe-area-inset-bottom))]"
        >
          {isEditing ? (
            <DayPostForm
              record={record}
              isSaving={isSaving}
              onCancel={() => setIsEditing(false)}
              onSave={async (title, content) => {
                if (await onSave(title, content)) setIsEditing(false)
              }}
            />
          ) : record.title || record.content ? (
            <VStack gap={2} width="100%">
              <HStack gap={2} vAlign="start" width="100%">
                <VStack gap={2} className="min-w-0 flex-1">
                  {record.title && <Heading level={2}>{record.title}</Heading>}
                  {record.content && (
                    <Text className="leading-relaxed wrap-anywhere whitespace-pre-wrap">
                      {record.content}
                    </Text>
                  )}
                </VStack>
                <IconButton
                  label="제목과 내용 고치기"
                  variant="ghost"
                  size="sm"
                  icon={<PenLine className="size-4" />}
                  onClick={() => setIsEditing(true)}
                />
              </HStack>
            </VStack>
          ) : (
            <Button
              label="이날의 이야기 남기기"
              variant="secondary"
              width="100%"
              icon={<PenLine className="size-4" />}
              onClick={() => setIsEditing(true)}
            />
          )}
        </VStack>
      </VStack>

      <DayPhotoViewer
        media={photos.map((photo, index) => ({
          src: photo.fullUrl,
          alt: `${formatEventDate(record.date)} 사진 ${index + 1}`,
          caption: record.title ?? undefined,
        }))}
        index={viewerIndex}
        onIndexChange={setViewerIndex}
      />
    </VStack>
  )
}

function DayPostForm({
  record,
  isSaving,
  onCancel,
  onSave,
}: {
  record: DayRecord
  isSaving: boolean
  onCancel: () => void
  onSave: (title: string | null, content: string | null) => Promise<void>
}) {
  const [title, setTitle] = useState(record.title ?? '')
  const [content, setContent] = useState(record.content ?? '')

  const trimmedTitle = title.trim()
  const trimmedContent = content.trim()
  const isTitleTooLong = trimmedTitle.length > DAY_TITLE_MAX
  const isContentTooLong = trimmedContent.length > DAY_CONTENT_MAX

  // 사진이 화면을 거의 채워서, 그대로 두면 입력칸이 화면 아래에 숨는다.
  const formRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // 창이 열리며 첫 버튼으로 포커스를 옮길 때 스크롤이 맨 위로 되돌아가므로
    // 그 뒤로 미룬다.
    const timer = window.setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }, 150)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <VStack ref={formRef} gap={3} width="100%">
      <TextInput
        label="제목"
        isLabelHidden
        htmlName="day-post-title"
        placeholder="제목"
        size="lg"
        status={
          isTitleTooLong ? { type: 'error', message: `${DAY_TITLE_MAX}자까지 쓸 수 있어요.` } : undefined
        }
        value={title}
        onChange={setTitle}
      />
      <TextArea
        label="내용"
        isLabelHidden
        placeholder="이날 어떤 일이 있었나요?"
        rows={6}
        maxLength={DAY_CONTENT_MAX}
        status={
          isContentTooLong
            ? { type: 'error', message: `${DAY_CONTENT_MAX}자까지 쓸 수 있어요.` }
            : undefined
        }
        value={content}
        onChange={setContent}
      />
      <HStack gap={2} width="100%">
        <Button
          label="취소"
          variant="secondary"
          width="100%"
          isDisabled={isSaving}
          onClick={onCancel}
        />
        <Button
          label="저장"
          variant="primary"
          width="100%"
          isLoading={isSaving}
          isDisabled={isTitleTooLong || isContentTooLong}
          onClick={() => void onSave(trimmedTitle || null, trimmedContent || null)}
        />
      </HStack>
    </VStack>
  )
}
