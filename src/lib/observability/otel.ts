import { PrismaInstrumentation } from '@prisma/instrumentation'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { NodeSDK } from '@opentelemetry/sdk-node'

let sdk: NodeSDK | undefined

function exporterUrl(endpoint: string, signal: 'traces' | 'metrics'): string {
  const url = new URL(endpoint)
  url.pathname = `${url.pathname.replace(/\/$/, '')}/v1/${signal}`
  return url.toString()
}

/** Telemetry is optional: a missing or unavailable collector must not block ERP. */
export function startObservability(serviceName: string): NodeSDK | undefined {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
  if (!endpoint || sdk) return sdk

  try {
    const instance = new NodeSDK({
      serviceName: process.env.OTEL_SERVICE_NAME || serviceName,
      traceExporter: new OTLPTraceExporter({ url: exporterUrl(endpoint, 'traces') }),
      metricReaders: [new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({ url: exporterUrl(endpoint, 'metrics') }),
        exportIntervalMillis: 30_000,
      })],
      instrumentations: [new PrismaInstrumentation()],
    })
    instance.start()
    sdk = instance
    return instance
  } catch (error) {
    console.warn('OpenTelemetry initialization failed; continuing without telemetry', error)
    return undefined
  }
}

export async function stopObservability(): Promise<void> {
  const instance = sdk
  sdk = undefined
  if (!instance) return
  try {
    await instance.shutdown()
  } catch (error) {
    console.warn('OpenTelemetry shutdown failed', error)
  }
}
