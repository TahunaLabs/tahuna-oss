import { DocsLayout } from "fumadocs-ui/layouts/docs"
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/page"
import defaultMdxComponents from "fumadocs-ui/mdx"
import { Navigate, Route, Routes, useParams } from "react-router"
import { baseOptions } from "@/layout.config"
import { source } from "app/lib/source"

function DocsPageRoute() {
  const params = useParams()
  const slug = params["*"]?.split("/").filter(Boolean)
  const page = source.getPage(slug?.length ? slug : undefined)

  if (!page) return <Navigate to="/docs" replace />

  const MDX = page.data.body

  return (
    <DocsLayout tree={source.pageTree} {...baseOptions}>
      <DocsPage toc={page.data.toc} full={page.data.full}>
        <DocsTitle>{page.data.title}</DocsTitle>
        <DocsDescription>{page.data.description}</DocsDescription>
        <DocsBody>
          <MDX components={{ ...defaultMdxComponents }} />
        </DocsBody>
      </DocsPage>
    </DocsLayout>
  )
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/docs" replace />} />
      <Route path="/docs/*" element={<DocsPageRoute />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
