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
    title: '지브리',
    prompt: `Transform the uploaded photo into a beautiful hand-painted Japanese animated film scene inspired by the warm, whimsical aesthetic of classic Japanese animation.

Preserve the identity and recognizable characteristics of the person in the original photo, including:
- facial structure and proportions
- hairstyle and hair color
- skin tone
- eye shape and color
- clothing and accessories
- pose and overall composition

Reimagine the person as a charming hand-drawn animated character with soft facial features, expressive eyes, natural proportions, delicate linework, and beautifully painted details.

Use a warm watercolor-like color palette, soft natural lighting, subtle textures, gentle shadows, detailed backgrounds, and a nostalgic cinematic atmosphere.

Create a peaceful, emotional, and magical feeling similar to a beautifully illustrated Japanese animated movie.

Keep the original facial expression and emotional feeling as close to the source photo as possible.

Preserve the original composition and important environmental details.

Do not add extra people or objects.
Do not change the person's age or gender.
Do not unnecessarily change the hairstyle, clothing, or accessories.
Do not distort the face, hands, or body proportions.
Do not make the character overly cartoonish.

The final image should feel like a carefully hand-painted frame from a beautiful Japanese animated feature film while remaining clearly recognizable as the person in the original photo.`,
  },
  {
    // id는 'pixar'로 남겨둔다 — 이미 만들어진 기록의 theme_id가 이 값을
    // 그대로 참조하고 있어서, 여기서 바꾸면 예전 기록의 제목이 "아바타"로
    // 떨어진다(findAiAvatarTheme이 못 찾음). 화면에 보이는 이름(title)만
    // "디즈니"로 바꾼다.
    id: 'pixar',
    title: '디즈니',
    prompt: `Transform the uploaded photo into a high-quality Disney-inspired animated movie character portrait.

Preserve the identity and recognizable characteristics of the person in the original photo, including:
- facial structure and proportions
- hairstyle and hair color
- skin tone
- eye shape and color
- clothing and accessories
- pose and overall composition

Reimagine the person as a charming 3D animated character with expressive eyes, soft facial features, polished character design, and a warm cinematic appearance.

Use soft cinematic lighting, subtle depth of field, beautiful colors, detailed hair, smooth skin rendering, and a magical family-friendly animated movie atmosphere.

Keep the person's expression and emotional feeling as close to the original photo as possible.

Do not add extra people or objects.
Do not change the person's age, gender, hairstyle, or clothing unnecessarily.
Do not distort the face or create unnatural facial features.

The final image should look like a professionally produced animated movie character while still clearly resembling the person in the uploaded photo.`,
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
