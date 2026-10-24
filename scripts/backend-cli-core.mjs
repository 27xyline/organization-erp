import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
export const repositoryRoot = path.resolve(scriptDirectory, '..')

export const backendModules = Object.freeze({
  seed: 'app.scripts.seed',
  verify: 'app.scripts.verify_data',
  'create-admin': 'app.scripts.create_admin',
})

export function backendEnvironment(source) {
  const env = { ...source }
  if (env.BACKEND_DATABASE_URL === undefined && env.DATABASE_URL !== undefined) {
    env.BACKEND_DATABASE_URL = env.DATABASE_URL
  }
  if (env.BACKEND_ENVIRONMENT === undefined && env.NODE_ENV !== undefined) {
    env.BACKEND_ENVIRONMENT = env.NODE_ENV
  }
  return env
}

export function runBackendCli(command, options = {}) {
  const moduleName = backendModules[command]
  if (!moduleName) {
    throw new Error('Использование: npm run db:seed | db:verify | user:create-admin')
  }

  const run = options.spawn ?? spawnSync
  const cwd = options.cwd ?? repositoryRoot
  const backendRoot = path.join(cwd, 'backend')
  const result = run(
    'uv',
    ['run', '--project', backendRoot, 'python', '-m', moduleName],
    { cwd: backendRoot, env: backendEnvironment(options.env ?? process.env), stdio: 'inherit' },
  )
  if (result.error) {
    throw new Error('Не удалось запустить Python CLI через uv')
  }
  return result.status ?? 1
}
