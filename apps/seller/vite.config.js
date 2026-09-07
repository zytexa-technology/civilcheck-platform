import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite ko batate hain ki yeh React project hai
export default defineConfig({
  plugins: [react()],

  resolve: {
    // Same duplicate-React trap as apps/admin: apps/buyer pins react 19.1.0
    // and `nodeLinker: hoisted` puts that copy at the root, so this app gets
    // its own 19.2.7 while hoisted deps (react-router-dom) carry another.
    // Without deduping, <BrowserRouter> hits a null hooks dispatcher.
    dedupe: ['react', 'react-dom'],
  },
})