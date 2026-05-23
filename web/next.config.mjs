/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "pub-5f7c225fd68446a9b652150d7c7e52e9.r2.dev",
      },
    ],
  },
}

export default nextConfig