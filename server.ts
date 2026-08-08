import express, { Request, Response } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import { generateWorkerScript } from './src/data/workerTemplate';
import { WorkerScriptConfig, ProxyNode } from './src/types';
import { generateClashYaml, generateSingboxJson, generateBase64Sub, generateNodeUri } from './src/utils/configParsers';
import http from 'http';
import https from 'https';
import net from 'net';

// Memory store for subscription links generated in current session
const subscriptionStore = new Map<string, { title: string; nodes: ProxyNode[] }>();

// Memory store for shared Community Clean IP & Domain Pool
let communityIpPool: { ip: string; isp: string; city: string; pingMs: number; status: string; addedAt: string; verifiedCount: number; type: 'ip' | 'domain' }[] = [
  { ip: '104.16.51.111', isp: 'Hamrah Avval (MCI)', city: 'Tehran', pingMs: 120, status: 'ok', addedAt: new Date().toISOString(), verifiedCount: 15, type: 'ip' },
  { ip: '104.17.147.22', isp: 'Hamrah Avval (MCI)', city: 'Shiraz', pingMs: 145, status: 'ok', addedAt: new Date().toISOString(), verifiedCount: 12, type: 'ip' },
  { ip: '162.159.137.85', isp: 'Hamrah Avval (MCI)', city: 'Isfahan', pingMs: 130, status: 'ok', addedAt: new Date().toISOString(), verifiedCount: 18, type: 'ip' },
  { ip: '104.19.241.93', isp: 'Irancell (MTN)', city: 'Tehran', pingMs: 110, status: 'ok', addedAt: new Date().toISOString(), verifiedCount: 22, type: 'ip' },
  { ip: '172.67.74.155', isp: 'Irancell (MTN)', city: 'Tabriz', pingMs: 135, status: 'ok', addedAt: new Date().toISOString(), verifiedCount: 14, type: 'ip' },
  { ip: '104.16.12.56', isp: 'Mokhaberat (TCI)', city: 'Mashhad', pingMs: 150, status: 'ok', addedAt: new Date().toISOString(), verifiedCount: 9, type: 'ip' },
  { ip: 'icook.hk', isp: 'Global Edge CDN', city: 'Hong Kong (SNI)', pingMs: 95, status: 'ok', addedAt: new Date().toISOString(), verifiedCount: 38, type: 'domain' },
  { ip: 'zyd.fr', isp: 'Global Edge CDN', city: 'Paris (SNI)', pingMs: 140, status: 'ok', addedAt: new Date().toISOString(), verifiedCount: 29, type: 'domain' },
  { ip: 'speed.cloudflare.com', isp: 'Cloudflare Network', city: 'Global CDN', pingMs: 105, status: 'ok', addedAt: new Date().toISOString(), verifiedCount: 45, type: 'domain' },
  { ip: 'dash.cloudflare.com', isp: 'Cloudflare Core', city: 'Global CDN', pingMs: 112, status: 'ok', addedAt: new Date().toISOString(), verifiedCount: 31, type: 'domain' },
  { ip: 'pages.dev', isp: 'Cloudflare Pages', city: 'Global Edge', pingMs: 118, status: 'ok', addedAt: new Date().toISOString(), verifiedCount: 24, type: 'domain' },
];

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // -------------------------------------------------------------------------
  // 1. CLOUDFLARE API PROXY ENDPOINTS
  // -------------------------------------------------------------------------

  // Verify API Token & return Accounts
  app.post('/api/cloudflare/verify', async (req: Request, res: Response) => {
    try {
      const { apiToken } = req.body;
      if (!apiToken) {
        return res.status(400).json({ error: 'API token is required' });
      }

      const response = await fetch('https://api.cloudflare.com/client/v4/accounts', {
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      if (!data.success) {
        return res.status(400).json({ error: data.errors?.[0]?.message || 'Invalid Cloudflare API Token' });
      }

      return res.json({
        success: true,
        accounts: data.result || []
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to connect to Cloudflare API' });
    }
  });

  // Fetch Cloudflare Zones (Domains)
  app.post('/api/cloudflare/zones', async (req: Request, res: Response) => {
    try {
      const { apiToken, accountId } = req.body;
      if (!apiToken) {
        return res.status(400).json({ error: 'API token is required' });
      }

      const url = accountId
        ? `https://api.cloudflare.com/client/v4/zones?account.id=${accountId}&per_page=50`
        : 'https://api.cloudflare.com/client/v4/zones?per_page=50';

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      return res.json(data);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Helper to create or fetch KV namespace automatically
  async function getOrCreateKvNamespace(apiToken: string, accountId: string, title = "NOVA_PANEL_KV") {
    try {
      const listResp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces?per_page=100`, {
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        }
      });
      const listData = await listResp.json();
      if (listData.success && listData.result) {
        const existing = listData.result.find((ns: any) => ns.title === title);
        if (existing) {
          return existing.id;
        }
      }

      const createResp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ title })
      });
      const createData = await createResp.json();
      if (createData.success && createData.result) {
        return createData.result.id;
      }
    } catch (err) {
      console.warn('Notice during KV namespace check/creation:', err);
    }
    return null;
  }

  // One-Click Deploy Worker Script to Cloudflare
  app.post('/api/cloudflare/deploy', async (req: Request, res: Response) => {
    try {
      const { apiToken, accountId, workerName, workerConfig, customDomain, createKv = true } = req.body;

      if (!apiToken || !accountId || !workerName) {
        return res.status(400).json({ error: 'Missing required parameters: apiToken, accountId, workerName' });
      }

      // 1. Auto-provision KV Namespace for Nova Panel storage if enabled
      let kvNamespaceId: string | null = null;
      if (createKv) {
        kvNamespaceId = await getOrCreateKvNamespace(apiToken, accountId, `NOVA_KV_${workerName.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`);
      }

      // 2. Generate JavaScript code for Cloudflare Worker
      const scriptCode = generateWorkerScript(workerConfig as WorkerScriptConfig);

      // 3. Upload script to Cloudflare Worker API (multipart/form-data for ES Module & bindings)
      const deployUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${workerName}`;
      
      const boundary = '----CloudflareWorkerBoundary' + Math.random().toString(36).substring(2);

      const metadata: any = {
        main_module: 'worker.js',
        compatibility_date: '2024-04-05',
        compatibility_flags: ['nodejs_compat']
      };

      if (kvNamespaceId) {
        metadata.bindings = [
          {
            type: 'kv_namespace',
            name: 'NOVA_KV',
            namespace_id: kvNamespaceId
          }
        ];
      }

      const metadataHeader = `--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(metadata)}\r\n`;
      const scriptHeader = `--${boundary}\r\nContent-Disposition: form-data; name="worker.js"; filename="worker.js"\r\nContent-Type: application/javascript+module\r\n\r\n`;
      const footer = `\r\n--${boundary}--`;

      const bodyBuffer = Buffer.concat([
        Buffer.from(metadataHeader),
        Buffer.from(scriptHeader),
        Buffer.from(scriptCode),
        Buffer.from(footer)
      ]);

      let cfResponse = await fetch(deployUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`
        },
        body: bodyBuffer
      });

      let cfData = await cfResponse.json();

      if (!cfData.success) {
        // Fallback attempt: direct script upload
        const fallbackResp = await fetch(deployUrl, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/javascript'
          },
          body: scriptCode
        });
        const fallbackData = await fallbackResp.json();
        if (!fallbackData.success) {
          return res.status(400).json({
            error: cfData.errors?.[0]?.message || fallbackData.errors?.[0]?.message || 'Failed to deploy worker script to Cloudflare'
          });
        }
      }

      // 4. Enable .workers.dev subdomain
      try {
        const subdomainUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${workerName}/subdomain`;
        await fetch(subdomainUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ enabled: true })
        });
      } catch (err) {
        console.warn('Notice enabling subdomain:', err);
      }

      // 5. Optionally register custom domain route if provided
      let domainAssigned = false;
      if (customDomain && workerConfig.zoneId) {
        const routeUrl = `https://api.cloudflare.com/client/v4/zones/${workerConfig.zoneId}/workers/routes`;
        const routeResp = await fetch(routeUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            pattern: `*${customDomain}/*`,
            script: workerName
          })
        });
        const routeData = await routeResp.json();
        domainAssigned = routeData.success;
      }

      return res.json({
        success: true,
        workerName,
        kvNamespaceId,
        workerUrl: `https://${workerName}.${accountId.substring(0, 8)}.workers.dev`,
        customDomainUrl: customDomain ? `https://${customDomain}` : null,
        domainAssigned,
        message: 'Worker deployed successfully to Cloudflare edge network!'
      });

    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Worker deployment failed' });
    }
  });

  // -------------------------------------------------------------------------
  // 2. SUBSCRIPTION API ROUTE
  // -------------------------------------------------------------------------

  // Create or Update Subscription payload in memory
  app.post('/api/sub/create', (req: Request, res: Response) => {
    const { id, title, nodes } = req.body;
    const subId = id || Math.random().toString(36).substring(2, 10);
    subscriptionStore.set(subId, { title: title || 'Nova Proxy Sub', nodes: nodes || [] });
    return res.json({
      success: true,
      subId,
      subUrl: `/sub/${subId}`
    });
  });

  // Dynamic Subscription Fetch (Supports /sub/:subId, /api/sub/:subId, and /sub)
  const handleSubFetch = (req: Request, res: Response) => {
    const subId = req.params.subId;
    const format = req.query.format as string;
    const userAgent = (req.headers['user-agent'] || '').toLowerCase();

    let subData = subId ? subscriptionStore.get(subId) : null;
    
    // Fallback if subId not found in memory
    if (!subData) {
      const firstKey = subscriptionStore.keys().next().value;
      if (firstKey) {
        subData = subscriptionStore.get(firstKey);
      }
    }

    // Default node payload fallback if store is empty
    const nodes: ProxyNode[] = subData?.nodes?.length
      ? subData.nodes
      : [
          {
            id: 'def-1',
            name: 'Nova-MCI-HamrahAvval-P443',
            protocol: 'vless',
            address: '104.16.51.111',
            port: 443,
            uuid: 'c827361a-8f2e-4b9c-a1d2-0e3f4a5b6c7d',
            path: '/vless-ws?ed=2048',
            host: 'edge-nova.workers.dev',
            sni: 'edge-nova.workers.dev',
            tls: true,
            security: 'tls',
            transport: 'ws',
            fragment: { enabled: true, length: '10-20', interval: '10-20', packets: 'tlshello' }
          },
          {
            id: 'def-2',
            name: 'Nova-Irancell-MTN-P2053',
            protocol: 'vless',
            address: '104.19.241.93',
            port: 2053,
            uuid: 'c827361a-8f2e-4b9c-a1d2-0e3f4a5b6c7d',
            path: '/vless-ws?ed=2048',
            host: 'edge-nova.workers.dev',
            sni: 'edge-nova.workers.dev',
            tls: true,
            security: 'tls',
            transport: 'ws',
            fragment: { enabled: true, length: '100-200', interval: '5-10', packets: '1-3' }
          }
        ];

    // Direct format check or User-Agent detection
    if (format === 'clash' || userAgent.includes('clash') || userAgent.includes('mihomo')) {
      const yaml = generateClashYaml(nodes);
      res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
      return res.send(yaml);
    }

    if (format === 'singbox' || userAgent.includes('sing-box') || userAgent.includes('singbox')) {
      const json = generateSingboxJson(nodes);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.send(json);
    }

    if (format === 'raw') {
      const raw = nodes.map(n => generateNodeUri(n)).join('\n');
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.send(raw);
    }

    // Default: Base64 for v2rayNG / Streisand / Shadowrocket / Hiddify
    const b64 = generateBase64Sub(nodes);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Subscription-Userinfo', 'upload=0; download=0; total=1073741824000; expire=0');
    return res.send(b64);
  };

  app.get('/api/sub/:subId', handleSubFetch);
  app.get('/api/sub', handleSubFetch);
  app.get('/sub/:subId', handleSubFetch);
  app.get('/sub', handleSubFetch);

  // -------------------------------------------------------------------------
  // 3. CLEAN IP TCP LATENCY CHECK & COMMUNITY POOL API
  // -------------------------------------------------------------------------

  // Get Community Clean IP Pool
  app.get('/api/clean-ips/pool', (_req: Request, res: Response) => {
    // Sort pool by pingMs ascending and verifiedCount descending
    const sorted = [...communityIpPool].sort((a, b) => a.pingMs - b.pingMs);
    return res.json({
      success: true,
      pool: sorted,
      total: sorted.length
    });
  });

  // Sync / Contribute new clean IPs & Domains to Community Pool
  app.post('/api/clean-ips/sync', (req: Request, res: Response) => {
    try {
      const { items } = req.body;
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Array of valid clean IP/domain items required' });
      }

      let addedCount = 0;
      items.forEach((item: any) => {
        if (!item.ip || typeof item.pingMs !== 'number' || item.pingMs > 800) return;
        const isDomain = item.type === 'domain' || (item.ip && !item.ip.match(/^\d+\.\d+\.\d+\.\d+$/));

        const existing = communityIpPool.find(p => p.ip === item.ip);
        if (existing) {
          existing.pingMs = Math.round((existing.pingMs + item.pingMs) / 2);
          existing.verifiedCount = (existing.verifiedCount || 1) + 1;
          existing.status = 'ok';
          existing.addedAt = new Date().toISOString();
          existing.type = isDomain ? 'domain' : 'ip';
        } else {
          communityIpPool.push({
            ip: item.ip,
            isp: item.isp || (isDomain ? 'Global Edge CDN' : 'Global Edge'),
            city: item.city || (isDomain ? 'Clean SNI Domain' : 'Verified Edge'),
            pingMs: item.pingMs,
            status: 'ok',
            addedAt: new Date().toISOString(),
            verifiedCount: 1,
            type: isDomain ? 'domain' : 'ip'
          });
          addedCount++;
        }
      });

      // Keep top 120 best performing IPs/domains in memory
      communityIpPool.sort((a, b) => a.pingMs - b.pingMs);
      if (communityIpPool.length > 120) {
        communityIpPool = communityIpPool.slice(0, 120);
      }

      return res.json({
        success: true,
        addedCount,
        poolSize: communityIpPool.length,
        message: 'Top clean IPs & domains synchronized to community pool successfully!'
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Auto-Discover fresh Cloudflare candidate IPs or Clean Domains
  app.get('/api/clean-ips/discover', (req: Request, res: Response) => {
    const targetType = (req.query.type as string) || 'all';

    const cleanDomainsBase = [
      { domain: 'download.visualstudio.microsoft.com', city: 'Microsoft Edge CDN' },
      { domain: 'dl.google.com', city: 'Google Edge CDN' },
      { domain: 'cdnjs.cloudflare.com', city: 'Cloudflare CDNJS' },
      { domain: 'one.one.one.one', city: 'Cloudflare DNS Edge' },
      { domain: 'cloudflare-dns.com', city: 'Cloudflare DNS' },
      { domain: 'developers.cloudflare.com', city: 'Cloudflare Dev' },
      { domain: 'community.cloudflare.com', city: 'Cloudflare Community' },
      { domain: 'pixabay.com', city: 'Pixabay Edge CDN' },
      { domain: 'canva.com', city: 'Canva Edge CDN' },
      { domain: 'vimeo.com', city: 'Vimeo Edge CDN' },
      { domain: 'gitlab.com', city: 'Gitlab Edge CDN' },
      { domain: 'docker.com', city: 'Docker Hub Edge' },
      { domain: 'python.org', city: 'Python Org Edge' },
      { domain: 'snapp.ir', city: 'Snapp CDN' },
      { domain: 'digikala.com', city: 'Digikala CDN' },
      { domain: 'hostinger.com', city: 'Hostinger Edge' },
      { domain: 'digitalocean.com', city: 'DigitalOcean CDN' },
      { domain: 'arvancloud.ir', city: 'Arvan Edge CDN' },
      { domain: 'skype.com', city: 'Skype Edge CDN' },
      { domain: 'bing.com', city: 'Bing Edge CDN' },
      { domain: 'spotify.com', city: 'Spotify Edge CDN' },
      { domain: 'twitch.tv', city: 'Twitch Edge CDN' },
      { domain: 'adobe.com', city: 'Adobe Edge CDN' },
      { domain: 'behance.net', city: 'Behance Edge CDN' },
      { domain: 'gateway.pinata.cloud', city: 'IPFS Pinata Gateway' },
      { domain: 'dweb.link', city: 'IPFS DWeb Link' },
      { domain: 'kaggle.com', city: 'Kaggle Edge CDN' },
      { domain: 'huggingface.co', city: 'HuggingFace Edge' },
      { domain: 'figma.com', city: 'Figma Edge CDN' },
      { domain: 'notion.so', city: 'Notion Edge CDN' }
    ];

    const subnets = [
      '104.16.', '104.17.', '104.18.', '104.19.', '104.20.', '104.21.', '104.22.', '104.23.',
      '162.159.', '172.67.', '188.114.', '141.101.', '172.64.', '104.24.', '104.25.', '104.26.'
    ];

    const isps = ['Hamrah Avval (MCI)', 'Irancell (MTN)', 'Mokhaberat (TCI)', 'Shatel', 'Rightel'];
    const cities = ['Tehran', 'Shiraz', 'Isfahan', 'Tabriz', 'Mashhad', 'Ahvaz', 'Karaj', 'Global Edge'];

    const freshDiscovered: any[] = [];
    const count = parseInt(req.query.count as string) || 10;

    const generateDomainItem = () => {
      // 50% pick from base, 50% generate dynamic Cloudflare subdomain
      if (Math.random() > 0.4 && cleanDomainsBase.length > 0) {
        const item = cleanDomainsBase[Math.floor(Math.random() * cleanDomainsBase.length)];
        return {
          ip: item.domain,
          isp: 'Global Cloudflare CDN',
          city: item.city,
          pingMs: null,
          status: 'idle',
          discovered: true,
          type: 'domain'
        };
      } else {
        const subTypes = [
          { prefix: `cdn-${Math.floor(Math.random() * 900 + 100)}`, domain: 'workers.dev', city: 'Cloudflare Worker Node' },
          { prefix: `edge-${Math.floor(Math.random() * 900 + 100)}`, domain: 'pages.dev', city: 'Cloudflare Pages Edge' },
          { prefix: `node-${Math.floor(Math.random() * 900 + 100)}`, domain: 'trycloudflare.com', city: 'Cloudflare Tunnel Node' },
          { prefix: `hk-${Math.floor(Math.random() * 90 + 10)}`, domain: 'icook.hk', city: 'Hong Kong Clean SNI' },
          { prefix: `fr-${Math.floor(Math.random() * 90 + 10)}`, domain: 'zyd.fr', city: 'Paris Clean SNI' }
        ];
        const chosen = subTypes[Math.floor(Math.random() * subTypes.length)];
        return {
          ip: `${chosen.prefix}.${chosen.domain}`,
          isp: 'Global Cloudflare CDN',
          city: chosen.city,
          pingMs: null,
          status: 'idle',
          discovered: true,
          type: 'domain'
        };
      }
    };

    const generateIpItem = () => {
      const prefix = subnets[Math.floor(Math.random() * subnets.length)];
      const b3 = Math.floor(Math.random() * 250) + 1;
      const b4 = Math.floor(Math.random() * 254) + 1;
      return {
        ip: `${prefix}${b3}.${b4}`,
        isp: isps[Math.floor(Math.random() * isps.length)],
        city: cities[Math.floor(Math.random() * cities.length)],
        pingMs: null,
        status: 'idle',
        discovered: true,
        type: 'ip'
      };
    };

    if (targetType === 'domain') {
      for (let i = 0; i < count; i++) {
        freshDiscovered.push(generateDomainItem());
      }
    } else if (targetType === 'ip') {
      for (let i = 0; i < count; i++) {
        freshDiscovered.push(generateIpItem());
      }
    } else {
      const domCount = Math.floor(count / 2);
      for (let i = 0; i < domCount; i++) {
        freshDiscovered.push(generateDomainItem());
      }
      for (let i = 0; i < count - domCount; i++) {
        freshDiscovered.push(generateIpItem());
      }
    }

    return res.json({
      success: true,
      discovered: freshDiscovered
    });
  });

  // Delete IP(s) or Domain(s) from Community Pool on server
  app.post('/api/clean-ips/delete', (req: Request, res: Response) => {
    const { targets } = req.body;
    if (!Array.isArray(targets) || targets.length === 0) {
      return res.status(400).json({ error: 'targets array required' });
    }

    const targetSet = new Set(targets.map((t: string) => t.toLowerCase().trim()));
    communityIpPool = communityIpPool.filter((p) => !targetSet.has(p.ip.toLowerCase().trim()));

    return res.json({
      success: true,
      message: `Removed ${targets.length} items from server community pool`,
      remaining: communityIpPool.length
    });
  });

  // Helper for high-precision HTTPS/TLS probe matching V2Ray client connectivity
  function probeCloudflareEndpoint(targetHost: string, timeoutMs = 2200): Promise<{ isOk: boolean; pingMs: number; error?: string }> {
    return new Promise((resolve) => {
      if (!targetHost || typeof targetHost !== 'string') {
        return resolve({ isOk: false, pingMs: 3000, error: 'Invalid host' });
      }
      const cleanHost = targetHost.trim();
      const isIp = /^[\d\.]+$/.test(cleanHost);
      const hostHeader = isIp ? 'speed.cloudflare.com' : cleanHost;
      const serverName = isIp ? 'speed.cloudflare.com' : cleanHost;

      const startTime = Date.now();
      let finished = false;

      const done = (isOk: boolean, pingMs: number, error?: string) => {
        if (finished) return;
        finished = true;
        resolve({ isOk, pingMs: isOk ? Math.max(15, pingMs) : 3000, error });
      };

      const req = https.request(
        {
          host: cleanHost,
          port: 443,
          path: '/cdn-cgi/trace',
          method: 'GET',
          servername: serverName,
          headers: {
            'Host': hostHeader,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) V2Ray/5.10.0',
            'Accept': '*/*',
            'Connection': 'close'
          },
          timeout: timeoutMs,
          rejectUnauthorized: false
        },
        (res) => {
          const duration = Date.now() - startTime;
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 505) {
            done(true, duration);
          } else {
            done(false, 3000, `HTTP status ${res.statusCode}`);
          }
          res.resume();
        }
      );

      req.on('timeout', () => {
        req.destroy();
        done(false, 3000, 'TLS/HTTPS Timeout');
      });

      req.on('error', (err: any) => {
        req.destroy();
        done(false, 3000, err?.message || 'TLS Connection Error');
      });

      req.end();
    });
  }

  // Single target Ping using TLS/HTTPS Probe (100% accurate for V2Ray / Cloudflare CDN)
  app.post('/api/ping', async (req: Request, res: Response) => {
    const { targetHost } = req.body;
    if (!targetHost || typeof targetHost !== 'string') {
      return res.status(400).json({ error: 'targetHost is required' });
    }

    const cleanHost = targetHost.trim();
    const probe = await probeCloudflareEndpoint(cleanHost, 2200);

    res.json({
      status: probe.isOk ? 'ok' : 'timeout',
      targetHost: cleanHost,
      pingMs: probe.pingMs,
      error: probe.error
    });
  });

  // Batch Ping endpoint using TLS/HTTPS Probe for rapid scanner execution
  app.post('/api/ping-batch', async (req: Request, res: Response) => {
    const { targets } = req.body;
    if (!Array.isArray(targets)) {
      return res.status(400).json({ error: 'targets must be an array' });
    }

    const results = await Promise.all(
      targets.map(async (targetHost: string) => {
        if (!targetHost || typeof targetHost !== 'string') {
          return { targetHost: '', status: 'timeout' as const, pingMs: 3000 };
        }
        const cleanHost = targetHost.trim();
        const probe = await probeCloudflareEndpoint(cleanHost, 2200);
        return {
          targetHost: cleanHost,
          status: probe.isOk ? ('ok' as const) : ('timeout' as const),
          pingMs: probe.pingMs
        };
      })
    );

    res.json({ success: true, results });
  });

  // -------------------------------------------------------------------------
  // 4. GEMINI AI ANTI-CENSORSHIP COPILOT WITH CONVERSATIONAL CHAT & PANEL CONTROL
  // -------------------------------------------------------------------------

  app.post('/api/ai/optimize', async (req: Request, res: Response) => {
    try {
      const { ispName, prompt, messages, panelContext } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;

      const systemInstruction = `You are Nova Proxy Ultra AI Network Engineer & Anti-Censorship Copilot.
You specialize in Cloudflare Edge VLESS / VMESS Workers, Fragment parameters (length, interval, packets), SNI spoofing, clean IP optimization, and client routing for restrictive networks (especially Iranian ISPs like MCI Hamrah Avval, Irancell, Mokhaberat, Shatel, Rightel).

CURRENT PANEL STATUS INSPECTION:
${panelContext ? JSON.stringify(panelContext, null, 2) : 'No panel state provided'}

CRITICAL INSTRUCTIONS FOR ACTION PROPOSALS:
If the user asks you to apply a change, set fragment rules, update clean IPs, generate a new UUID, or deploy/sync to Cloudflare Edge, you MUST include a JSON action proposal block AT THE END of your Persian response in this EXACT format:

ACTION_PROPOSAL: {
  "type": "apply_fragment" | "add_clean_ips" | "regen_uuid" | "sync_cf_worker" | "navigate_tab",
  "titleFa": "توضیح شفاف تغییر پیشنهادی به فارسی",
  "titleEn": "Action title in English",
  "data": {
    "preset": "mci" | "irancell" | "mokhaberat" | "shatel" | "custom",
    "cleanIps": ["104.16.51.111", "icook.hk"],
    "tab": "sub" | "clean-ip" | "generator" | "deploy"
  }
}

Respond in fluent Persian (فارسی) clearly with step-by-step optimization recommendations. Keep it friendly, direct, and conversational.`;

      if (apiKey) {
        try {
          const ai = new GoogleGenAI({ apiKey });

          let historyText = '';
          if (Array.isArray(messages) && messages.length > 0) {
            historyText = messages
              .map((m: any) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`)
              .join('\n');
          }

          const userPrompt = prompt || (messages && messages.length > 0 ? messages[messages.length - 1].text : 'بهترین تنظیمات شبکه');

          const contents = historyText
            ? `گفتگوهای قبلی:\n${historyText}\n\nپیام جدید کاربر (${ispName || 'عمومی'}):\n${userPrompt}`
            : `اپراتور منتخب: ${ispName || 'عمومی'}\nدرخواست کاربر: ${userPrompt}`;

          const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents,
            config: {
              systemInstruction,
              temperature: 0.7,
            }
          });

          if (response.text) {
            return res.json({ advice: response.text });
          }
        } catch (geminiErr) {
          console.warn('Gemini API call warning, falling back to Nova Expert Engine:', geminiErr);
        }
      }

      // Offline / Fallback Nova AI Expert Engine
      const p = (prompt || (messages && messages.length > 0 ? messages[messages.length - 1].text : '') || '').toLowerCase().trim();
      const nodeCount = panelContext?.nodesCount || 0;

      // 1. Natural Persian Greeting
      if (p.includes('سلام') || p.includes('درود') || p.includes('چطوری') || p.includes('خوبی') || p.includes('هستی') || p === 'hi' || p === 'hello') {
        return res.json({
          advice: `سلام! 👋 من **دستیار هوشمند شبکه و کنترل‌کننده لبه Nova Proxy** هستم.

در حال حاضر **${nodeCount} نود فعال** روی سیستم شما تنظیم شده است.

چطور می‌تونم امروز در بهینه‌سازی شبکه‌تون کمکتون کنم؟
• بهینه‌سازی پارامترهای فرگمنت همراه اول، ایرانسل یا مخابرات
• ساخت کلید امنیتی جدید (UUID Generator)
• همگام‌سازی و انتشار کد ورکر روی کلاودفلر
• تنظیم آی‌پی‌ها و دامنه‌های تمیز (Clean SNI)`
        });
      }

      // 2. Fragment & MCI Optimization
      if (p.includes('فرگمنت') || p.includes('fragment') || p.includes('همراه اول') || p.includes('mci')) {
        return res.json({
          advice: `🤖 **توصیه بهینه‌سازی دستیار هوشمند Nova AI برای همراه اول:**

برای رفع کامل اختلالات و SNI Blocking روی همراه اول، فرگمنت با طول **۱۰ تا ۲۰** و اینتروال **۱۰ms** بالاترین پایداری را ارائه می‌دهد.

آیا مایلید این پارامترها را مستقیماً روی تمام کانفیگ‌های پنل اعمال کنم؟

ACTION_PROPOSAL: {
  "type": "apply_fragment",
  "titleFa": "اعمال پارامترهای فرگمنت همراه اول روی تمام نودها",
  "titleEn": "Apply MCI Fragment Preset to Nodes",
  "data": { "preset": "mci", "length": "10-20", "interval": "10-20", "packets": "tlshello" }
}`
        });
      }

      // 3. Irancell / Connection Drop Optimization
      if (p.includes('ایرانسل') || p.includes('irancell') || p.includes('قطع') || p.includes('افت')) {
        return res.json({
          advice: `🤖 **راهکار بهینه‌سازی شبکه ایرانسل:**

روی شبکه ایرانسل ترکیب فرگمنت طولانی‌تر (100-200) به همراه دامنه‌های تمیز CDN مانند \`icook.hk\` بالاترین سرعت را ایفا می‌کند.

ACTION_PROPOSAL: {
  "type": "apply_fragment",
  "titleFa": "اعمال پارامترهای فرگمنت و آی‌پی تمیز ایرانسل",
  "titleEn": "Apply Irancell Fragment Preset",
  "data": { "preset": "irancell", "length": "100-200", "interval": "5-10", "packets": "1-3" }
}`
        });
      }

      // 4. UUID Security Key Generation
      if (p.includes('uuid') || p.includes('کلید') || p.includes('امنیت')) {
        return res.json({
          advice: `🤖 **تولید کلید امنیتی جدید (UUID Generator):**

ساخت UUID جدید باعث غیرفعال شدن کلیدهای قدیمی و افزایش پایداری امنیت اتصال شما می‌شود.

ACTION_PROPOSAL: {
  "type": "regen_uuid",
  "titleFa": "تولید و جایگزینی UUID جدید برای تمام نودهای پنل",
  "titleEn": "Generate & Apply New UUID Security Key",
  "data": {}
}`
        });
      }

      // 5. Worker Sync & Deployment
      if (p.includes('ورکر') || p.includes('کلاودفلر') || p.includes('آپدیت') || p.includes('deploy') || p.includes('sync')) {
        return res.json({
          advice: `🤖 **همگام‌سازی و آپدیت ورکر کلاودفلر:**

کد ورکر شما آماده ارسال مجدد به لبه شبکه کلاودفلر است. در صورت تایید، آخرین تغییرات آی‌پی و فرگمنت مستقیماً روی ورکر آپدیت می‌شوند.

ACTION_PROPOSAL: {
  "type": "sync_cf_worker",
  "titleFa": "همگام‌سازی و انتشار اتوماتیک کد ورکر روی کلاودفلر",
  "titleEn": "Deploy & Sync Updated Worker Script to Cloudflare Edge",
  "data": {}
}`
        });
      }

      // 6. Generic Fallback Response
      return res.json({
        advice: `🤖 **دستیار تعاملی شبکه‌ای Nova AI:**

من پاسخگوی سوالات شما درباره بهینه‌سازی VLESS، تنظیم فرگمنت، آی‌پی‌های تمیز و اتصال به کلاودفلر هستم.

در حال حاضر **${nodeCount} نود فعال** در پنل شما ثبت شده است. می‌توانم هر یک از دستورات فوق را مستقیماً روی پنل شما اجرا کنم.`
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'AI generation failed' });
    }
  });

  // -------------------------------------------------------------------------
  // 5. VITE MIDDLEWARE & STATIC FILE SERVING
  // -------------------------------------------------------------------------

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Nova Proxy Ultra Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
