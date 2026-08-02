import React, { useState } from 'react';
import { Cloud, Key, CheckCircle2, AlertCircle, RefreshCw, Copy, ExternalLink, Zap, Lock, ShieldCheck, ArrowRight, Layers, Eye } from 'lucide-react';
import { Language, CloudflareAccount, CloudflareZone, ProxyNode, WorkerScriptConfig } from '../types';
import { generateRandomUuid } from '../utils/configParsers';
import { POPULAR_PROXY_IPS } from '../data/cleanIps';
import { verifyCloudflareToken, fetchCloudflareZones, deployCloudflareWorker } from '../utils/cloudflareClient';

interface CloudflareDeployerProps {
  lang: Language;
  onDeploySuccess: (workerUrl: string, subUrl: string, nodes: ProxyNode[]) => void;
  setCfConnected: (connected: boolean) => void;
  setActiveWorkerName: (name: string) => void;
}

export const CloudflareDeployer: React.FC<CloudflareDeployerProps> = ({
  lang,
  onDeploySuccess,
  setCfConnected,
  setActiveWorkerName,
}) => {
  const isFa = lang === 'fa';

  const [apiToken, setApiToken] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifySuccess, setVerifySuccess] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const [accounts, setAccounts] = useState<CloudflareAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [zones, setZones] = useState<CloudflareZone[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState('');
  const [customDomain, setCustomDomain] = useState('');

  const [workerName, setWorkerName] = useState('nova-edge-worker');
  const [uuid, setUuid] = useState(generateRandomUuid());
  const [proxyIp, setProxyIp] = useState(POPULAR_PROXY_IPS[0]);
  const [cleanIpText, setCleanIpText] = useState('104.16.51.111\n104.19.241.93\n162.159.137.85\nicook.hk');

  const [deploying, setDeploying] = useState(false);
  const [deployProgress, setDeployProgress] = useState(0);
  const [deployStatusText, setDeployStatusText] = useState('');
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deployedResult, setDeployedResult] = useState<{
    workerUrl: string;
    subUrl: string;
    customDomainUrl?: string | null;
  } | null>(null);

  const [autoCreateKv, setAutoCreateKv] = useState(true);
  const [existingWorkerUrl, setExistingWorkerUrl] = useState('');
  const [activeTabMode, setActiveTabMode] = useState<'new_deploy' | 'existing_link'>('new_deploy');

  const fetchZones = async (token: string, accId: string) => {
    try {
      const res = await fetchCloudflareZones(token, accId);
      if (res.success && res.result) {
        setZones(res.result);
      }
    } catch (err) {
      console.error('Failed to fetch zones:', err);
    }
  };

  // Helper to handle Token verification
  const handleVerifyToken = async () => {
    if (!apiToken.trim()) {
      setVerifyError(isFa ? 'لطفا توکن API کلاودفلر را وارد کنید.' : 'Please enter your Cloudflare API token.');
      return;
    }

    setVerifying(true);
    setVerifyError(null);
    setVerifySuccess(false);

    try {
      const res = await verifyCloudflareToken(apiToken.trim());

      if (!res.success || !res.accounts || res.accounts.length === 0) {
        throw new Error(res.error || (isFa ? 'توکن وارد شده معتبر نیست یا هیچ اکانتی ندارد.' : 'Token validation failed.'));
      }

      setAccounts(res.accounts);
      if (res.accounts.length > 0) {
        setSelectedAccountId(res.accounts[0].id);
        fetchZones(apiToken.trim(), res.accounts[0].id);
      }

      setVerifySuccess(true);
      setCfConnected(true);
    } catch (err: any) {
      setVerifyError(err.message || 'Error connecting to Cloudflare API');
      setCfConnected(false);
    } finally {
      setVerifying(false);
    }
  };

  const handleAccessExisting = () => {
    if (!existingWorkerUrl.trim()) {
      alert(isFa ? 'لطفاً آدرس لینک وورکر مستقر شده را وارد کنید.' : 'Please enter your deployed worker URL.');
      return;
    }
    let formattedUrl = existingWorkerUrl.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`;
    }
    const subUrl = `${formattedUrl}/sub`;
    
    // Create initial nodes for this worker
    const domainHost = formattedUrl.replace(/^https?:\/\//, '').split('/')[0];
    const initialNodes: ProxyNode[] = [
      {
        id: 'existing-1',
        name: `Nova-Edge-Clean1-${domainHost}`,
        protocol: 'vless',
        address: '104.16.51.111',
        port: 443,
        uuid: uuid,
        path: '/vless-ws?ed=2048',
        host: domainHost,
        sni: domainHost,
        tls: true,
        security: 'tls',
        transport: 'ws',
        fragment: { enabled: true, length: '10-20', interval: '10-20', packets: 'tlshello' }
      }
    ];

    setCfConnected(true);
    setActiveWorkerName(domainHost);
    onDeploySuccess(formattedUrl, subUrl, initialNodes);
  };

  const handleDeploy = async () => {
    setDeployError(null);
    setVerifyError(null);

    if (!apiToken.trim()) {
      setDeployError(isFa ? 'لطفاً ابتدا توکن API کلاودفلر را وارد نمایید.' : 'Please enter your Cloudflare API Token.');
      return;
    }

    let accId = selectedAccountId;

    // Auto-verify token if account ID is not yet retrieved
    if (!accId) {
      setDeploying(true);
      setDeployProgress(5);
      setDeployStatusText(isFa ? 'در حال تایید توکن و استعلام حساب‌های کلاودفلر...' : 'Verifying Cloudflare API Token & accounts...');
      try {
        const res = await verifyCloudflareToken(apiToken.trim());
        if (!res.success || !res.accounts || res.accounts.length === 0) {
          throw new Error(res.error || (isFa ? 'توکن وارد شده معتبر نیست یا هیچ اکانتی ندارد.' : 'Invalid API Token or no accounts found.'));
        }
        setAccounts(res.accounts);
        accId = res.accounts[0].id;
        setSelectedAccountId(accId);
        setVerifySuccess(true);
        setCfConnected(true);
        fetchZones(apiToken.trim(), accId);
      } catch (err: any) {
        setDeployError(err.message || 'Error verifying Cloudflare token');
        setDeploying(false);
        return;
      }
    }

    const targetWorkerName = workerName.trim().toLowerCase() || 'nova-worker';

    setDeploying(true);
    setDeployProgress(15);
    setDeployStatusText(isFa ? 'در حال برقراری ارتباط و بررسی دیتابیس KV...' : 'Checking KV Namespace & preparing scripts...');
    setDeployedResult(null);

    const cleanIpsArr = cleanIpText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    const subPathStr = `/sub-${uuid.substring(0, 6)}`;
    const workerConfig: WorkerScriptConfig = {
      uuid,
      proxyIPs: [proxyIp],
      cleanIPs: cleanIpsArr,
      subPath: subPathStr,
      subTitle: `Nova Edge Node - ${targetWorkerName}`,
      enableFragment: true,
      fragmentLength: '10-20',
      fragmentInterval: '10-20',
      enableVless: true,
      enableVmess: true,
      enableTrojan: false,
      customSNIs: ['speedtest.net', 'zula.ir'],
    };

    try {
      setDeployProgress(45);
      setDeployStatusText(isFa ? 'در حال ایجاد دیتابیس KV و ارسال کد به Cloudflare Edge...' : 'Deploying code & provisioning KV namespace on Cloudflare Edge...');

      const deployRes = await deployCloudflareWorker({
        apiToken: apiToken.trim(),
        accountId: accId,
        workerName: targetWorkerName,
        customDomain: customDomain.trim() || undefined,
        zoneId: selectedZoneId || undefined,
        createKv: autoCreateKv,
        workerConfig,
      });

      if (!deployRes.success || !deployRes.workerUrl) {
        throw new Error(deployRes.error || 'Deployment failed.');
      }

      setDeployProgress(85);
      setDeployStatusText(isFa ? 'در حال فعال‌سازی زیردامنه و تولید لینک‌های اختصاصی...' : 'Enabling workers.dev route & sub links...');

      // Build initial ProxyNode array using returned worker host domain
      const workerDomainFromRes = deployRes.workerUrl ? deployRes.workerUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, '') : '';
      const domainHost = customDomain.trim() || workerDomainFromRes || `${targetWorkerName}.workers.dev`;
      const generatedNodes: ProxyNode[] = cleanIpsArr.map((cip, i) => ({
        id: `node-deploy-${i}`,
        name: `Nova-Edge-${i + 1}-${cip}`,
        protocol: 'vless',
        address: cip,
        port: 443,
        uuid,
        path: '/vless-ws?ed=2048',
        host: domainHost,
        sni: domainHost,
        tls: true,
        security: 'tls',
        transport: 'ws',
        proxyIp,
        fragment: {
          enabled: true,
          length: '10-20',
          interval: '10-20',
          packets: 'tlshello',
        },
      }));

      // Create subscription payload on backend (if server exists) or fallback to worker direct sub URL
      let finalSubUrl = `${deployRes.workerUrl}${subPathStr}`;
      try {
        const subResp = await fetch('/api/sub/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: uuid.substring(0, 8),
            title: `Nova Sub - ${targetWorkerName}`,
            nodes: generatedNodes,
          }),
        });
        const contentType = subResp.headers.get('content-type') || '';
        if (subResp.ok && contentType.includes('application/json')) {
          const subData = await subResp.json();
          if (subData.subUrl) {
            finalSubUrl = `${window.location.origin}${subData.subUrl}`;
          }
        }
      } catch (e) {
        console.warn('Backend sub creation notice, using worker direct sub URL:', e);
      }

      setDeployProgress(100);

      setDeployedResult({
        workerUrl: deployRes.workerUrl,
        subUrl: finalSubUrl,
        customDomainUrl: deployRes.customDomainUrl,
      });

      setActiveWorkerName(targetWorkerName);
      onDeploySuccess(deployRes.workerUrl, finalSubUrl, generatedNodes);

    } catch (err: any) {
      setDeployError(err.message || 'Deployment error');
    } finally {
      setDeploying(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Intro Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0d0d15] via-[#090d18] to-[#070b14] border border-cyan-500/20 p-6 sm:p-8 shadow-2xl">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2.5 max-w-2xl">
            <div className="inline-flex items-center space-x-2 space-x-reverse px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[10px] uppercase tracking-widest font-mono">
              <Zap className="w-3.5 h-3.5" />
              <span>{isFa ? 'سامانه استقرار هوشمند Edge Proxy v4.8' : 'Smart Edge Proxy Deployment System v4.8'}</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-light text-white tracking-tight">
              {isFa ? 'راه‌اندازی فوق‌سریع Nova Edge X روی شبکه کلاودفلر' : 'Deploy Nova Edge X on Cloudflare Worker Network'}
            </h2>
            <p className="text-white/60 text-xs sm:text-sm leading-relaxed">
              {isFa
                ? 'توکن API کلاودفلر خود را وارد کنید تا تمامی کانفیگ‌های VLESS WS، پروتکل‌های فرگمنت، آی‌پی تمیز و پنل مدیریت اختصاصی، مستقیماً روی دامنه و وورکر شما استقرار یابند.'
                : 'Enter your Cloudflare API token to deploy VLESS WS proxy workers, fragment configurations, clean IP routing, and smart subscription links.'}
            </p>
          </div>
          <div className="flex-shrink-0 flex items-center justify-center p-5 bg-cyan-500/5 rounded-2xl border border-cyan-500/20 shadow-lg">
            <ShieldCheck className="w-12 h-12 text-cyan-400" />
          </div>
        </div>
      </div>

      {/* Mode Switcher Tabs */}
      <div className="flex bg-white/5 border border-white/10 p-1.5 rounded-2xl gap-2 text-xs font-mono">
        <button
          onClick={() => setActiveTabMode('new_deploy')}
          className={`flex-1 py-3 px-4 rounded-xl transition flex items-center justify-center space-x-2 space-x-reverse ${
            activeTabMode === 'new_deploy'
              ? 'bg-blue-600 text-white font-bold shadow'
              : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}
        >
          <Zap className="w-4 h-4" />
          <span>{isFa ? '⚡ استقرار اتوماتیک پنل با توکن (پیش‌فرض)' : '⚡ Auto-Deploy Panel with Token'}</span>
        </button>

        <button
          onClick={() => setActiveTabMode('existing_link')}
          className={`flex-1 py-3 px-4 rounded-xl transition flex items-center justify-center space-x-2 space-x-reverse ${
            activeTabMode === 'existing_link'
              ? 'bg-blue-600 text-white font-bold shadow'
              : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}
        >
          <ExternalLink className="w-4 h-4" />
          <span>{isFa ? '🔗 ورود به پنل مستقر شده (لینک پروژه)' : '🔗 Connect Deployed Project URL'}</span>
        </button>
      </div>

      {activeTabMode === 'existing_link' ? (
        <div className="bg-white/[0.03] border border-white/10 rounded-3xl p-8 space-y-6 max-w-2xl mx-auto">
          <div className="text-center space-y-2">
            <h3 className="text-xl font-light text-white">
              {isFa ? 'ورود مستقیم به پنل با لینک پروژه مستقر شده' : 'Enter Deployed Worker Project URL'}
            </h3>
            <p className="text-xs text-white/50 leading-relaxed">
              {isFa
                ? 'اگر قبلاً وورکر Nova Proxy یا پنل خود را روی کلاودفلر استقرار داده‌اید، آدرس زیردامنه یا لینک کامل آن را وارد کنید تا پنل مدیریت بلافاصله فراخوانی و فعال شود.'
                : 'Enter your deployed Cloudflare Worker URL (e.g. https://nova-worker.account.workers.dev) to unlock full control dashboard.'}
            </p>
          </div>

          <div className="space-y-4 pt-2">
            <div>
              <label className="block text-xs font-mono text-white/70 mb-2 uppercase tracking-wider">
                {isFa ? 'آدرس پروژه مستقر شده (Worker URL):' : 'Project Worker URL:'}
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={existingWorkerUrl}
                  onChange={(e) => setExistingWorkerUrl(e.target.value)}
                  placeholder="https://nova-worker.myaccount.workers.dev"
                  className="w-full bg-black border border-white/15 rounded-2xl px-4 py-3.5 pl-10 text-xs text-white placeholder-white/20 focus:outline-none focus:border-blue-500 font-mono"
                />
                <ExternalLink className="w-4 h-4 text-white/30 absolute left-3.5 top-4" />
              </div>
            </div>

            <button
              onClick={handleAccessExisting}
              className="w-full py-4 px-6 bg-white text-black hover:bg-blue-400 font-bold text-xs uppercase tracking-widest rounded-2xl transition flex items-center justify-center space-x-2 space-x-reverse"
            >
              <Zap className="w-4 h-4" />
              <span>{isFa ? 'ورود به پنل و فراخوانی تنظیمات' : 'Open Deployed Panel Dashboard'}</span>
            </button>
          </div>
        </div>
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Step 1: Cloudflare Credentials Card */}
        <div className="lg:col-span-1 bg-white/[0.03] border border-white/10 rounded-3xl p-6 space-y-5">
          <div className="flex items-center space-x-3 space-x-reverse border-b border-white/10 pb-4">
            <div className="w-7 h-7 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center font-mono font-bold text-xs border border-blue-500/30">
              01
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">
                {isFa ? 'اعتبارسنجی توکن API' : 'API Token Authorization'}
              </h3>
              <p className="text-[10px] uppercase tracking-wider text-white/40">{isFa ? 'ارتباط مستقیم با Cloudflare' : 'Connect via REST API'}</p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Direct Token Creator Button */}
            <div className="p-3.5 bg-blue-500/10 border border-blue-500/20 rounded-2xl space-y-2">
              <span className="text-xs font-semibold text-blue-300 block">
                {isFa ? '🔑 هنوز توکن کلودفلر ندارید؟' : '🔑 Don\'t have a Cloudflare Token yet?'}
              </span>
              <a
                href="https://dash.cloudflare.com/profile/api-tokens"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white font-mono text-xs rounded-xl transition flex items-center justify-center space-x-2 space-x-reverse shadow-lg shadow-blue-600/20 border border-blue-400/30 font-bold"
              >
                <Key className="w-4 h-4" />
                <span>{isFa ? 'دریافت مستقیم توکن از کلودفلر (۱ کلیک)' : 'Get Token from Cloudflare (1-Click)'}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <p className="text-[10px] text-white/50 leading-relaxed">
                {isFa ? 'الگوی Edit Cloudflare Workers را انتخاب کنید و توکن را در کادر زیر قرار دهید.' : 'Select Edit Cloudflare Workers template and copy token here.'}
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-white/80 mb-1.5 flex items-center justify-between">
                <span>{isFa ? 'توکن API کلاودفلر:' : 'Cloudflare API Token:'}</span>
                <span className="text-[10px] text-white/40 font-mono">{isFa ? 'دارای دسترسی Workers Edit' : 'Requires Workers Edit scope'}</span>
              </label>
              <div className="relative">
                <input
                  type="password"
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  placeholder="e.g. 1a2b3c4d5e6f7g8h9i0j..."
                  className="w-full bg-white/5 border border-white/15 rounded-xl px-3.5 py-2.5 pl-10 text-xs text-white placeholder-white/20 focus:outline-none focus:border-blue-500 font-mono"
                />
                <Key className="w-4 h-4 text-white/30 absolute left-3 top-3" />
              </div>
            </div>

            <button
              onClick={handleVerifyToken}
              disabled={verifying}
              className="w-full py-3 px-4 bg-white text-black hover:bg-blue-400 font-bold text-xs uppercase tracking-wider rounded-xl transition flex items-center justify-center space-x-2 space-x-reverse disabled:opacity-50"
            >
              {verifying ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>{isFa ? 'در حال بررسی توکن...' : 'Verifying Token...'}</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>{isFa ? 'بررسی و تایید توکن' : 'Verify & Load Accounts'}</span>
                </>
              )}
            </button>

            {verifySuccess && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center space-x-2 space-x-reverse text-emerald-400 text-xs">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>{isFa ? 'توکن تایید شد! اکانت‌ها دریافت شدند.' : 'Token verified successfully!'}</span>
              </div>
            )}

            {verifyError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center space-x-2 space-x-reverse text-rose-400 text-xs">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{verifyError}</span>
              </div>
            )}

            {/* Account Selector */}
            {accounts.length > 0 && (
              <div className="space-y-3 pt-2">
                <div>
                  <label className="block text-xs font-medium text-white/80 mb-1">
                    {isFa ? 'انتخاب اکانت کلاودفلر:' : 'Select Account:'}
                  </label>
                  <select
                    value={selectedAccountId}
                    onChange={(e) => {
                      setSelectedAccountId(e.target.value);
                      fetchZones(apiToken, e.target.value);
                    }}
                    className="w-full bg-[#0d0d0f] border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                  >
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({acc.id.substring(0, 8)}...)
                      </option>
                    ))}
                  </select>
                </div>

                {/* Custom Zone / Domain optional */}
                {zones.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-white/80 mb-1">
                      {isFa ? 'دامنه اختصاصی (اختیاری):' : 'Custom Domain Zone (Optional):'}
                    </label>
                    <select
                      value={selectedZoneId}
                      onChange={(e) => {
                        setSelectedZoneId(e.target.value);
                        const found = zones.find((z) => z.id === e.target.value);
                        if (found) setCustomDomain(`sub.${found.name}`);
                      }}
                      className="w-full bg-[#0d0d0f] border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                    >
                      <option value="">{isFa ? 'استفاده از دامنه رایگان workers.dev' : 'Use free workers.dev subdomain'}</option>
                      {zones.map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="p-3 bg-black border border-white/10 rounded-xl text-[11px] text-white/50 space-y-1">
            <span className="font-semibold text-white/80 block">{isFa ? '💡 راهنمای ساخت توکن:' : '💡 Token Setup Guide:'}</span>
            <p>{isFa ? '۱. به داشبورد Cloudflare -> My Profile -> API Tokens بروید.' : '1. Go to Cloudflare Profile -> API Tokens.'}</p>
            <p>{isFa ? '۲. الگوی Edit Cloudflare Workers را انتخاب کنید.' : '2. Select Edit Cloudflare Workers template.'}</p>
          </div>
        </div>

        {/* Step 2: Deployment Settings & Parameters */}
        <div className="lg:col-span-2 bg-white/[0.03] border border-white/10 rounded-3xl p-6 space-y-6">
          <div className="flex items-center space-x-3 space-x-reverse border-b border-white/10 pb-4">
            <div className="w-7 h-7 rounded-lg bg-indigo-600/20 text-indigo-400 flex items-center justify-center font-mono font-bold text-xs border border-indigo-500/30">
              02
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">
                {isFa ? 'پیکربندی پارامترهای وورکر و آی‌پی تمیز' : 'Worker Parameters & Clean IP Config'}
              </h3>
              <p className="text-[10px] uppercase tracking-wider text-white/40">{isFa ? 'تنظیمات VLESS، UUID و ریورس پروکسی' : 'VLESS WS settings & proxy clean IPs'}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-white/80 mb-1">
                {isFa ? 'نام وورکر (Worker Name):' : 'Worker Name:'}
              </label>
              <input
                type="text"
                value={workerName}
                onChange={(e) => setWorkerName(e.target.value)}
                className="w-full bg-white/5 border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-white/80 mb-1 flex items-center justify-between">
                <span>{isFa ? 'شناسه UUID اختصاصی:' : 'VLESS UUID:'}</span>
                <button
                  onClick={() => setUuid(generateRandomUuid())}
                  className="text-[11px] text-blue-400 hover:underline"
                >
                  {isFa ? 'تولید جدید' : 'Generate'}
                </button>
              </label>
              <input
                type="text"
                value={uuid}
                onChange={(e) => setUuid(e.target.value)}
                className="w-full bg-white/5 border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-white/80 mb-1">
                {isFa ? 'آی‌پی ریورس پروکسی (Proxy IP):' : 'Outbound Proxy IP:'}
              </label>
              <select
                value={proxyIp}
                onChange={(e) => setProxyIp(e.target.value)}
                className="w-full bg-[#0d0d0f] border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
              >
                {POPULAR_PROXY_IPS.map((ip) => (
                  <option key={ip} value={ip}>
                    {ip}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-white/80 mb-1">
                {isFa ? 'دامنه اختصاصی جهت Route (اختیاری):' : 'Custom Route Pattern:'}
              </label>
              <input
                type="text"
                value={customDomain}
                onChange={(e) => setCustomDomain(e.target.value)}
                placeholder="e.g. proxy.mydomain.com"
                className="w-full bg-white/5 border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>

            <div className="md:col-span-2 bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <span className="text-xs font-semibold text-blue-300 block">
                  {isFa ? '🗄️ ساخت و اتصال اتوماتیک دیتابیس KV' : '🗄️ Auto Provision KV Namespace'}
                </span>
                <p className="text-[11px] text-white/50">
                  {isFa ? 'ایجاد دیتابیس KV اختصاصی روی اکانت کلاودفلر جهت ذخیره‌سازی لایه دیتای پنل و کانفیگ‌ها' : 'Provisions KV Namespace NOVA_PANEL_KV automatically during deployment'}
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                <input
                  type="checkbox"
                  checked={autoCreateKv}
                  onChange={(e) => setAutoCreateKv(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-white/80 mb-1 flex items-center justify-between">
                <span>{isFa ? 'آی‌پی‌های تمیز جهت درج در کانفیگ‌ها (هر سطر یک آی‌پی/دامنه):' : 'Clean IPs List (One per line):'}</span>
                <span className="text-[11px] text-white/40">{isFa ? 'پشتیبانی از MCI، ایرانسل و مخابرات' : 'Supports Irancell & MCI'}</span>
              </label>
              <textarea
                value={cleanIpText}
                onChange={(e) => setCleanIpText(e.target.value)}
                rows={3}
                className="w-full bg-white/5 border border-white/15 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-blue-500 font-mono leading-relaxed"
              />
            </div>
          </div>

          {/* Progress Bar during deploy */}
          {deploying && (
            <div className="space-y-2 p-4 bg-black border border-white/10 rounded-2xl">
              <div className="flex items-center justify-between text-xs text-blue-400 font-mono">
                <span>{deployStatusText}</span>
                <span>{deployProgress}%</span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${deployProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Deploy Error Message */}
          {deployError && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-xs flex items-center space-x-2 space-x-reverse font-mono">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" />
              <span>{deployError}</span>
            </div>
          )}

          {/* Deploy Action Button */}
          <div className="pt-2">
            <button
              onClick={handleDeploy}
              disabled={deploying || !apiToken.trim()}
              className="w-full py-4 px-6 border border-blue-500/50 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 font-bold text-xs uppercase tracking-widest rounded-2xl transition flex items-center justify-center space-x-2 space-x-reverse disabled:opacity-50"
            >
              {deploying ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>{isFa ? 'در حال استقرار روی کلاودفلر...' : 'Deploying to Cloudflare...'}</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  <span>{isFa ? '🚀 استقرار اتوماتیک وورکر در شبکه‌ی کلاودفلر' : 'Deploy Worker to Cloudflare Now'}</span>
                </>
              )}
            </button>
          </div>

          {/* Deployment Results Card */}
          {deployedResult && (
            <div className="p-6 bg-gradient-to-b from-blue-950/40 to-black border border-blue-500/30 rounded-3xl space-y-5 animate-in fade-in duration-300 shadow-2xl">
              <div className="flex items-center space-x-3 space-x-reverse text-emerald-400">
                <CheckCircle2 className="w-6 h-6 flex-shrink-0" />
                <div>
                  <h4 className="text-base font-bold text-white">{isFa ? 'پنل مدیریت Nova Proxy روی ورکر مستقر گردید! 🎉' : 'Nova Proxy Control Panel Deployed! 🎉'}</h4>
                  <p className="text-xs text-white/50">{isFa ? 'اکنون پنل کامل روی ساب‌دامنه اختصاصی شما فعال است.' : 'The full admin dashboard is now running on your custom worker subdomain.'}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                <a
                  href={`${deployedResult.workerUrl}/login`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-3.5 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-xs rounded-2xl transition flex items-center justify-center space-x-2 space-x-reverse shadow-lg shadow-cyan-500/20"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>{isFa ? '🚀 باز کردن پنل مدیریت در زبانه جدید' : '🚀 Open Admin Panel on Worker Subdomain'}</span>
                </a>

                <button
                  onClick={() => {
                    const el = document.getElementById('embedded-worker-frame');
                    if (el) el.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="py-3.5 px-4 bg-white/10 hover:bg-white/20 border border-white/10 text-white font-bold text-xs rounded-2xl transition flex items-center justify-center space-x-2 space-x-reverse"
                >
                  <Eye className="w-4 h-4" />
                  <span>{isFa ? '📺 مشاهده زنده پنل در همین صفحه' : '📺 View Embedded Panel Preview'}</span>
                </button>
              </div>

              <div className="space-y-3 pt-2 text-xs border-t border-white/10">
                <div>
                  <span className="text-white/40 uppercase tracking-widest text-[10px] block mb-1">{isFa ? 'آدرس ساب‌دامنه اختصاصی ورکر (Worker Subdomain):' : 'Worker Subdomain URL:'}</span>
                  <div className="flex items-center space-x-2 space-x-reverse bg-white/5 p-3 rounded-xl border border-white/10 font-mono text-cyan-300">
                    <span className="truncate flex-1 font-bold">{deployedResult.workerUrl}</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(deployedResult.workerUrl);
                        alert(isFa ? 'آدرس کپی شد!' : 'Copied!');
                      }}
                      className="p-1.5 hover:bg-white/10 rounded-lg text-white/60 hover:text-white transition"
                      title="Copy"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <a
                      href={deployedResult.workerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 hover:bg-white/10 rounded-lg text-white/60 hover:text-white transition"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                </div>

                <div>
                  <span className="text-white/40 uppercase tracking-widest text-[10px] block mb-1">{isFa ? 'لینک مستقیم اشتراک کلاینت‌ها (Subscription URL):' : 'Subscription Link:'}</span>
                  <div className="flex items-center space-x-2 space-x-reverse bg-white/5 p-3 rounded-xl border border-white/10 font-mono text-emerald-400">
                    <span className="truncate flex-1">{deployedResult.subUrl}</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(deployedResult.subUrl);
                        alert(isFa ? 'لینک اشتراک کپی شد!' : 'Subscription copied!');
                      }}
                      className="p-1.5 hover:bg-white/10 rounded-lg text-white/60 hover:text-white transition"
                      title="Copy"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Embedded Frame View */}
              <div id="embedded-worker-frame" className="pt-4 space-y-2">
                <div className="flex items-center justify-between text-xs text-white/60 font-mono">
                  <span>{isFa ? 'پیش‌نمایش زنده پنل مستقر شده:' : 'Live Embedded Worker Dashboard:'}</span>
                  <a
                    href={`${deployedResult.workerUrl}/login`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cyan-400 hover:underline flex items-center gap-1"
                  >
                    <span>{isFa ? 'باز کردن در صفحه کامل' : 'Full Screen'}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <div className="w-full h-[600px] rounded-2xl border border-white/20 overflow-hidden bg-black shadow-2xl">
                  <iframe
                    src={`${deployedResult.workerUrl}/login`}
                    className="w-full h-full border-0"
                    title="Nova Proxy Deployed Worker Panel"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
};
