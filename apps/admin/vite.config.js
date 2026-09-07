import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  resolve: {
    // apps/buyer pins react 19.1.0 (Expo) and pnpm-workspace.yaml sets
    // `nodeLinker: hoisted`, so pnpm hoists THAT copy to the root
    // node_modules. This app asks for ^19.2.5 and so gets its own private
    // apps/admin/node_modules/react@19.2.7 — while react-router-dom and
    // recharts resolve from the root tree and carry their own nested react.
    //
    // Two React instances on one page leaves the hooks dispatcher null for
    // whichever copy did not render the tree, which surfaces as
    // "Cannot read properties of null (reading 'useRef')" inside
    // <BrowserRouter>. Deduping pins every react/react-dom import — including
    // those reached through hoisted deps — to this app's single copy.
    dedupe: ['react', 'react-dom'],
  },
})
