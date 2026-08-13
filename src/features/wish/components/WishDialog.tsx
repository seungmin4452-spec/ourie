import { Button } from '@astryxdesign/core/Button'
import { Collapsible } from '@astryxdesign/core/Collapsible'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Divider } from '@astryxdesign/core/Divider'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Heading } from '@astryxdesign/core/Heading'
import { HStack } from '@astryxdesign/core/HStack'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { List, ListItem } from '@astryxdesign/core/List'
import { Text } from '@astryxdesign/core/Text'
import { TextArea } from '@astryxdesign/core/TextArea'
import { useToast } from '@astryxdesign/core/Toast'
import { VStack } from '@astryxdesign/core/VStack'
import { useMutation } from '@tanstack/react-query'
import { Check, Minus, Pencil, Plus, Ticket, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'

import type { Partner } from '@/features/couple/api/partner'
import { createWish, deleteWish, setWishTotal, updateWish } from '../api/wish'
import { wishDateLabel, wishOwnerName } from '../board'
import { WISH_CONTENT_MAX, WISH_TOTAL_MAX, type Wish, type WishStatus } from '../types'
import { WishMeter } from './WishMeter'

interface WishDialogProps {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  coupleId: string
  userId: string
  partner: Partner | null
  /** 커플이 쓴 소원 전부, 최신순. */
  wishes: Wish[]
  mine: WishStatus
  /** 커플이 아직 연결되지 않았으면 null. */
  theirs: WishStatus | null
  /** 소원이나 장수가 바뀌었을 때 — 위젯의 현황판까지 같이 다시 읽는다. */
  onChanged: () => Promise<void>
}

/**
 * 소원권을 쓰고, 지난 소원을 보고, 장수를 정하는 화면.
 *
 * 셋을 한 다이얼로그에 모은 이유는 셋이 같은 숫자를 보고 움직이기 때문이다 —
 * 한 장을 쓰면 남은 장수가 줄고, 하나를 지우면 돌아오고, 장수를 고치면 둘 다
 * 다시 계산된다. 화면을 나누면 그 인과가 화면 전환 뒤로 숨는다. 그래서 현황
 * 막대를 맨 위에 두고, 아래에서 무엇을 하든 그 막대가 바로 움직이게 했다.
 *
 * 고치기가 목록이 아니라 아래 폼에서 일어나는 것은 콕 찌르기 다이얼로그와
 * 같은 방식이다 (PokePresetDialog 참고) — 고치는 줄이 목록에서 선택 상태로
 * 남아 있어서 무엇을 고치는 중인지 보인다.
 */
export function WishDialog({
  isOpen,
  onOpenChange,
  coupleId,
  userId,
  partner,
  wishes,
  mine,
  theirs,
  onChanged,
}: WishDialogProps) {
  const showToast = useToast()

  const [content, setContent] = useState('')
  /** 고치는 중인 소원의 id. null이면 새로 쓰는 중이다. */
  const [editingId, setEditingId] = useState<string | null>(null)

  const isEditing = editingId != null
  const trimmed = content.trim()
  const canSubmit =
    trimmed.length > 0 &&
    trimmed.length <= WISH_CONTENT_MAX &&
    // 잔량은 새로 쓸 때만 본다. 다 쓴 사람도 이미 적어둔 소원은 고칠 수 있어야
    // 한다 (그때가 오히려 고치고 싶어지는 때다).
    (isEditing || mine.remaining > 0)

  function resetForm() {
    setEditingId(null)
    setContent('')
  }

  const creation = useMutation({
    mutationFn: () => createWish(coupleId, userId, trimmed),
    onSuccess: async () => {
      await onChanged()
      showToast({ type: 'info', body: '소원권 한 장을 썼어요.' })
      resetForm()
    },
    onError: (error) => {
      showToast({
        type: 'error',
        body: error instanceof Error ? error.message : '소원권을 쓰지 못했어요.',
      })
      // 남은 장수가 없다고 막힌 경우는 우리가 들고 있던 숫자가 낡았다는 뜻이다
      // (다른 기기에서 이미 썼다). 다시 읽어 현황판을 맞춘다.
      void onChanged()
    },
  })

  const edit = useMutation({
    mutationFn: (id: string) => updateWish(id, trimmed),
    onSuccess: async () => {
      await onChanged()
      showToast({ type: 'info', body: '소원 내용을 고쳤어요.' })
      resetForm()
    },
    onError: (error) => {
      showToast({
        type: 'error',
        body: error instanceof Error ? error.message : '소원을 고치지 못했어요.',
      })
    },
  })

  const deletion = useMutation({
    mutationFn: (wish: Wish) => deleteWish(wish.id),
    onSuccess: async (_data, wish) => {
      await onChanged()
      // 고치던 소원을 지운 경우. 폼을 그대로 두면 사라진 줄을 계속 고치는
      // 모양이 되고, 저장하면 아무 row도 안 맞는다.
      if (editingId === wish.id) resetForm()
      showToast({ type: 'info', body: '소원권 한 장이 돌아왔어요.' })
    },
    onError: (error) => {
      showToast({
        type: 'error',
        body: error instanceof Error ? error.message : '소원을 지우지 못했어요.',
      })
    },
  })

  const isBusy = creation.isPending || edit.isPending || deletion.isPending

  function startEditing(wish: Wish) {
    setEditingId(wish.id)
    setContent(wish.content)
  }

  /** 닫을 때 폼을 비운다 — 이 컴포넌트는 위젯 안에 계속 붙어 있어 상태가 남는다. */
  function handleOpenChange(nextIsOpen: boolean) {
    if (!nextIsOpen) resetForm()
    onOpenChange(nextIsOpen)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) return
    if (editingId != null) {
      edit.mutate(editingId)
      return
    }
    creation.mutate()
  }

  return (
    <Dialog isOpen={isOpen} onOpenChange={handleOpenChange} purpose="form" width={420}>
      <form onSubmit={handleSubmit}>
        <Layout
          header={
            <DialogHeader title="소원권" onOpenChange={() => handleOpenChange(false)} />
          }
          content={
            <LayoutContent>
              <VStack gap={5}>
                {/* 현황판이 맨 위다. 아래에서 무엇을 하든 이 막대가 바로 움직인다. */}
                <VStack gap={3}>
                  <WishMeter status={mine} />
                  {theirs && <WishMeter status={theirs} />}

                  {/* 장수를 정하는 자리는 **막대 바로 밑**이다. 한때 다이얼로그
                      맨 아래에 뒀는데, 목록과 작성 폼을 다 지나쳐야 나와서 이런
                      게 있는 줄도 모르고 지나쳤다. 바꾸는 숫자 옆에 있어야
                      찾는다 — "몇 장이지?"를 묻는 그 자리가 "몇 장으로 할까?"를
                      묻는 자리이기도 하다.

                      접어두는 것은 그대로다. 어쩌다 한 번 정하는 것이라 펼쳐두면
                      소원을 쓰러 올 때마다 숫자 두 칸이 길을 막는다. */}
                  <Collapsible
                    defaultIsOpen={false}
                    trigger={<Text weight="medium">소원권 장수 정하기</Text>}
                  >
                    <WishTotalForm
                      // 서버 값이 바뀌면(상대가 다른 기기에서 정했다) 새로
                      // 시작한다. 아래 폼은 처음 받은 숫자를 자기 상태로 들고
                      // 있어서, key가 없으면 낡은 숫자를 계속 보여준다.
                      key={`${mine.total}-${theirs?.total ?? 0}`}
                      coupleId={coupleId}
                      userId={userId}
                      mine={mine}
                      theirs={theirs}
                      onChanged={onChanged}
                    />
                  </Collapsible>
                </VStack>

                <Divider />

                {wishes.length === 0 ? (
                  <EmptyState
                    isCompact
                    icon={<Ticket className="size-6" />}
                    title="아직 이루어진 소원이 없어요"
                    description="아래에 소원을 적으면 한 장이 쓰인 것으로 기록돼요."
                  />
                ) : (
                  <VStack gap={2}>
                    <Heading level={2}>이루어진 소원들</Heading>
                    <List hasDividers>
                      {wishes.map((wish) => {
                        const isMine = wish.owner_id === userId
                        return (
                          <ListItem
                            key={wish.id}
                            label={wish.content}
                            description={`${wishOwnerName(wish.owner_id, userId, partner?.name)} · ${wishDateLabel(wish.created_at)}`}
                            isSelected={editingId === wish.id}
                            // 내 소원권만 고치고 지울 수 있다 (RLS도 같다).
                            // 상대가 부탁한 말을 내가 바꿔 적을 수 있으면
                            // 그건 더 이상 상대의 소원이 아니다.
                            endContent={
                              isMine ? (
                                <HStack gap={0.5}>
                                  <IconButton
                                    label="이 소원 고치기"
                                    tooltip="고치기"
                                    variant="ghost"
                                    size="sm"
                                    icon={<Pencil className="size-4" />}
                                    isDisabled={isBusy}
                                    onClick={() => startEditing(wish)}
                                  />
                                  <IconButton
                                    label="이 소원 지우기"
                                    tooltip="지우면 한 장이 돌아와요"
                                    variant="ghost"
                                    size="sm"
                                    icon={<Trash2 className="size-4" />}
                                    isDisabled={isBusy}
                                    onClick={() => deletion.mutate(wish)}
                                  />
                                </HStack>
                              ) : undefined
                            }
                          />
                        )
                      })}
                    </List>
                  </VStack>
                )}

                <Divider />

                <VStack gap={3}>
                  <HStack gap={2} hAlign="between" vAlign="center">
                    <Heading level={2}>{isEditing ? '소원 고치기' : '소원권 사용'}</Heading>
                    {isEditing && (
                      <Button
                        type="button"
                        label="취소"
                        variant="ghost"
                        size="sm"
                        onClick={resetForm}
                      />
                    )}
                  </HStack>

                  <TextArea
                    label="소원 내용"
                    htmlName="wish-content"
                    placeholder="예: 하루 종일 같이 뒹굴거리기"
                    description={
                      isEditing
                        ? '이미 쓴 한 장이라 장수는 그대로예요.'
                        : '적어서 저장하면 소원권 한 장이 쓰인 것으로 기록돼요.'
                    }
                    isRequired
                    rows={2}
                    maxLength={WISH_CONTENT_MAX}
                    value={content}
                    onChange={setContent}
                  />

                  {!isEditing && mine.remaining === 0 && (
                    <Text type="supporting">
                      남은 소원권이 없어요. 쓴 소원을 하나 지우거나, 맨 위의
                      "소원권 장수 정하기"에서 장수를 늘리면 다시 쓸 수 있어요.
                    </Text>
                  )}
                </VStack>
              </VStack>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack gap={2} hAlign="center" justify="end">
                <Button
                  type="button"
                  label="닫기"
                  variant="secondary"
                  onClick={() => handleOpenChange(false)}
                />
                <Button
                  type="submit"
                  label={isEditing ? '저장' : '소원권 쓰기'}
                  variant="primary"
                  // 고치는 중에는 지니가 아니라 체크다 — 새로 비는 소원이
                  // 아니라 이미 빈 소원의 문장을 손보는 것이다.
                  icon={isEditing ? <Check className="size-4" /> : '🧞'}
                  isLoading={creation.isPending || edit.isPending}
                  isDisabled={!canSubmit}
                />
              </HStack>
            </LayoutFooter>
          }
        />
      </form>
    </Dialog>
  )
}

