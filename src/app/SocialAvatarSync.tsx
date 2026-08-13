import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'

import { useAuth } from '@/features/auth'
import { socialAvatar } from '@/features/me/socialAvatar'
import { getProfile, updateProfile } from '@/features/onboarding/api/profile'

/**
 * 소셜 프로필 사진을 조용히 최신으로 맞춘다.
 *
 * 카카오에서 사진을 바꾸면 제공자는 **새 주소**를 발급한다. 우리가 저장해 둔
 * 주소는 옛 사진을 가리킨 채로 남고, 상대방 화면에서는 그 사람이 직접 뭔가를
 * 누르기 전까지 옛 사진이 보인다 (게다가 옛 주소가 언제까지 살아 있는지는
 * 제공자 마음이라, 만료되면 사진이 아예 사라진다). 세션에는 로그인할 때마다
 * 최신 값이 실려 오므로 그걸 프로필에 옮겨 적는다.
 *
 * **`avatar_source === 'social'`일 때만 손댄다.** 직접 올린 사진을 덮으면
 * 그건 고쳐준 게 아니라 뺏은 것이다. 출처를 주소로 추측하지 않고 컬럼에
 * 적어두는 이유가 이것이다 (supabase/schema.sql의 profiles.avatar_source).
 * 출처가 null(모름)일 때도 건드리지 않는다 — 모르면 두는 쪽이 안전하다.
 *
 * AppMetaSync 옆에 두는 이유: 어느 화면에서 앱을 열든 한 번은 돌아야 한다.
 * 홈 화면 아이콘도 이 값을 보므로, 갱신되면 아이콘까지 따라온다.
 */
export function SocialAvatarSync() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const { data: profile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: () => getProfile(user!.id),
    enabled: user != null,
  })

  // 한 번 쓰고 나면 프로필 캐시가 갱신되어 조건이 저절로 꺼지지만, 그 사이
  // 렌더가 겹치면 같은 PATCH가 두 번 나간다. 이미 시도한 주소를 기억해 둔다.
  const attemptedUrl = useRef<string | null>(null)

  useEffect(() => {
    if (user == null || profile == null) return
    if (profile.avatar_source !== 'social') return

    const social = socialAvatar(user)
    if (social == null) return
    if (social.url === profile.avatar_url) return
    if (attemptedUrl.current === social.url) return

    attemptedUrl.current = social.url

    void updateProfile(user.id, { avatar_url: social.url, avatar_source: 'social' })
      .then(() => queryClient.invalidateQueries({ queryKey: ['profile', user.id] }))
      .catch(() => {
        // 조용히 넘어간다. 사용자가 시킨 일이 아니라 우리가 알아서 맞추는
        // 일이라, 실패했다고 화면에 띄우면 영문 모를 에러가 된다. 다음 실행
        // 때 다시 시도된다.
      })
  }, [user, profile, queryClient])

  return null
}
