import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  shutdown: vi.fn().mockResolvedValue(undefined),
  constructors: [] as unknown[],
}))

vi.mock('@opentelemetry/sdk-node', () => ({
  NodeSDK: class {
    constructor(config: unknown) { mocks.constructors.push(config) }
    start = mocks.start
    shutdown = mocks.shutdown
  },
}))

vi.mock('@opentelemetry/exporter-trace-otlp-http', () => ({
  OTLPTraceExporter: class { constructor(readonly options: { url: string }) {} },
}))

vi.mock('@opentelemetry/exporter-metrics-otlp-http', () => ({
  OTLPMetricExporter: class { constructor(readonly options: { url: string }) {} },
}))

vi.mock('@opentelemetry/sdk-metrics', () => ({
  PeriodicExportingMetricReader: class { constructor(readonly options: unknown) {} },
}))

vi.mock('@prisma/instrumentation', () => ({ PrismaInstrumentation: class {} }))

import { startObservability, stopObservability } from './otel'

afterEach(async () => {
  await stopObservability()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  mocks.constructors.length = 0
  mocks.start.mockClear()
  mocks.shutdown.mockClear()
})

describe('startObservability', () => {
  it('stays disabled when no collector endpoint is configured', () => {
    vi.stubEnv('OTEL_EXPORTER_OTLP_ENDPOINT', '')
    expect(startObservability('app')).toBeUndefined()
    expect(mocks.start).not.toHaveBeenCalled()
  })

  it('registers Prisma tracing and a periodic metric exporter', () => {
    vi.stubEnv('OTEL_EXPORTER_OTLP_ENDPOINT', 'http://collector:4318')
    vi.stubEnv('OTEL_SERVICE_NAME', 'erp-app')
    expect(startObservability('default')).toBeDefined()
    expect(mocks.start).toHaveBeenCalledTimes(1)
    expect(mocks.constructors).toEqual([expect.objectContaining({
      serviceName: 'erp-app',
      traceExporter: expect.objectContaining({ options: { url: 'http://collector:4318/v1/traces' } }),
      metricReaders: [expect.objectContaining({ options: expect.objectContaining({
        exportIntervalMillis: 30_000,
        exporter: expect.objectContaining({ options: { url: 'http://collector:4318/v1/metrics' } }),
      }) })],
      instrumentations: [expect.any(Object)],
    })])
  })

  it('does not stop the application if exporter configuration is invalid', () => {
    vi.stubEnv('OTEL_EXPORTER_OTLP_ENDPOINT', 'invalid-url')
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(startObservability('app')).toBeUndefined()
    expect(warning).toHaveBeenCalledOnce()
  })
})
