import { ImageResponse } from "next/og"

import { Logo } from "@/components/logo"

export const socialImageAlt = "Tahuna | The RL Training Substrate"
export const socialImageSize = { width: 1200, height: 630 }
export const socialImageContentType = "image/png"

export function renderSocialImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#000000",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "28px",
          }}
        >
          <Logo style={{ width: "96px", height: "96px" }} />
          <div
            style={{
              color: "#ffffff",
              fontFamily: '"Cormorant Garamond", serif',
              fontSize: "88px",
              fontWeight: 600,
              letterSpacing: "-0.04em",
              lineHeight: 1,
            }}
          >
            Tahuna
          </div>
        </div>
      </div>
    ),
    socialImageSize,
  )
}
