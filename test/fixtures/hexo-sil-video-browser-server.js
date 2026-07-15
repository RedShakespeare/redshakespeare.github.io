'use strict';

const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const {
  BUILTIN_SKINS,
  RUNTIME_ROUTES,
  renderBootstrapScript,
  renderVideoPlayer,
  runtimeRouteData
} = require('../../plugins/hexo-sil-video');

const PORT = 4173;
const ROOT = `http://127.0.0.1:${PORT}`;
const runtimeUrls = Object.fromEntries(Object.entries(RUNTIME_ROUTES).map(([name, route]) => [name, `/${route}`]));
const subtitleSource = `[Script Info]
ScriptType: v4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,liberation sans,24,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,1,0,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,Browser subtitle`;
let mediaFixturePromise;

function player({ subtitles = false, title = 'Browser Fixture' } = {}) {
  return renderVideoPlayer({
    title,
    source: '/test/hexo-sil-video-fixture.webm',
    type: 'video/webm',
    poster: '',
    preload: 'metadata',
    aspectRatio: '16/9',
    subtitles: subtitles ? [{
      format: 'ass',
      label: '测试字幕',
      srclang: 'zh-Hans',
      default: true,
      url: '/test/default.ass'
    }] : [],
    fonts: {},
    fallbackFont: '',
    runtime: runtimeUrls
  });
}

function instrumentScript() {
  return `<script>(()=>{
    let fullscreenElement=null;
    const fullscreenDescriptor={configurable:true,get:()=>fullscreenElement};
    try{Object.defineProperty(document,'fullscreenElement',fullscreenDescriptor);}catch{try{Object.defineProperty(Object.getPrototypeOf(document),'fullscreenElement',fullscreenDescriptor);}catch{}}
    Object.defineProperty(document,'exitFullscreen',{configurable:true,value:async()=>{fullscreenElement=null;document.dispatchEvent(new Event('fullscreenchange'));}});
    window.__instrumentVideoPlayers=()=>document.querySelectorAll('[data-sil-video-player]').forEach(root=>{
      if(root.dataset.fixtureInstrumented==='true')return;
      root.dataset.fixtureInstrumented='true';
      const stage=root.querySelector('[data-sil-video-stage]');
      Object.defineProperty(stage,'requestFullscreen',{configurable:true,value:async()=>{fullscreenElement=stage;document.dispatchEvent(new Event('fullscreenchange'));}});
    });
    window.__instrumentVideoPlayers();
  })();</script>`;
}

function bootstrap() {
  return renderBootstrapScript({
    styles: ['/css/hexo-sil-video.css'],
    script: runtimeUrls.script
  });
}

function documentHtml(content, extraScript = '') {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Video fixture</title><style>body{max-width:760px;margin:2rem auto;font-family:sans-serif}</style></head><body>${content}${instrumentScript()}${extraScript}${bootstrap()}</body></html>`;
}

function page(pathname) {
  if (pathname === '/plain') return documentHtml('<main><h1>Plain page</h1></main>');
  if (pathname === '/video-no-subtitles') return documentHtml(player());
  if (pathname === '/video-subtitles') return documentHtml(player({ subtitles: true }));
  if (pathname === '/video-two-subtitles') return documentHtml(`${player({ subtitles: true, title: 'First' })}${player({ subtitles: true, title: 'Second' })}`);
  if (pathname === '/dynamic') {
    const encoded = Buffer.from(player()).toString('base64');
    return documentHtml('<main id="mount"><h1>Dynamic page</h1></main>', `<script>window.insertVideo=()=>{const box=document.createElement('div');box.innerHTML=atob('${encoded}');document.querySelector('#mount').append(...box.childNodes);window.__instrumentVideoPlayers();document.dispatchEvent(new Event('inside'));};</script>`);
  }
  return '';
}

function contentType(route) {
  if (route.endsWith('.css')) return 'text/css; charset=utf-8';
  if (route.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (route.endsWith('.wasm')) return 'application/wasm';
  if (route.endsWith('.woff2')) return 'font/woff2';
  return 'application/octet-stream';
}

async function main() {
  const routes = new Map((await runtimeRouteData()).map(route => [`/${route.path}`, route.data]));
  routes.set('/css/hexo-sil-video.css', await fs.readFile(BUILTIN_SKINS.ephesus.sourcePath));
  const server = http.createServer(async (request, response) => {
    const pathname = new URL(request.url, ROOT).pathname;
    const html = page(pathname);
    let body;
    let type;
    if (html) {
      body = Buffer.from(html);
      type = 'text/html; charset=utf-8';
    } else if (routes.has(pathname)) {
      body = routes.get(pathname);
      type = contentType(pathname);
    } else if (pathname === '/test/default.ass') {
      body = Buffer.from(subtitleSource);
      type = 'text/x-ssa; charset=utf-8';
    } else if (pathname === '/test/hexo-sil-video-fixture.webm') {
      mediaFixturePromise ||= fs.readFile(path.join(__dirname, 'hexo-sil-video-fixture.webm'));
      body = await mediaFixturePromise;
      type = 'video/webm';
    } else {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not Found');
      return;
    }
    let status = 200;
    const headers = {
      'Content-Type': type,
      'Content-Length': body.length,
      'Cache-Control': 'no-store'
    };
    if (pathname === '/test/hexo-sil-video-fixture.webm') {
      headers['Accept-Ranges'] = 'bytes';
      const totalLength = body.length;
      const match = String(request.headers.range || '').match(/^bytes=(\d+)-(\d*)$/);
      if (match) {
        const start = Number(match[1]);
        const end = match[2] ? Number(match[2]) : body.length - 1;
        if (start < body.length && start <= end) {
          body = body.subarray(start, Math.min(end + 1, body.length));
          status = 206;
          headers['Content-Range'] = `bytes ${start}-${start + body.length - 1}/${totalLength}`;
          headers['Content-Length'] = body.length;
        }
      }
    }
    response.writeHead(status, headers);
    response.end(request.method === 'HEAD' ? undefined : body);
  });
  server.listen(PORT, '127.0.0.1');
  const close = () => server.close(() => process.exit(0));
  process.on('SIGINT', close);
  process.on('SIGTERM', close);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
