import { siGithub } from "simple-icons"
import type { SVGProps } from "react"

export function GitHubIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg role="img" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
      <title>{siGithub.title}</title>
      <path d={siGithub.path} />
    </svg>
  )
}
