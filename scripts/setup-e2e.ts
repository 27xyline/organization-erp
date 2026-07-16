import setupE2e from '../e2e/global-setup'

setupE2e().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
