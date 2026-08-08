import { generateWorkerScript } from '../data/workerTemplate';
import { WorkerScriptConfig, CloudflareAccount, CloudflareZone } from '../types';

export interface VerifyTokenResult {
  success: boolean;
  accounts: CloudflareAccount[];
  error?: string;
}

export interface FetchZonesResult {
  success: boolean;
  result: CloudflareZone[];
  error?: string;
}

export interface DeployWorkerParams {
  apiToken: string;
  accountId: string;
  workerName: string;
  workerConfig: WorkerScriptConfig;
  customDomain?: string;
  zoneId?: string;
  createKv?: boolean;
}

export interface DeployWorkerResult {
  success: boolean;
  workerName?: string;
  workerUrl?: string;
  customDomainUrl?: string | null;
  error?: string;
}

// Helper function to safely fetch Cloudflare API endpoints in browser (with CORS proxy fallbacks)
async function fetchCF(url: string, options: RequestInit = {}): Promise<Response> {
  // 1. Try Direct Fetch
  try {
    const res = await fetch(url, options);
    if (res.ok || res.status === 400 || res.status === 401 || res.status === 403) {
      return res;
    }
  } catch (err) {
    console.warn('Direct Cloudflare API fetch failed, trying CORS proxy fallback:', err);
  }

  // 2. Fallback 1: corsproxy.io
  try {
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
    const res = await fetch(proxyUrl, options);
    return res;
  } catch (err) {
    console.warn('CORS proxy 1 (corsproxy.io) failed:', err);
  }

  // 3. Fallback 2: api.allorigins.win
  try {
    const proxyUrl = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`;
    const res = await fetch(proxyUrl, options);
    return res;
  } catch (err) {
    console.warn('CORS proxy 2 failed:', err);
  }

  throw new Error('خطای شبکه یا CORS در ارتباط مستقیم با Cloudflare API. لطفاً فیلترشکن خود را بررسی یا روشن کنید.');
}

// 1. Verify Cloudflare Token
export async function verifyCloudflareToken(apiToken: string): Promise<VerifyTokenResult> {
  const cleanToken = apiToken.trim();

  // Try Express server backend endpoint first if available
  try {
    const resp = await fetch('/api/cloudflare/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiToken: cleanToken }),
    });

    const contentType = resp.headers.get('content-type') || '';
    if (resp.ok && contentType.includes('application/json')) {
      const data = await resp.json();
      if (data.success) {
        return { success: true, accounts: data.accounts || [] };
      }
      if (data.error) {
        return { success: false, accounts: [], error: data.error };
      }
    }
  } catch (err) {
    console.warn('Server proxy unavailable, falling back to client Cloudflare API fetch:', err);
  }

  // Fallback: Direct/Proxy Cloudflare REST API call from browser
  try {
    const cfResp = await fetchCF('https://api.cloudflare.com/client/v4/accounts', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${cleanToken}`,
        'Content-Type': 'application/json',
      },
    });

    const cfData = await cfResp.json();
    if (!cfResp.ok || !cfData.success) {
      const msg = cfData.errors?.[0]?.message || 'کلید API کلاودفلر معتبر نیست یا دسترسی کافی ندارد.';
      return { success: false, accounts: [], error: msg };
    }

    const accounts: CloudflareAccount[] = (cfData.result || []).map((acc: any) => ({
      id: acc.id,
      name: acc.name,
    }));

    return { success: true, accounts };
  } catch (err: any) {
    return {
      success: false,
      accounts: [],
      error: (err.message || 'خطا در ارتباط با Cloudflare API'),
    };
  }
}

