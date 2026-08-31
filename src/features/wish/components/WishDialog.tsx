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
import { Minus, Ticket } from 'lucide-react'
import { useState, type FormEvent } from 'react'

import type { Partner } from '@/features/couple/api/partner'
import {
  createWish,
  notifyWish,
  notifyWishQuotaRequest,
  requestWishQuotaAdd,
  resolveWishQuotaRequest,
  setWishTotal,
  WishError,
  type WishNotifyResult,
} from '../api/wish'
import { wishDateLabel, wishOwnerName } from '../board'
import { WISH_CONTENT_MAX, type Wish, type WishQuotaRequest, type WishStatus } from '../types'
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
  /** 아직 응답하지 않은 소원권 추가 요청 전부. 승인·거절된 것은 여기 없다. */
  quotaRequests: WishQuotaRequest[]
  /** 소원이나 장수, 요청이 바뀌었을 때 — 위젯의 현황판까지 같이 다시 읽는다. */
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
  quotaRequests,
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

  // 내가 응답해야 하는 요청(상대가 만든 요청)이 있으면 접어두지 않는다 —
  // 알림을 놓쳤더라도 다이얼로그를 열자마자 보여야 승인/거절을 잊지 않는다.
  const hasActionableRequest = quotaRequests.some((request) => request.requested_by !== userId)

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

                      평소엔 접어둔다. 어쩌다 한 번 정하는 것이라 펼쳐두면 소원을
                      쓰러 올 때마다 길을 막는다 — 다만 내가 응답해야 하는 요청이
                      있으면 그건 예외다 (hasActionableRequest). */}
                  <Collapsible
                    defaultIsOpen={hasActionableRequest}
                    trigger={<Text weight="medium">소원권 장수 정하기</Text>}
                  >
                    <WishQuotaSection
                      coupleId={coupleId}
                      userId={userId}
                      mine={mine}
                      theirs={theirs}
                      quotaRequests={quotaRequests}
                      partnerName={partner?.name}
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

interface WishQuotaSectionProps {
  coupleId: string
  userId: string
  mine: WishStatus
  theirs: WishStatus | null
  /** 아직 응답하지 않은 요청 전부 (couple 범위, status는 항상 pending). */
  quotaRequests: WishQuotaRequest[]
  partnerName: string | null | undefined
  onChanged: () => Promise<void>
}

/**
 * 두 사람의 소원권 장수를 다룬다 — **줄이는 건 즉시, 늘리는 건 요청+승인**이다.
 *
 * 줄이는 쪽에 상대의 동의가 필요 없는 이유: 자기 부담(상대에게 부탁받을 수
 * 있는 최대치)을 스스로 줄이는 것뿐이라 약속을 깨는 일이 아니다. 반면 늘리는
 * 쪽은 "앞으로 이만큼 더 부탁할 수 있다"는 새 약속이라, 상대가 모르는 새
 * 조용히 늘어나면 안 된다 — DB도 승인 없는 늘림은 막는다
 * (schema.sql의 check_wish_total_increase_requires_approval).
 */
function WishQuotaSection({
  coupleId,
  userId,
  mine,
  theirs,
  quotaRequests,
  partnerName,
  onChanged,
}: WishQuotaSectionProps) {
  return (
    <VStack gap={4}>
      <VStack gap={3}>
        <WishQuotaRow
          coupleId={coupleId}
          userId={userId}
          status={mine}
          hasPendingRequest={quotaRequests.some(
            (request) => request.target_owner_id === mine.ownerId,
          )}
          onChanged={onChanged}
        />
        {theirs && (
          <WishQuotaRow
            coupleId={coupleId}
            userId={userId}
            status={theirs}
            hasPendingRequest={quotaRequests.some(
              (request) => request.target_owner_id === theirs.ownerId,
            )}
            onChanged={onChanged}
          />
        )}
      </VStack>

      <WishQuotaRequestList
        requests={quotaRequests}
        userId={userId}
        partnerName={partnerName}
        onChanged={onChanged}
      />
    </VStack>
  )
}

interface WishQuotaRowProps {
  coupleId: string
  userId: string
  status: WishStatus
  /** 이 사람 앞으로 이미 대기 중인 요청이 있으면 추가 요청 버튼을 잠근다 —
      DB의 부분 유니크 인덱스가 어차피 막지만, 눌러보고 에러를 보는 것보다
      버튼이 미리 잠기는 편이 낫다. */
  hasPendingRequest: boolean
  onChanged: () => Promise<void>
}

