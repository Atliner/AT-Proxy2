import React, { useState } from 'react';
import { Zap, Plus, Copy, QrCode, Trash2, Check, RefreshCw, Layers, Shield, Settings2, Sparkles, Filter, Database, Globe, Cloud } from 'lucide-react';
import { Language, ProxyNode, FragmentConfig } from '../types';
import { generateVlessUri, generateVmessUri, generateTrojanUri, generateNodeUri, generateRandomUuid, generateMultiNodesBatch } from '../utils/configParsers';
import { INITIAL_CLEAN_IPS, POPULAR_PROXY_IPS, CF_HTTPS_PORTS, CF_HTTP_PORTS } from '../data/cleanIps';
import { autoSyncWorkerToCloudflare } from '../utils/cloudflareClient';

interface ConfigGeneratorProps {
  lang: Language;
  nodes: ProxyNode[];
  setNodes: React.Dispatch<React.SetStateAction<ProxyNode[]>>;
  onOpenQrModal: (title: string, content: string) => void;
}

export const ConfigGenerator: React.FC<ConfigGeneratorProps> = ({
  lang,
  nodes,
  setNodes,
  onOpenQrModal,
}) => {
  const isFa = lang === 'fa';

  // Single node builder state
  const [nodeName, setNodeName] = useState('Nova-VLESS-MCI');
  const [protocol, setProtocol] = useState<'vless' | 'vmess' | 'trojan'>('vless');
  const [address, setAddress] = useState('104.16.51.111');
  const [port, setPort] = useState(443);
  const [uuid, setUuid] = useState(generateRandomUuid());
  const [host, setHost] = useState('my-worker.account.workers.dev');
  const [sni, setSni] = useState('my-worker.account.workers.dev');
  const [path, setPath] = useState('/vless-ws?ed=2048');
  const [transport, setTransport] = useState<'ws' | 'grpc'>('ws');
  const [security, setSecurity] = useState<'tls' | 'none'>('tls');
  const [proxyIp, setProxyIp] = useState(POPULAR_PROXY_IPS[0]);

  // Fragment settings
  const [enableFragment, setEnableFragment] = useState(true);
  const [fragLength, setFragLength] = useState('10-20');
  const [fragInterval, setFragInterval] = useState('10-20');
  const [fragPackets, setFragPackets] = useState('tlshello');
  const [presetIsp, setPresetIsp] = useState<'mci' | 'irancell' | 'mokhaberat' | 'shatel' | 'custom'>('mci');

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [loadingPoolGen, setLoadingPoolGen] = useState(false);
  const [syncingCf, setSyncingCf] = useState(false);
  const [poolGenMessage, setPoolGenMessage] = useState<string | null>(null);
  const [poolItemCount, setPoolItemCount] = useState<number | null>(null);

  React.useEffect(() => {
    try {
      const saved1 = localStorage.getItem('nova_community_pool');
      const saved2 = localStorage.getItem('nova_community_clean_pool');
      const raw = saved1 || saved2;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setPoolItemCount(parsed.length);
        }
      }
    } catch (e) {}
  }, []);

  const handleSyncToCloudflare = async () => {
    setSyncingCf(true);
    setPoolGenMessage(null);
    const uniqueCleanIps = Array.from(new Set(nodes.map((n) => n.address))) as string[];

    try {
      const res = await autoSyncWorkerToCloudflare({
        uuid,
        proxyIp,
        cleanIps: uniqueCleanIps.length > 0 ? uniqueCleanIps : undefined,
      });

      if (res.success) {
        setPoolGenMessage(
          isFa
            ? '🚀 کد ورکر با موفقیت و به صورت اتوماتیک مستقیماً روی حساب کلاودفلر شما آپدیت شد! (بدون نیاز به دستکاری دستی)'
            : '🚀 Worker script successfully updated on Cloudflare via API!'
        );
      } else {
        setPoolGenMessage(
          isFa
            ? `⚠️ خطا در بروزرسانی اتوماتیک کلاودفلر: ${res.error}`
            : `⚠️ Cloudflare sync error: ${res.error}`
        );
      }
    } catch (err: any) {
      setPoolGenMessage(err.message || 'Error syncing to Cloudflare');
    } finally {
      setSyncingCf(false);
    }
  };

  // Apply ISP fragment preset
  const handleApplyPreset = (preset: 'mci' | 'irancell' | 'mokhaberat' | 'shatel' | 'custom') => {
    setPresetIsp(preset);
    if (preset === 'mci') {
      setFragLength('10-20');
      setFragInterval('10-20');
      setFragPackets('tlshello');
      setAddress('104.16.51.111');
    } else if (preset === 'irancell') {
      setFragLength('100-200');
      setFragInterval('5-10');
      setFragPackets('1-3');
      setAddress('104.19.241.93');
    } else if (preset === 'mokhaberat') {
      setFragLength('20-50');
      setFragInterval('15-30');
      setFragPackets('tlshello');
      setAddress('104.16.12.56');
    } else if (preset === 'shatel') {
      setFragLength('5-15');
      setFragInterval('10-15');
      setFragPackets('1-2');
      setAddress('104.16.20.10');
    }
  };

  const handleAddSingleNode = () => {
    const newNode: ProxyNode = {
      id: `node-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: nodeName.trim() || 'Nova-Node',
      protocol,
      address: address.trim(),
      port,
      uuid: uuid.trim(),
      path: path.trim(),
      host: host.trim(),
      sni: sni.trim() || host.trim(),
      tls: security === 'tls',
      security,
      transport,
      proxyIp,
      fragment: enableFragment
        ? {
            enabled: true,
            length: fragLength,
            interval: fragInterval,
            packets: fragPackets,
            preset: presetIsp,
          }
        : undefined,
    };

    setNodes((prev) => [newNode, ...prev]);
  };

  const handleGenerateBatch = () => {
    const batch = generateMultiNodesBatch(
      host.trim() || 'my-worker.account.workers.dev',
      uuid,
      INITIAL_CLEAN_IPS.slice(0, 8),
      [443, 2053, 2087, 8880]
    );
    setNodes((prev) => [...batch, ...prev]);
    setPoolGenMessage(
      isFa
        ? '⚡ تعداد ۲۰ کانفیگ جدید بر اساس آی‌پی‌های تمیز اولیه تولید و به لیست اضافه شد!'
        : '⚡ 20 configs generated from standard clean IPs!'
    );
  };

  const handleGenerateFromPool = async () => {
    setLoadingPoolGen(true);
    setPoolGenMessage(null);

    let poolItems: { ip: string; isp?: string; type?: string }[] = [];

    // 1. Try reading community pool saved in LocalStorage (both keys for compatibility)
    try {
      const saved1 = localStorage.getItem('nova_community_pool');
      const saved2 = localStorage.getItem('nova_community_clean_pool');
      const localPoolRaw = saved1 || saved2;
      if (localPoolRaw) {
        const parsed = JSON.parse(localPoolRaw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          poolItems = parsed.map((item: any) => ({
            ip: item.ip || item.address,
            isp: item.isp || 'Clean Node',
            type: item.type || (item.ip && item.ip.includes('.') && !item.ip.match(/^\d+\.\d+\.\d+\.\d+$/) ? 'domain' : 'ip'),
          }));
        }
      }
    } catch (e) {
      // LocalStorage read fallback
    }

    // 2. Fetch API pool and merge
    try {
      const resp = await fetch('/api/clean-ips/pool');
      if (resp.ok) {
        const data = await resp.json();
        if (data.success && Array.isArray(data.pool) && data.pool.length > 0) {
          const apiItems = data.pool;
          // Merge avoiding duplicates
          const existingIps = new Set(poolItems.map((p) => p.ip));
          apiItems.forEach((item: any) => {
            if (!existingIps.has(item.ip)) {
              poolItems.push({
                ip: item.ip,
                isp: item.isp || 'Clean Pool Item',
                type: item.type || (item.ip.includes('.') && !item.ip.match(/^\d+\.\d+\.\d+\.\d+$/) ? 'domain' : 'ip'),
              });
            }
          });
        }
      }
    } catch (e) {
      // API fetch error fallback
    }

    // 3. Fallback defaults if still empty
    if (poolItems.length === 0) {
      poolItems = [
        { ip: '104.16.51.111', isp: 'Hamrah Avval (MCI)', type: 'ip' },
        { ip: 'icook.hk', isp: 'Global Cloudflare CDN', type: 'domain' },
        { ip: '104.19.241.93', isp: 'Irancell (MTN)', type: 'ip' },
        { ip: 'zyd.fr', isp: 'Global Cloudflare CDN', type: 'domain' },
        { ip: '162.159.137.85', isp: 'Mokhaberat (TCI)', type: 'ip' },
        { ip: 'speed.cloudflare.com', isp: 'Global Cloudflare CDN', type: 'domain' },
        { ip: '172.67.182.201', isp: 'Hamrah Avval (MCI)', type: 'ip' },
        { ip: 'visa.com', isp: 'Global Cloudflare CDN', type: 'domain' },
        { ip: '104.16.12.56', isp: 'Mokhaberat (TCI)', type: 'ip' },
        { ip: '172.67.74.155', isp: 'Irancell (MTN)', type: 'ip' },
        { ip: '104.20.10.1', isp: 'Shatel', type: 'ip' },
        { ip: '104.18.2.10', isp: 'Rightel', type: 'ip' },
        { ip: 'cloudflare.com', isp: 'Global Cloudflare CDN', type: 'domain' },
        { ip: 'time.is', isp: 'Global Cloudflare CDN', type: 'domain' },
        { ip: '104.16.20.10', isp: 'Shatel', type: 'ip' },
        { ip: '104.17.147.22', isp: 'Irancell (MTN)', type: 'ip' },
        { ip: '162.159.138.85', isp: 'Mokhaberat (TCI)', type: 'ip' },
        { ip: '104.16.100.1', isp: 'Hamrah Avval (MCI)', type: 'ip' },
        { ip: '104.19.100.1', isp: 'Irancell (MTN)', type: 'ip' },
        { ip: '172.67.200.1', isp: 'Mokhaberat (TCI)', type: 'ip' },
      ];
    }

    const currentWorkerHost = host.trim() || 'my-worker.account.workers.dev';
    const currentUuid = uuid.trim() || generateRandomUuid();

    // Create BOTH TCP & UDP configurations for ALL items in the pool!
    const createdNodes: ProxyNode[] = [];

    poolItems.forEach((item, index) => {
      const isDomain = item.type === 'domain' || !item.ip.match(/^\d+\.\d+\.\d+\.\d+$/);
      const itemIsp = item.isp || (isDomain ? 'Clean SNI' : 'Clean IP');

      let fragPreset: 'mci' | 'irancell' | 'mokhaberat' | 'shatel' | 'custom' = 'mci';
      let fLen = '10-20';
      let fInt = '10-20';
      let fPackets = 'tlshello';

      const ispLower = itemIsp.toLowerCase();
      if (ispLower.includes('irancell') || ispLower.includes('mtn')) {
        fragPreset = 'irancell';
        fLen = '100-200';
        fInt = '5-10';
        fPackets = '1-3';
      } else if (ispLower.includes('mokhaberat') || ispLower.includes('tci')) {
        fragPreset = 'mokhaberat';
        fLen = '20-50';
        fInt = '15-30';
        fPackets = 'tlshello';
      } else if (ispLower.includes('shatel')) {
        fragPreset = 'shatel';
        fLen = '5-15';
        fInt = '10-15';
        fPackets = '1-2';
      }

      const testPorts = [443, 2053, 2087, 8443, 2083, 2096];
      const selectedPort = testPorts[index % testPorts.length];

      // 1. High Speed TCP Node
      createdNodes.push({
        id: `pool-tcp-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 6)}`,
        name: isDomain
          ? `Nova-TCP-SNI-${item.ip}-P${selectedPort}`
          : `Nova-TCP-${itemIsp.split(' ')[0]}-${item.ip}-P${selectedPort}`,
        protocol: 'vless',
        address: item.ip,
        port: selectedPort,
        uuid: currentUuid,
        path: '/vless-ws?ed=2048',
        host: currentWorkerHost,
        sni: isDomain ? item.ip : currentWorkerHost,
        tls: true,
        security: 'tls',
        transport: 'ws',
        proxyIp: proxyIp,
        ispTag: `${itemIsp} [TCP]`,
        fragment: {
          enabled: true,
          length: fLen,
          interval: fInt,
          packets: fPackets,
          preset: fragPreset,
        },
      });

      // 2. Ultra Fast UDP / Gaming Node
      createdNodes.push({
        id: `pool-udp-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 6)}`,
        name: isDomain
          ? `Nova-UDP-Gaming-${item.ip}-P${selectedPort}`
          : `Nova-UDP-${itemIsp.split(' ')[0]}-${item.ip}-P${selectedPort}`,
        protocol: 'vless',
        address: item.ip,
        port: selectedPort,
        uuid: currentUuid,
        path: '/vless-udp?ed=2048',
        host: currentWorkerHost,
        sni: isDomain ? item.ip : currentWorkerHost,
        tls: true,
        security: 'tls',
        transport: 'ws',
        proxyIp: proxyIp,
        ispTag: `${itemIsp} [UDP/Gaming]`,
        fragment: {
          enabled: true,
          length: fLen,
          interval: fInt,
          packets: fPackets,
          preset: fragPreset,
        },
      });
    });

    setNodes((prev) => [...createdNodes, ...prev]);
    setPoolItemCount(poolItems.length);
    setLoadingPoolGen(false);
    setPoolGenMessage(
      isFa
        ? `🌊 تعداد ${createdNodes.length} کانفیگ هوشمند دوگانه (TCP + UDP) از تمام ${poolItems.length} مورد موجود در استخر همگانی با موفقیت تولید و اضافه گردید!`
        : `🌊 Created ${createdNodes.length} dual-protocol (TCP + UDP) configs from all ${poolItems.length} pool items!`
    );
  };

  const handleCopyLink = (node: ProxyNode) => {
    const uri = generateNodeUri(node);
    navigator.clipboard.writeText(uri);
    setCopiedId(node.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleTestPing = async (node: ProxyNode) => {
    setTestingId(node.id);
    try {
      const resp = await fetch('/api/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetHost: node.address, port: node.port }),
      });
      const data = await resp.json();
      setNodes((prev) =>
        prev.map((n) =>
          n.id === node.id
            ? {
                ...n,
                pingMs: data.pingMs,
                status: data.pingMs < 3000 ? 'ok' : 'timeout',
              }
            : n
        )
      );
    } catch (err) {
      console.error(err);
    } finally {
      setTestingId(null);
    }
  };

  const handleDeleteNode = (id: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== id));
  };

  return (
    <div className="space-y-6">
      {/* Top Batch Generator Actions */}
      <div className="bg-[#0d0d0f] border border-white/10 p-6 rounded-3xl space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-light text-white flex items-center space-x-2 space-x-reverse">
              <Zap className="w-5 h-5 text-blue-400" />
              <span>{isFa ? 'سازنده کانفیگ VLESS / VMESS و فرگمنت پیشرفته' : 'VLESS / VMESS Config Generator'}</span>
            </h3>
            <p className="text-xs text-white/40 mt-1">
              {isFa
                ? 'ایجاد کانفیگ‌های تک‌نود یا ساخت خودکار از آی‌پی‌ها و دامنه‌های استخر همگانی برای تمام اپراتورها'
                : 'Create single nodes or generate automatically from Community Pool IPs/Domains'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleSyncToCloudflare}
              disabled={syncingCf}
              className="py-3 px-5 border border-emerald-500/50 bg-gradient-to-r from-emerald-600/30 to-teal-600/30 hover:from-emerald-600/40 hover:to-teal-600/40 text-emerald-300 font-bold text-xs rounded-2xl transition flex items-center space-x-2 space-x-reverse whitespace-nowrap shadow-lg shadow-emerald-600/10 disabled:opacity-50"
              title="Auto-deploy updated worker script to Cloudflare Edge"
            >
              <Zap className={`w-4 h-4 text-emerald-400 ${syncingCf ? 'animate-spin' : ''}`} />
              <span>
                {syncingCf
                  ? (isFa ? 'در حال همگام‌سازی ورکر...' : 'Syncing Cloudflare...')
                  : (isFa ? '⚡ همگام‌سازی اتوماتیک کد ورکر در کلاودفلر' : 'Sync Worker to Cloudflare')}
              </span>
            </button>

            <button
              onClick={handleGenerateFromPool}
              disabled={loadingPoolGen}
              className="py-3 px-5 border border-cyan-500/50 bg-gradient-to-r from-cyan-600/30 to-blue-600/30 hover:from-cyan-600/40 hover:to-blue-600/40 text-cyan-300 font-bold text-xs rounded-2xl transition flex items-center space-x-2 space-x-reverse whitespace-nowrap shadow-lg shadow-cyan-600/10 disabled:opacity-50"
            >
              <Database className={`w-4 h-4 text-cyan-400 ${loadingPoolGen ? 'animate-spin' : ''}`} />
              <span>
                {loadingPoolGen
                  ? (isFa ? 'در حال دریافت و ساخت...' : 'Generating...')
                  : (isFa
                      ? (poolItemCount ? `🌊 ساخت کانفیگ از تمامی ${poolItemCount} مورد استخر (TCP + UDP)` : '🌊 ساخت کانفیگ از تمامی موارد استخر (TCP + UDP)')
                      : (poolItemCount ? `Generate Configs from All ${poolItemCount} Pool Items (TCP + UDP)` : 'Generate Configs from All Pool Items (TCP + UDP)'))}
              </span>
            </button>

            <button
              onClick={handleGenerateBatch}
              className="py-3 px-5 border border-blue-500/50 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 font-bold text-xs uppercase tracking-widest rounded-2xl transition flex items-center space-x-2 space-x-reverse whitespace-nowrap"
            >
              <Layers className="w-4 h-4" />
              <span>{isFa ? '⚡ تولید دسته‌ای ۲۰ کانفیگ پیش‌فرض' : 'Batch Generate 20+ Default Nodes'}</span>
            </button>
          </div>
        </div>

        {poolGenMessage && (
          <div className="p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-2xl text-cyan-300 text-xs font-medium flex items-center justify-between animate-in fade-in">
            <span>{poolGenMessage}</span>
            <button
              onClick={() => setPoolGenMessage(null)}
              className="text-[10px] text-cyan-400 hover:text-cyan-200 underline font-mono"
            >
              {isFa ? 'بستن' : 'Dismiss'}
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Form Builder */}
        <div className="lg:col-span-1 bg-white/[0.03] border border-white/10 rounded-3xl p-6 space-y-4">
          <h4 className="text-xs font-mono uppercase tracking-widest text-white/40 border-b border-white/10 pb-3 flex items-center space-x-2 space-x-reverse">
            <Settings2 className="w-4 h-4 text-blue-400" />
            <span>{isFa ? 'تنظیمات نود جدید' : 'New Node Config'}</span>
          </h4>

          {/* Node Name & Protocol */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-white/40 mb-1">{isFa ? 'پروتکل:' : 'Protocol:'}</label>
              <select
                value={protocol}
                onChange={(e) => setProtocol(e.target.value as any)}
                className="w-full bg-[#0d0d0f] border border-white/15 rounded-xl p-2.5 text-xs text-white focus:border-blue-500 font-mono"
              >
                <option value="vless">VLESS</option>
                <option value="vmess">VMESS</option>
                <option value="trojan">Trojan</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-white/40 mb-1">{isFa ? 'نام کانفیگ:' : 'Name:'}</label>
              <input
                type="text"
                value={nodeName}
                onChange={(e) => setNodeName(e.target.value)}
                className="w-full bg-white/5 border border-white/15 rounded-xl p-2.5 text-xs text-white font-mono"
              />
            </div>
          </div>

          {/* Clean IP & Port */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-white/40 mb-1">{isFa ? 'آدرس IP تمیز:' : 'Clean IP:'}</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full bg-white/5 border border-white/15 rounded-xl p-2.5 text-xs text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-white/40 mb-1">{isFa ? 'پورت:' : 'Port:'}</label>
              <select
                value={port}
                onChange={(e) => setPort(parseInt(e.target.value, 10))}
                className="w-full bg-[#0d0d0f] border border-white/15 rounded-xl p-2.5 text-xs text-white font-mono"
              >
                {CF_HTTPS_PORTS.map((p) => (
                  <option key={p} value={p}>
                    {p} (HTTPS/TLS)
                  </option>
                ))}
                {CF_HTTP_PORTS.map((p) => (
                  <option key={p} value={p}>
                    {p} (HTTP)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* UUID */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-white/40 mb-1 flex items-center justify-between">
              <span>{isFa ? 'شناسه UUID:' : 'UUID:'}</span>
              <button
                onClick={() => setUuid(generateRandomUuid())}
                className="text-[10px] text-blue-400 hover:underline font-mono"
              >
                {isFa ? 'تولید UUID' : 'New UUID'}
              </button>
            </label>
            <input
              type="text"
              value={uuid}
              onChange={(e) => setUuid(e.target.value)}
              className="w-full bg-white/5 border border-white/15 rounded-xl p-2.5 text-xs text-white font-mono"
            />
          </div>

          {/* Host & SNI */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-white/40 mb-1">{isFa ? 'Host Header:' : 'Host Header:'}</label>
              <input
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                className="w-full bg-white/5 border border-white/15 rounded-xl p-2.5 text-xs text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-white/40 mb-1">{isFa ? 'SNI ServerName:' : 'SNI:'}</label>
              <input
                type="text"
                value={sni}
                onChange={(e) => setSni(e.target.value)}
                className="w-full bg-white/5 border border-white/15 rounded-xl p-2.5 text-xs text-white font-mono"
              />
            </div>
          </div>

          {/* Fragment Controls */}
          <div className="p-4 bg-black border border-white/10 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-white flex items-center space-x-1.5 space-x-reverse">
                <Shield className="w-3.5 h-3.5 text-blue-400" />
                <span>{isFa ? 'تنظیمات فرگمنت (Fragment)' : 'Fragment Engine'}</span>
              </span>
              <input
                type="checkbox"
                checked={enableFragment}
                onChange={(e) => setEnableFragment(e.target.checked)}
                className="rounded bg-white/10 border-white/20 text-blue-500 focus:ring-0"
              />
            </div>

            {enableFragment && (
              <div className="space-y-2.5 pt-1">
                {/* Preset buttons */}
                <div>
                  <label className="block text-[10px] text-white/40 uppercase mb-1">{isFa ? 'پریست اپراتور:' : 'ISP Preset:'}</label>
                  <div className="grid grid-cols-4 gap-1">
                    {[
                      { id: 'mci', label: 'همراه اول' },
                      { id: 'irancell', label: 'ایرانسل' },
                      { id: 'mokhaberat', label: 'مخابرات' },
                      { id: 'shatel', label: 'شاتل' },
                    ].map((p) => (
                      <button
                        key={p.id}
                        onClick={() => handleApplyPreset(p.id as any)}
                        className={`py-1.5 text-[10px] font-mono rounded-lg transition ${
                          presetIsp === p.id
                            ? 'bg-blue-600 text-white'
                            : 'bg-white/5 text-white/60 hover:bg-white/10 border border-white/10'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-[10px]">
                  <div>
                    <span className="text-white/40 block mb-0.5 font-mono">Length:</span>
                    <input
                      type="text"
                      value={fragLength}
                      onChange={(e) => setFragLength(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded p-1 text-white font-mono text-center"
                    />
                  </div>
                  <div>
                    <span className="text-white/40 block mb-0.5 font-mono">Interval:</span>
                    <input
                      type="text"
                      value={fragInterval}
                      onChange={(e) => setFragInterval(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded p-1 text-white font-mono text-center"
                    />
                  </div>
                  <div>
                    <span className="text-white/40 block mb-0.5 font-mono">Packets:</span>
                    <input
                      type="text"
                      value={fragPackets}
                      onChange={(e) => setFragPackets(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded p-1 text-white font-mono text-center"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={handleAddSingleNode}
            className="w-full py-3 px-4 bg-white text-black hover:bg-blue-400 font-bold text-xs uppercase tracking-wider rounded-xl transition flex items-center justify-center space-x-2 space-x-reverse"
          >
            <Plus className="w-4 h-4" />
            <span>{isFa ? 'افزودن نود به لیست' : 'Add Node to List'}</span>
          </button>
        </div>

        {/* Right Column: Generated Nodes Table */}
        <div className="lg:col-span-2 bg-white/[0.03] border border-white/10 rounded-3xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h4 className="text-xs font-mono uppercase tracking-widest text-white/40 flex items-center space-x-2 space-x-reverse">
              <Layers className="w-4 h-4 text-blue-400" />
              <span>{isFa ? `لیست نودها و کانفیگ‌ها (${nodes.length})` : `Active Config Nodes (${nodes.length})`}</span>
            </h4>
            {nodes.length > 0 && (
              <button
                onClick={() => setNodes([])}
                className="text-xs text-rose-400 hover:underline font-mono"
              >
                {isFa ? 'پاکسازی همه' : 'Clear All'}
              </button>
            )}
          </div>

          {nodes.length === 0 ? (
            <div className="py-12 text-center text-white/40 space-y-3">
              <Sparkles className="w-8 h-8 mx-auto text-white/20" />
              <p className="text-xs">
                {isFa
                  ? 'هنوز هیچ نودی ساخته نشده است. از دکمه تولید دسته‌ای یا فرم سمت راست استفاده کنید.'
                  : 'No nodes created yet. Use the form or Batch Generator to add nodes.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
              {nodes.map((node) => {
                const uri = generateNodeUri(node);
                return (
                  <div
                    key={node.id}
                    className="p-4 bg-black border border-white/10 rounded-2xl space-y-2.5 hover:border-white/20 transition"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2 space-x-reverse">
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-blue-500/10 text-blue-400 uppercase font-mono border border-blue-500/20">
                          {node.protocol}
                        </span>
                        <span className="text-xs font-semibold text-white">{node.name}</span>
                        {node.ispTag && (
                          <span className="px-2 py-0.5 text-[10px] rounded bg-white/5 text-amber-300 font-mono border border-white/10">
                            {node.ispTag}
                          </span>
                        )}
                        {node.fragment?.enabled && (
                          <span className="px-2 py-0.5 text-[10px] rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 font-mono">
                            Frag ({node.fragment.length})
                          </span>
                        )}
                      </div>

                      <div className="flex items-center space-x-1 space-x-reverse">
                        {/* Ping badge */}
                        {node.pingMs !== undefined && node.pingMs !== null && (
                          <span
                            className={`px-2 py-0.5 text-[10px] rounded font-mono ${
                              node.pingMs < 200
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : node.pingMs < 350
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            }`}
                          >
                            {node.pingMs}ms
                          </span>
                        )}

                        <button
                          onClick={() => handleTestPing(node)}
                          disabled={testingId === node.id}
                          className="p-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-blue-400 transition"
                          title="Test TCP Ping"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${testingId === node.id ? 'animate-spin' : ''}`} />
                        </button>

                        <button
                          onClick={() => onOpenQrModal(node.name, uri)}
                          className="p-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition"
                          title="Show QR Code"
                        >
                          <QrCode className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleCopyLink(node)}
                          className="p-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-emerald-400 transition"
                          title="Copy Link"
                        >
                          {copiedId === node.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>

                        <button
                          onClick={() => handleDeleteNode(node.id)}
                          className="p-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-rose-400 transition"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="bg-[#0d0d0f] p-2.5 rounded-xl border border-white/10 text-[11px] font-mono text-white/60 truncate flex items-center justify-between">
                      <span className="truncate">{uri}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
