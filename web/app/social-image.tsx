import { ImageResponse } from "next/og"

import { Logo } from "@/components/logo"

export const socialImageAlt = "Tahuna | The RL Training Substrate"
export const socialImageSize = { width: 1200, height: 630 }
export const socialImageContentType = "image/png"

const WORDMARK = "Tahuna"

const cormorantFont = fetch(
  "https://osp.kitchen/work/caveat/tree/master/fonts/Cormorant_Garamond/CormorantGaramond-SemiBold.ttf",
).then((response) => {
  if (!response.ok) {
    throw new Error("Could not load Cormorant Garamond font source")
  }
  return response.arrayBuffer()
})

export async function renderSocialImage() {
  const fontData = await cormorantFont

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
            {WORDMARK}
          </div>
        </div>
      </div>
    ),
    {
      ...socialImageSize,
      fonts: [
        {
          name: "Cormorant Garamond",
          data: fontData,
          weight: 600,
          style: "normal",
        },
      ],
    },
  )
}