interface WishTotalFormProps {
  coupleId: string
  userId: string
  mine: WishStatus
  theirs: WishStatus | null
  onChanged: () => Promise<void>
}

/**
 * 두 사람의 총 장수를 정한다.
 *
 * 내 장수만이 아니라 상대의 장수도 여기서 정할 수 있다. 소원권은 "몇 장씩
 * 갖자"는 둘 사이의 약속이라, 각자 자기 것만 정할 수 있으면 그건 약속이
 * 아니라 자기 신고가 된다 (RLS도 커플 범위다).
 *
 * 저장 버튼이 따로 있는 이유: 숫자를 올릴 때마다 요청이 나가면 5장에서 12장으로
 * 가는 길에 일곱 번을 쓰게 된다. 바꾼 사람 몫만 골라 한 번에 보낸다.
 */
function WishTotalForm({ coupleId, userId, mine, theirs, onChanged }: WishTotalFormProps) {
  const showToast = useToast()
  const [myTotal, setMyTotal] = useState(mine.total)
  const [theirTotal, setTheirTotal] = useState(theirs?.total ?? 0)

  const isDirty = myTotal !== mine.total || (theirs != null && theirTotal !== theirs.total)

  const save = useMutation({
    mutationFn: async () => {
      if (myTotal !== mine.total) {
        await setWishTotal(coupleId, mine.ownerId, userId, myTotal)
      }
      if (theirs != null && theirTotal !== theirs.total) {
        await setWishTotal(coupleId, theirs.ownerId, userId, theirTotal)
      }
    },
    onSuccess: async () => {
      await onChanged()
      showToast({ type: 'info', body: '소원권 장수를 정했어요.' })
    },
    onError: async (error) => {
      showToast({
        type: 'error',
        body: error instanceof Error ? error.message : '장수를 정하지 못했어요.',
      })
      // 한쪽만 저장되고 다른 쪽이 막혔을 수 있다. 서버 값으로 되돌려 화면에
      // 실제 상태가 남게 한다.
      await onChanged()
      setMyTotal(mine.total)
      setTheirTotal(theirs?.total ?? 0)
    },
  })

  return (
    <VStack gap={3}>
      <WishTotalStepper status={mine} value={myTotal} onChange={setMyTotal} />
      {theirs && (
        <WishTotalStepper status={theirs} value={theirTotal} onChange={setTheirTotal} />
      )}

      {/* 바깥 form의 submit이 되지 않도록 type을 못 박는다 — 그쪽은 소원을 쓴다. */}
      <Button
        type="button"
        label="장수 저장"
        variant="secondary"
        width="100%"
        isDisabled={!isDirty}
        isLoading={save.isPending}
        onClick={() => save.mutate()}
      />
    </VStack>
  )
}

