import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

// Versión de la app para los archivos exportados: número de package.json y commit con que se construyó
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
let commit = (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7) || 'sin-commit';
if (commit === 'sin-commit') try { commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { /* sin git (p. ej. otro entorno de build) */ }

// React y el cliente de Supabase en archivos propios: el navegador los guarda en caché entre versiones
// de la app y ningún archivo supera el aviso de 500 kB. Las librerías de exportación ya se cargan bajo demanda.
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(`${version} (${commit})`) },
  build: {
    // ExcelJS (~930 kB) es un archivo aparte que solo se descarga al exportar el análisis financiero
    chunkSizeWarningLimit: 1000,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'supabase', test: /node_modules[\\/]@supabase[\\/]/ },
          ],
        },
      },
    },
  },
});
