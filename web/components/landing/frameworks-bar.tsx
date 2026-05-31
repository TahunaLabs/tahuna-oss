import Image from "next/image"

import { CDN_CONFIG } from "@/config"

const FRAMEWORKS = [
  { name: "PyTorch", logo: frameworkIcon("pytorch_logo.png") },
  { name: "HuggingFace", logo: frameworkIcon("hugging-face_logo.png") },
  { name: "Unsloth", logo: frameworkIcon("unsloth_logo.png") },
  { name: "TRL", logo: frameworkIcon("trl_logo.png") },
  { name: "Verifiers", logo: frameworkIcon("prime-intellect_logo.png") },
] as const

function frameworkIcon(filename: string) {
  return `${CDN_CONFIG.baseUrl}${CDN_CONFIG.frameworkIconsPath}/${filename}`
}

export function FrameworksBar() {
  return (
    <section className="border-t border-border px-6 py-20 md:px-8 md:py-24">
      <div className="mx-auto max-w-4xl text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
          Works with the stack you already use
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-lg leading-relaxed text-muted-foreground">
          PyTorch, Hugging Face, Unsloth, TRL, Verifiers — and anything that runs from a Python entrypoint.
        </p>
      </div>

      <div className="mx-auto mt-12 flex max-w-5xl flex-wrap items-center justify-center gap-x-14 gap-y-8">
        {FRAMEWORKS.map(({ name, logo }) => (
          <span
            key={name}
            className="flex shrink-0 items-center gap-3 whitespace-nowrap text-2xl font-semibold text-muted-foreground/50"
          >
            <Image
              src={logo}
              alt={name}
              width={32}
              height={32}
              className="shrink-0 opacity-60 grayscale brightness-0 dark:invert"
            />
            {name}
          </span>
        ))}
      </div>
    </section>
  )
}
