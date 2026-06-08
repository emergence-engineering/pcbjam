// @ts-check
import { defineConfig, envField } from 'astro/config';
import vercel from '@astrojs/vercel';

// Static by default (every page prerenders to HTML, zero client JS).
// The Vercel adapter is wired in so any single route can opt into
// per-request SSR later with `export const prerender = false;`.
// See README.md ("SSR per route") for how.
export default defineConfig({
  output: 'static',
  adapter: vercel(),
  // Prefetch linked pages so SPA-style navigation feels instant.
  prefetch: { prefetchAll: true, defaultStrategy: 'viewport' },
  // Typed, validated server secrets for the waitlist endpoint. All optional so
  // the build never requires them and the endpoint degrades gracefully when a
  // key is absent (see src/pages/api/waitlist.ts). The @astrojs/vercel adapter
  // reads these from process.env at runtime — never inlined into the bundle.
  env: {
    schema: {
      RESEND_API_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      RESEND_SEGMENT_ID: envField.string({ context: 'server', access: 'secret', optional: true }),
      WAITLIST_FROM_EMAIL: envField.string({
        context: 'server',
        access: 'secret',
        optional: true,
        default: 'PCBJam <hello@pcbjam.com>',
      }),
    },
  },
});
