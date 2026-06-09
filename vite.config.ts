import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  // GitHub Pages はリポジトリ名のサブパスで配信されるため、
  // 相対パスにしておくとサブパスでもアセットが正しく解決される。
  base: './',
  plugins: [react()],
});
