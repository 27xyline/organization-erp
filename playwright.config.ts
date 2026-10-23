import { defineConfig, devices } from '@playwright/test'
import { resolveStage08E2EDocumentStorageRoot } from './src/lib/stage08-e2e-storage'
import { resolveStage10E2EDocumentStorageRoot } from './src/lib/stage10-e2e-storage'

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3001'
const serverUrl = new URL(baseURL)
const serverPort = serverUrl.port || (serverUrl.protocol === 'https:' ? '443' : '80')
const serverHost = serverUrl.hostname === 'localhost' ? '127.0.0.1' : serverUrl.hostname
const backendBaseUrl = process.env.PLAYWRIGHT_BACKEND_URL || 'http://127.0.0.1:8000'
const backendUrl = new URL(backendBaseUrl)
const backendPort = backendUrl.port || (backendUrl.protocol === 'https:' ? '443' : '80')
const isolatedE2eDatabaseUrl = process.env.STAGE10_E2E_DATABASE_URL ??
  process.env.STAGE09_E2E_DATABASE_URL ??
  process.env.STAGE08_E2E_DATABASE_URL ??
  process.env.STAGE07_E2E_DATABASE_URL ??
  process.env.STAGE06_E2E_DATABASE_URL ??
  process.env.STAGE05_E2E_DATABASE_URL ??
  process.env.STAGE04_E2E_DATABASE_URL ?? process.env.STAGE03_TEST_DATABASE_URL
if (!isolatedE2eDatabaseUrl) {
  throw new Error('STAGE07_E2E_DATABASE_URL (or a prior-stage compatibility variable) must point to an isolated shared Node/Python E2E database')
}
const e2eDatabaseName = new URL(isolatedE2eDatabaseUrl).pathname.replace(/^\//, '')
const isStage10E2E = e2eDatabaseName === 'erp_stage10_e2e'
if (!/^erp_stage0[3-9]_e2e$/.test(e2eDatabaseName) && !isStage10E2E) {
  throw new Error('Playwright requires an isolated stage-specific E2E database')
}
const documentStorageRoot = isStage10E2E
  ? resolveStage10E2EDocumentStorageRoot(process.env.DOCUMENT_STORAGE_ROOT)
  : resolveStage08E2EDocumentStorageRoot(process.env.DOCUMENT_STORAGE_ROOT)
if (!process.env.DATABASE_URL || process.env.DATABASE_URL !== isolatedE2eDatabaseUrl) {
  throw new Error('DATABASE_URL and the isolated E2E database URL must be the same isolated database')
}
for (const name of ['BACKEND_BRIDGE_SECRET', 'BACKEND_INTERNAL_AUTH_SECRET']) {
  if (!process.env[name] || Buffer.byteLength(process.env[name]!, 'utf8') < 32) {
      throw new Error(`${name} must be a distinct secret of at least 32 bytes for Stage 07 E2E`)
  }
}
if (process.env.BACKEND_BRIDGE_SECRET === process.env.BACKEND_INTERNAL_AUTH_SECRET) {
  throw new Error('Bridge and internal-auth secrets must be different')
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  globalSetup: './e2e/global-setup.ts',
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
        DATABASE_URL: isolatedE2eDatabaseUrl,
        BACKEND_BASE_URL: backendBaseUrl,
        DOCUMENT_STORAGE_ROOT: documentStorageRoot,
        NEXTAUTH_URL: baseURL,
        NEXT_PUBLIC_APP_URL: baseURL,
      },
    },
    {
      command: `cd backend && uv run uvicorn app.main:create_app --factory --host ${backendUrl.hostname} --port ${backendPort}`,
      url: `${backendBaseUrl}/api/health/live`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        BACKEND_DATABASE_URL: isolatedE2eDatabaseUrl.replace(/^postgresql:/, 'postgresql+asyncpg:'),
        BACKEND_TEST_DATABASE_URL: isolatedE2eDatabaseUrl.replace(/^postgresql:/, 'postgresql+asyncpg:'),
        STAGE07_TEST_DATABASE_URL: isolatedE2eDatabaseUrl.replace(/^postgresql:/, 'postgresql+asyncpg:'),
        STAGE07_E2E_DATABASE_URL: isolatedE2eDatabaseUrl.replace(/^postgresql:/, 'postgresql+asyncpg:'),
        STAGE08_E2E_DATABASE_URL: isolatedE2eDatabaseUrl.replace(/^postgresql:/, 'postgresql+asyncpg:'),
        STAGE09_E2E_DATABASE_URL: isolatedE2eDatabaseUrl.replace(/^postgresql:/, 'postgresql+asyncpg:'),
        STAGE10_E2E_DATABASE_URL: isStage10E2E
          ? isolatedE2eDatabaseUrl.replace(/^postgresql:/, 'postgresql+asyncpg:')
          : '',
        STAGE08_TEST_DATABASE_URL: process.env.STAGE08_TEST_DATABASE_URL || '',
        DOCUMENT_STORAGE_ROOT: documentStorageRoot,
        STAGE06_TEST_DATABASE_URL: isolatedE2eDatabaseUrl.replace(/^postgresql:/, 'postgresql+asyncpg:'),
        STAGE06_E2E_DATABASE_URL: isolatedE2eDatabaseUrl.replace(/^postgresql:/, 'postgresql+asyncpg:'),
        STAGE05_TEST_DATABASE_URL: isolatedE2eDatabaseUrl.replace(/^postgresql:/, 'postgresql+asyncpg:'),
        STAGE05_E2E_DATABASE_URL: isolatedE2eDatabaseUrl.replace(/^postgresql:/, 'postgresql+asyncpg:'),
        STAGE04_E2E_DATABASE_URL: isolatedE2eDatabaseUrl.replace(/^postgresql:/, 'postgresql+asyncpg:'),
        BACKEND_ENVIRONMENT: 'test',
        BACKEND_OTEL_ENABLED: 'false',
        BACKEND_BRIDGE_SECRET: process.env.BACKEND_BRIDGE_SECRET || '',
        BACKEND_INTERNAL_AUTH_SECRET: process.env.BACKEND_INTERNAL_AUTH_SECRET || '',
      },
    },
  ],
})
