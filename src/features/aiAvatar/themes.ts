/**
 * 위젯이 제안하는 스타일 프리셋들.
 *
 * 자유 프롬프트 입력을 열어두지 않는다 — poke_presets가 알림 문구를 서버에
 * 고정해둔 것과 같은 이유다. 프리셋이 없으면 요청마다 결과 품질이 들쭉날쭉해질
 * 뿐 아니라, 앱 톤과 안 맞는 프롬프트가 그대로 나노바나나에 들어갈 수도 있다.
 * 그래서 사용자는 이 목록 중 하나만 고르고, 실제 프롬프트는 여기서만 나온다.
 */
export interface AiAvatarTheme {
  id: string
  /** 위젯의 주제 버튼에 뜨는 이름. */
  title: string
  /** Puter(나노바나나)에 보낼 프롬프트. 항상 "얼굴을 유지하라"는 지시를 포함한다. */
  prompt: string
}

export const AI_AVATAR_THEMES: readonly AiAvatarTheme[] = [
  {
    id: 'ghibli',
    title: '지브리풍',
    prompt:
      '이 사진 속 사람(들)을 다음 스타일로 완전히 다시 그려줘: Studio Ghibli style, ' +
      '2d anime animation, directed by Hayao Miyazaki, hand-drawn art, beautiful ' +
      'watercolor texture, soft and vibrant colors, cinematic lighting, nostalgic and ' +
      'magical atmosphere, masterpiece, best quality, highres. 사진 같은 사실적 디테일은 ' +
      '남기지 말고, 배경도 원본을 그대로 두지 말고 이 분위기에 어울리는 새로운 배경으로 ' +
      '함께 다시 그려줘. 다만 원래 사진 속 사람들과 같은 사람이라는 걸 알아볼 수 있게 ' +
      '헤어스타일과 전체적인 인상은 유지해줘.',
  },
  {
    id: 'pixar',
    title: '픽사풍',
    prompt:
      '이 사진 속 사람(들)을 다음 스타일로 완전히 다시 그려줘: Pixar style, Disney ' +
      'Pixar, 3d animation, CGI, high quality 3d render, octane render, smooth ' +
      'textures, subsurface scattering, vivid soft colors, cinematic lighting, magical ' +
      'and warm atmosphere, masterpiece, best quality, highres. 사진 같은 사실적 ' +
      '디테일은 남기지 말고, 배경도 원본을 그대로 두지 말고 이 분위기에 어울리는 새로운 ' +
      '배경으로 함께 다시 그려줘. 다만 원래 사진 속 사람들과 같은 사람이라는 걸 알아볼 ' +
      '수 있게 헤어스타일과 전체적인 인상은 유지해줘.',
  },
  {
    id: 'spring',
    title: '우리들의 봄',
    prompt:
      '이 사진 속 사람(들)을 따뜻한 봄 분위기의 일러스트로 바꿔줘. 벚꽃이 흩날리는 ' +
      '배경과 화사한 파스텔톤으로 채우되, 원래 사진 속 사람들의 얼굴과 표정은 그대로 ' +
      '알아볼 수 있게 유지해줘.',
  },
  {
    id: 'summer',
    title: '우리들의 여름',
    prompt:
      '이 사진 속 사람(들)을 싱그러운 여름 분위기의 일러스트로 바꿔줘. 푸른 하늘과 ' +
      '초록빛, 시원한 여름 햇살이 느껴지는 배경으로 채우되, 원래 사진 속 사람들의 ' +
      '얼굴과 표정은 그대로 알아볼 수 있게 유지해줘.',
  },
  {
    id: 'autumn',
    title: '우리들의 가을',
    prompt:
      '이 사진 속 사람(들)을 포근한 가을 분위기의 일러스트로 바꿔줘. 노랗고 붉게 ' +
      '물든 단풍이 있는 배경과 따뜻한 색감으로 채우되, 원래 사진 속 사람들의 얼굴과 ' +
      '표정은 그대로 알아볼 수 있게 유지해줘.',
  },
  {
    id: 'winter',
    title: '우리들의 겨울',
    prompt:
      '이 사진 속 사람(들)을 아늑한 겨울 분위기의 일러스트로 바꿔줘. 하얀 눈이 ' +
      '내리는 배경과 따뜻한 조명이 느껴지는 색감으로 채우되, 원래 사진 속 사람들의 ' +
      '얼굴과 표정은 그대로 알아볼 수 있게 유지해줘.',
  },
] as const

export function findAiAvatarTheme(id: string): AiAvatarTheme | undefined {
  return AI_AVATAR_THEMES.find((theme) => theme.id === id)
}
