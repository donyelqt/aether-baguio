import { defineConfig } from 'vitest/config';

/**
 * Vitest config.
 *
 * Vitest 5 transforms with oxc, not esbuild — setting `esbuild.jsx` is silently
 * ignored and `.tsx` files fail to parse. Without JSX support here, any test
 * that transitively imports a component file breaks: `roads.ts` pulls
 * `groundAt` from `Terrain.tsx`, so the roads test drags JSX into a transform
 * that otherwise only ever sees plain TypeScript.
 *
 * oxc rather than the full React plugin because nothing under test needs the
 * automatic runtime or component mocking — only that the syntax parses.
 */
export default defineConfig({
  oxc: {
    jsx: { runtime: 'automatic', importSource: 'react' },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