// 2. Fetch Cloudflare Zones
export async function fetchCloudflareZones(apiToken: string, accountId: string): Promise<FetchZonesResult> {
  const cleanToken = apiToken.trim();

  // Try Express server backend endpoint first
  try {
    const resp = await fetch('/api/cloudflare/zones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiToken: cleanToken, accountId }),
    });

    const contentType = resp.headers.get('content-type') || '';
    if (resp.ok && contentType.includes('application/json')) {
      const data = await resp.json();
      if (data.result) {
        return { success: true, result: data.result };
      }
    }
  } catch (err) {
    console.warn('Server proxy unavailable, falling back to client Cloudflare API fetch:', err);
  }

  // Fallback: Direct/Proxy Cloudflare REST API call from browser
  try {
    const url = accountId
      ? `https://api.cloudflare.com/client/v4/zones?account.id=${accountId}&per_page=50`
      : 'https://api.cloudflare.com/client/v4/zones?per_page=50';

    const cfResp = await fetchCF(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${cleanToken}`,
        'Content-Type': 'application/json',
      },
    });

    const cfData = await cfResp.json();
    if (!cfResp.ok || !cfData.success) {
      return { success: false, result: [], error: cfData.errors?.[0]?.message };
    }

    return { success: true, result: cfData.result || [] };
  } catch (err: any) {
    return { success: false, result: [], error: err.message };
  }
}

// Helper: Get or Create KV Namespace directly on Cloudflare
async function getOrCreateKvDirect(apiToken: string, accountId: string, title: string): Promise<string | null> {
  try {
    // List KV Namespaces
    const listResp = await fetchCF(`https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces?per_page=100`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
    });
    const listData = await listResp.json();
    if (listData.success && listData.result) {
      const existing = listData.result.find((ns: any) => ns.title === title);
      if (existing) return existing.id;
    }

    // Create KV Namespace if not existing
    const createResp = await fetchCF(`https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title }),
    });
    const createData = await createResp.json();
    if (createData.success && createData.result) {
      return createData.result.id;
    }
  } catch (err) {
    console.warn('Direct KV creation warning:', err);
  }
  return null;
}

// Helper: Fetch Cloudflare Workers Subdomain
export async function getWorkersSubdomain(apiToken: string, accountId: string): Promise<string | null> {
  try {
    const res = await fetchCF(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/subdomain`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
    });
    const data = await res.json();
    if (data.success && data.result && data.result.subdomain) {
      return data.result.subdomain;
    }
  } catch (err) {
    console.warn('Could not fetch workers subdomain:', err);
  }
  return null;
}

// 3. Deploy Worker Script
export async function deployCloudflareWorker(params: DeployWorkerParams): Promise<DeployWorkerResult> {
  const { apiToken, accountId, workerName, workerConfig, customDomain, zoneId, createKv = true } = params;
  const cleanToken = apiToken.trim();

  // Try Express server backend endpoint first
  try {
    const resp = await fetch('/api/cloudflare/deploy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiToken: cleanToken,
        accountId,
        workerName,
        workerConfig,
        customDomain,
        zoneId,
        createKv,
      }),
    });

    const contentType = resp.headers.get('content-type') || '';
    if (resp.ok && contentType.includes('application/json')) {
      const data = await resp.json();
      if (data.success) {
        return {
          success: true,
          workerName: data.workerName,
          workerUrl: data.workerUrl,
          customDomainUrl: data.customDomainUrl,
        };
      }
      if (data.error) {
        return { success: false, error: data.error };
      }
    }
  } catch (err) {
    console.warn('Server proxy unavailable, falling back to direct Cloudflare Worker deployment:', err);
  }

  // Fallback: Direct Cloudflare Worker deployment from browser
  try {
    // A. Auto KV Namespace creation
    let kvNamespaceId: string | null = null;
    if (createKv) {
      const kvTitle = `NOVA_KV_${workerName.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
      kvNamespaceId = await getOrCreateKvDirect(cleanToken, accountId, kvTitle);
    }

    // B. Generate Worker JS script
    const scriptCode = generateWorkerScript(workerConfig);

    // C. Upload script via multipart/form-data for ES Module & Bindings
    const deployUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${workerName}`;

    const metadata: any = {
      main_module: 'worker.js',
      compatibility_date: '2024-04-05',
      compatibility_flags: ['nodejs_compat'],
    };

    if (kvNamespaceId) {
      metadata.bindings = [
        {
          type: 'kv_namespace',
          name: 'NOVA_KV',
          namespace_id: kvNamespaceId,
        },
      ];
    }

    const formData = new FormData();
    formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    formData.append('worker.js', new Blob([scriptCode], { type: 'application/javascript+module' }), 'worker.js');

    let cfResp = await fetchCF(deployUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${cleanToken}`,
      },
      body: formData,
    });

    let cfData = await cfResp.json();

    // Fallback: If multipart fails, attempt plain text JavaScript upload
    if (!cfResp.ok || !cfData.success) {
      const plainResp = await fetchCF(deployUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${cleanToken}`,
          'Content-Type': 'application/javascript',
        },
        body: scriptCode,
      });

      const plainData = await plainResp.json();
      if (!plainResp.ok || !plainData.success) {
        const errMsg = cfData.errors?.[0]?.message || plainData.errors?.[0]?.message || 'خطا در آپلود اسکریپت وورکر به کلاودفلر.';
        return { success: false, error: errMsg };
      }
    }

    // D. Enable .workers.dev subdomain
    try {
      const subdomainUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${workerName}/subdomain`;
      await fetchCF(subdomainUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cleanToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ enabled: true }),
      });
    } catch (e) {
      console.warn('Subdomain enable note:', e);
    }

    // E. Custom Domain Routing if provided
    let customDomainUrl: string | null = null;
    if (customDomain && zoneId) {
      try {
        const routeUrl = `https://api.cloudflare.com/client/v4/zones/${zoneId}/workers/routes`;
        await fetchCF(routeUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${cleanToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            pattern: `*${customDomain}/*`,
            script: workerName,
          }),
        });
        customDomainUrl = `https://${customDomain}`;
      } catch (e) {
        console.warn('Custom domain routing note:', e);
      }
    }

    const userSubdomain = await getWorkersSubdomain(cleanToken, accountId);
    const workerHostName = userSubdomain ? `${workerName}.${userSubdomain}.workers.dev` : `${workerName}.workers.dev`;
    const workerUrl = `https://${workerHostName}`;

    return {
      success: true,
      workerName,
      workerUrl,
      customDomainUrl,
    };
  } catch (err: any) {
    return {
      success: false,
      error: 'استقرار وورکر با خطا مواجه شد: ' + (err.message || 'مشکل ناشناخته'),
    };
  }
}

