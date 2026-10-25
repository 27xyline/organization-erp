import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3301'
const databaseUrl = process.env.STAGE14C_E2E_DATABASE_URL

if (!databaseUrl || new URL(databaseUrl).pathname !== '/erp_stage14c_e2e') {
  throw new Error('STAGE14C_E2E_DATABASE_URL must target the disposable erp_stage14c_e2e database')
}
if (process.env.DATABASE_URL !== databaseUrl) {
  throw new Error('DATABASE_URL and STAGE14C_E2E_DATABASE_URL must target the same disposable database')
}

export default defineConfig({
  testDir: './e2e',
  testMatch: [
    'stage06-projects.spec.ts',
    'stage07-assets.spec.ts',
    'stage08-documents.spec.ts',
    'stage09-approvals-notifications.spec.ts',
    'stage10-payroll-workflow.spec.ts',
    'stage12-reporting.spec.ts',
    'stage14b-sessions.spec.ts',
    'stage14c-full-flow.spec.ts',
  ],
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  globalSetup: process.env.STAGE14C_VERIFY_ONLY === '1'
    ? undefined
    : './e2e/global-setup.ts',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
  },
})
