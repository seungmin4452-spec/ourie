import { Button } from '@astryxdesign/core/Button'
import { TextArea } from '@astryxdesign/core/TextArea'
import { TextInput } from '@astryxdesign/core/TextInput'
import { useToast } from '@astryxdesign/core/Toast'
import { VStack } from '@astryxdesign/core/VStack'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import { sendBroadcast } from '../api/broadcast'
import { BROADCAST_BODY_MAX, BROADCAST_TITLE_MAX } from '../limits'

/**
 * 관리자 위젯 "전체 알림" — 가입자 전체에게 지금 바로 푸시 알림을 보낸다.
 *
 * 이 화면 자체가 이미 서버에서 계정으로 막혀 있는 단일 운영자용 도구라,
 * 앱의 다른 발송 버튼(콕 찌르기·소원권)과 같은 수준의 마찰로 맞췄다 — 별도
 * 확인 다이얼로그는 두지 않는다.
 */
export function BroadcastWidget() {
  const showToast = useToast()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [url, setUrl] = useState('')

  const trimmedTitle = title.trim()
  const trimmedBody = body.trim()
  const canSubmit =
    trimmedTitle.length > 0 &&
    trimmedTitle.length <= BROADCAST_TITLE_MAX &&
    trimmedBody.length > 0 &&
    trimmedBody.length <= BROADCAST_BODY_MAX

  const send = useMutation({
    mutationFn: () =>
      sendBroadcast({ title: trimmedTitle, body: trimmedBody, url: url.trim() || undefined }),
    onSuccess: (result) => {
      showToast({
        type: 'info',
        body: `${result.total}명 중 ${result.delivered}명에게 보냈어요.`,
      })
      setTitle('')
      setBody('')
      setUrl('')
    },
    onError: (error) => {
      showToast({
        type: 'error',
        body: error instanceof Error ? error.message : '알림을 보내지 못했어요.',
      })
    },
  })

  return (
    <VStack gap={3}>
      <TextInput
        label="제목"
        htmlName="broadcast-title"
        placeholder="예: 새 기능이 나왔어요"
        isRequired
        value={title}
        onChange={setTitle}
      />
      <TextArea
        label="본문"
        htmlName="broadcast-body"
        placeholder="예: 소원권 위젯이 추가됐어요. 확인해보세요!"
        isRequired
        rows={3}
        maxLength={BROADCAST_BODY_MAX}
        value={body}
        onChange={setBody}
      />
      <TextInput
        label="눌렀을 때 열릴 경로"
        htmlName="broadcast-url"
        placeholder="/"
        isOptional
        description="비워두면 홈으로 열려요."
        value={url}
        onChange={setUrl}
      />
      <Button
        label="지금 모두에게 보내기"
        variant="primary"
        width="100%"
        isDisabled={!canSubmit}
        isLoading={send.isPending}
        onClick={() => send.mutate()}
      />
    </VStack>
  )
}
