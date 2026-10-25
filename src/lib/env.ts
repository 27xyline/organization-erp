import { z } from 'zod'

const serverEnvSchema = z.object({
  BACKEND_BASE_URL: z.string().url(),
  BACKEND_PUBLIC_ORIGIN: z.string().url(),
  NEXT_PUBLIC_APP_URL: z.string().url(),
})

export type ServerEnv = z.infer<typeof serverEnvSchema>

let cachedEnv: ServerEnv | undefined

export function getServerEnv(): ServerEnv {
  cachedEnv ??= serverEnvSchema.parse(process.env)
  return cachedEnv
}
