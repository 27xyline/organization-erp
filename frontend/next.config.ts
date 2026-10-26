import type { NextConfig } from 'next'

const isDevelopment = process.env.NODE_ENV === 'development'

const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  distDir: process.env.NEXT_DIST_DIR || (isDevelopment ? '.next-dev' : '.next'),
  turbopack: {
    root: process.cwd(),
  },
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  images: {
    remotePatterns: [{ protocol: 'http', hostname: 'localhost' }],
  },
}

export default nextConfig
