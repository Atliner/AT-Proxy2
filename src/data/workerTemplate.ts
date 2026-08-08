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
// Nova Proxy Ultra - High Performance Edge Worker (TCP + UDP Dual Engine)
// Generated automatically by Nova Proxy Setup Portal
// =========================================================================

import { connect } from 'cloudflare:sockets';

const DEFAULT_UUID = '${uuid}';
const DEFAULT_PROXY_IP = '${defaultProxyIp}';
const DEFAULT_SUB_PATH = '${subPath}';
const DEFAULT_SUB_TITLE = '${subTitle || 'Nova Proxy Edge Node'}';
const DEFAULT_CLEAN_IPS = ${cleanIpListStr};

// Random benign target websites for browser disguise / anti-probing
const RANDOM_REDIRECT_TARGETS = [
  'https://www.wikipedia.org',
  'https://www.speedtest.net',
  'https://www.cloudflare.com',
  'https://www.bing.com',
  'https://www.yahoo.com',
  'https://www.google.com',
  'https://www.github.com',
  'https://www.sciencedirect.com',
  'https://www.reuters.com'
];

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      const upgradeHeader = request.headers.get('Upgrade');

      let currentUuid = DEFAULT_UUID;
      let currentProxyIp = DEFAULT_PROXY_IP;
      let currentCleanIps = DEFAULT_CLEAN_IPS;

      if (env && env.NOVA_KV) {
        try {
          const kvSettings = await env.NOVA_KV.get('NOVA_SETTINGS', 'json');
          if (kvSettings) {
            if (kvSettings.uuid) currentUuid = kvSettings.uuid;
            if (kvSettings.proxyIp) currentProxyIp = kvSettings.proxyIp;
            if (kvSettings.cleanIps && Array.isArray(kvSettings.cleanIps)) currentCleanIps = kvSettings.cleanIps;
          }
        } catch (e) {
          // KV error fallback
        }
      }

      // 1. Handle VLESS WebSocket Connections (TCP & UDP Proxying)
      if (upgradeHeader && upgradeHeader.toLowerCase() === 'websocket') {
        return await vlessOverWSHandler(request, currentUuid, currentProxyIp);
      }

      // 2. Health check endpoint for testing
      if (url.pathname === '/health' || url.pathname === '/ping') {
        return new Response(JSON.stringify({ status: 'ok', engine: 'Nova-Dual-TCP-UDP', time: new Date().toISOString() }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      // 3. Subscription Request Handler
      const isSubPath = url.pathname === DEFAULT_SUB_PATH ||
        url.pathname.startsWith('/sub') ||
        url.pathname.startsWith('/api/sub') ||
        url.pathname === '/' + currentUuid;

      const userAgent = (request.headers.get('User-Agent') || '').toLowerCase();
      const isSubQueryOrClient = url.searchParams.has('sub') ||
        url.searchParams.has('format') ||
        /v2ray|clash|singbox|sing-box|streisand|shadowrocket|hiddify|nekobox|stash|foxray|sub|mihomo/i.test(userAgent);

      if (isSubPath || isSubQueryOrClient) {
        return handleSub(request, url, currentUuid, currentCleanIps);
      }

      // 4. Default Browser Disguise: Random Redirect to benign external website
      const randomRedirect = RANDOM_REDIRECT_TARGETS[Math.floor(Math.random() * RANDOM_REDIRECT_TARGETS.length)];
      return Response.redirect(randomRedirect, 302);

    } catch (err) {
      const fallbackTarget = RANDOM_REDIRECT_TARGETS[0];
      return Response.redirect(fallbackTarget, 302);
    }
  }
};

