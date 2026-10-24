import { runBackendCli } from './backend-cli-core.mjs'

try {
  process.exitCode = runBackendCli(process.argv[2])
} catch (error) {
  const message = error instanceof Error ? error.message : 'Не удалось выполнить Python CLI'
  process.stderr.write(`${message}\n`)
  process.exitCode = 1
}
