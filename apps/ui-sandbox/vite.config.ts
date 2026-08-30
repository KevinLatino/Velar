import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Minimal second consumer of @velar/ui. Vite resolves `@velar/ui` through its
// published `exports` map (dist), so this app never reaches into apps/web.
export default defineConfig({
  plugins: [react()],
});
