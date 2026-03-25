/** @type {import('next').NextConfig} */
const convexSiteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL

const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async rewrites() {
    if (!convexSiteUrl) {
      return []
    }
    return [
      {
        source: '/api/:path*',
        destination: `${convexSiteUrl}/api/:path*`,
      },
    ];
  },
}

export default nextConfig
