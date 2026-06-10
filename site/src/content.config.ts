import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Content Layer API (Astro 5+). Markdown files live in src/content/blog/.
// NOTE: this config file is src/content.config.ts — NOT src/content/config.ts.
const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
  }),
});

// Legal pages (cookies, privacy, terms) render from one clean markdown source
// via src/pages/[legal].astro. File basename → URL slug (cookies.md → /cookies).
const legal = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/legal' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    updated: z.coerce.date(),
  }),
});

export const collections = { blog, legal };
