import { siHuggingface } from "simple-icons"
import type { SVGProps } from "react"

export function HuggingFaceIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg role="img" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
      <title>{siHuggingface.title}</title>
      <path d={siHuggingface.path} />
    </svg>
  )
}
