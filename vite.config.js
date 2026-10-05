import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: './',
  plugins: [
    {
      name: 'glb-png-alias',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url && req.url.includes('/models/') && req.url.endsWith('.png')) {
            req.url = req.url.slice(0, -4) + '.glb'
          }
          next()
        })
      },
    },
    vue({
      template: {
        compilerOptions: {
          isCustomElement: tag => ['model-viewer', 'extra-model'].includes(tag),
        },
      },
    }),
    tailwindcss(),
  ],
  server: {
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost/kickcraft',
        changeOrigin: true,
      },
    },
  },
})
