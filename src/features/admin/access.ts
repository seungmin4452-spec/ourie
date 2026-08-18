/**
 * 관리자 모드에 들어갈 수 있는 계정 하나.
 *
 * DB에 role/admin 컬럼을 두지 않았다 — 운영자가 한 명뿐이라 컬럼 하나를 위해
 * 마이그레이션을 만들 이유가 없다. 대신 이 상수 하나를 client와 server
 * (api/admin/broadcast.ts가 이 파일을 .js로 가져간다)가 같이 본다.
 *
 * **이 파일만으로는 아무것도 막지 않는다.** client 쪽 검사(길게 누르기를
 * 켤지 말지)는 UX일 뿐이고, 진짜 권한 검사는 서버가 토큰을 Supabase에
 * 되물어 나온 이메일로 다시 한다 (api/admin/broadcast.ts 참고) — 클라이언트가
 * 주장하는 값은 아무것도 믿지 않는다.
 */
export const ADMIN_EMAIL = 'seungmin4452@gmail.com'

export function isAdminEmail(email: string | null | undefined): boolean {
  return email === ADMIN_EMAIL
}
