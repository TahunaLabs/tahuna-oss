import { ImageResponse } from "next/og"

export const runtime = "edge"
export const alt = "Tahuna | A gentle control plane for post-training"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default async function OgImage() {
  const [geistBold, geistRegular] = await Promise.all([
    fetch("https://cdn.jsdelivr.net/fontsource/fonts/geist-sans@latest/latin-700-normal.woff").then((r) => r.arrayBuffer()),
    fetch("https://cdn.jsdelivr.net/fontsource/fonts/geist-sans@latest/latin-400-normal.woff").then((r) => r.arrayBuffer()),
  ])

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
          width: "100%",
          height: "100%",
          padding: "80px",
          backgroundColor: "#0a0a0a",
          color: "#fafafa",
          fontFamily: "Geist",
        }}
      >
        <div style={{ display: "flex", fontSize: 32, fontWeight: 400, color: "#a1a1aa", marginBottom: 24 }}>
          tahuna.app
        </div>
        <div style={{ display: "flex", fontSize: 64, fontWeight: 700, lineHeight: 1.15, marginBottom: 32 }}>
          A gentle control plane for post-training
        </div>
        <div style={{ display: "flex", fontSize: 28, fontWeight: 400, color: "#a1a1aa", lineHeight: 1.5 }}>
          Train, fine-tune, and run reinforcement learning on your AI models — no research lab required.
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Geist", data: geistBold, weight: 700, style: "normal" },
        { name: "Geist", data: geistRegular, weight: 400, style: "normal" },
      ],
    },
  )
}
