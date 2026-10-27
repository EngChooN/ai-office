import { useEffect } from 'react'
import { create } from 'zustand'

// 앱 안 토스트: 잠깐 떴다가 저절로 사라진다 (window.alert 대신)
const TOAST_MS = 4000

interface ToastState {
  message: string | null
  id: number
  show(message: string): void
  clear(): void
}

export const useToast = create<ToastState>((set) => ({
  message: null,
  id: 0,
  show: (message) => set((s) => ({ message, id: s.id + 1 })),
  clear: () => set({ message: null }),
}))

export const showToast = (message: string) => useToast.getState().show(message)

export function ToastHost() {
  const { message, id, clear } = useToast()
  useEffect(() => {
    if (!message) return
    const timer = setTimeout(clear, TOAST_MS)
    return () => clearTimeout(timer)
  }, [message, id, clear])
  if (!message) return null
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-[100] flex justify-center px-4">
      <div className="bg-foreground text-background pointer-events-auto max-w-md rounded-lg px-4 py-2.5 text-sm shadow-lg">{message}</div>
    </div>
  )
}
