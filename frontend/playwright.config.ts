import { defineConfig, devices } from '@playwright/test'
import { resolveE2EDocumentStorageRoot } from './src/lib/e2e-storage'

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3001'
const serverUrl = new URL(baseURL)
const serverPort = serverUrl.port || (serverUrl.protocol === 'https:' ? '443' : '80')
const serverHost = serverUrl.hostname === 'localhost' ? '127.0.0.1' : serverUrl.hostname
const backendBaseUrl = process.env.PLAYWRIGHT_BACKEND_URL || 'http://127.0.0.1:8000'
const backendUrl = new URL(backendBaseUrl)
const backendPort = backendUrl.port || (backendUrl.protocol === 'https:' ? '443' : '80')
const isolatedE2eDatabaseUrl = process.env.E2E_DATABASE_URL
if (!isolatedE2eDatabaseUrl || new URL(isolatedE2eDatabaseUrl).pathname !== '/organization_erp_e2e') {
  throw new Error('E2E_DATABASE_URL must point to the isolated PostgreSQL database organization_erp_e2e')
}
if (!['postgresql:', 'postgres:'].includes(new URL(isolatedE2eDatabaseUrl).protocol)) {
  throw new Error('E2E_DATABASE_URL must use PostgreSQL')
}
if (process.env.DATABASE_URL !== isolatedE2eDatabaseUrl) {
  throw new Error('DATABASE_URL and E2E_DATABASE_URL must point to the same isolated database')
}
const documentStorageRoot = resolveE2EDocumentStorageRoot(process.env.DOCUMENT_STORAGE_ROOT)
if (Buffer.byteLength(process.env.BACKEND_CSRF_SECRET ?? '', 'utf8') < 32) {
  throw new Error('BACKEND_CSRF_SECRET must be at least 32 bytes for E2E')
}
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  testIgnore: process.env.E2E_VERIFY_ONLY === '1' ? /^(?!.*full-flow\.spec\.ts$).*$/ : undefined,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  globalSetup: process.env.E2E_VERIFY_ONLY === '1' ? undefined : './e2e/global-setup.ts',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: `npm run dev -- --hostname ${serverHost} --port ${serverPort}`,
      url: `${baseURL}/api/health/live`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        BACKEND_BASE_URL: backendBaseUrl,
        DOCUMENT_STORAGE_ROOT: documentStorageRoot,
        NEXT_PUBLIC_APP_URL: baseURL,
      },
    },
    {
      command: `cd ../backend && uv run uvicorn app.main:create_app --factory --host ${backendUrl.hostname} --port ${backendPort}`,
      url: `${backendBaseUrl}/api/health/live`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        BACKEND_DATABASE_URL: isolatedE2eDatabaseUrl.replace(/^postgres(?:ql)?:/, 'postgresql+asyncpg:'),
        DOCUMENT_STORAGE_ROOT: documentStorageRoot,
        BACKEND_ENVIRONMENT: 'test',
        BACKEND_OTEL_ENABLED: 'false',
        BACKEND_CSRF_SECRET: process.env.BACKEND_CSRF_SECRET || '',
        BACKEND_PUBLIC_ORIGIN: baseURL,
      },
    },
  ],
})
