"use client"

import { useEffect } from "react"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex h-full flex-col items-center justify-center p-4">
      <h2 className="text-xl font-semibold mb-4">Что-то пошло не так!</h2>
      <button
        onClick={() => reset()}
        className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
      >
        Попробовать снова
      </button>
    </div>
  )
}
