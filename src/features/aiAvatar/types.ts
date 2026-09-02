/**
 * AI 이미지 생성 — 커플 사진을 고정된 스타일 하나로 바꿔주는 위젯.
 *
 * 생성은 서버를 거치지 않고 브라우저가 Puter(무료 공용 계정)를 직접 부른다 —
 * 이유는 hooks/useGenerateAiAvatar.ts 머리말 참고. 이 테이블은 그 결과가
 * "무엇을, 언제 만들었는지"만 남긴다.
 */
export interface AiAvatarGeneration {
  id: string
  couple_id: string
  requested_by: string
  /** themes.ts 프리셋의 id. */
  theme_id: string
  /** `ai-avatars` 버킷 안의 경로. */
  storage_path: string
  created_at: string
}
