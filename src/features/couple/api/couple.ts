import { supabase } from '@/lib/supabase'
import type { CoupleInvite } from '../types'

// Excludes visually ambiguous characters (0/O, 1/I).
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 6
const POSTGRES_UNIQUE_VIOLATION = '23505'

// Must match the 1-hour window enforced in public.join_couple (supabase/schema.sql).
export const INVITE_CODE_TTL_MS = 60 * 60 * 1000

function generateInviteCode(): string {
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  }
  return code
}

async function getPendingInvite(userId: string): Promise<CoupleInvite | null> {
  const notExpiredSince = new Date(Date.now() - INVITE_CODE_TTL_MS).toISOString()
  const { data, error } = await supabase
    .from('couples')
    .select('id, invite_code, created_at')
    .eq('user_a', userId)
    .is('user_b', null)
    .gt('created_at', notExpiredSince)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

// Get-or-create: reuses an existing not-yet-expired invite so revisiting
// this screen doesn't spawn a new code (and orphan the old couples row).
// Once the reused code would be older than INVITE_CODE_TTL_MS, this mints a
// fresh one instead -- see INVITE_CODE_TTL_MS above.
export async function createInviteCode(userId: string): Promise<CoupleInvite> {
  const existing = await getPendingInvite(userId)
  if (existing) return existing

  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabase
      .from('couples')
      .insert({ user_a: userId, invite_code: generateInviteCode() })
      .select('id, invite_code, created_at')
      .single()
    if (!error) return data
    if (error.code !== POSTGRES_UNIQUE_VIOLATION) throw error
  }
  throw new Error('초대 코드를 생성하지 못했어요. 다시 시도해주세요.')
}

export async function joinCoupleByCode(code: string): Promise<string> {
  const { data, error } = await supabase.rpc('join_couple', {
    p_invite_code: code.trim().toUpperCase(),
  })
  if (error) throw error
  return data as string
}

/**
 * 이 커플 row가 만들어진 시각(=초대 코드를 처음 만든 시각). 정확히 "연결된"
 * 시각은 아니지만(연결 전에도 row가 있다) 그보다 늦을 수 없으므로, 연간
 * 결산이 연도 선택 범위의 하한을 정하는 데는 이걸로 충분하다.
 */
export async function getCoupleCreatedAt(coupleId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('couples')
    .select('created_at')
    .eq('id', coupleId)
    .maybeSingle()
  if (error) throw error
  return data?.created_at ?? null
}
