import type { CapacitorConfig } from '@capacitor/cli';

// 劇場ペナントのネイティブアプリ設定（iOS/Android共通）
const config: CapacitorConfig = {
  appId: 'dev.yamamoto.gekijopennant',
  appName: '劇場ペナント',
  webDir: 'dist',
  backgroundColor: '#0d1117',
};

export default config;