export interface SyncWorkerOptions {
  token?: string;
  accountId?: string;
  workerName?: string;
  cleanIps?: string[];
  proxyIp?: string;
  uuid?: string;
}

export async function autoSyncWorkerToCloudflare(options?: SyncWorkerOptions): Promise<{ success: boolean; error?: string; workerUrl?: string }> {
  const token = options?.token || localStorage.getItem('nova_cf_token') || '';
  let accountId = options?.accountId || localStorage.getItem('nova_cf_account_id') || '';
  const workerName = options?.workerName || localStorage.getItem('nova_cf_worker_name') || 'nova-edge-worker';
  const uuid = options?.uuid || localStorage.getItem('nova_cf_uuid') || 'e04313f8-4e1d-4001-9032-15f5c88bb712';
  const proxyIp = options?.proxyIp || localStorage.getItem('nova_cf_proxy_ip') || '104.16.51.111';
  
  let cleanIps = options?.cleanIps;
  if (!cleanIps || cleanIps.length === 0) {
    try {
      const savedIps = localStorage.getItem('nova_cf_clean_ips');
      if (savedIps) {
        cleanIps = JSON.parse(savedIps);
      }
    } catch (e) {
      console.warn('Failed to parse clean IPs from localStorage', e);
    }
  }
  if (!cleanIps || cleanIps.length === 0) {
    cleanIps = ['104.16.51.111', '104.19.241.93', '162.159.137.85', 'icook.hk'];
  }

  if (!token) {
    return { success: false, error: 'توکن API کلاودفلر یافت نشد. لطفاً ابتدا در تب استقرار کلاودفلر توکن را وارد کنید.' };
  }

  if (!accountId) {
    const verifyRes = await verifyCloudflareToken(token);
    if (verifyRes.success && verifyRes.accounts && verifyRes.accounts.length > 0) {
      accountId = verifyRes.accounts[0].id;
      try {
        localStorage.setItem('nova_cf_account_id', accountId);
      } catch (e) {
        console.warn(e);
      }
    } else {
      return { success: false, error: verifyRes.error || 'شناسه حساب کلاودفلر استخراج نشد.' };
    }
  }

  const subPathStr = `/sub-${uuid.substring(0, 6)}`;
  const workerConfig: WorkerScriptConfig = {
    uuid,
    proxyIPs: [proxyIp],
    cleanIPs: cleanIps,
    subPath: subPathStr,
    subTitle: `Nova Edge Node - ${workerName}`,
    enableFragment: true,
    fragmentLength: '10-20',
    fragmentInterval: '10-20',
    enableVless: true,
    enableVmess: true,
    enableTrojan: false,
    customSNIs: ['speedtest.net', 'zula.ir'],
  };

  const res = await deployCloudflareWorker({
    apiToken: token,
    accountId,
    workerName,
    createKv: true,
    workerConfig,
  });

  if (res.success && res.workerUrl) {
    try {
      localStorage.setItem('nova_cf_is_deployed', 'true');
      localStorage.setItem('nova_cf_worker_url', res.workerUrl);
      localStorage.setItem('nova_cf_clean_ips', JSON.stringify(cleanIps));
      localStorage.setItem('nova_cf_uuid', uuid);
      localStorage.setItem('nova_cf_proxy_ip', proxyIp);
    } catch (e) {
      console.warn('LocalStorage save error:', e);
    }
  }

  return res;
}

