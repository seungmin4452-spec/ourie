// 지역 뱃지 형태 두 안을 실제 시도·시군구 path로 그려보는 미리보기 생성기.
//
// 형태를 눈으로 고르려고 만든 일회용 도구다. 프로덕션 코드가 아니고,
// 형태가 정해지면 지워도 된다 (docs/REGION_BADGE.md §3).
//
//   node scripts/preview-region-badges.mjs badge-preview.html
//
// districts.ts / regions.ts를 직접 읽어 그리므로, 지도 데이터가 갱신되면
// 미리보기도 자동으로 따라간다.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const TRAVEL = resolve(dirname(fileURLToPath(import.meta.url)), '../src/features/travel')

const out = process.argv[2]
if (!out) {
  console.error('사용법: node scripts/preview-region-badges.mjs <출력.html>')
  process.exit(1)
}

/**
 * 생성물 TS에서 도형만 긁어온다.
 *
 * 정식 파서를 쓰지 않는 이유: 이 두 파일은 gen-travel-regions.mjs가 찍어내는
 * 생성물이라 항목 하나가 늘 `\n  {`로 시작한다. 미리보기 하나를 띄우려고
 * 의존성을 늘릴 자리가 아니다.
 *
 * 다만 **필드 순서에는 기대지 않는다** — regions.ts는 code 다음이 name이고
 * districts.ts는 sido다. 한 덩어리로 자른 뒤 필드를 따로 뽑으면 순서가 바뀌어도
 * 조용히 절반만 읽히는 일이 없다.
 */
function parseShapes(src, marker) {
  const body = src.slice(src.indexOf(marker))
  const field = (chunk, name) => chunk.match(new RegExp(`${name}: '([^']*)'`))?.[1] ?? null

  return body
    .split('\n  {')
    .slice(1)
    .map((chunk) => ({
      code: field(chunk, 'code'),
      shortName: field(chunk, 'shortName'),
      sido: field(chunk, 'sido'),
      path: field(chunk, 'path'),
    }))
    .filter((row) => row.code && row.path)
}

const regions = parseShapes(readFileSync(`${TRAVEL}/regions.ts`, 'utf8'), 'TRAVEL_REGIONS')
const districts = parseShapes(readFileSync(`${TRAVEL}/districts.ts`, 'utf8'), 'TRAVEL_DISTRICTS')

const bySido = {}
for (const d of districts) (bySido[d.sido] ??= []).push(d)

