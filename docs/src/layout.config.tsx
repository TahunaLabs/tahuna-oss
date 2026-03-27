import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared"
import { artefactAsset } from "@/config"

const docsLogo = artefactAsset("logo_3shades_gaussienfilter_tight.svg")

export const baseOptions: BaseLayoutProps = {
  nav: {
    title: (
      <div className="flex items-center gap-2">
        <img src={docsLogo} alt="Tahuna" className="h-6 w-auto" />
        <span className="font-semibold">Tahuna Docs</span>
      </div>
    ),
  },
  links: [],
  searchToggle: {
    enabled: false,
  },
}
