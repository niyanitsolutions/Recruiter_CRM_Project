import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const isProduction = mode === 'production'

  return {
    plugins: [react()],

    // ── Development server ──────────────────────────────────────────────────
    server: {
      port: 3000,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true,
          // Generous timeouts so employee leave requests (more DB queries) don't get dropped
          proxyTimeout: 30000,   // 30 s — time for proxy to wait for backend response
          timeout: 30000,        // 30 s — socket inactivity timeout
        },
        // Proxy /uploads so resume files served by FastAPI StaticFiles
        // are accessible during local development without setting VITE_API_URL.
        '/uploads': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true,
          proxyTimeout: 15000,
          timeout: 15000,
        },
      },
    },

    // ── Path aliases ────────────────────────────────────────────────────────
    resolve: {
      alias: {
        '@': '/src',
      },
    },

    // ── Production build ────────────────────────────────────────────────────
    build: {
      outDir: 'dist',
      // Remove console.log / console.debug in production builds
      minify: isProduction ? 'terser' : false,
      terserOptions: isProduction
        ? {
            compress: {
              drop_console: true,
              drop_debugger: true,
            },
          }
        : undefined,
      // Hidden source maps — useful for error tracking but not exposed to users
      sourcemap: isProduction ? 'hidden' : true,
      // Split vendor chunks for better long-term caching
      rollupOptions: {
        output: {
          manualChunks(id) {
            // Core React runtime — loaded on every page, cache forever
            if (id.includes('node_modules/react/') ||
                id.includes('node_modules/react-dom/') ||
                id.includes('node_modules/react-router-dom/') ||
                id.includes('node_modules/scheduler/')) {
              return 'vendor-react'
            }
            // Redux — loaded on every page
            if (id.includes('@reduxjs/toolkit') || id.includes('react-redux')) {
              return 'vendor-redux'
            }
            // Heavy chart library — only loaded on dashboard/analytics pages
            if (id.includes('recharts') || id.includes('d3-')) {
              return 'vendor-charts'
            }
            // Icon library — large but tree-shaken; keep separate for caching
            if (id.includes('lucide-react')) {
              return 'vendor-icons'
            }
            // Utilities — small, group together
            if (id.includes('react-hook-form') ||
                id.includes('date-fns') ||
                id.includes('react-hot-toast')) {
              return 'vendor-utils'
            }
            // Axios + its deps — loaded on every page
            if (id.includes('node_modules/axios')) {
              return 'vendor-http'
            }
          },
        },
      },
      // Inline assets ≤ 4 kB directly into JS (saves a round trip per small image/svg)
      assetsInlineLimit: 4096,
      // Warn if any chunk exceeds 500 kB
      chunkSizeWarningLimit: 500,
    },
  }
})
