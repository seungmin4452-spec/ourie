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
  /** 버튼 아래 한 줄 설명. */
  description: string
  /** Puter(나노바나나)에 보낼 프롬프트. 항상 "얼굴을 유지하라"는 지시를 포함한다. */
  prompt: string
}

export const AI_AVATAR_THEMES: readonly AiAvatarTheme[] = [
  {
    id: 'ghibli',
    title: '지브리풍',
    description: '따뜻한 손그림 애니메이션 느낌으로',
    prompt:
      '이 사진 속 사람(들)을 지브리 스튜디오 애니메이션 스타일의 손그림 일러스트로 바꿔줘. ' +
      '원래 사진 속 사람들의 얼굴과 표정, 인원 수는 그대로 알아볼 수 있게 유지하고, ' +
      '배경도 같은 분위기의 일러스트로 함께 바꿔줘.',
  },
  {
    id: 'watercolor',
    title: '수채화',
    description: '번지는 수채 물감 느낌으로',
    prompt:
      '이 사진 속 사람(들)을 수채화 물감으로 그린 그림처럼 바꿔줘. ' +
      '붓터치와 색이 은은하게 번지는 느낌을 살리되, 원래 사진 속 사람들의 얼굴과 ' +
      '표정은 그대로 알아볼 수 있게 유지해줘.',
  },
  {
    id: 'pixar',
    title: '픽사풍',
    description: '입체감 있는 3D 애니메이션 느낌으로',
    prompt:
      '이 사진 속 사람(들)을 픽사 애니메이션 영화에 나올 법한 3D 캐릭터 스타일로 ' +
      '바꿔줘. 원래 얼굴의 특징과 표정, 분위기는 그대로 알아볼 수 있게 유지해줘.',
  },
  {
    id: 'oil-painting',
    title: '유화',
    description: '붓터치가 느껴지는 유화 느낌으로',
    prompt:
      '이 사진 속 사람(들)을 캔버스에 유화 물감으로 그린 초상화처럼 바꿔줘. ' +
      '붓터치가 도드라지는 화풍으로 바꾸되, 원래 사진 속 사람들의 얼굴과 표정은 ' +
      '그대로 알아볼 수 있게 유지해줘.',
  },
] as const

export function findAiAvatarTheme(id: string): AiAvatarTheme | undefined {
  return AI_AVATAR_THEMES.find((theme) => theme.id === id)
}
