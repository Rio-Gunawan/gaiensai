import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { fileURLToPath, URL } from 'node:url';

// https://vite.dev/config/
export default defineConfig({
  plugins: [preact()],
  resolve: {
    alias: {
      '@ticket-codec': fileURLToPath(
        new URL(
          './supabase/functions/_shared/decodeTicketCode.ts',
          import.meta.url,
        ),
      ),
    },
  },
});
