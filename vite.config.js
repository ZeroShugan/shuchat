import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { wasm } from '@rollup/plugin-wasm';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import { NodeGlobalsPolyfillPlugin } from '@esbuild-plugins/node-globals-polyfill';
import inject from '@rollup/plugin-inject';
import topLevelAwait from 'vite-plugin-top-level-await';
import { VitePWA } from 'vite-plugin-pwa';
import fs from 'fs';
import path from 'path';
import buildConfig from './build.config';

const copyFiles = {
  targets: [
    {
      src: 'node_modules/@element-hq/element-call-embedded/dist/*',
      dest: 'public/element-call',
    },
    {
      // ShuChat Voice & Video: overwrite Element Call's index.html with a
      // version that (1) exposes RTCPeerConnections as window.__rtcPCs (used
      // by useConnectionStats + per-stream bitrate caps) and (2) loads
      // media-shim.js before the app bundle. Both injections are idempotent so
      // they survive whether or not node_modules was hand-patched before.
      src: 'node_modules/@element-hq/element-call-embedded/dist/index.html',
      dest: 'public/element-call',
      transform: (content) => {
        let html = String(content);
        if (!html.includes('__rtcPCs')) {
          const pcWrap =
            '<script>(function(){\n' +
            '  var OrigPC = window.RTCPeerConnection;\n' +
            '  window.__rtcPCs = [];\n' +
            '  window.RTCPeerConnection = function() {\n' +
            '    var pc = new (Function.prototype.bind.apply(OrigPC, [null].concat([].slice.call(arguments))))();\n' +
            '    window.__rtcPCs.push(pc);\n' +
            '    return pc;\n' +
            '  };\n' +
            '  window.RTCPeerConnection.prototype = OrigPC.prototype;\n' +
            '  Object.keys(OrigPC).forEach(function(k){ try{ window.RTCPeerConnection[k] = OrigPC[k]; }catch(e){} });\n' +
            '  window.RTCPeerConnection.generateCertificate = OrigPC.generateCertificate;\n' +
            '})();</script>';
          html = html.replace('<head>', `<head>${pcWrap}`);
        }
        if (!html.includes('media-shim.js')) {
          html = html.replace('<head>', '<head><script src="./media-shim.js"></script>');
        }
        return html;
      },
    },
    {
      // Multi-stream screenshare: expose the LiveKit Room instance to the
      // media-shim (window.__shuLKRoom) by tagging `this` where the Room
      // constructor creates its LocalParticipant. Regex keyed on the shape
      // `this.localParticipant=new <Minified>(""` so it survives minifier
      // renames; idempotent. If an Element Call update changes this shape the
      // shim logs "LiveKit room NOT exposed" and multi-share degrades cleanly.
      src: 'node_modules/@element-hq/element-call-embedded/dist/assets/index-*.js',
      dest: 'public/element-call/assets',
      transform: (content) => {
        const js = String(content);
        if (js.includes('__shuLKRoom')) return js;
        return js.replace(
          /this\.localParticipant=new ([A-Za-z_$][\w$]*)\(""/,
          '(window.__shuLKRoom=this).localParticipant=new $1(""'
        );
      },
    },
    {
      src: 'call-shim/media-shim.js',
      dest: 'public/element-call',
    },
    {
      // RNNoise neural noise suppression (vendored @jitsi/rnnoise-wasm 0.2.1,
      // SOC-scanned 2026-07-18, patched to a classic script). Lazily loaded by
      // media-shim when Settings → Voice & Video → RNNoise is enabled.
      src: 'call-shim/rnnoise-sync.js',
      dest: 'public/element-call',
    },
    {
      src: 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
      dest: '',
      rename: 'pdf.worker.min.js',
    },
    {
      src: 'netlify.toml',
      dest: '',
    },
    {
      src: 'config.json',
      dest: '',
    },
    {
      src: 'public/manifest.json',
      dest: '',
    },
    {
      // Stream pop-out page (desktop app; loaded via window.open + #shuchat-popout)
      src: 'public/popout.html',
      dest: '',
    },
    {
      src: 'public/res/android',
      dest: 'public/',
    },
    {
      src: 'public/locales',
      dest: 'public/',
    },
  ],
};

function serverMatrixSdkCryptoWasm(wasmFilePath) {
  return {
    name: 'vite-plugin-serve-matrix-sdk-crypto-wasm',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === wasmFilePath) {
          const resolvedPath = path.join(
            path.resolve(),
            '/node_modules/@matrix-org/matrix-sdk-crypto-wasm/pkg/matrix_sdk_crypto_wasm_bg.wasm'
          );

          if (fs.existsSync(resolvedPath)) {
            res.setHeader('Content-Type', 'application/wasm');
            res.setHeader('Cache-Control', 'no-cache');

            const fileStream = fs.createReadStream(resolvedPath);
            fileStream.pipe(res);
          } else {
            res.writeHead(404);
            res.end('File not found');
          }
        } else {
          next();
        }
      });
    },
  };
}

export default defineConfig({
  appType: 'spa',
  publicDir: false,
  base: buildConfig.base,
  server: {
    port: 8080,
    host: true,
    fs: {
      // Allow serving files from one level up to the project root
      allow: ['..'],
    },
  },
  plugins: [
    serverMatrixSdkCryptoWasm('/node_modules/.vite/deps/pkg/matrix_sdk_crypto_wasm_bg.wasm'),
    topLevelAwait({
      // The export name of top-level await promise for each chunk module
      promiseExportName: '__tla',
      // The function to generate import names of top-level await promise in each chunk module
      promiseImportName: (i) => `__tla_${i}`,
    }),
    viteStaticCopy(copyFiles),
    vanillaExtractPlugin(),
    wasm(),
    react(),
    VitePWA({
      srcDir: 'src',
      filename: 'sw.ts',
      strategies: 'injectManifest',
      injectRegister: false,
      manifest: false,
      injectManifest: {
        injectionPoint: undefined,
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
      plugins: [
        // Enable esbuild polyfill plugins
        NodeGlobalsPolyfillPlugin({
          process: false,
          buffer: true,
        }),
      ],
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    copyPublicDir: false,
    rollupOptions: {
      plugins: [inject({ Buffer: ['buffer', 'Buffer'] })],
    },
  },
});