/**
 * High-performance VLESS over WebSocket handler with dual TCP and UDP support
 */
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
        console.error('VLESS authentication failed: invalid UUID');
        return;
      }

      const optLength = new Uint8Array(buffer.slice(17, 18))[0];
      const command = new Uint8Array(buffer.slice(18 + optLength, 19 + optLength))[0];
      const isUdp = (command === 2); // Command 2 = UDP
      const portBuffer = buffer.slice(19 + optLength, 21 + optLength);
      const port = new DataView(portBuffer).getUint16(0);

      let addressType = new Uint8Array(buffer.slice(21 + optLength, 22 + optLength))[0];
      let addressValueIndex = 22 + optLength;
      let addressLength = 0;
      let address = '';

      if (addressType === 1) { // IPv4
        addressLength = 4;
        address = new Uint8Array(buffer.slice(addressValueIndex, addressValueIndex + addressLength)).join('.');
      } else if (addressType === 2) { // Domain
        addressLength = new Uint8Array(buffer.slice(addressValueIndex, addressValueIndex + 1))[0];
        addressValueIndex += 1;
        address = new TextDecoder().decode(buffer.slice(addressValueIndex, addressValueIndex + addressLength));
      } else if (addressType === 3) { // IPv6
        addressLength = 16;
        const ipv6 = new Uint8Array(buffer.slice(addressValueIndex, addressValueIndex + addressLength));
        address = Array.from(ipv6).map((b) => b.toString(16).padStart(2, '0')).join(':');
      }

      const rawDataIndex = addressValueIndex + addressLength;
      const rawClientData = buffer.slice(rawDataIndex);

      // Reply back with VLESS response header (version 0, no addon)
      server.send(new Uint8Array([version[0], 0]));

      // Handle UDP traffic (Command 2)
      if (isUdp) {
        if (port === 53) {
          await handleDohDns(rawClientData, server);
        } else {
          // UDP packet forwarding via DoH / TCP relay
          await handleUdpRelay(rawClientData, address || defaultProxyIp, port, server);
        }
        return;
      }

      // Handle TCP traffic (Command 1)
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
          // Fallback to proxy IP if direct target connect fails
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
        console.error('TCP socket connection failed:', err);
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

/**
 * Handle DNS queries over DoH (1.1.1.1) for high-speed UDP DNS resolution
 */
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

/**
 * Handle non-DNS UDP packet relaying
 */
