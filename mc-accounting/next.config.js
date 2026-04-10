/** @type {import('next').NextConfig} */
const isDevelopment = process.env.NODE_ENV === 'development'

const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || (isDevelopment ? '.next-dev' : '.next'),
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost' },
    ],
  },
}

module.exports = nextConfig
