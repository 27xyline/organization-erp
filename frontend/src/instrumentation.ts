export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NEXT_PHASE !== 'phase-production-build') {
    const { getServerEnv } = await import('@/lib/env')
    getServerEnv()
    await import('./instrumentation.node')
  }
}
