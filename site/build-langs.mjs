// 소개 페이지 언어별 정적 페이지(/en/ /ja/ /zh/)와 sitemap.xml을 index.html에서 만든다.
// 사용: node site/build-langs.mjs   (pages.yml이 배포 전에 실행)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SITE = 'https://engchoon.github.io/ai-office/';
const LANGS = { ko: ['', 'ko', 'ko_KR'], en: ['en/', 'en', 'en_US'], ja: ['ja/', 'ja', 'ja_JP'], zh: ['zh/', 'zh-CN', 'zh_CN'] };
const SHOTS = ['office', 'staff-mix', 'chat', 'inbox', 'board'];

// index.html은 한국어 정적 본문을 <!--p-->…<!--/p--> 표시로 품는다. 다시 만들 때 표시 구간을 비우고 새로 채운다
const src = readFileSync(join(ROOT, 'index.html'), 'utf8').replace(/<!--p-->[\s\S]*?<!--\/p-->/g, '');
const i18nSrc = src.match(/var I18N = (\{[\s\S]*?\n\});\n/)[1];
const I18N = vm.runInNewContext('(' + i18nSrc + ')');
const version = src.match(/version: '([\d.]+)'/)[1];
const url = (l) => SITE + LANGS[l][0];
const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function head(l) {
  const t = I18N[l];
  const hreflang = Object.keys(LANGS).map((k) => `<link rel="alternate" hreflang="${LANGS[k][1]}" href="${url(k)}">`).join('\n')
    + `\n<link rel="alternate" hreflang="x-default" href="${SITE}">`;
  const ld = {
    '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'AI Office', url: url(l),
    image: SITE + 'assets/og.png?v=0.14.0', applicationCategory: 'BusinessApplication',
    operatingSystem: 'macOS, Windows, Android', softwareVersion: version, license: 'https://opensource.org/licenses/MIT',
    downloadUrl: 'https://github.com/EngChooN/ai-office/releases/latest', isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD', url: 'https://github.com/EngChooN/ai-office/releases/latest' },
    screenshot: SHOTS.map((s) => `${SITE}assets/screens/${l}/${s}.webp`), inLanguage: LANGS[l][1], description: t['meta.desc'],
  };
  return { hreflang, ld: JSON.stringify(ld) };
}

function page(l, html) {
  const t = I18N[l], { hreflang, ld } = head(l), [path, htmlLang, og] = LANGS[l];
  let o = html;
  const sub = (re, to) => { if (!re.test(o)) throw new Error('패턴 없음: ' + re); o = o.replace(re, () => to); };
  if (!path) { // 한국어: index.html 자체 — head는 직접 관리, 본문만 채운다
    return o.replace(/(<(\w+)\b[^>]*\bdata-i18n="([^"]+)"[^>]*>)(<\/\2>)/g, (m, open, tag, key) => (key in t ? open + '<!--p-->' + t[key] + '<!--/p--></' + tag + '>' : m));
  }
  sub(/<html lang="[^"]*">/, `<html lang="${htmlLang}">`);
  sub(/<title>[^<]*<\/title>/, `<title>${esc(t['meta.title'])}</title>`);
  sub(/<meta name="description" content="[^"]*"/, `<meta name="description" content="${esc(t['meta.desc'])}"`);
  o = o.replace(/<link rel="alternate" hreflang=[^>]*>\n/g, '');
  sub(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${url(l)}">\n${hreflang}`);
  sub(/(<meta property="og:url" content=")[^"]*"/, `<meta property="og:url" content="${url(l)}"`);
  sub(/<meta property="og:title" content="[^"]*"/, `<meta property="og:title" content="${esc(t['meta.title'])}"`);
  sub(/<meta property="og:description" content="[^"]*"/, `<meta property="og:description" content="${esc(t['meta.desc'])}"`);
  sub(/<meta name="twitter:title" content="[^"]*"/, `<meta name="twitter:title" content="${esc(t['meta.title'])}"`);
  sub(/<meta name="twitter:description" content="[^"]*"/, `<meta name="twitter:description" content="${esc(t['meta.desc'])}"`);
  sub(/<meta property="og:locale" content="[^"]*"/, `<meta property="og:locale" content="${og}"`);
  sub(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, `<script type="application/ld+json">\n${ld}\n</script>`);
  // 이 페이지의 언어 고정 + 언어 선택은 주소 이동
  sub(/var D = DOWNLOADS, LANGS/, `var PAGE_LANG = '${l}', D = DOWNLOADS, LANGS`);
  // 정적 본문: 비어 있는 data-i18n 요소를 채워 JS 없이도 글이 보이게 한다
  o = o.replace(/(<(\w+)\b[^>]*\bdata-i18n="([^"]+)"[^>]*>)(<\/\2>)/g, (m, open, tag, key) => (key in t ? open + '<!--p-->' + t[key] + '<!--/p--></' + tag + '>' : m));
  if (!path) return o;
  o = o.replace(/(src|href)="assets\//g, '$1="../assets/').replace(/'assets\//g, "'../assets/");
  return o;
}

// 한국어는 index.html 자체가 원본(head·hreflang·JSON-LD는 직접 관리)
const out = [];
for (const l of Object.keys(LANGS)) {
  const html = page(l, src);
  if (!LANGS[l][0]) writeFileSync(join(ROOT, 'index.html'), html);
  else { mkdirSync(join(ROOT, LANGS[l][0]), { recursive: true }); writeFileSync(join(ROOT, LANGS[l][0], 'index.html'), html); out.push(LANGS[l][0] + 'index.html'); }
}

const urls = Object.keys(LANGS).map((l) => `  <url>\n    <loc>${url(l)}</loc>\n${Object.keys(LANGS).map((k) => `    <xhtml:link rel="alternate" hreflang="${LANGS[k][1]}" href="${url(k)}"/>`).join('\n')}\n    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}"/>\n  </url>`).join('\n');
writeFileSync(join(ROOT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`);
console.log('생성:', out.join(', '), 'sitemap.xml');
