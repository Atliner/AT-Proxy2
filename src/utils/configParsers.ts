import * as jsyaml from 'js-yaml';
import { ProxyNode, FragmentConfig } from '../types';

export function generateRandomUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function generateVlessUri(node: ProxyNode): string {
  const {
    uuid,
    address,
    port,
    security,
    transport,
    host,
    sni,
    path,
    name,
    fragment,
  } = node;

  const params = new URLSearchParams();
  params.set('encryption', 'none');
  params.set('security', security || 'tls');
  params.set('type', transport || 'ws');
  if (host) params.set('host', host);
  const isDomain = address.includes('.') && !address.match(/^\d+\.\d+\.\d+\.\d+$/);
  const effectiveSni = sni || (isDomain ? address : host) || '';
  if (effectiveSni) params.set('sni', effectiveSni);
  params.set('fp', 'chrome');
  if (path) params.set('path', path);

  const queryStr = params.toString();
  const remark = encodeURIComponent(name || 'Nova-VLESS-Node');

  return `vless://${uuid}@${address}:${port}?${queryStr}#${remark}`;
}

export function generateVmessUri(node: ProxyNode): string {
  const vmessObj = {
    v: '2',
    ps: node.name || 'Nova-VMESS-Node',
    add: node.address,
    port: node.port,
    id: node.uuid,
    aid: node.alterId || 0,
    scy: node.cipher || 'auto',
    net: node.transport || 'ws',
    type: 'none',
    host: node.host || '',
    path: node.path || '/',
    tls: node.security === 'tls' ? 'tls' : '',
    sni: node.sni || node.host || '',
    alpn: '',
    fp: 'chrome',
  };

  const jsonStr = JSON.stringify(vmessObj);
  const b64 = btoa(unescape(encodeURIComponent(jsonStr)));
  return `vmess://${b64}`;
}

export function generateTrojanUri(node: ProxyNode): string {
  const params = new URLSearchParams();
  params.set('security', node.security || 'tls');
  params.set('type', node.transport || 'ws');
  if (node.host) params.set('host', node.host);
  if (node.sni) params.set('sni', node.sni);
  if (node.path) params.set('path', node.path);

  const queryStr = params.toString();
  const remark = encodeURIComponent(node.name || 'Nova-Trojan-Node');

  return `trojan://${node.uuid}@${node.address}:${node.port}?${queryStr}#${remark}`;
}

export function generateNodeUri(node: ProxyNode): string {
  if (node.protocol === 'vmess') return generateVmessUri(node);
  if (node.protocol === 'trojan') return generateTrojanUri(node);
  return generateVlessUri(node);
}

export function parseProxyUri(link: string): ProxyNode | null {
  try {
    const trimmed = link.trim();
    if (!trimmed) return null;

    if (trimmed.startsWith('vless://')) {
      const url = new URL(trimmed);
      const uuid = url.username;
      const address = url.hostname;
      const port = parseInt(url.port || '443', 10);
      const name = url.hash ? decodeURIComponent(url.hash.replace('#', '')) : 'Decoded-VLESS';
      const security = url.searchParams.get('security') === 'tls' ? 'tls' : 'none';
      const transport = (url.searchParams.get('type') as 'ws' | 'grpc') || 'ws';
      const host = url.searchParams.get('host') || '';
      const sni = url.searchParams.get('sni') || '';
      const path = url.searchParams.get('path') || '/';

      const fragParam = url.searchParams.get('fragment');
      let fragment: FragmentConfig | undefined;
      if (fragParam) {
        const parts = fragParam.split(',');
        fragment = {
          enabled: true,
          length: parts[0] || '10-20',
          interval: parts[1] || '10-20',
          packets: parts[2] || 'tlshello',
        };
      }

      return {
        id: 'node-' + Math.random().toString(36).substring(2, 9),
        name,
        protocol: 'vless',
        address,
        port,
        uuid,
        path,
        host,
        sni,
        tls: security === 'tls',
        security,
        transport,
        fragment,
      };
    }

    if (trimmed.startsWith('vmess://')) {
      const b64 = trimmed.replace('vmess://', '');
      const jsonStr = decodeURIComponent(escape(atob(b64)));
      const v = JSON.parse(jsonStr);

      return {
        id: 'node-' + Math.random().toString(36).substring(2, 9),
        name: v.ps || 'Decoded-VMESS',
        protocol: 'vmess',
        address: v.add || '104.16.51.111',
        port: parseInt(v.port || '443', 10),
        uuid: v.id || '',
        path: v.path || '/',
        host: v.host || '',
        sni: v.sni || v.host || '',
        tls: v.tls === 'tls',
        security: v.tls === 'tls' ? 'tls' : 'none',
        transport: v.net || 'ws',
        alterId: parseInt(v.aid || '0', 10),
        cipher: v.scy || 'auto',
      };
    }

    if (trimmed.startsWith('trojan://')) {
      const url = new URL(trimmed);
      const uuid = url.username;
      const address = url.hostname;
      const port = parseInt(url.port || '443', 10);
      const name = url.hash ? decodeURIComponent(url.hash.replace('#', '')) : 'Decoded-Trojan';
      const host = url.searchParams.get('host') || '';
      const sni = url.searchParams.get('sni') || '';
      const path = url.searchParams.get('path') || '/';

      return {
        id: 'node-' + Math.random().toString(36).substring(2, 9),
        name,
        protocol: 'trojan',
        address,
        port,
        uuid,
        path,
        host,
        sni,
        tls: true,
        security: 'tls',
        transport: (url.searchParams.get('type') as 'ws' | 'grpc') || 'ws',
      };
    }

    return null;
  } catch (err) {
    console.error('Error parsing proxy link:', err);
    return null;
  }
}

