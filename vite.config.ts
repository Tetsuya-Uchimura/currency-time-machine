/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { iwsdkDev } from '@iwsdk/vite-plugin-dev';
import { defineConfig, type Plugin } from 'vite';

/**
 * Dev server only: the BGM audition panel posts its rendered previews here, and they are saved
 * to audition/ (git-ignored) so they can be listened to and analysed outside the browser.
 */
const bgmSave: Plugin = {
  name: 'ctm-bgm-save',
  configureServer(server) {
    server.middlewares.use('/__bgm-save', (req, res) => {
      const name = (new URL(req.url ?? '/', 'http://local').searchParams.get('name') ?? '').replace(/[^\w.-]/g, '');
      if (req.method !== 'POST' || !/^bgm-[\w-]+\.(wav|json)$/.test(name)) {
        res.statusCode = 400;
        res.end();
        return;
      }
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        mkdirSync('audition', { recursive: true });
        writeFileSync(`audition/${name}`, Buffer.concat(chunks));
        res.end('saved');
      });
    });
  },
};

export default defineConfig({
  plugins: [iwsdkDev(), bgmSave],
  server: { host: '0.0.0.0', port: 8081, open: false },
  build: {
    outDir: 'dist',
    sourcemap: process.env.NODE_ENV !== 'production',
    target: 'esnext',
    rollupOptions: { input: './index.html' },
  },
  esbuild: { target: 'esnext' },
  // @drawcall/uikitml otherwise pulls a second three/@pmndrs/uikit graph
  // (its own three vs the app's super-three alias). Duplicate Component classes break
  // instanceof checks → "Only pmndrs/uikit components can be added as children".
  resolve: {
    dedupe: [
      'three',
      '@pmndrs/uikit',
      '@pmndrs/uikit-horizon',
      '@pmndrs/uikit-lucide',
    ],
  },
  optimizeDeps: {
    exclude: ['@babylonjs/havok'],
    include: [
      'three',
      '@pmndrs/uikit',
      '@pmndrs/uikit-horizon',
      '@pmndrs/uikit-lucide',
      '@drawcall/uikitml',
    ],
    esbuildOptions: { target: 'esnext' },
  },
  publicDir: 'public',
  base: './',
});
