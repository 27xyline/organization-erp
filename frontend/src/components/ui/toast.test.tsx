import { act, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ToastProvider, useToast } from './toast'

let host: HTMLDivElement
let root: ReturnType<typeof createRoot>

beforeEach(() => {
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true })
  vi.useFakeTimers()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.clearAllTimers()
  vi.useRealTimers()
})

it('does not rerun subscriber effects when a notification is shown or dismissed', async () => {
  const subscribe = vi.fn()
  function Subscriber() {
    const { toast } = useToast()
    useEffect(() => { subscribe() }, [toast])
    return <button onClick={() => toast.success('Сохранено')}>Сохранить</button>
  }

  await act(async () => root.render(<ToastProvider><Subscriber /></ToastProvider>))
  expect(subscribe).toHaveBeenCalledTimes(1)
  await act(async () => host.querySelector('button')?.click())
  expect(host.textContent).toContain('Сохранено')
  expect(subscribe).toHaveBeenCalledTimes(1)
  await act(async () => vi.advanceTimersByTime(4000))
  expect(host.textContent).not.toContain('Сохранено')
  expect(subscribe).toHaveBeenCalledTimes(1)
})
