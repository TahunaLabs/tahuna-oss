import { ImageResponse } from "next/og"

export const runtime = "edge"
export const alt = "Sign in | Tahuna"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default function OgImage() {
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
        }}
      >
        <div style={{ display: "flex", fontSize: 32, fontWeight: 400, color: "#a1a1aa", marginBottom: 24 }}>
          tahuna.app
        </div>
        <div style={{ display: "flex", fontSize: 64, fontWeight: 700, lineHeight: 1.15, marginBottom: 32 }}>
          Sign in to Tahuna
        </div>
        <div style={{ display: "flex", fontSize: 28, fontWeight: 400, color: "#a1a1aa", lineHeight: 1.5 }}>
          Manage your AI training runs, environments, and GPU infrastructure.
        </div>
      </div>
    ),
    { ...size },
  )
}
