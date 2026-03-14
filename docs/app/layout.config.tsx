import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared"

export const baseOptions: BaseLayoutProps = {
  nav: {
    title: (
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded bg-emerald-600 flex items-center justify-center text-xs font-bold text-white">
          T
        </div>
        <span className="font-semibold">Tahuna Docs</span>
      </div>
    ),
  },
  links: [],
}
