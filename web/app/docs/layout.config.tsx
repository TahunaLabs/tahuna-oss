import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared"

export const docsLayoutOptions: BaseLayoutProps = {
  nav: {
    title: (
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded bg-emerald-600 text-xs font-bold text-white">
          T
        </div>
        <span className="font-semibold">Tahuna Docs</span>
      </div>
    ),
  },
  links: [
    {
      text: "Dashboard",
      url: "/dashboard",
    },
  ],
}
