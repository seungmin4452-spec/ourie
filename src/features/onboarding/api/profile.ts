import { supabase } from '@/lib/supabase'

export interface Profile {
  id: string
  couple_id: string | null
  nickname: string | null
  avatar_url: string | null
  /** 상대방이 보내는 콕 찌르기 알림을 받겠다는 동의. src/features/poke 참고. */
  poke_opt_in: boolean
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, couple_id, nickname, avatar_url, poke_opt_in')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function uploadAvatar(userId: string, file: File): Promise<string> {
  const fileExt = file.name.split('.').pop() ?? 'jpg'
  const path = `${userId}/avatar-${Date.now()}.${fileExt}`

  const { error: uploadError } = await supabase.storage
    .from('profile-avatars')
    .upload(path, file, { upsert: true })
  if (uploadError) throw uploadError

  const { data } = supabase.storage.from('profile-avatars').getPublicUrl(path)
  return data.publicUrl
}

export async function updateProfile(
  userId: string,
  updates: { nickname?: string; avatar_url?: string },
) {
  // upsert, not update: some accounts don't have a profiles row yet (e.g. the
  // handle_new_user signup trigger not having run for them), and .update()
  // silently succeeds with zero rows affected when there's nothing to match.
  const { error } = await supabase
    .from('profiles')
    .upsert({ id: userId, ...updates })
  if (error) throw error
}
