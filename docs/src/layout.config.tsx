import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared"
import { faviconAsset } from "@/config"

const docsLogo = faviconAsset("apple-touch-icon.png")

export const baseOptions: BaseLayoutProps = {
  nav: {
    title: (
      <div className="flex items-center gap-2">
        <img src={docsLogo} alt="Tahuna" className="h-6 w-6 rounded-md" />
        <span className="font-semibold">Tahuna Docs</span>
      </div>
    ),
  },
  links: [],
  searchToggle: {
    enabled: false,
  },
}
