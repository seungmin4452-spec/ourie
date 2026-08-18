import { Card } from '@astryxdesign/core/Card'
import { Heading } from '@astryxdesign/core/Heading'
import { HStack } from '@astryxdesign/core/HStack'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Text } from '@astryxdesign/core/Text'
import { Theme } from '@astryxdesign/core/theme'
import { VStack } from '@astryxdesign/core/VStack'
import { Circle, LogOut } from 'lucide-react'

import { PageShell } from '@/components/common/PageShell'
import { setAdminMode } from '@/app/adminMode'
import { adminTerminalTheme } from '@/app/adminTheme'
import { ADMIN_WIDGETS } from './adminWidgets'

/**
 * 관리자 모드(화면 뒤집기 뒷면)의 내용.
 *
 * 형식은 홈 화면과 똑같다 — 위젯 하나를 카드 하나에 담아 세로로 쌓는다.
 * 다른 건 테마뿐이다: 중첩 `<Theme>`로 이 서브트리만 `adminTerminalTheme`를
 * 쓴다 (astryx의 nested Theme 지원 — 나머지 앱은 `ourieTheme` 그대로다).
 * 맨 위 타이틀바는 macOS 터미널 창을 흉내 낸 장식일 뿐, 눌러서 창을
 * 닫거나 최소화하는 기능은 없다 — 나가기는 오른쪽 버튼이 한다.
 *
 * **바깥쪽에 `bg-body`를 직접 칠하는 이유.** `PageShell`은 배경을 칠하지
 * 않는다 — 앱 전체에서 배경은 `providers.tsx`의 `ThemedApp`이 딱 한 번,
 * 바깥 라이트/다크 테마로 칠한다. 그런데 여기는 그 바깥 테마 밖으로
 * 나가려고 중첩 `<Theme>`를 쓴 것이라, 이 안에서도 배경을 직접 칠해주지
 * 않으면 콘텐츠 아래·둘레로 바깥의 라이트/다크 배경이 그대로 비쳐 보인다
 * — 뒤집었는데 옛 화면이 아직 보이는 것처럼, 또는 터미널 테마가 라이트
 * 모드에서는 절반만 적용된 것처럼 보이던 것이 이것이다. `ThemedApp`의
 * 바깥 wrapper와 똑같은 처방(`min-h-screen bg-body text-primary`)이다.
 */
export function AdminScreen() {
  return (
    <Theme theme={adminTerminalTheme} mode="dark">
      <div className="min-h-screen bg-body text-primary">
        <PageShell gap={5}>
          <HStack hAlign="between" vAlign="center">
            <HStack gap={1.5} vAlign="center">
              <Circle className="size-3 fill-current text-red-vivid" />
              <Circle className="size-3 fill-current text-yellow-vivid" />
              <Circle className="size-3 fill-current text-green-vivid" />
              <Text weight="medium" className="pl-2">
                관리자 모드
              </Text>
            </HStack>
            <IconButton
              label="일반 모드로 돌아가기"
              tooltip="나가기"
              variant="ghost"
              size="sm"
              icon={<LogOut className="size-4" />}
              onClick={() => setAdminMode(false)}
            />
          </HStack>

          <VStack gap={3}>
            {ADMIN_WIDGETS.map(({ id, title, description, Component }) => (
              <Card key={id} width="100%" padding={5} variant="default" elevation="low">
                <VStack gap={3}>
                  <VStack gap={1}>
                    <Heading level={2}>{title}</Heading>
                    <Text type="supporting">{description}</Text>
                  </VStack>
                  <Component />
                </VStack>
              </Card>
            ))}
          </VStack>
        </PageShell>
      </div>
    </Theme>
  )
}
