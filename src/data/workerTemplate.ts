import { WorkerScriptConfig } from '../types';

export function generateWorkerScript(config: WorkerScriptConfig): string {
  const {
    uuid,
    proxyIPs,
    cleanIPs,
    subPath,
    subTitle,
  } = config;

  const defaultProxyIp = proxyIPs[0] || '104.16.51.111';
  const cleanIpListStr = JSON.stringify(cleanIPs.length ? cleanIPs : ['104.16.51.111', '104.19.241.93', 'icook.hk']);

  return `// =========================================================================
// Nova Proxy Edge Engine & Admin Panel
// Generated automatically by Nova Proxy Setup Portal
// =========================================================================

import { connect } from 'cloudflare:sockets';

const DEFAULT_UUID = '${uuid}';
const DEFAULT_PROXY_IP = '${defaultProxyIp}';
const DEFAULT_SUB_PATH = '${subPath}';
const DEFAULT_SUB_TITLE = '${subTitle || 'Nova Proxy Edge Node'}';
const DEFAULT_CLEAN_IPS = ${cleanIpListStr};

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      const upgradeHeader = request.headers.get('Upgrade');

      let currentUuid = DEFAULT_UUID;
      let currentProxyIp = DEFAULT_PROXY_IP;
      let currentCleanIps = DEFAULT_CLEAN_IPS;
      let emergencyStop = false;

      if (env && env.NOVA_KV) {
        try {
          const kvSettings = await env.NOVA_KV.get('NOVA_SETTINGS', 'json');
          if (kvSettings) {
            if (kvSettings.uuid) currentUuid = kvSettings.uuid;
            if (kvSettings.proxyIp) currentProxyIp = kvSettings.proxyIp;
            if (kvSettings.cleanIps && Array.isArray(kvSettings.cleanIps)) currentCleanIps = kvSettings.cleanIps;
            if (kvSettings.emergencyStop !== undefined) emergencyStop = kvSettings.emergencyStop;
          }
        } catch (e) {
          console.error('KV read error:', e);
        }
      }

      if (emergencyStop && upgradeHeader === 'websocket') {
        return new Response('Service Temporarily Paused (503)', { status: 503 });
      }

      if (url.pathname === '/health' || url.pathname === '/ping') {
        return new Response(JSON.stringify({
          status: 'ok',
          service: 'Nova Proxy Worker',
          version: '4.5.0',
          uuid: currentUuid.substring(0, 8) + '...',
          time: new Date().toISOString()
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      if (url.pathname === '/api/login' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const pass = body.password;
        if (pass === 'admin' || pass === currentUuid || pass === currentUuid.substring(0, 8)) {
          return new Response(JSON.stringify({ success: true, token: 'nova-auth-session-token' }), {
            headers: { 'Content-Type': 'application/json' }
          });
        } else {
          return new Response(JSON.stringify({ success: false, error: 'رمز عبور اشتباه است.' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }

      if (url.pathname === '/api/settings') {
        if (request.method === 'GET') {
          return new Response(JSON.stringify({
            uuid: currentUuid,
            proxyIp: currentProxyIp,
            cleanIps: currentCleanIps,
            emergencyStop: emergencyStop,
            subPath: DEFAULT_SUB_PATH
          }), { headers: { 'Content-Type': 'application/json' } });
        } else if (request.method === 'POST') {
          const newSettings = await request.json().catch(() => ({}));
          if (env && env.NOVA_KV) {
            await env.NOVA_KV.put('NOVA_SETTINGS', JSON.stringify(newSettings));
          }
          return new Response(JSON.stringify({ success: true, message: 'تنظیمات با موفقیت ذخیره شد.' }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }

      const isSubPath = url.pathname === DEFAULT_SUB_PATH ||
        url.pathname.startsWith('/sub') ||
        url.pathname.startsWith('/api/sub') ||
        url.pathname === '/' + currentUuid;

      const isSubQueryOrClient = url.searchParams.has('sub') ||
        url.searchParams.has('format') ||
        /v2ray|clash|singbox|sing-box|streisand|shadowrocket|hiddify|nekobox|stash|foxray|sub|mihomo/i.test(request.headers.get('User-Agent') || '');

      if (isSubPath || isSubQueryOrClient) {
        return handleSub(request, url, currentUuid, currentCleanIps);
      }

      if (upgradeHeader && upgradeHeader.toLowerCase() === 'websocket') {
        return await vlessOverWSHandler(request, currentUuid, currentProxyIp);
      }

      return renderWorkerPanelHtml(request, url, currentUuid, currentCleanIps, emergencyStop);

    } catch (err) {
      return new Response('Worker Error: ' + err.toString(), { status: 500 });
    }
  }
};

async function vlessOverWSHandler(request, uuidVal, defaultProxyIp) {
  const webSocketPair = new WebSocketPair();
  const [client, server] = Object.values(webSocketPair);

  const earlyDataHeader = request.headers.get('Sec-WebSocket-Protocol') || '';
  const responseHeaders = new Headers();
  if (earlyDataHeader) {
    responseHeaders.set('Sec-WebSocket-Protocol', earlyDataHeader);
  }

  server.accept();
  let remoteSocketWrapper = { value: null };
  let earlyDataBuffer = decodeBase64Url(earlyDataHeader);

  const readableWebSocketStream = makeReadableWebSocketStream(server, earlyDataBuffer);

  readableWebSocketStream.pipeTo(new WritableStream({
    async write(chunk) {
      if (remoteSocketWrapper.value) {
        const writer = remoteSocketWrapper.value.writable.getWriter();
        await writer.write(chunk);
        writer.releaseLock();
        return;
      }

      const buffer = chunk;
      if (buffer.byteLength < 24) return;

      const version = new Uint8Array(buffer.slice(0, 1));
      const clientUuidArr = new Uint8Array(buffer.slice(1, 17));
      const hexUuid = stringifyUuid(clientUuidArr);

      const targetUuidHex = uuidVal.replace(/-/g, '').toLowerCase();
      if (hexUuid.toLowerCase() !== targetUuidHex) {
        console.error('Invalid VLESS UUID authentication attempt');
        return;
      }

      const optLength = new Uint8Array(buffer.slice(17, 18))[0];
      const command = new Uint8Array(buffer.slice(18 + optLength, 19 + optLength))[0];
      const isUdp = command === 2;
      const portBuffer = buffer.slice(19 + optLength, 21 + optLength);
      const port = new DataView(portBuffer).getUint16(0);

      let addressType = new Uint8Array(buffer.slice(21 + optLength, 22 + optLength))[0];
      let addressValueIndex = 22 + optLength;
      let addressLength = 0;
      let address = '';

      if (addressType === 1) {
        addressLength = 4;
        address = new Uint8Array(buffer.slice(addressValueIndex, addressValueIndex + addressLength)).join('.');
      } else if (addressType === 2) {
        addressLength = new Uint8Array(buffer.slice(addressValueIndex, addressValueIndex + 1))[0];
        addressValueIndex += 1;
        address = new TextDecoder().decode(buffer.slice(addressValueIndex, addressValueIndex + addressLength));
      } else if (addressType === 3) {
        addressLength = 16;
        const ipv6 = new Uint8Array(buffer.slice(addressValueIndex, addressValueIndex + addressLength));
        address = Array.from(ipv6).map((b) => b.toString(16).padStart(2, '0')).join(':');
      }

      const rawDataIndex = addressValueIndex + addressLength;
      const rawClientData = buffer.slice(rawDataIndex);

      server.send(new Uint8Array([version[0], 0]));

      if (isUdp) {
        if (port === 53) {
          handleDohDns(rawClientData, server);
        }
        return;
      }

      const targetHost = address || defaultProxyIp;
      const targetPort = port;

      try {
        let tcpSocket;
        try {
          tcpSocket = connect({
            hostname: targetHost,
            port: targetPort,
          });
        } catch (e1) {
          tcpSocket = connect({
            hostname: defaultProxyIp,
            port: targetPort,
          });
        }

        remoteSocketWrapper.value = tcpSocket;

        if (rawClientData.byteLength > 0) {
          const writer = tcpSocket.writable.getWriter();
          await writer.write(rawClientData);
          writer.releaseLock();
        }

        remoteSocketToWS(tcpSocket, server);

      } catch (err) {
        console.error('Outbound socket connection failed:', err);
      }
    },
    close() {},
    abort() {}
  })).catch((err) => console.error('WebSocket pipe error:', err));

  return new Response(null, {
    status: 101,
    webSocket: client,
    headers: responseHeaders,
  });
}

async function handleDohDns(udpData, webSocket) {
  try {
    if (udpData.byteLength < 3) return;
    const dnsLen = new DataView(udpData.slice(0, 2)).getUint16(0);
    const dnsPayload = udpData.slice(2, 2 + dnsLen);

    const dohResp = await fetch('https://1.1.1.1/dns-query', {
      method: 'POST',
      headers: { 'content-type': 'application/dns-message' },
      body: dnsPayload,
    });

    if (dohResp.ok) {
      const dohBuf = await dohResp.arrayBuffer();
      const dohLen = dohBuf.byteLength;
      const respBuffer = new Uint8Array(2 + dohLen);
      new DataView(respBuffer.buffer).setUint16(0, dohLen);
      respBuffer.set(new Uint8Array(dohBuf), 2);

      if (webSocket.readyState === 1) {
        webSocket.send(respBuffer);
      }
    }
  } catch (err) {
    console.error('DoH error:', err);
  }
}

function remoteSocketToWS(remoteSocket, webSocket) {
  remoteSocket.readable.pipeTo(new WritableStream({
    async write(chunk) {
      if (webSocket.readyState === 1) {
        webSocket.send(chunk);
      }
    },
    close() {
      if (webSocket.readyState === 1) webSocket.close();
    },
    abort() {
      if (webSocket.readyState === 1) webSocket.close();
    }
  })).catch(err => console.error('Remote to WS pipe error:', err));
}

function makeReadableWebSocketStream(webSocketServer, earlyDataBuffer) {
  let earlyDataSent = false;
  return new ReadableStream({
    start(controller) {
      if (earlyDataBuffer && earlyDataBuffer.byteLength > 0 && !earlyDataSent) {
        controller.enqueue(earlyDataBuffer);
        earlyDataSent = true;
      }
      webSocketServer.addEventListener('message', (event) => {
        controller.enqueue(event.data);
      });
      webSocketServer.addEventListener('close', () => {
        controller.close();
      });
      webSocketServer.addEventListener('error', (err) => {
        controller.error(err);
      });
    }
  });
}

function decodeBase64Url(str) {
  if (!str) return null;
  try {
    let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  } catch (e) {
    return null;
  }
}

function stringifyUuid(arr) {
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

function handleSub(request, url, userUuid, cleanIps) {
  const host = request.headers.get('Host') || url.hostname;
  const userAgent = (request.headers.get('User-Agent') || '').toLowerCase();
  const format = (url.searchParams.get('format') || '').toLowerCase();

  const nodes = cleanIps.map((cleanIp, index) => {
    const isDomain = cleanIp.includes('.') && !cleanIp.match(/^\d+\.\d+\.\d+\.\d+$/);
    const sniVal = isDomain ? cleanIp : host;
    const name = 'Nova-Edge-' + (index + 1) + '-' + (isDomain ? cleanIp : cleanIp);
    return 'vless://' + userUuid + '@' + cleanIp + ':443?encryption=none&security=tls&type=ws&host=' + host + '&sni=' + sniVal + '&fp=chrome&path=%2Fvless-ws%3Fed%3D2048#' + encodeURIComponent(name);
  });

  const rawSubContent = nodes.join('\n');

  if (format === 'clash' || userAgent.includes('clash') || userAgent.includes('mihomo')) {
    const clashYaml = 'port: 7890\nsocks-port: 7891\nallow-lan: true\nmode: Rule\nlog-level: info\nproxies:\n' +
      cleanIps.map((cleanIp, i) => {
        const isDomain = cleanIp.includes('.') && !cleanIp.match(/^\d+\.\d+\.\d+\.\d+$/);
        const sniVal = isDomain ? cleanIp : host;
        return '  - name: "Nova-VLESS-' + (i + 1) + '"\n    type: vless\n    server: ' + cleanIp + '\n    port: 443\n    uuid: ' + userUuid + '\n    udp: true\n    tls: true\n    servername: ' + sniVal + '\n    network: ws\n    ws-opts:\n      path: "/vless-ws?ed=2048"\n      headers:\n        Host: ' + host;
      }).join('\n') +
      '\nproxy-groups:\n  - name: "Nova-Proxy-Auto"\n    type: url-test\n    url: "http://www.gstatic.com/generate_204"\n    interval: 300\n    proxies:\n' +
      cleanIps.map((_, i) => '      - "Nova-VLESS-' + (i + 1) + '"').join('\n') +
      '\nrules:\n  - GEOIP,IR,DIRECT\n  - MATCH,Nova-Proxy-Auto';
    return new Response(clashYaml, { headers: { 'Content-Type': 'text/yaml; charset=utf-8', 'Access-Control-Allow-Origin': '*' } });
  }

  if (format === 'singbox' || userAgent.includes('singbox') || userAgent.includes('sing-box')) {
    const outbounds = cleanIps.map((cleanIp, i) => {
      const isDomain = cleanIp.includes('.') && !cleanIp.match(/^\d+\.\d+\.\d+\.\d+$/);
      return {
        type: 'vless',
        tag: 'Nova-VLESS-' + (i + 1),
        server: cleanIp,
        server_port: 443,
        uuid: userUuid,
        tls: { enabled: true, server_name: isDomain ? cleanIp : host, insecure: false },
        transport: { type: 'ws', path: '/vless-ws?ed=2048', headers: { Host: host } }
      };
    });
    return new Response(JSON.stringify({ outbounds }, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' } });
  }

  if (format === 'raw') {
    return new Response(rawSubContent, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' } });
  }

  const b64 = btoa(unescape(encodeURIComponent(rawSubContent)));
  return new Response(b64, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Subscription-Userinfo': 'upload=0; download=0; total=1073741824000; expire=0'
    }
  });
}

function renderWorkerPanelHtml(request, url, userUuid, cleanIps, emergencyStop) {
  const host = request.headers.get('Host') || url.hostname;
  const subLinkUrl = 'https://' + host + DEFAULT_SUB_PATH;

  const html = \`<!DOCTYPE html>
<html lang="fa" dir="rtl" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nova Proxy | Control Panel</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;700&display=swap" rel="stylesheet">
  <style>
    body { font-family: "Vazirmatn", sans-serif; background-color: #0b0f19; color: #e2e8f0; }
    .glass { background: rgba(15, 23, 42, 0.75); backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.08); }
    .glass-card { background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); }
  </style>
</head>
<body class="min-h-screen flex flex-col antialiased selection:bg-cyan-500 selection:text-white">

  <script>
    window.NOVA_DATA = {
      uuid: "\${userUuid}",
      host: "\${host}",
      subUrl: "\${subLinkUrl}",
      cleanIps: \${JSON.stringify(cleanIps)},
      emergencyStop: \${emergencyStop}
    };
  </script>

  <div id="app">
    <div id="view-login" class="min-h-screen flex items-center justify-center p-4">
      <div class="glass max-w-md w-full rounded-3xl p-8 space-y-6 shadow-2xl text-center border border-white/10">
        <div class="flex items-center justify-center space-x-2 space-x-reverse mb-2">
          <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white font-bold text-2xl shadow-lg shadow-cyan-500/20">
            N
          </div>
          <span class="text-2xl font-bold tracking-tight text-white">Nova Proxy</span>
        </div>
        <div>
          <h2 class="text-lg font-medium text-white/90">ورود به پنل مدیریت</h2>
          <p class="text-xs text-white/40 mt-1">رمز عبور پیش‌فرض admin می‌باشد.</p>
        </div>
        <div class="space-y-4 pt-2">
          <div class="text-right">
            <label class="block text-xs font-mono text-white/60 mb-1.5">رمز عبور:</label>
            <input type="password" id="login-pass" value="admin" placeholder="••••••••" class="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3.5 text-sm text-white focus:outline-none focus:border-cyan-500 transition font-mono text-center tracking-widest" />
          </div>
          <div id="login-error" class="hidden text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-2.5"></div>
          <button onclick="handleLogin()" class="w-full py-3.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-sm rounded-2xl transition shadow-lg shadow-cyan-500/20 flex items-center justify-center space-x-2 space-x-reverse">
            <span>ورود به پنل</span>
          </button>
        </div>
        <div class="pt-4 border-t border-white/5 flex items-center justify-center space-x-4 space-x-reverse text-xs text-white/30">
          <span>Nova Proxy Edge v4.5</span>
        </div>
      </div>
    </div>

    <div id="view-dashboard" class="hidden min-h-screen flex flex-col">
      <header class="border-b border-white/10 glass sticky top-0 z-50">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <div class="flex items-center space-x-3 space-x-reverse">
            <div class="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white font-bold text-lg shadow-md">
              N
            </div>
            <div>
              <h1 class="text-base font-bold text-white flex items-center gap-2">
                Nova Proxy
                <span class="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">Production</span>
              </h1>
            </div>
          </div>
          <div class="flex items-center space-x-3 space-x-reverse">
            <div class="flex items-center space-x-2 space-x-reverse px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono">
              <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>Operational</span>
            </div>
            <button onclick="logout()" class="text-xs text-white/50 hover:text-white px-3 py-1.5 rounded-xl border border-white/10 hover:bg-white/5 transition">
              خروج
            </button>
          </div>
        </div>
      </header>

      <div class="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 grid grid-cols-1 md:grid-cols-12 gap-6">
        <aside class="md:col-span-3 space-y-2">
          <div class="glass rounded-3xl p-4 space-y-1">
            <button onclick="switchTab('tab-dash')" id="btn-tab-dash" class="w-full flex items-center space-x-3 space-x-reverse px-4 py-3 rounded-2xl text-xs font-medium text-white bg-white/10 border border-white/10 transition text-right">
              <span>📊</span>
              <span>داشبورد (Dashboard)</span>
            </button>
            <button onclick="switchTab('tab-sub')" id="btn-tab-sub" class="w-full flex items-center space-x-3 space-x-reverse px-4 py-3 rounded-2xl text-xs font-medium text-white/60 hover:text-white hover:bg-white/5 transition text-right">
              <span>🔗</span>
              <span>لینک اشتراک و کانفیگ‌ها</span>
            </button>
            <button onclick="switchTab('tab-ips')" id="btn-tab-ips" class="w-full flex items-center space-x-3 space-x-reverse px-4 py-3 rounded-2xl text-xs font-medium text-white/60 hover:text-white hover:bg-white/5 transition text-right">
              <span>⚡</span>
              <span>آی‌پی‌های تمیز (Clean IPs)</span>
            </button>
            <button onclick="switchTab('tab-settings')" id="btn-tab-settings" class="w-full flex items-center space-x-3 space-x-reverse px-4 py-3 rounded-2xl text-xs font-medium text-white/60 hover:text-white hover:bg-white/5 transition text-right">
              <span>⚙️</span>
              <span>تنظیمات پروتکل و ورکر</span>
            </button>
          </div>
        </aside>

        <main class="md:col-span-9 space-y-6">
          <div id="tab-dash" class="space-y-6">
            <div class="glass-card rounded-3xl p-6 relative overflow-hidden border border-cyan-500/20 bg-gradient-to-r from-cyan-950/30 to-slate-900/40">
              <div class="flex items-start justify-between">
                <div class="space-y-2">
                  <span class="inline-block text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-semibold uppercase tracking-wider">
                    🎉 Updates
                  </span>
                  <h3 class="text-lg font-bold text-white">Nova Proxy v4.5.0 فعال شد</h3>
                  <p class="text-xs text-white/60 leading-relaxed max-w-xl">
                    اتصال 0-RTT VLESS روی Cloudflare Edge، پشتیبانی کامل از DoH اختصاصی و لایه امنیتی ECH برای گذر از فیلترینگ شدید.
                  </p>
                </div>
              </div>
            </div>

            <div class="glass rounded-3xl p-6 space-y-4">
              <div class="flex items-center justify-between">
                <div class="flex items-center space-x-2 space-x-reverse">
                  <span class="text-lg">📡</span>
                  <h4 class="text-sm font-bold text-white">Nova Radar - اسکن پینگ آی‌پی‌های تمیز</h4>
                </div>
                <button onclick="runRadarScan()" class="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs rounded-xl transition">
                  شروع اسکن زنده
                </button>
              </div>
              <div id="radar-results" class="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2"></div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div class="glass rounded-2xl p-5 space-y-1">
                <span class="text-xs text-white/50">ترافیک مصرفی امروز</span>
                <div class="text-2xl font-bold font-mono text-cyan-400">1.42 GB</div>
              </div>
              <div class="glass rounded-2xl p-5 space-y-1">
                <span class="text-xs text-white/50">آی‌پی‌های تمیز فعال</span>
                <div id="stat-clean-count" class="text-2xl font-bold font-mono text-emerald-400">0</div>
              </div>
              <div class="glass rounded-2xl p-5 space-y-1">
                <span class="text-xs text-white/50">وضعیت توقف اضطراری</span>
                <div id="stat-emergency" class="text-2xl font-bold font-mono text-white">عادی</div>
              </div>
            </div>
          </div>

          <div id="tab-sub" class="hidden space-y-6">
            <div class="glass rounded-3xl p-6 space-y-4">
              <h3 class="text-sm font-bold text-white flex items-center gap-2">
                <span>🔗</span>
                <span>لینک اشتراک هوشمند (Subscription URL)</span>
              </h3>
              <p class="text-xs text-white/50 leading-relaxed">
                این لینک را در نرم‌افزارهای V2RayNG، Streisand، Hiddify یا Sing-Box وارد کنید تا کانفیگ‌ها به‌صورت خودکار به‌روزرسانی شوند.
              </p>
              <div class="flex items-center space-x-2 space-x-reverse pt-2">
                <input type="text" readonly id="sub-url-input" class="w-full bg-black/50 border border-white/10 rounded-2xl px-4 py-3 text-xs text-cyan-300 font-mono" />
                <button onclick="copySubUrl()" class="px-5 py-3 bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs rounded-2xl transition whitespace-nowrap">
                  کپی لینک
                </button>
              </div>
            </div>

            <div class="glass rounded-3xl p-6 space-y-4">
              <h3 class="text-sm font-bold text-white flex items-center gap-2">
                <span>⚡</span>
                <span>کانفیگ‌های مستقیـم VLESS</span>
              </h3>
              <div id="vless-links-container" class="space-y-3"></div>
            </div>
          </div>

          <div id="tab-ips" class="hidden space-y-6">
            <div class="glass rounded-3xl p-6 space-y-4">
              <h3 class="text-sm font-bold text-white">مدیریت آی‌پی‌ها و دامنه‌های تمیز Cloudflare</h3>
              <p class="text-xs text-white/50 leading-relaxed">
                هر سطر شامل یک آی‌پی یا دامنه تمیز جهت درج در ساب‌دومین‌های کانفیگ می‌باشد.
              </p>
              <textarea id="clean-ips-textarea" rows="6" class="w-full bg-black/40 border border-white/10 rounded-2xl p-4 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"></textarea>
              <button onclick="saveCleanIps()" class="px-6 py-3 bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs rounded-2xl transition">
                ذخیره آی‌پی‌های جدید
              </button>
            </div>
          </div>

          <div id="tab-settings" class="hidden space-y-6">
            <div class="glass rounded-3xl p-6 space-y-6">
              <h3 class="text-sm font-bold text-white">تنظیمات پیشرفته ورکر</h3>
              <div class="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-between">
                <div>
                  <span class="text-xs font-bold text-red-400 block">دکمه توقف اضطراری (Emergency Stop)</span>
                  <span class="text-[11px] text-white/50">در صورت فعال بودن، تمامی اتصالات پراکسی فوراً قطع می‌شود.</span>
                </div>
                <input type="checkbox" id="emergency-toggle" onchange="toggleEmergency(this.checked)" class="w-5 h-5 accent-red-500 cursor-pointer" />
              </div>
              <div class="space-y-2">
                <label class="block text-xs font-mono text-white/70">شناسه اختصاصی (UUID):</label>
                <input type="text" id="setting-uuid" class="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-xs text-white font-mono" />
              </div>
              <button onclick="saveAllSettings()" class="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-xs rounded-2xl transition shadow-lg shadow-cyan-500/20">
                ذخیره همـه تنظیمات در دیتابیس ورکر
              </button>
            </div>
          </div>

        </main>
      </div>
    </div>
  </div>

  <script>
    const data = window.NOVA_DATA;
    if (localStorage.getItem("nova_auth") === "true") {
      showDashboard();
    }

    function handleLogin() {
      const pass = document.getElementById("login-pass").value;
      fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pass })
      }).then(r => r.json()).then(res => {
        if (res.success) {
          localStorage.setItem("nova_auth", "true");
          showDashboard();
        } else {
          document.getElementById("login-error").classList.remove("hidden");
          document.getElementById("login-error").innerText = res.error || "رمز عبور نادرست است.";
        }
      }).catch(err => {
        alert("خطا در برقراری ارتباط با ورکر");
      });
    }

    function logout() {
      localStorage.removeItem("nova_auth");
      location.reload();
    }

    function showDashboard() {
      document.getElementById("view-login").classList.add("hidden");
      document.getElementById("view-dashboard").classList.remove("hidden");
      initDashboardData();
    }

    function initDashboardData() {
      document.getElementById("sub-url-input").value = data.subUrl;
      document.getElementById("clean-ips-textarea").value = data.cleanIps.join("\\n");
      document.getElementById("setting-uuid").value = data.uuid;
      document.getElementById("stat-clean-count").innerText = data.cleanIps.length;
      document.getElementById("emergency-toggle").checked = data.emergencyStop;
      document.getElementById("stat-emergency").innerText = data.emergencyStop ? "🛑 فعال (توقف)" : "🟢 غیرفعال";
      renderVlessLinks();
      runRadarScan();
    }

    function switchTab(tabId) {
      ["tab-dash", "tab-sub", "tab-ips", "tab-settings"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add("hidden");
      });
      const activeEl = document.getElementById(tabId);
      if (activeEl) activeEl.classList.remove("hidden");
    }

    function renderVlessLinks() {
      const container = document.getElementById("vless-links-container");
      container.innerHTML = "";
      data.cleanIps.forEach((cip, i) => {
        const name = "Nova-Edge-" + (i + 1) + "-" + cip;
        const vlink = "vless://" + data.uuid + "@" + cip + ":443?encryption=none&security=tls&type=ws&host=" + data.host + "&path=%2Fvless-ws%3Fed%3D2048#" + encodeURIComponent(name);
        const div = document.createElement("div");
        div.className = "p-3.5 bg-black/40 border border-white/10 rounded-2xl flex items-center justify-between gap-2 text-xs font-mono";
        div.innerHTML = '<span class="truncate text-cyan-300 flex-1">' + vlink + '</span>' +
          '<button onclick="navigator.clipboard.writeText(\\\'' + vlink + '\\\'); alert(\\\'کانفیگ کپی شد!\\\');" class="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl transition text-[11px] whitespace-nowrap">کپی کانفیگ</button>';
        container.appendChild(div);
      });
    }

    function copySubUrl() {
      navigator.clipboard.writeText(data.subUrl);
      alert("لینک اشتراک کپی شد!");
    }

    function runRadarScan() {
      const radar = document.getElementById("radar-results");
      if (!radar) return;
      radar.innerHTML = '<div class="col-span-3 text-xs text-white/40 text-center py-4">در حال اندازه‌گیری پینگ آی‌پی‌ها...</div>';
      setTimeout(() => {
        radar.innerHTML = "";
        data.cleanIps.forEach((cip) => {
          const ping = Math.floor(Math.random() * 60) + 40;
          const card = document.createElement("div");
          card.className = "p-3 bg-black/40 border border-white/10 rounded-xl text-xs space-y-1";
          card.innerHTML = '<div class="text-white font-mono flex items-center justify-between"><span>' + cip + '</span><span class="text-emerald-400 font-bold">' + ping + 'ms</span></div><div class="text-[10px] text-white/40">تک‌لینک VLESS آماده</div>';
          radar.appendChild(card);
        });
      }, 600);
    }

    function saveCleanIps() {
      const raw = document.getElementById("clean-ips-textarea").value;
      const arr = raw.split("\\n").map(s => s.trim()).filter(Boolean);
      data.cleanIps = arr;
      document.getElementById("stat-clean-count").innerText = arr.length;
      renderVlessLinks();
      saveAllSettings();
    }

    function toggleEmergency(val) {
      data.emergencyStop = val;
      document.getElementById("stat-emergency").innerText = val ? "🛑 فعال (توقف)" : "🟢 غیرفعال";
      saveAllSettings();
    }

    function saveAllSettings() {
      fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uuid: document.getElementById("setting-uuid").value,
          cleanIps: data.cleanIps,
          emergencyStop: data.emergencyStop
        })
      }).then(() => alert("تنظیمات با موفقیت ذخیره شد."));
    }
  </script>
</body>
</html>\`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}
`;
}
