import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { createBrowserRouter, RouterProvider } from "react-router"
import { RootProvider } from "fumadocs-ui/provider/react-router"
import { App } from "@/App"
import { artefactAsset, faviconAsset } from "@/config"
import "@/styles.css"

function installFavicons() {
  const managedAttr = "data-tahuna-managed-favicon"

  for (const node of document.head.querySelectorAll(`[${managedAttr}="true"]`)) {
    node.remove()
  }

  const links: Array<Record<string, string>> = [
    { rel: "icon", href: faviconAsset("favicon.ico"), type: "image/x-icon" },
    { rel: "icon", href: faviconAsset("favicon.svg"), type: "image/svg+xml" },
    { rel: "icon", href: faviconAsset("favicon-96x96.png"), type: "image/png", sizes: "96x96" },
    { rel: "apple-touch-icon", href: faviconAsset("apple-touch-icon.png"), sizes: "180x180" },
    { rel: "shortcut icon", href: faviconAsset("favicon.ico") },
    { rel: "manifest", href: faviconAsset("site.webmanifest") },
  ]

  for (const attributes of links) {
    const link = document.createElement("link")
    link.setAttribute(managedAttr, "true")

    for (const [key, value] of Object.entries(attributes)) {
      link.setAttribute(key, value)
    }

    document.head.append(link)
  }
}

installFavicons()
document.body.style.setProperty("--app-shell-background-image", `url("${artefactAsset("background.avif")}")`)

const router = createBrowserRouter([
  {
    path: "*",
    element: (
      <RootProvider>
        <App />
      </RootProvider>
    ),
  },
])

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
