export const DEFAULT_AVATAR_EMOJIS = [
  '💕', '💖', '💗', '💘', '💝', '🥰', '😍', '😻',
  '🐻', '🐰', '🦊', '🐼', '🦋', '🌸', '🍑', '⭐️',
]

export function pickRandomAvatarEmoji() {
  return DEFAULT_AVATAR_EMOJIS[Math.floor(Math.random() * DEFAULT_AVATAR_EMOJIS.length)]
}
