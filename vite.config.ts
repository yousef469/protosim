import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('@mujoco/mujoco')) return 'mujoco'
          if (id.includes('@tensorflow/tfjs')) return 'tfjs'
        },
      },
    },
  },
  optimizeDeps: {
    exclude: ['@mujoco/mujoco'],
  },
})
