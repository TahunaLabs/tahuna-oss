import Image from 'next/image'

import { Eyebrow } from '@/components/ui/eyebrow'
import { ScrollRail } from '@/components/ui/scroll-rail'
import { CDN_CONFIG } from '@/config'

const FRAMEWORKS = [
  { name: 'PyTorch', logo: frameworkIcon('pytorch_logo.png') },
  { name: 'HuggingFace', logo: frameworkIcon('hugging-face_logo.png') },
  { name: 'Unsloth', logo: frameworkIcon('unsloth_logo.png') },
  { name: 'TRL', logo: frameworkIcon('trl_logo.png') },
  { name: 'Prime Intellect', logo: frameworkIcon('prime-intellect_logo.png') },
] as const

function frameworkIcon(filename: string) {
  return `${CDN_CONFIG.baseUrl}${CDN_CONFIG.frameworkIconsPath}/${filename}`
}

export function FrameworksBar() {
  return (
    <section className="shrink-0 px-8 py-8">
      <div className="flex items-center gap-8">
        <Eyebrow variant="cancelling" className="shrink-0">
          Works with your stack
        </Eyebrow>

        <ScrollRail className="ml-auto mr-4 max-w-2xl">
          <div className="flex items-center gap-12 pr-12">
            {FRAMEWORKS.map(({ name, logo }) => (
              <span
                key={name}
                className="flex shrink-0 items-center gap-3 whitespace-nowrap text-2xl font-semibold text-muted-foreground/40"
              >
                <Image
                  src={logo}
                  alt={name}
                  width={36}
                  height={36}
                  className="shrink-0 opacity-60 grayscale brightness-0 dark:invert"
                />
                {name}
              </span>
            ))}
          </div>
        </ScrollRail>
      </div>
    </section>
  )
}
