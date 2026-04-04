/** @type {import('next').NextConfig} */
const convexSiteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL

const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "pub-5f7c225fd68446a9b652150d7c7e52e9.r2.dev",
      },
    ],
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
