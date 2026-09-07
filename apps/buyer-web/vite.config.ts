import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  resolve: {
    // Same duplicate-React trap as apps/admin and apps/seller: apps/buyer pins
    // react 19.1.0 and pnpm-workspace.yaml sets `nodeLinker: hoisted`, so pnpm
    // hoists THAT copy to the root node_modules while this app's own
    // react-router-dom resolves a different nested react. Two React instances
    // on one page leaves the hooks dispatcher null for whichever copy did not
    // render the tree ("Cannot read properties of null (reading 'useRef')"
    // inside <BrowserRouter>). Deduping pins every react/react-dom import to
    // this app's single copy.
    dedupe: ['react', 'react-dom'],
  },

  server: {
    port: 5175,
  },
})
