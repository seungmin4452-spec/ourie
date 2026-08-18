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
import { Minus, Plus, Ticket } from 'lucide-react'
import { useState, type FormEvent } from 'react'

import type { Partner } from '@/features/couple/api/partner'
import { createWish, notifyWish, setWishTotal, type WishNotifyResult } from '../api/wish'
import { wishDateLabel, wishOwnerName } from '../board'
import { WISH_CONTENT_MAX, WISH_TOTAL_MAX, type Wish, type WishStatus } from '../types'
import { WishMeter } from './WishMeter'

/** 목록에서 접지 않고 바로 보여주는 최근 소원의 수. */
const RECENT_WISH_COUNT = 3

/**
 * 소원권을 쓴 뒤 뭐라고 말할지.
 *
 * **"썼다"와 "닿았다"를 갈라 말한다.** 알림이 못 갔는데 전했다고 하면
 * 거짓말이고, 반대로 실패했다고만 하면 이미 줄어든 장수와 말이 어긋난다.
 * 한 장은 어느 쪽이든 쓰인 것이 맞다 (api/wish.ts의 notifyWish 주석 참고).
 */
function wroteMessage(notified: WishNotifyResult): string {
  if (notified.delivered > 0) return '소원권 한 장을 썼어요. 상대방에게 전했어요.'
  if (notified.reason === 'not_opted_in') {
    return '소원권 한 장을 썼어요. 상대방이 알림을 켜지 않아 전하진 못했어요.'
  }
  // 커플이 없으면 알릴 상대가 없다. 이 화면까지 온 이상 흔한 경우는 아니라
  // 이유를 덧붙이지 않는다.
  if (notified.reason === 'no_couple') return '소원권 한 장을 썼어요.'
  return '소원권 한 장을 썼어요. 다만 상대방 기기에 닿지 않았어요.'
}

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
 * 한 장을 쓰면 남은 장수가 준다. 장수를 고치면 그 숫자도 다시 계산된다.
 * 화면을 나누면 그 인과가 화면 전환 뒤로 숨는다. 그래서 현황 막대를 맨
 * 위에 두고, 아래에서 무엇을 하든 그 막대가 바로 움직이게 했다.
 *
 * 지난 소원은 고치거나 지울 수 없다 — 한 번 상대에게 전한 말이라, 나중에
 * 조용히 바뀌거나 사라지면 상대는 그걸 알 길이 없다. 목록도 최근
 * {@link RECENT_WISH_COUNT}개만 펼쳐 보여주고 나머지는 접어 둔다.
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

  const trimmed = content.trim()
  const canSubmit =
    trimmed.length > 0 && trimmed.length <= WISH_CONTENT_MAX && mine.remaining > 0

  function resetForm() {
    setContent('')
  }

  const creation = useMutation({
    // 소원을 만든 뒤 상대에게 알린다. 알림은 던지지 않으므로(api/wish.ts의
    // notifyWish) 여기까지 오면 소원은 이미 저장된 것이고, 남은 건 그 사실을
    // 어떻게 말하느냐뿐이다.
    mutationFn: async () => {
      const wish = await createWish(coupleId, userId, trimmed)
      return notifyWish(wish.id)
    },
    onSuccess: async (notified) => {
      await onChanged()
      showToast({ type: 'info', body: wroteMessage(notified) })
      // canSubmit이 remaining > 0일 때만 열어주므로, 쓰기 전 remaining이
      // 1이었다면 이 한 장으로 남은 장수가 0이 된 것이다.
      if (mine.remaining === 1) {
        showToast({ type: 'info', body: '소원권 내기를 하자고 쫄라봐~😆' })
      }
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

  /** 닫을 때 폼을 비운다 — 이 컴포넌트는 위젯 안에 계속 붙어 있어 상태가 남는다. */
  function handleOpenChange(nextIsOpen: boolean) {
    if (!nextIsOpen) resetForm()
    onOpenChange(nextIsOpen)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) return
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
                    {/* 한 번 상대에게 전한 말이라 고치거나 지울 수 없다. 최근
                        {RECENT_WISH_COUNT}개만 펼쳐 보여주고, 그 전 것들은
                        접어서 필요할 때만 펼쳐 본다. */}
                    <List hasDividers>
                      {wishes.slice(0, RECENT_WISH_COUNT).map((wish) => (
                        <WishListItem key={wish.id} wish={wish} userId={userId} partner={partner} />
                      ))}
                    </List>

                    {wishes.length > RECENT_WISH_COUNT && (
                      <Collapsible
                        defaultIsOpen={false}
                        trigger={<Text weight="medium">전체 {wishes.length}개 보기</Text>}
                      >
                        <List hasDividers>
                          {wishes.slice(RECENT_WISH_COUNT).map((wish) => (
                            <WishListItem key={wish.id} wish={wish} userId={userId} partner={partner} />
                          ))}
                        </List>
                      </Collapsible>
                    )}
                  </VStack>
                )}

                <Divider />

                <VStack gap={3}>
                  <Heading level={2}>소원권 사용</Heading>

                  <TextArea
                    label="소원 내용"
                    htmlName="wish-content"
                    placeholder="예: 하루 종일 같이 뒹굴거리기"
                    description="적어서 저장하면 소원권 한 장이 쓰인 것으로 기록돼요."
                    isRequired
                    rows={2}
                    maxLength={WISH_CONTENT_MAX}
                    value={content}
                    onChange={setContent}
                  />

                  {/* 알림이 갈지를 **쓰기 전에** 알려준다. 다 쓰고 나서
                      "닿지 않았어요"를 보면 이미 한 장이 줄어든 뒤라, 그때는
                      알아도 되돌릴 수가 없다. */}
                  {partner != null && !partner.poke_opt_in && (
                    <Text type="supporting">
                      {wishOwnerName(partner.id, null, partner.name)}님이 알림을 켜지
                      않아, 소원을 써도 알림은 가지 않아요. 콕 찌르기 위젯의 "상대방이
                      보내는 알림 받기"를 상대방이 켜면 전해져요.
                    </Text>
                  )}

                  {mine.remaining === 0 && (
                    <Text type="supporting">
                      남은 소원권이 없어요. 맨 위의 "소원권 장수 정하기"에서
                      장수를 늘리면 다시 쓸 수 있어요.
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
                  label="소원권 쓰기"
                  variant="primary"
                  isLoading={creation.isPending}
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

interface WishListItemProps {
  wish: Wish
  userId: string
  partner: Partner | null
}

/** 지난 소원 한 줄. 고치거나 지울 수 없어 endContent 없이 내용과 누가/언제만 보여준다. */
function WishListItem({ wish, userId, partner }: WishListItemProps) {
  return (
    <ListItem
      label={wish.content}
      description={`${wishOwnerName(wish.owner_id, userId, partner?.name)} · ${wishDateLabel(wish.created_at)}`}
    />
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
