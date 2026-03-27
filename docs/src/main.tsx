import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router"
import { RootProvider } from "fumadocs-ui/provider/react-router"
import { App } from "@/App"
import "@/styles.css"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <RootProvider>
        <App />
      </RootProvider>
    </BrowserRouter>
  </StrictMode>,
)
