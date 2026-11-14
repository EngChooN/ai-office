// 소개 페이지 4개 언어 사전 검사: 키 개수·키 이름이 같은지, 빈 문구가 없는지, 본문이 쓰는 키가 모두 있는지, 사진 파일이 있는지
// 사용: node site/check-i18n.mjs   (build-langs는 빠진 키를 조용히 비우므로 배포 전에 돌린다)
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(ROOT, 'index.html'), 'utf8').replace(/<!--p-->[\s\S]*?<!--\/p-->/g, '');
const I18N = vm.runInNewContext('(' + src.match(/var I18N = (\{[\s\S]*?\n\});\n/)[1] + ')');
const langs = Object.keys(I18N);
const errors = [];
const base = new Set(Object.keys(I18N.ko));
for (const l of langs) {
  const keys = Object.keys(I18N[l]);
  console.log(`${l}: 키 ${keys.length}개`);
  for (const k of base) if (!(k in I18N[l])) errors.push(`${l}: 키 없음 ${k}`);
  for (const k of keys) if (!base.has(k)) errors.push(`${l}: ko에 없는 키 ${k}`);
  for (const [k, v] of Object.entries(I18N[l])) if (Array.isArray(v) ? v.some((x) => !String(x).trim()) || !v.length : !String(v).trim()) errors.push(`${l}: 빈 문구 ${k}`);
}
const used = new Set([...src.matchAll(/data-i18n(?:-alt)?="([^"]+)"/g)].map((m) => m[1]));
for (const l of langs) for (const k of used) if (!(k in I18N[l])) errors.push(`${l}: 본문이 쓰는 키 없음 ${k}`);
for (const k of base) if (!used.has(k) && !/^(meta\.|btn\.|hero\.(android|ios)|limits\.items|os\.|dl\.mine|foot\.license|theme\.to)/.test(k)) errors.push(`안 쓰는 키 ${k}`);
for (const l of langs) {
  for (const name of [...new Set([...src.matchAll(/data-shot="([^"]+)"([^>]*)>/g)].map((m) => m[1]))]) {
    const nodark = new RegExp(`data-shot="${name}"[^>]*data-nodark`).test(src);
    for (const f of nodark ? [name] : [name, name + '-dark']) if (!existsSync(join(ROOT, 'assets/screens', l, f + '.webp'))) errors.push(`사진 없음 ${l}/${f}.webp`);
  }
}
if (errors.length) { console.log('\n문제 ' + errors.length + '건'); errors.forEach((e) => console.log(' - ' + e)); process.exit(1); }
console.log('\n통과: 4개 언어 키·문구·사진 모두 이상 없음');
