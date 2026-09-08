import Image from "next/image"
import type { SVGProps } from "react"

import { HuggingFaceIcon } from "@/components/icons/huggingface-icon"
import { PyTorchIcon } from "@/components/icons/pytorch-icon"
import { CDN_CONFIG } from "@/config"

type Framework =
  | { name: string; icon: (props: SVGProps<SVGSVGElement>) => React.JSX.Element; logo?: never }
  | { name: string; logo: string; icon?: never }

const FRAMEWORKS: Framework[] = [
  { name: "PyTorch", icon: PyTorchIcon },
  { name: "HuggingFace", icon: HuggingFaceIcon },
  { name: "Unsloth", logo: frameworkIcon("unsloth_logo.png") },
  { name: "TRL", logo: frameworkIcon("trl_logo.png") },
  { name: "Verifiers", logo: frameworkIcon("prime-intellect_logo.png") },
]

function frameworkIcon(filename: string) {
  return `${CDN_CONFIG.baseUrl}${CDN_CONFIG.frameworkIconsPath}/${filename}`
}

export function FrameworksBar() {
  return (
    <section className="border-t border-border px-6 py-12 md:px-8 md:py-14">
      <div className="mx-auto max-w-4xl text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
          Bring the stack you already use
        </h2>
      </div>

      <div className="mx-auto mt-8 flex max-w-5xl flex-wrap items-center justify-center gap-x-14 gap-y-6">
        {FRAMEWORKS.map(({ name, icon: Icon, logo }) => (
          <span
            key={name}
            className="flex shrink-0 items-center gap-3 whitespace-nowrap text-2xl font-semibold text-muted-foreground/50"
          >
            {Icon ? (
              <Icon className="size-8 shrink-0 opacity-60" />
            ) : (
              <Image
                src={logo!}
                alt={name}
                width={32}
                height={32}
                className="shrink-0 opacity-60 grayscale brightness-0 dark:invert"
              />
            )}
            {name}
          </span>
        ))}
      </div>
    </section>
  )
}