async function handleUdpRelay(udpData, targetHost, targetPort, webSocket) {
  try {
    const tcpSocket = connect({
      hostname: targetHost,
      port: targetPort,
    });
    if (udpData.byteLength > 0) {
      const writer = tcpSocket.writable.getWriter();
      await writer.write(udpData);
      writer.releaseLock();
    }
    remoteSocketToWS(tcpSocket, webSocket);
  } catch (err) {
    // Fallback ignore
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

/**
 * Handle subscription links generator with dual TCP and UDP nodes
 */
function handleSub(request, url, userUuid, cleanIps) {
  const host = request.headers.get('Host') || url.hostname;
  const userAgent = (request.headers.get('User-Agent') || '').toLowerCase();
  const format = (url.searchParams.get('format') || '').toLowerCase();

  const nodes = [];

  cleanIps.forEach((cleanIp, index) => {
    const isDomain = cleanIp.includes('.') && !cleanIp.match(/^\\d+\\.\\d+\\.\\d+\\.\\d+$/);
    const sniVal = isDomain ? cleanIp : host;

    // 1. High Speed TCP Node
    const tcpName = 'Nova-TCP-' + (index + 1) + '-' + cleanIp;
    const tcpUri = 'vless://' + userUuid + '@' + cleanIp + ':443?encryption=none&security=tls&type=ws&host=' + host + '&sni=' + sniVal + '&fp=chrome&path=%2Fvless-ws%3Fed%3D2048#' + encodeURIComponent(tcpName);
    nodes.push(tcpUri);

    // 2. High Speed UDP / Gaming Node
    const udpName = 'Nova-UDP-Gaming-' + (index + 1) + '-' + cleanIp;
    const udpUri = 'vless://' + userUuid + '@' + cleanIp + ':443?encryption=none&security=tls&type=ws&host=' + host + '&sni=' + sniVal + '&fp=chrome&path=%2Fvless-udp%3Fed%3D2048#' + encodeURIComponent(udpName);
    nodes.push(udpUri);
  });

  const rawSubContent = nodes.join('\\n');

  if (format === 'clash' || userAgent.includes('clash') || userAgent.includes('mihomo')) {
    const proxiesYaml = cleanIps.flatMap((cleanIp, i) => {
      const isDomain = cleanIp.includes('.') && !cleanIp.match(/^\\d+\\.\\d+\\.\\d+\\.\\d+$/);
      const sniVal = isDomain ? cleanIp : host;

      return [
        '  - name: "Nova-TCP-' + (i + 1) + '"\\n    type: vless\\n    server: ' + cleanIp + '\\n    port: 443\\n    uuid: ' + userUuid + '\\n    udp: true\\n    tls: true\\n    servername: ' + sniVal + '\\n    network: ws\\n    ws-opts:\\n      path: "/vless-ws?ed=2048"\\n      headers:\\n        Host: ' + host,
        '  - name: "Nova-UDP-' + (i + 1) + '"\\n    type: vless\\n    server: ' + cleanIp + '\\n    port: 443\\n    uuid: ' + userUuid + '\\n    udp: true\\n    tls: true\\n    servername: ' + sniVal + '\\n    network: ws\\n    ws-opts:\\n      path: "/vless-udp?ed=2048"\\n      headers:\\n        Host: ' + host
      ];
    }).join('\\n');

    const clashYaml = 'port: 7890\\nsocks-port: 7891\\nallow-lan: true\\nmode: Rule\\nlog-level: info\\nproxies:\\n' +
      proxiesYaml +
      '\\nproxy-groups:\\n  - name: "⚡ Nova-Auto-TCP"\\n    type: url-test\\n    url: "http://www.gstatic.com/generate_204"\\n    interval: 300\\n    proxies:\\n' +
      cleanIps.map((_, i) => '      - "Nova-TCP-' + (i + 1) + '"').join('\\n') +
      '\\n  - name: "🎮 Nova-UDP-Gaming"\\n    type: url-test\\n    url: "http://www.gstatic.com/generate_204"\\n    interval: 300\\n    proxies:\\n' +
      cleanIps.map((_, i) => '      - "Nova-UDP-' + (i + 1) + '"').join('\\n') +
      '\\nrules:\\n  - GEOIP,IR,DIRECT\\n  - MATCH,⚡ Nova-Auto-TCP';
    return new Response(clashYaml, { headers: { 'Content-Type': 'text/yaml; charset=utf-8', 'Access-Control-Allow-Origin': '*' } });
  }

  if (format === 'singbox' || userAgent.includes('singbox') || userAgent.includes('sing-box')) {
    const outbounds = cleanIps.flatMap((cleanIp, i) => {
      const isDomain = cleanIp.includes('.') && !cleanIp.match(/^\\d+\\.\\d+\\.\\d+\\.\\d+$/);
      const sniVal = isDomain ? cleanIp : host;

      return [
        {
          type: 'vless',
          tag: 'Nova-TCP-' + (i + 1),
          server: cleanIp,
          server_port: 443,
          uuid: userUuid,
          tls: { enabled: true, server_name: sniVal, insecure: false },
          transport: { type: 'ws', path: '/vless-ws?ed=2048', headers: { Host: host } }
        },
        {
          type: 'vless',
          tag: 'Nova-UDP-' + (i + 1),
          server: cleanIp,
          server_port: 443,
          uuid: userUuid,
          tls: { enabled: true, server_name: sniVal, insecure: false },
          transport: { type: 'ws', path: '/vless-udp?ed=2048', headers: { Host: host } }
        }
      ];
    });
    return new Response(JSON.stringify({ outbounds }, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' } });
  }

  if (format === 'raw') {
    return new Response(rawSubContent, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' } });
  }

  let b64 = '';
  try {
    b64 = btoa(rawSubContent);
  } catch (e) {
    b64 = btoa(unescape(encodeURIComponent(rawSubContent)));
  }

  return new Response(b64, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Subscription-Userinfo': 'upload=0; download=0; total=1073741824000; expire=0'
    }
  });
}
`;
}
