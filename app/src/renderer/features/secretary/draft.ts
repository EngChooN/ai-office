import { create } from 'zustand'

// 비서 입력창에 글을 미리 채워 포커스를 옮긴다 ([다시 다듬기] → "더 …"를 이어 쓰게)
export const useSecretaryDraft = create<{ prefill: { text: string; at: number } | null }>(() => ({ prefill: null }))

export const requestSecretaryDraft = (text: string) => useSecretaryDraft.setState({ prefill: { text, at: Date.now() } })