export function generateClashYaml(nodes: ProxyNode[]): string {
  const proxies = nodes.map((n) => {
    if (n.protocol === 'vmess') {
      return {
        name: n.name,
        type: 'vmess',
        server: n.address,
        port: n.port,
        uuid: n.uuid,
        alterId: n.alterId || 0,
        cipher: n.cipher || 'auto',
        udp: true,
        tls: n.tls,
        servername: n.sni || n.host,
        network: n.transport,
        'ws-opts': {
          path: n.path,
          headers: { Host: n.host },
        },
      };
    }
    return {
      name: n.name,
      type: 'vless',
      server: n.address,
      port: n.port,
      uuid: n.uuid,
      udp: true,
      tls: n.tls,
      servername: n.sni || n.host,
      network: n.transport,
      'ws-opts': {
        path: n.path,
        headers: { Host: n.host },
      },
    };
  });

  const clashObj = {
    port: 7890,
    'socks-port': 7891,
    'allow-lan': true,
    mode: 'Rule',
    'log-level': 'info',
    proxies,
    'proxy-groups': [
      {
        name: '⚡ Auto-Select (Best Ping)',
        type: 'url-test',
        url: 'http://www.gstatic.com/generate_204',
        interval: 300,
        tolerance: 50,
        proxies: nodes.map((n) => n.name),
      },
      {
        name: '🔰 Nova-Proxy-Nodes',
        type: 'select',
        proxies: ['⚡ Auto-Select (Best Ping)', ...nodes.map((n) => n.name)],
      },
    ],
    rules: ['GEOIP,IR,DIRECT', 'MATCH,🔰 Nova-Proxy-Nodes'],
  };

  return jsyaml.dump(clashObj);
}

export function generateSingboxJson(nodes: ProxyNode[]): string {
  const outbounds = nodes.map((n) => ({
    type: n.protocol,
    tag: n.name,
    server: n.address,
    server_port: n.port,
    uuid: n.uuid,
    tls: n.tls
      ? {
          enabled: true,
          server_name: n.sni || n.host,
          insecure: true,
        }
      : undefined,
    transport: {
      type: n.transport,
      path: n.path,
      headers: {
        Host: n.host,
      },
    },
    multiplex: {
      enabled: false,
    },
  }));

  const singboxConfig = {
    log: {
      level: 'info',
      timestamp: true,
    },
    inbounds: [
      {
        type: 'tun',
        tag: 'tun-in',
        interface_name: 'tun0',
        inet4_address: '172.19.0.1/30',
        auto_route: true,
        strict_route: true,
        stack: 'mixed',
        sniff: true,
      },
    ],
    outbounds: [
      {
        type: 'selector',
        tag: 'select',
        outbounds: ['auto', ...nodes.map((n) => n.name), 'direct'],
        default: 'auto',
      },
      {
        type: 'urltest',
        tag: 'auto',
        outbounds: nodes.map((n) => n.name),
        url: 'https://www.gstatic.com/generate_204',
        interval: '3m',
      },
      ...outbounds,
      {
        type: 'direct',
        tag: 'direct',
      },
    ],
    route: {
      rules: [
        {
          ip_is_private: true,
          outbound: 'direct',
        },
        {
          geoip: ['ir'],
          outbound: 'direct',
        },
      ],
      auto_detect_interface: true,
    },
  };

  return JSON.stringify(singboxConfig, null, 2);
}

export function generateBase64Sub(nodes: ProxyNode[]): string {
  const rawLinks = nodes.map((n) => generateNodeUri(n)).join('\n');
  return btoa(unescape(encodeURIComponent(rawLinks)));
}

export function generateMultiNodesBatch(
  baseDomain: string,
  uuid: string,
  cleanIps: { ip: string; isp: string }[],
  ports: number[] = [443, 2053, 2083, 2087, 8880]
): ProxyNode[] {
  const result: ProxyNode[] = [];
  let index = 1;

  cleanIps.forEach((item) => {
    ports.slice(0, 2).forEach((port) => {
      const isTls = [443, 2053, 2083, 2087, 2096, 8443].includes(port);

      result.push({
        id: `batch-${index}-${Math.random().toString(36).substring(2, 7)}`,
        name: `Nova-${item.isp.replace(/[^a-zA-Z0-9]/g, '')}-P${port}-${index}`,
        protocol: 'vless',
        address: item.ip,
        port,
        uuid,
        path: '/vless-ws?ed=2048',
        host: baseDomain,
        sni: baseDomain,
        tls: isTls,
        security: isTls ? 'tls' : 'none',
        transport: 'ws',
        ispTag: item.isp,
        fragment: {
          enabled: true,
          length: '10-20',
          interval: '10-20',
          packets: 'tlshello',
          preset: item.isp.toLowerCase().includes('hamrah') ? 'mci' : 'custom',
        },
      });
      index++;
    });
  });

  return result;
}
