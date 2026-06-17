import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared"
import { faviconAsset } from "@/config"

const docsLogo = faviconAsset("apple-touch-icon.png")
const changelogUrl = "https://github.com/TahunaLabs/tahuna/releases"

export const baseOptions: BaseLayoutProps = {
  nav: {
    title: (
      <div className="flex items-center gap-2">
        <img src={docsLogo} alt="Tahuna" className="h-6 w-6 rounded-md" />
        <span className="font-semibold">Tahuna Docs</span>
      </div>
    ),
  },
  links: [
    {
      type: "menu",
      text: "Guides",
      items: [
        {
          text: "Quickstart",
          description: "Create a project and launch the first run.",
          url: "/quickstart",
          active: "nested-url",
        },
        {
          text: "Training Runs",
          description: "Launch, monitor, and inspect GPU training runs.",
          url: "/runs",
          active: "nested-url",
        },
        {
          text: "Serving",
          description: "Deploy a trained model for inference.",
          url: "/serving",
          active: "nested-url",
        },
        {
          text: "Auto-Research / Hillclimb",
          description: "Run bounded local research loops.",
          url: "/auto-research",
          active: "nested-url",
        },
      ],
    },
    {
      type: "menu",
      text: "References",
      items: [
        {
          text: "CLI Reference",
          description: "Exact Tahuna command surface.",
          url: "/cli",
          active: "nested-url",
        },
        {
          text: "Environments",
          description: "Project runtime and GPU configuration.",
          url: "/environments",
          active: "nested-url",
        },
        {
          text: "Syncing",
          description: "Code and data snapshot behavior.",
          url: "/syncing",
          active: "nested-url",
        },
        {
          text: "Agent Skills",
          description: "Tahuna workflow skills for coding agents.",
          url: "/agent-skills",
          active: "nested-url",
        },
      ],
    },
    {
      text: "Changelog",
      url: changelogUrl,
      external: true,
      active: "none",
    },
  ],
  searchToggle: {
    enabled: false,
  },
}
