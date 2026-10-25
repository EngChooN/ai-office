// 업데이트 소식은 저장소 루트의 CHANGELOG*.md를 빌드에 그대로 넣어 보여 준다 (문서와 앱이 같은 내용을 본다)
// 한국어(CHANGELOG.md)가 기준이고, 어떤 버전이 그 언어 파일에 없으면 그 버전만 한국어로 보여 준다
import ko from '../../../../CHANGELOG.md?raw'
import en from '../../../../CHANGELOG.en.md?raw'
import ja from '../../../../CHANGELOG.ja.md?raw'
import zh from '../../../../CHANGELOG.zh.md?raw'
import pkg from '../../../package.json'
import { parseChangelog, type Release } from '@shared/changelogParse'
import type { Lang } from '@shared/i18n'

export { type ChangeKind, type ChangeSection, type Release } from '@shared/changelogParse'

export const APP_VERSION: string = pkg.version

const KO = parseChangelog(ko)
const BY_LANG: Record<Lang, Map<string, Release>> = {
  ko: new Map(KO.map((r) => [r.version, r])),
  en: new Map(parseChangelog(en).map((r) => [r.version, r])),
  ja: new Map(parseChangelog(ja).map((r) => [r.version, r])),
  zh: new Map(parseChangelog(zh).map((r) => [r.version, r])),
}

/** 앱 언어에 맞춘 버전별 변경 이력 (없는 버전은 한국어) */
export const releasesFor = (lang: Lang): Release[] => KO.map((r) => BY_LANG[lang].get(r.version) ?? r)
