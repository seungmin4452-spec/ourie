import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { useState } from 'react'

type Platform = 'android' | 'ios'

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'android'
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ? 'ios' : 'android'
}

const STEPS: Record<Platform, string[]> = {
  android: [
    'Chrome 브라우저로 이 페이지를 열어주세요.',
    '오른쪽 위 메뉴(⋮) 버튼을 눌러주세요.',
    '"앱 설치" 또는 "홈 화면에 추가"를 선택해주세요.',
    '"설치"를 눌러 완료해주세요.',
  ],
  ios: [
    'Safari 브라우저로 이 페이지를 열어주세요. (다른 브라우저는 지원하지 않아요)',
    '하단 공유 버튼을 눌러주세요.',
    '"홈 화면에 추가"를 선택해주세요.',
    '오른쪽 위 "추가"를 눌러 완료해주세요.',
  ],
}

const PLATFORM_LABELS: Record<Platform, string> = {
  android: '안드로이드',
  ios: '아이폰',
}

export function PwaInstallGuide() {
  const [platform, setPlatform] = useState<Platform>(() => detectPlatform())

  return (
    <div className="flex flex-col gap-5">
      <SegmentedControl
        label="플랫폼 선택"
        value={platform}
        onChange={(value) => setPlatform(value as Platform)}
        layout="fill"
      >
        {(Object.keys(PLATFORM_LABELS) as Platform[]).map((key) => (
          <SegmentedControlItem key={key} value={key} label={PLATFORM_LABELS[key]} />
        ))}
      </SegmentedControl>

      <ol className="flex flex-col gap-3 text-left text-sm">
        {STEPS[platform].map((step, index) => (
          <li key={step} className="flex gap-3">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-muted text-xs font-medium text-accent">
              {index + 1}
            </span>
            <span className="text-secondary">{step}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
