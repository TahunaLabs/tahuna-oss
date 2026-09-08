const assetsUrl = process.env.NEXT_PUBLIC_ASSETS_URL
if (!assetsUrl) throw new Error("NEXT_PUBLIC_ASSETS_URL is required")

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: process.env.NEXT_OUTPUT_MODE === "standalone" ? "standalone" : undefined,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: new URL(assetsUrl).hostname,
      },
    ],
  },
}

export default nextConfig
