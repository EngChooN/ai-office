// 직원 생김새(부품 조합) 저장 숫자 변환 단위 테스트 — pnpm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decodeLook, encodeLook, LEGACY_AVATARS, randomLook, roleLook, type Look } from '../src/shared/look.ts'

test('예전 아바타 번호는 같은 색·머리 모양으로 읽는다', () => {
  assert.deepEqual(decodeLook(0), { hairStyle: 0, hairColor: 0, skin: 0, top: 0, topColor: 0, pants: 0, face: 0, head: 0 })
  assert.deepEqual(decodeLook(13), { hairStyle: 1, hairColor: 5, skin: 4, top: 0, topColor: 5, pants: 3, face: 0, head: 0 })
  assert.equal(decodeLook(23).hairStyle, 2)
})

test('부품 조합은 저장 숫자로 바꿨다가 그대로 되돌린다', () => {
  let seed = 7
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < 200; i++) {
    const look = randomLook('', rand)
    const n = encodeLook(look)
    assert.ok(n >= LEGACY_AVATARS && Number.isSafeInteger(n))
    assert.deepEqual(decodeLook(n), look)
  }
})

test('외부 직원 해시처럼 큰 수도 범위 안 부품으로 읽는다', () => {
  const look = decodeLook(4_294_967_295)
  for (const v of Object.values(look)) assert.ok(Number.isInteger(v) && v >= 0)
  assert.deepEqual(decodeLook(encodeLook(look)), look)
})

test('직무 기본 소품을 얹는다', () => {
  const lead: Look = randomLook('개발 팀장')
  assert.equal(lead.top, roleLook('팀장').top)
  assert.equal(randomLook('코드 리뷰어').face, 1)
  assert.equal(randomLook('QA').head, 2)
  assert.deepEqual(roleLook('자유 직무'), {})
})
