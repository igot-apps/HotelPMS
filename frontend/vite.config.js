import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Each build gets its own version. The running app compares it with /version.json to offer
// "Update available" after a new release (see src/lib/appVersion.js).
const APP_VERSION = new Date().toISOString();

const versionFile = () => ({
  name: 'hideout24-version-file',
  apply: 'build',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: APP_VERSION }) });
  },
});

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), versionFile()],
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
})
