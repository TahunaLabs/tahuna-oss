import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { createBrowserRouter, RouterProvider } from "react-router"
import { RootProvider } from "fumadocs-ui/provider/react-router"
import { App } from "@/App"
import "@/styles.css"

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
