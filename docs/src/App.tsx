import { HomeLayout } from "fumadocs-ui/layouts/home"
import { DocsLayout } from "fumadocs-ui/layouts/docs"
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from "fumadocs-ui/page"
import defaultMdxComponents from "fumadocs-ui/mdx"
import { Link, Navigate, Route, Routes, useParams } from "react-router"
import { baseOptions } from "@/layout.config"
import { source } from "app/lib/source"

function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-emerald-600 text-2xl font-bold text-white">
        T
      </div>
      <h1 className="text-4xl font-bold">Tahuna</h1>
      <p className="max-w-lg text-lg text-fd-muted-foreground">
        The compute platform for machine learning. Train, deploy, and manage
        your ML workloads with GPU-accelerated environments.
      </p>
      <div className="flex items-center gap-4">
        <Link
          to="/docs"
          className="rounded-lg bg-fd-primary px-6 py-3 text-sm font-medium text-fd-primary-foreground hover:bg-fd-primary/90"
        >
          Get Started
        </Link>
        <Link
          to="/docs/cli"
          className="rounded-lg border border-fd-border px-6 py-3 text-sm font-medium hover:bg-fd-accent"
        >
          CLI Reference
        </Link>
      </div>
    </main>
  )
}

function DocsContentRoute() {
  const params = useParams()
  const slug = params["*"]?.split("/").filter(Boolean)
  const page = source.getPage(slug && slug.length > 0 ? slug : undefined)

  if (!page) {
    return <Navigate to="/docs" replace />
  }

  const MDX = page.data.body

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX components={{ ...defaultMdxComponents }} />
      </DocsBody>
    </DocsPage>
  )
}

function DocsRoute() {
  return (
    <DocsLayout tree={source.pageTree} {...baseOptions}>
      <DocsContentRoute />
    </DocsLayout>
  )
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeLayout {...baseOptions}><HomePage /></HomeLayout>} />
      <Route path="/docs" element={<DocsRoute />} />
      <Route path="/docs/*" element={<DocsRoute />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