/** pathBounds.ts와 같은 계산 (M·L·Z만 쓰는 직선 다각형이라 숫자만 훑으면 된다). */
function bounds(d) {
  const nums = d.match(/-?\d*\.?\d+/g) ?? []
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = +nums[i]
    const y = +nums[i + 1]
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

/**
 * 먼 섬을 뺀 "본토" 경계상자 — src/features/travel/mainlandBounds.ts와 같은 계산.
 *
 * 전체 도형으로 프레임을 잡으면 인천은 서해 5도 때문에 본토가 점 몇 개로
 * 사라진다 (238x129 → 본토만 51x87). 뱃지는 본토를 기준으로 잡고 먼 섬은
 * 원 밖으로 잘라낸다.
 */
function mainlandBounds(d) {
  const subs = d
    .split('M')
    .filter((chunk) => chunk.trim() !== '')
    .map((chunk) => {
      const b = bounds(`M${chunk}`)
      return { b, area: b.w * b.h }
    })
  if (subs.length === 0) return bounds(d)

  const seed = subs.reduce((best, item) => (item.area > best.area ? item : best))
  const near = Math.max(seed.b.w, seed.b.h) * 0.2
  const gap = (p, q) =>
    Math.max(
      Math.max(0, p.x - (q.x + q.w), q.x - (p.x + p.w)),
      Math.max(0, p.y - (q.y + q.h), q.y - (p.y + p.h)),
    )

  return subs.reduce((acc, item) => {
    if (gap(seed.b, item.b) > near) return acc
    const x = Math.min(acc.x, item.b.x)
    const y = Math.min(acc.y, item.b.y)
    return {
      x,
      y,
      w: Math.max(acc.x + acc.w, item.b.x + item.b.w) - x,
      h: Math.max(acc.y + acc.h, item.b.y + item.b.h) - y,
    }
  }, seed.b)
}

/** 시군구 수가 자연스럽게 갈라지는 세 덩어리. docs/REGION_BADGE.md §2 참고. */
function cellSize(count) {
  if (count <= 3) return 60
  if (count <= 18) return 84
  return 112
}

// "사진" 자리에 넣는 흐린 색들. 실제로는 여기에 지역별 사진이 들어간다.
const PHOTO_TONES = [
  '#8fa3b0', '#b9a68f', '#9aab8f', '#a8919c', '#8f9bb0', '#c0b39a',
  '#94a89f', '#b09a91', '#9f96b0', '#a9b39a', '#8fa8a8', '#bda99f',
]

/**
 * 도형을 자기 경계상자에 맞춘 viewBox로 그린다 — 원래 전국 좌표는 버린다.
 *
 * `frame`이 'mainland'면 먼 섬을 뺀 본토 기준으로 잡는다 (원형 뱃지가 이걸
 * 쓴다). A안은 잘라낼 원이 없어서 전체 도형 그대로 둔다.
 */
function shapeSvg(region, state, size, frame = 'full') {
  const b = frame === 'mainland' ? mainlandBounds(region.path) : bounds(region.path)
  const pad = Math.max(b.w, b.h) * 0.06
  const stroke = Math.max(b.w, b.h) * 0.02
  const vb = `${b.x - pad} ${b.y - pad} ${b.w + 2 * pad} ${b.h + 2 * pad}`

  let inner
  if (state === 'locked') {
    inner = `<path d="${region.path}" fill="none" stroke="currentColor" stroke-width="${stroke * 1.1}" stroke-linejoin="round" opacity="0.45"/>`
  } else if (state === 'visited') {
    inner = `<path d="${region.path}" fill="currentColor" stroke="currentColor" stroke-width="${stroke}" stroke-linejoin="round"/>`
  } else {
    const cells = (bySido[region.code] ?? [])
      .map((d, i) => `<path d="${d.path}" fill="${PHOTO_TONES[i % PHOTO_TONES.length]}"/>`)
      .join('')
    inner = `${cells}<path d="${region.path}" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linejoin="round" opacity="0.5"/>`
  }

  return `<svg viewBox="${vb}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet">${inner}</svg>`
}

function sizeOf(region) {
  return cellSize((bySido[region.code] ?? []).length)
}

function rawBadge(region, state) {
  const s = sizeOf(region)
  return `<figure class="badge"><span class="raw" style="--s:${s}px">${shapeSvg(region, state, s)}</span><figcaption>${region.shortName}</figcaption></figure>`
}

function discBadge(region, state) {
  const s = sizeOf(region)
  return `<figure class="badge"><span class="disc ${state}" style="--s:${s}px">${shapeSvg(region, state, Math.round(s * 0.62), 'mainland')}</span><figcaption>${region.shortName}</figcaption></figure>`
}

const STATES = [
  ['locked', '잠김 — 아직 못 채운 지역'],
  ['visited', '다 다녀옴 — 스크래치 지도 완성'],
  ['photo', '사진까지 채움 — 사진 지도 완성'],
]

function section(title, note, render) {
  const rows = STATES.map(
    ([state, label]) =>
      `<div><h3>${label}</h3><div class="grid">${regions.map((r) => render(r, state)).join('')}</div></div>`,
  ).join('')
  return `<section><h2>${title}</h2><p class="note">${note}</p>${rows}</section>`
}

// 일부만 얻은 진열장. 빈 칸이 보여야 모으고 싶어진다.
const EARNED = { 30: 'photo', 36: 'visited', 26: 'photo', 50: 'visited', 31: 'visited' }

const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>지역 뱃지 형태 비교</title>
<style>
  :root { --bg:#fff; --fg:#1a1a1a; --muted:#6b6b6b; --line:#e4e4e4; --disc:#f2f2f2; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#141414; --fg:#ededed; --muted:#9a9a9a; --line:#2c2c2c; --disc:#1f1f1f; }
  }
  * { box-sizing: border-box; }
  body { margin:0; padding:24px; background:var(--bg); color:var(--fg);
         font-family: system-ui, -apple-system, sans-serif; }
  h1 { font-size:20px; margin:0 0 4px; }
  h2 { font-size:16px; margin:32px 0 4px; }
  h3 { font-size:13px; font-weight:400; color:var(--muted); margin:20px 0 8px; }
  p.note { font-size:13px; color:var(--muted); margin:0 0 8px; line-height:1.6; }
  .grid { display:flex; flex-wrap:wrap; gap:16px; align-items:flex-end; }
  .shelf { align-items:center; }
  .badge { margin:0; display:flex; flex-direction:column; align-items:center; gap:6px; }
  figcaption { font-size:11px; color:var(--muted); }
  .raw, .disc { display:grid; place-items:center; width:var(--s); height:var(--s); color:var(--fg); }
  .disc { border-radius:50%; background:var(--disc); border:1px solid var(--line); }
  .disc.locked { background:transparent; border-style:dashed; }
  section { border-top:1px solid var(--line); padding-top:8px; }
</style></head><body>
<h1>지역 뱃지 — 형태 두 안</h1>
<p class="note">실제 <code>regions.ts</code> · <code>districts.ts</code> path로 그렸다. 사진 상태의 색은 사진 대신 넣은 자리표시자다. 크기는 시군구 수 세 덩어리(소 60 / 중 84 / 대 112).</p>
${section('A안 — 지역 도형 그대로', '개성은 가장 강하다. 다만 격자에서 아래위가 들쭉날쭉하고, 작은 뱃지(부산·인천·전남)는 섬이 점으로 뭉개진다.', rawBadge)}
${section('B안 — 원형 뱃지 안에 실루엣', '정렬이 깔끔하고 작아도 뱃지로 읽힌다. 원이 여백을 주는 만큼 도형 자체는 작아진다.', discBadge)}
<section><h2>진열장 목업 — 5곳만 얻은 상태</h2>
<p class="note">못 얻은 칸이 보여야 모으고 싶어진다.</p>
<div class="grid shelf">${regions.map((r) => discBadge(r, EARNED[r.code] ?? 'locked')).join('')}</div>
</section>
</body></html>`

writeFileSync(out, html)
console.log(`${out} — 시도 ${regions.length}곳 · 시군구 ${districts.length}곳`)
