const { existsSync } = require('fs')
const { rmSync } = require('fs')
const { spawnSync } = require('child_process')

const buildDir = '.next'
const requiredFiles = [
  `${buildDir}/BUILD_ID`,
  `${buildDir}/server/pages-manifest.json`,
  `${buildDir}/server/next-font-manifest.json`,
]

function hasCompleteBuild() {
  return requiredFiles.every((file) => existsSync(file))
}

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: process.env,
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

console.log('Applying pending Prisma migrations before start...')
run('npx', ['prisma', 'migrate', 'deploy'])

if (!hasCompleteBuild()) {
  console.log('Production build artifacts are missing or incomplete. Rebuilding .next before start...')
  rmSync(buildDir, { recursive: true, force: true })
  run('npx', ['next', 'build'])
}

run('npx', ['next', 'start', ...process.argv.slice(2)])