interface WishTotalStepperProps {
  status: WishStatus
  value: number
  onChange: (next: number) => void
}

/**
 * 한 사람의 장수를 −/+ 버튼으로 정한다.
 *
 * 숫자 입력칸이 아닌 이유: 여기서 바뀌는 값은 대개 한두 장이고, 모바일에서
 * 숫자칸을 누르면 키보드가 올라와 다이얼로그의 절반을 덮는다. 눌러서 세는
 * 쪽이 "소원권을 한 장 더 준다"는 행동에도 더 가깝다.
 *
 * 아래로는 **이미 쓴 장수**가 바닥이다. DB도 같은 것을 막지만
 * (check_wish_total), 눌러보고 에러를 보는 것보다 버튼이 잠기는 편이 낫다.
 */
function WishTotalStepper({ status, value, onChange }: WishTotalStepperProps) {
  const canDecrease = value > status.used
  const canIncrease = value < WISH_TOTAL_MAX

  return (
    <HStack gap={2} hAlign="between" vAlign="center">
      <VStack gap={0}>
        <Text weight="medium">{status.name}의 소원권</Text>
        {status.used > 0 && (
          <Text type="supporting">이미 {status.used}장을 썼어요</Text>
        )}
      </VStack>

      <HStack gap={1} vAlign="center">
        <IconButton
          label={`${status.name}의 소원권 한 장 줄이기`}
          tooltip={canDecrease ? '한 장 줄이기' : '이미 쓴 장수보다 줄일 수 없어요'}
          variant="secondary"
          size="sm"
          icon={<Minus className="size-4" />}
          isDisabled={!canDecrease}
          onClick={() => onChange(value - 1)}
        />
        {/* 숫자 자리를 고정한다. 폭이 내용에 따라 변하면 −/+ 버튼이 5장과
            12장 사이를 오갈 때마다 좌우로 흔들려 연달아 누르기 어렵다. */}
        <HStack width={52} hAlign="center">
          <Text weight="semibold" hasTabularNumbers>
            {value}장
          </Text>
        </HStack>
        <IconButton
          label={`${status.name}의 소원권 한 장 늘리기`}
          tooltip={canIncrease ? '한 장 늘리기' : `${WISH_TOTAL_MAX}장까지 정할 수 있어요`}
          variant="secondary"
          size="sm"
          icon={<Plus className="size-4" />}
          isDisabled={!canIncrease}
          onClick={() => onChange(value + 1)}
        />
      </HStack>
    </HStack>
  )
}
