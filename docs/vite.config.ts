import { fileURLToPath, URL } from "node:url"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import mdx from "fumadocs-mdx/vite"
import * as MdxConfig from "#source-config"

export default defineConfig({
  plugins: [tailwindcss(), mdx(MdxConfig), react()],
  resolve: {
    dedupe: ["react", "react-dom", "react-router"],
    alias: {
      "node:path": "path-browserify",
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      app: fileURLToPath(new URL("./app", import.meta.url)),
      collections: fileURLToPath(new URL("./.source", import.meta.url)),
    },
  },
})
