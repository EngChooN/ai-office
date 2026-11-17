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
for (const k of base) if (!used.has(k) && !/^(meta\.|btn\.|hero\.(android|ios)|os\.|dl\.mine|foot\.license|theme\.to|exp\.|lv\.|try\.other)/.test(k)) errors.push(`안 쓰는 키 ${k}`);
for (const l of langs) {
  for (const name of [...new Set([...src.matchAll(/data-shot="([^"]+)"([^>]*)>/g)].map((m) => m[1]))]) {
    const nodark = new RegExp(`data-shot="${name}"[^>]*data-nodark`).test(src);
    for (const f of nodark ? [name] : [name, name + '-dark']) if (!existsSync(join(ROOT, 'assets/screens', l, f + '.webp'))) errors.push(`사진 없음 ${l}/${f}.webp`);
  }
}
// 화면 코드가 직접 쓰는 키(체험 대본·레벨 막대): 스크립트에 적힌 키가 4개 언어에 모두 있는지, 배열 길이가 맞는지
const scriptKeys = new Set([...src.matchAll(/'((?:exp|lv)\.[\w.]+|try\.other)'/g)].map((m) => m[1]).filter((k) => !k.endsWith('.')));
for (const l of langs) for (const k of scriptKeys) if (!(k in I18N[l])) errors.push(`${l}: 화면 코드가 쓰는 키 없음 ${k}`);
for (const k of base) if (/^exp\./.test(k) && !scriptKeys.has(k) && !used.has(k) && !/^exp\.(n|st)\./.test(k)) errors.push(`안 쓰는 키 ${k}`);
for (const l of langs) {
  if (I18N[l]['lv.names']?.length !== 7) errors.push(`${l}: lv.names는 건물 7단계`);
  if (I18N[l]['lv.unlocks']?.length !== 4) errors.push(`${l}: lv.unlocks는 4개`);
  for (const [k, v] of Object.entries(I18N[l])) if (/BETA|베타|ベータ|测试版|시험판|Preview ·|プレビュー版|预览版/i.test(JSON.stringify(v))) errors.push(`${l}: 베타·시험판 문구 ${k}`);
}
for (let i = 1; i <= 7; i++) if (!existsSync(join(ROOT, 'assets/building', `lv${i}.webp`))) errors.push(`건물 그림 없음 lv${i}.webp`);
// 언어별 페이지: 그림 경로가 ../assets로 바뀌었는지, 빈 값이 새지 않았는지
for (const l of ['en', 'ja', 'zh']) {
  const f = join(ROOT, l, 'index.html');
  if (!existsSync(f)) { errors.push(`${l}/index.html 없음 (node site/build-langs.mjs)`); continue; }
  const h = readFileSync(f, 'utf8');
  if (/(src|href)="assets\//.test(h) || /'assets\//.test(h)) errors.push(`${l}/index.html: assets 경로가 ../assets로 안 바뀜`);
  if (/>undefined</.test(h)) errors.push(`${l}/index.html: undefined 문구`);
}
if (errors.length) { console.log('\n문제 ' + errors.length + '건'); errors.forEach((e) => console.log(' - ' + e)); process.exit(1); }
console.log('\n통과: 4개 언어 키·문구·사진 모두 이상 없음');
