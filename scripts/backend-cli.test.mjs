import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import path from 'node:path'

import { backendEnvironment, runBackendCli } from './backend-cli-core.mjs'

test('backend environment maps root database and runtime settings without overriding backend values', () => {
  const mapped = backendEnvironment({
    DATABASE_URL: 'postgresql://local/db',
    NODE_ENV: 'production',
    BACKEND_DATABASE_URL: 'postgresql://explicit/backend',
  })

  assert.equal(mapped.BACKEND_DATABASE_URL, 'postgresql://explicit/backend')
  assert.equal(mapped.BACKEND_ENVIRONMENT, 'production')
  assert.equal(mapped.DATABASE_URL, 'postgresql://local/db')
})

test('launcher dispatches each public command to the matching Python module', () => {
  const dispatched = []
  for (const [command, moduleName] of Object.entries({
    seed: 'app.scripts.seed',
    verify: 'app.scripts.verify_data',
    'create-admin': 'app.scripts.create_admin',
  })) {
    const status = runBackendCli(command, {
      cwd: '/repo',
      env: { DATABASE_URL: 'postgresql://do-not-print' },
      spawn: (executable, args, options) => {
        dispatched.push({ executable, args, options })
        return { status: 0 }
      },
    })
    assert.equal(status, 0)
    assert.deepEqual(dispatched.at(-1).args, [
      'run', '--project', '/repo/backend', 'python', '-m', moduleName,
    ])
    assert.equal(dispatched.at(-1).executable, 'uv')
    assert.equal(dispatched.at(-1).options.cwd, '/repo/backend')
    assert.equal(dispatched.at(-1).options.env.BACKEND_DATABASE_URL, 'postgresql://do-not-print')
  }
})

test('launcher rejects unknown commands without attempting a process spawn', () => {
  assert.throws(() => runBackendCli('legacy-ts-command', { spawn: () => assert.fail() }))
})

test('public npm commands load the root env file before invoking the launcher', () => {
  const packageJson = JSON.parse(readFileSync(path.resolve('package.json'), 'utf8'))

  for (const name of ['db:seed', 'db:verify', 'user:create-admin']) {
    assert.match(packageJson.scripts[name], /^node --env-file-if-exists=\.env scripts\/backend-cli\.mjs /)
  }
})