/** 한 사람의 장수 한 줄 — 줄이는 버튼과 "추가 요청" 버튼. */
function WishQuotaRow({ coupleId, userId, status, hasPendingRequest, onChanged }: WishQuotaRowProps) {
  const showToast = useToast()
  const canDecrease = status.total > status.used

  // 줄이는 쪽은 누르면 바로 반영한다. 알릴 상대도, 지킬 약속도 없는 즉시
  // 반영이라 늘리는 쪽처럼 여러 번 눌러 모았다가 한 번에 보낼 이유가 없다.
  const decrease = useMutation({
    mutationFn: () => setWishTotal(coupleId, status.ownerId, userId, status.total - 1),
    onSuccess: onChanged,
    onError: (error) => {
      showToast({
        type: 'error',
        body: error instanceof Error ? error.message : '장수를 줄이지 못했어요.',
      })
      void onChanged()
    },
  })

  // 요청을 만든 뒤 상대에게 알린다. 알림은 던지지 않으므로(notifyWishQuotaRequest)
  // 여기까지 오면 요청은 이미 저장된 것이다 (creation 뮤테이션과 같은 모양).
  const request = useMutation({
    mutationFn: async () => {
      const row = await requestWishQuotaAdd(status.ownerId)
      return notifyWishQuotaRequest(row.id)
    },
    onSuccess: async (notified) => {
      await onChanged()
      showToast({
        type: 'info',
        body:
          notified.delivered > 0
            ? `${status.name}의 소원권 추가를 요청했어요. 상대방에게 전했어요.`
            : `${status.name}의 소원권 추가를 요청했어요. 다만 상대방 기기에 닿지 않았어요.`,
      })
    },
    onError: (error) => {
      showToast({
        type: 'error',
        body: error instanceof WishError ? error.message : '요청을 보내지 못했어요.',
      })
      void onChanged()
    },
  })

  return (
    <HStack gap={2} hAlign="between" vAlign="center">
      <VStack gap={0}>
        <Text weight="medium">{status.name}의 소원권</Text>
        <Text type="supporting">
          {status.total}장{status.used > 0 ? ` · 이미 ${status.used}장을 썼어요` : ''}
        </Text>
      </VStack>

      <HStack gap={2} vAlign="center">
        <IconButton
          label={`${status.name}의 소원권 한 장 줄이기`}
          tooltip={canDecrease ? '한 장 줄이기' : '이미 쓴 장수보다 줄일 수 없어요'}
          variant="secondary"
          size="sm"
          icon={<Minus className="size-4" />}
          isDisabled={!canDecrease || decrease.isPending}
          onClick={() => decrease.mutate()}
        />
        <Button
          type="button"
          label={hasPendingRequest ? `${status.name}의 소원권 추가 요청 중` : `${status.name}의 소원권 추가 요청`}
          variant="secondary"
          size="sm"
          isDisabled={hasPendingRequest}
          isLoading={request.isPending}
          onClick={() => request.mutate()}
        />
      </HStack>
    </HStack>
  )
}

interface WishQuotaRequestListProps {
  requests: WishQuotaRequest[]
  userId: string
  partnerName: string | null | undefined
  onChanged: () => Promise<void>
}

/**
 * 아직 응답하지 않은 소원권 추가 요청 목록 — 추가 요청 버튼 바로 아래다.
 *
 * `requests`는 애초에 `status = 'pending'`만 읽어온 것이라
 * (listPendingWishQuotaRequests) 이미 승인·거절된 요청은 여기 올 일이 없다 —
 * 화면이 따로 걸러낼 필요가 없다.
 */
function WishQuotaRequestList({ requests, userId, partnerName, onChanged }: WishQuotaRequestListProps) {
  if (requests.length === 0) {
    return (
      <EmptyState
        isCompact
        title="대기 중인 요청이 없어요"
        description="추가 요청을 보내면 여기 뜨고, 상대방이 응답하면 사라져요."
      />
    )
  }

  return (
    <VStack gap={2}>
      <Text weight="medium">소원권 추가 요청</Text>
      <List hasDividers>
        {requests.map((request) => (
          <WishQuotaRequestListItem
            key={request.id}
            request={request}
            userId={userId}
            partnerName={partnerName}
            onChanged={onChanged}
          />
        ))}
      </List>
    </VStack>
  )
}

interface WishQuotaRequestListItemProps {
  request: WishQuotaRequest
  userId: string
  partnerName: string | null | undefined
  onChanged: () => Promise<void>
}

/**
 * 요청 한 줄.
 *
 * 내가 응답해야 하는 요청(상대가 만든 것)에만 승인/거절 버튼이 붙는다 — 내가
 * 만든 요청은 상대의 응답을 기다리는 중이라는 말만 보여준다.
 * resolve_wish_quota_request가 요청한 사람의 응답 자체를 막으므로 버튼을
 * 보여줘도 눌러지지 않는데, 그럴 바엔 처음부터 안 보이는 편이 낫다.
 */
function WishQuotaRequestListItem({
  request,
  userId,
  partnerName,
  onChanged,
}: WishQuotaRequestListItemProps) {
  const showToast = useToast()
  const isMine = request.requested_by === userId
  const requesterLabel = wishOwnerName(request.requested_by, userId, partnerName)
  const targetLabel = wishOwnerName(request.target_owner_id, userId, partnerName)

  const label =
    request.target_owner_id === request.requested_by
      ? `${requesterLabel}의 소원권을 1장 늘려달라는 요청`
      : `${requesterLabel}이 ${targetLabel}의 소원권을 1장 늘려주겠다는 요청`

  const resolve = useMutation({
    mutationFn: (approve: boolean) => resolveWishQuotaRequest(request.id, approve),
    onSuccess: async (_row, approve) => {
      await onChanged()
      showToast({ type: 'info', body: approve ? '요청을 승인했어요.' : '요청을 거절했어요.' })
    },
    onError: (error) => {
      showToast({
        type: 'error',
        body: error instanceof WishError ? error.message : '응답하지 못했어요.',
      })
      void onChanged()
    },
  })

  return (
    <ListItem
      label={label}
      description={
        isMine ? '상대방의 응답을 기다리는 중이에요.' : wishDateLabel(request.created_at)
      }
      endContent={
        isMine ? undefined : (
          <HStack gap={2}>
            <Button
              type="button"
              label="거절"
              variant="secondary"
              size="sm"
              isDisabled={resolve.isPending}
              onClick={() => resolve.mutate(false)}
            />
            <Button
              type="button"
              label="승인"
              variant="primary"
              size="sm"
              isDisabled={resolve.isPending}
              onClick={() => resolve.mutate(true)}
            />
          </HStack>
        )
      }
    />
  )
}
