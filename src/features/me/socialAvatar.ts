import type { User } from '@supabase/supabase-js'

/**
 * 소셜 로그인이 준 프로필 사진을 세션에서 꺼낸다.
 *
 * 가입 트리거(handle_new_user)가 이미 같은 값을 profiles에 넣지만, 그건
 * **가입할 때 한 번**이다. 그 뒤 꾸미기에서 직접 사진을 올렸거나, 사진이
 * 안 뜨던 시절(아래 https 주석)에 가입한 사람은 지금 프로필에 소셜 사진이
 * 없다. 세션에는 로그인할 때마다 최신 값이 실려 오므로, 여기서 꺼내 쓰면
 * "지금 다시 가져오기"를 만들 수 있다.
 *
 * 자동으로 덮어쓰지 않는 이유: 직접 올린 사진이 로그인할 때마다 지워지면
 * 그건 고쳐준 게 아니라 뺏은 것이다. 가져올지는 사람이 정한다.
 */

const PROVIDER_LABELS: Record<string, string> = {
  kakao: '카카오',
  google: '구글',
}

export interface SocialAvatar {
  /** https로 정규화된 사진 주소. */
  url: string
  /** "카카오" 같은 제공자 이름. 모르는 제공자면 "소셜". */
  providerLabel: string
}

export function socialAvatar(user: User | null | undefined): SocialAvatar | null {
  if (!user) return null

  const meta = user.user_metadata ?? {}
  // 키 이름이 제공자마다 제각각이라 둘을 본다 (가입 트리거의 coalesce와 같은 순서).
  const raw = [meta.avatar_url, meta.picture].find(
    (value): value is string => typeof value === 'string' && value.trim() !== '',
  )
  if (!raw) return null

  // **카카오는 주소를 http로 준다.** https 페이지에서 http 이미지는 혼합
  // 콘텐츠로 막히고, 깨진 이미지가 뜨는 것도 아니라 조용히 사라진다.
  // kakaocdn은 https로도 같은 파일을 주므로 스킴만 올린다 (DB 쪽에서도 같은
  // 일을 한다 — supabase/migrations/2026-08-13-social-avatar-https.sql).
  const url = raw.trim().replace(/^http:\/\//, 'https://')

  const provider = user.app_metadata?.provider
  return {
    url,
    providerLabel: (provider && PROVIDER_LABELS[provider]) || '소셜',
  }
}
