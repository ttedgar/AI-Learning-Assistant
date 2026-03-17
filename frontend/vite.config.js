import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  // When @vitejs/plugin-react's Babel transform is bypassed in the Vitest
  // jsdom worker, esbuild handles JSX. Setting jsx:'automatic' ensures it
  // uses React's automatic runtime (react/jsx-runtime) instead of the
  // classic React.createElement form that requires React in scope.
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
  },
})
