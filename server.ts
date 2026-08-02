import express, { Request, Response } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import { generateWorkerScript } from './src/data/workerTemplate';
import { WorkerScriptConfig, ProxyNode } from './src/types';
import { generateClashYaml, generateSingboxJson, generateBase64Sub, generateNodeUri } from './src/utils/configParsers';
import http from 'http';
import https from 'https';

// Memory store for subscription links generated in current session
const subscriptionStore = new Map<string, { title: string; nodes: ProxyNode[] }>();

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
      subUrl: `/api/sub/${subId}`
    });
  });

  // Dynamic Subscription Fetch
  app.get('/api/sub/:subId', (req: Request, res: Response) => {
    const { subId } = req.params;
    const format = req.query.format as string;
    const userAgent = (req.headers['user-agent'] || '').toLowerCase();

    const subData = subscriptionStore.get(subId);
    if (!subData) {
      return res.status(404).send('Subscription link expired or not found.');
    }

    const { nodes } = subData;

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
  });

  // -------------------------------------------------------------------------
  // 3. CLEAN IP TCP LATENCY CHECK
  // -------------------------------------------------------------------------

  app.post('/api/ping', async (req: Request, res: Response) => {
    const { targetHost, port } = req.body;
    const targetPort = port || 443;

    if (!targetHost) {
      return res.status(400).json({ error: 'targetHost is required' });
    }

    const startTime = Date.now();

    try {
      // Perform HTTPS / HTTP handshake to measure roundtrip latency
      const protocol = targetPort === 443 ? https : http;
      const request = protocol.get(`https://${targetHost}:${targetPort}/cdn-cgi/trace`, {
        timeout: 3000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      }, (response) => {
        const pingMs = Date.now() - startTime;
        res.json({
          status: 'ok',
          targetHost,
          pingMs,
          statusCode: response.statusCode
        });
      });

      request.on('error', (err) => {
        const pingMs = Date.now() - startTime;
        // Even if CF trace is blocked, TCP handshake response time indicates reachability
        res.json({
          status: 'timeout',
          targetHost,
          pingMs: pingMs > 3000 ? 3000 : pingMs,
          error: err.message
        });
      });

      request.on('timeout', () => {
        request.destroy();
        res.json({
          status: 'timeout',
          targetHost,
          pingMs: 3000
        });
      });
    } catch (err: any) {
      res.json({
        status: 'error',
        targetHost,
        pingMs: 3000,
        error: err.message
      });
    }
  });

  // -------------------------------------------------------------------------
  // 4. GEMINI AI ANTI-CENSORSHIP COPILOT
  // -------------------------------------------------------------------------

  app.post('/api/ai/optimize', async (req: Request, res: Response) => {
    try {
      const { ispName, prompt, currentNodeConfig } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;

      if (!apiKey) {
        return res.status(400).json({
          error: 'GEMINI_API_KEY environment variable is not configured.'
        });
      }

      const ai = new GoogleGenAI({ apiKey });

      const systemInstruction = `You are Nova Proxy Ultra AI Network Engineer & Anti-Censorship Advisor.
You specialize in Cloudflare Edge VLESS / VMESS Workers, Fragment parameters (length, interval, packets), SNI spoofing, clean IP optimization, and client routing for restrictive networks (especially Iranian ISPs like MCI Hamrah Avval, Irancell, Mokhaberat, Shatel, Rightel).
Respond in Persian (فارسی) clearly with step-by-step optimization recommendations, custom Fragment settings, recommended ports, and Sing-Box / Clash snippets if requested. Keep it concise, professional, and practical.`;

      const userMessage = `اپراتور: ${ispName || 'عمومی'}
سوال/درخواست کاربر: ${prompt || 'بهترین تنظیمات فرگمنت و آیپی تمیز برای دور زدن اختلالات و پینگ پایین'}
کانفیگ فعلی: ${JSON.stringify(currentNodeConfig || {})}`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: userMessage,
        config: {
          systemInstruction,
          temperature: 0.7,
        }
      });

      return res.json({
        advice: response.text || 'پاسخی از هوش مصنوعی دریافت نشد.'
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
