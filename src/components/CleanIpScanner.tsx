import React, { useState, useEffect } from 'react';
import { Network, RefreshCw, CheckCircle2, Plus, Zap, Filter, ShieldCheck, ArrowUpRight, Globe, Sparkles, Database, Send, Radio } from 'lucide-react';
import { Language, CleanIpItem } from '../types';
import { INITIAL_CLEAN_IPS, ISP_PRESETS } from '../data/cleanIps';

interface CleanIpScannerProps {
  lang: Language;
  onExportCleanIpsToNodes?: (ips: string[]) => void;
}

export const CleanIpScanner: React.FC<CleanIpScannerProps> = ({
  lang,
  onExportCleanIpsToNodes,
}) => {
  const isFa = lang === 'fa';

  const [activeTab, setActiveTab] = useState<'scanner' | 'pool'>('scanner');
  const [ipList, setIpList] = useState<CleanIpItem[]>(INITIAL_CLEAN_IPS);
  const [selectedIsp, setSelectedIsp] = useState<string>('all');
  const [itemTypeFilter, setItemTypeFilter] = useState<'all' | 'domain' | 'ip'>('all');
  const [poolTypeFilter, setPoolTypeFilter] = useState<'all' | 'domain' | 'ip'>('all');

  const [scanning, setScanning] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [newIp, setNewIp] = useState('');
  const [newIsp, setNewIsp] = useState('Hamrah Avval (MCI)');
  const [poolSyncStatus, setPoolSyncStatus] = useState<string | null>(null);

  // Community IP Pool state
  const [communityPool, setCommunityPool] = useState<
    { ip: string; isp: string; city: string; pingMs: number; status: string; verifiedCount: number; type?: 'ip' | 'domain' }[]
  >([]);
  const [poolLoading, setPoolLoading] = useState(false);

  // Fetch Community Pool on load or tab switch
  const fetchCommunityPool = async () => {
    setPoolLoading(true);
    try {
      const resp = await fetch('/api/clean-ips/pool');
      const data = await resp.json();
      if (data.success && Array.isArray(data.pool)) {
        setCommunityPool(data.pool);
      }
    } catch (err) {
      console.error('Failed to fetch clean IP pool:', err);
    } finally {
      setPoolLoading(false);
    }
  };

  useEffect(() => {
    fetchCommunityPool();
  }, []);

  // Discover fresh candidate Cloudflare IPs or Clean Domains
  const handleDiscover = async (targetType: 'ip' | 'domain' | 'all') => {
    setDiscovering(true);
    setPoolSyncStatus(null);
    try {
      const resp = await fetch(`/api/clean-ips/discover?type=${targetType}&count=10`);
      const data = await resp.json();
      if (data.success && Array.isArray(data.discovered)) {
        const existingSet = new Set(ipList.map((item) => item.ip.toLowerCase()));
        const newItems: CleanIpItem[] = data.discovered
          .filter((item: any) => !existingSet.has(item.ip.toLowerCase()))
          .map((item: any) => ({
            ip: item.ip,
            isp: item.isp,
            city: item.city,
            pingMs: null,
            status: 'idle',
            type: item.type || (item.ip.match(/^\d+\.\d+\.\d+\.\d+$/) ? 'ip' : 'domain'),
            discovered: true,
          }));

        if (newItems.length > 0) {
          setIpList((prev) => [...newItems, ...prev]);
          if (targetType === 'domain') setItemTypeFilter('domain');
          if (targetType === 'ip') setItemTypeFilter('ip');
          setPoolSyncStatus(
            isFa
              ? `🔍 تعداد ${newItems.length} مورد جدید ${targetType === 'domain' ? 'دامنه تمیز' : 'آی‌پی'} کشف و به بالای لیست اضافه گردید!`
              : `🔍 Discovered ${newItems.length} new ${targetType} endpoints added to top of list!`
          );
        } else {
          setPoolSyncStatus(
            isFa
              ? `💡 تمام موارد کشف شده در این نوبت در لیست شما موجود بودند. می‌توانید دکمه اسکن زنده را بزنید.`
              : `💡 All discovered items were already in your list.`
          );
        }
      }
    } catch (err) {
      console.error('Failed to discover fresh IPs/Domains:', err);
    } finally {
      setDiscovering(false);
    }
  };

  // Run live TCP ping scan across selected clean IPs in parallel batches & sync working ones to Community Pool
  const handleScanAll = async () => {
    setScanning(true);
    setPoolSyncStatus(null);

    const itemsToScan = filteredList.length > 0 ? [...filteredList] : [...ipList];
    const workingFound: CleanIpItem[] = [];

    // Mark all items to scan as testing
    setIpList((prev) =>
      prev.map((item) =>
        itemsToScan.some((t) => t.ip === item.ip) ? { ...item, status: 'testing' } : item
      )
    );

    const BATCH_SIZE = 5;
    for (let i = 0; i < itemsToScan.length; i += BATCH_SIZE) {
      const batch = itemsToScan.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (item) => {
          try {
            const resp = await fetch('/api/ping', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ targetHost: item.ip, port: 443 }),
            });
            const data = await resp.json();

            const isOk = data.status === 'ok' && data.pingMs < 3000;
            const updatedItem: CleanIpItem = {
              ...item,
              pingMs: isOk ? data.pingMs : 3000,
              status: isOk ? 'ok' : 'fail',
              lastChecked: new Date().toLocaleTimeString(),
            };

            if (isOk && data.pingMs < 800) {
              workingFound.push(updatedItem);
            }

            setIpList((prev) =>
              prev.map((p) => (p.ip === item.ip ? updatedItem : p))
            );
          } catch (err) {
            setIpList((prev) =>
              prev.map((p) => (p.ip === item.ip ? { ...p, pingMs: 3000, status: 'fail' } : p))
            );
          }
        })
      );
    }

    setScanning(false);

    // Sync working low-latency items to central Community Pool
    if (workingFound.length > 0) {
      try {
        const syncResp = await fetch('/api/clean-ips/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: workingFound }),
        });
        const syncData = await syncResp.json();
        if (syncData.success) {
          setPoolSyncStatus(
            isFa
              ? `✅ اسکن با موفقیت کامل شد! ${workingFound.length} مورد سالم (آی‌پی و دامنه) در استخر همگانی ذخیره شد!`
              : `✅ ${workingFound.length} best clean endpoints saved to Community Pool!`
          );
          fetchCommunityPool();
        }
      } catch (err) {
        console.error('Error syncing to community pool:', err);
      }
    } else {
      setPoolSyncStatus(
        isFa
          ? `⚠️ اسکن پایان یافت. هیچ موردی پینگ پاسخگو دریافت نکرد.`
          : `⚠️ Scan finished. No reachable hosts found.`
      );
    }
  };

  const handleAddCustomItem = () => {
    if (!newIp.trim()) return;
    const val = newIp.trim();
    const isDomain = !val.match(/^\d+\.\d+\.\d+\.\d+$/);

    const newItem: CleanIpItem = {
      ip: val,
      isp: newIsp,
      city: isDomain ? 'Clean SNI Domain' : 'Custom IP',
      pingMs: null,
      status: 'idle',
      type: isDomain ? 'domain' : 'ip',
    };
    setIpList((prev) => [newItem, ...prev]);
    setNewIp('');
  };

  const handleApplyPoolToNodes = (ipsToApply: string[]) => {
    if (onExportCleanIpsToNodes && ipsToApply.length > 0) {
      onExportCleanIpsToNodes(ipsToApply);
      alert(
        isFa
          ? `تعداد ${ipsToApply.length} آدرس آی‌پی/دامنه تمیز با موفقیت به تمام نودهای وورکر اضافه گردید!`
          : `Added ${ipsToApply.length} clean endpoints to worker node configurations!`
      );
    }
  };

  const filteredList = ipList.filter((item) => {
    // Type filter check
    const isDomain = item.type === 'domain' || !item.ip.match(/^\d+\.\d+\.\d+\.\d+$/);
    if (itemTypeFilter === 'domain' && !isDomain) return false;
    if (itemTypeFilter === 'ip' && isDomain) return false;

    // ISP filter check
    if (selectedIsp === 'all') return true;
    if (selectedIsp === 'mci') return item.isp.toLowerCase().includes('mci') || item.isp.toLowerCase().includes('hamrah');
    if (selectedIsp === 'irancell') return item.isp.toLowerCase().includes('irancell') || item.isp.toLowerCase().includes('mtn');
    if (selectedIsp === 'mokhaberat') return item.isp.toLowerCase().includes('tci') || item.isp.toLowerCase().includes('mokhaberat');
    if (selectedIsp === 'shatel') return item.isp.toLowerCase().includes('shatel');
    if (selectedIsp === 'rightel') return item.isp.toLowerCase().includes('rightel');
    return true;
  });

  const filteredPool = communityPool.filter((item) => {
    const isDomain = item.type === 'domain' || !item.ip.match(/^\d+\.\d+\.\d+\.\d+$/);
    if (poolTypeFilter === 'domain') return isDomain;
    if (poolTypeFilter === 'ip') return !isDomain;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* View Switcher Tabs */}
      <div className="flex items-center space-x-2 space-x-reverse bg-black/60 p-1.5 rounded-2xl border border-white/10 max-w-md">
        <button
          onClick={() => setActiveTab('scanner')}
          className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-semibold transition flex items-center justify-center space-x-1.5 space-x-reverse ${
            activeTab === 'scanner'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
              : 'text-white/60 hover:text-white'
          }`}
        >
          <Network className="w-4 h-4" />
          <span>{isFa ? 'اسکنر و کشف آی‌پی/دامنه' : 'Live Scanner & Discover'}</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('pool');
            fetchCommunityPool();
          }}
          className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-semibold transition flex items-center justify-center space-x-1.5 space-x-reverse ${
            activeTab === 'pool'
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
              : 'text-white/60 hover:text-white'
          }`}
        >
          <Database className="w-4 h-4 text-cyan-300" />
          <span>{isFa ? '🏊‍♂️ استخر همگانی تمیز' : 'Community Pool'}</span>
          {communityPool.length > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] bg-cyan-500/20 text-cyan-300 rounded-full font-mono">
              {communityPool.length}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'scanner' ? (
        <>
          {/* Top Scanner Banner */}
          <div className="bg-[#0d0d0f] border border-white/10 rounded-3xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-light text-white flex items-center space-x-2 space-x-reverse">
                  <Network className="w-5 h-5 text-blue-400" />
                  <span>{isFa ? 'اسکنر و کشف زنده آی‌پی و دامنه‌های تمیز کلاودفلر' : 'Cloudflare Clean IP & Domain Auto-Scanner'}</span>
                </h3>
                <p className="text-xs text-white/40 mt-1">
                  {isFa
                    ? 'تست تاخیر زنده، پیدا کردن دامنه‌های تمیز (Clean SNI) و آی‌پی‌های متصل به کلاودفلر سازگار با نت شما'
                    : 'Real-time HTTP/TCP latency test targeting Clean IPs & Cloudflare-fronted Clean SNI Domains'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => handleDiscover('domain')}
                  disabled={discovering || scanning}
                  className="py-2.5 px-3.5 bg-emerald-600/20 border border-emerald-500/40 hover:bg-emerald-600/30 text-emerald-300 font-semibold text-xs rounded-xl transition flex items-center space-x-1.5 space-x-reverse disabled:opacity-50"
                  title="Discover fresh Clean Cloudflare Domains (SNI)"
                >
                  <Globe className={`w-3.5 h-3.5 text-emerald-400 ${discovering ? 'animate-spin' : ''}`} />
                  <span>{isFa ? '🌐 کشف دامنه تمیز' : 'Discover Domain'}</span>
                </button>

                <button
                  onClick={() => handleDiscover('ip')}
                  disabled={discovering || scanning}
                  className="py-2.5 px-3.5 bg-indigo-600/20 border border-indigo-500/40 hover:bg-indigo-600/30 text-indigo-300 font-semibold text-xs rounded-xl transition flex items-center space-x-1.5 space-x-reverse disabled:opacity-50"
                  title="Discover fresh Clean Cloudflare IP Subnets"
                >
                  <Sparkles className={`w-3.5 h-3.5 text-indigo-400 ${discovering ? 'animate-spin' : ''}`} />
                  <span>{isFa ? '📡 کشف آی‌پی جدید' : 'Discover Fresh IP'}</span>
                </button>

                <button
                  onClick={handleScanAll}
                  disabled={scanning}
                  className="py-2.5 px-5 border border-blue-500/50 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition flex items-center space-x-2 space-x-reverse disabled:opacity-50 shadow-lg shadow-blue-600/20"
                >
                  <RefreshCw className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} />
                  <span>{scanning ? (isFa ? 'در حال اسکن...' : 'Scanning...') : (isFa ? '🚀 شروع اسکن زنده' : 'Start Live Scan')}</span>
                </button>
              </div>
            </div>

            {/* Sync Notification Banner */}
            {poolSyncStatus && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-emerald-300 text-xs font-medium flex items-center justify-between animate-in fade-in">
                <span>{poolSyncStatus}</span>
                <button
                  onClick={() => setActiveTab('pool')}
                  className="text-[11px] underline font-mono text-emerald-400 hover:text-emerald-200"
                >
                  {isFa ? 'مشاهده استخر همگانی ←' : 'View Community Pool ←'}
                </button>
              </div>
            )}

            {/* Sub-Filters: Type Filter (IP vs Domain) & ISP Selector */}
            <div className="space-y-3 pt-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                {/* Type Filter Pill Selector */}
                <div className="flex items-center space-x-1 space-x-reverse bg-black/80 p-1 rounded-2xl border border-white/10">
                  <button
                    onClick={() => setItemTypeFilter('all')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium transition ${
                      itemTypeFilter === 'all'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-white/50 hover:text-white'
                    }`}
                  >
                    {isFa ? 'همه موارد' : 'All Items'}
                  </button>
                  <button
                    onClick={() => setItemTypeFilter('domain')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium transition flex items-center space-x-1 space-x-reverse ${
                      itemTypeFilter === 'domain'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-white/50 hover:text-white'
                    }`}
                  >
                    <Globe className="w-3.5 h-3.5" />
                    <span>{isFa ? '🌐 دامنه‌های تمیز' : 'Domains Only'}</span>
                  </button>
                  <button
                    onClick={() => setItemTypeFilter('ip')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium transition flex items-center space-x-1 space-x-reverse ${
                      itemTypeFilter === 'ip'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-white/50 hover:text-white'
                    }`}
                  >
                    <Radio className="w-3.5 h-3.5" />
                    <span>{isFa ? '📡 آی‌پی‌ها' : 'IPs Only'}</span>
                  </button>
                </div>

                {/* Custom IP/Domain Input */}
                <div className="flex items-center space-x-2 space-x-reverse bg-black p-1.5 rounded-2xl border border-white/10 flex-1 max-w-sm">
                  <input
                    type="text"
                    value={newIp}
                    onChange={(e) => setNewIp(e.target.value)}
                    placeholder={isFa ? 'آی‌پی یا دامنه (مثلاً icook.hk یا 104.16.51.111)' : 'IP or Domain (e.g. icook.hk)'}
                    className="w-full bg-transparent px-2 text-xs text-white placeholder-white/30 focus:outline-none font-mono"
                  />
                  <button
                    onClick={handleAddCustomItem}
                    className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs transition flex-shrink-0 border border-white/10"
                    title="Add Custom Clean IP/Domain"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* ISP Preset Buttons */}
              <div className="flex overflow-x-auto no-scrollbar space-x-1.5 space-x-reverse bg-black/40 p-1.5 rounded-2xl border border-white/10">
                {ISP_PRESETS.map((isp) => (
                  <button
                    key={isp.id}
                    onClick={() => setSelectedIsp(isp.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-mono whitespace-nowrap transition ${
                      selectedIsp === isp.id
                        ? 'bg-white text-black font-bold'
                        : 'text-white/50 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {isFa ? isp.nameFa : isp.nameEn}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Clean IP / Domain Data Table */}
          <div className="bg-white/[0.03] border border-white/10 rounded-3xl overflow-hidden">
            <div className="p-5 border-b border-white/10 flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-widest text-white/40">
                {isFa ? `لیست موارد آماده اسکن (${filteredList.length})` : `Discovered Clean Endpoints (${filteredList.length})`}
              </span>
              {onExportCleanIpsToNodes && (
                <button
                  onClick={() => {
                    const workingItems = filteredList
                      .filter((item) => item.status === 'ok' || item.pingMs !== null)
                      .map((item) => item.ip);
                    if (workingItems.length === 0) {
                      alert(isFa ? 'لطفاً ابتدا اسکن را انجام دهید تا آدرس‌های سالم شناسایی شوند.' : 'Please run scan first.');
                      return;
                    }
                    handleApplyPoolToNodes(workingItems);
                  }}
                  className="py-1.5 px-3 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-medium transition flex items-center space-x-1.5 space-x-reverse"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isFa ? 'اعمال آدرس‌های سالم به کانفیگ‌ها' : 'Apply Clean Endpoints to Configs'}</span>
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-black text-white/40 border-b border-white/10 text-[10px] font-mono uppercase tracking-wider">
                  <tr>
                    <th className="p-4 font-normal">نوع / آدرس (IP یا دامنه)</th>
                    <th className="p-4 font-normal">اپراتور (ISP)</th>
                    <th className="p-4 font-normal">موقعیت/مکان CDN</th>
                    <th className="p-4 font-normal">تاخیر پینگ (Ping)</th>
                    <th className="p-4 font-normal">وضعیت و اشتراک‌گذاری</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-mono">
                  {filteredList.map((item, index) => {
                    const isDomain = item.type === 'domain' || !item.ip.match(/^\d+\.\d+\.\d+\.\d+$/);

                    return (
                      <tr key={index} className="hover:bg-white/[0.02] transition">
                        <td className="p-4 text-blue-400 font-bold">
                          <div className="flex items-center space-x-2 space-x-reverse">
                            <span
                              className={`p-1 rounded-md text-[10px] ${
                                isDomain
                                  ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                                  : 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20'
                              }`}
                              title={isDomain ? 'Clean SNI Domain' : 'Clean IP'}
                            >
                              {isDomain ? <Globe className="w-3.5 h-3.5" /> : <Radio className="w-3.5 h-3.5" />}
                            </span>
                            <span>{item.ip}</span>
                            {item.discovered && (
                              <span className="px-1.5 py-0.5 bg-indigo-500/20 text-indigo-300 rounded text-[9px]">
                                {isFa ? 'جدید' : 'Fresh'}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-4 text-white/80 font-sans">{item.isp}</td>
                        <td className="p-4 text-white/40 font-sans">{item.city || 'Global Edge'}</td>
                        <td className="p-4">
                          {item.pingMs !== null && item.pingMs !== undefined ? (
                            <span
                              className={`px-2.5 py-1 rounded-full text-[10px] font-bold font-mono ${
                                item.pingMs < 180
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : item.pingMs < 300
                                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              }`}
                            >
                              {item.pingMs} ms
                            </span>
                          ) : (
                            <span className="text-white/20">---</span>
                          )}
                        </td>
                        <td className="p-4">
                          {item.status === 'testing' ? (
                            <span className="text-blue-400 flex items-center space-x-1 space-x-reverse text-[10px]">
                              <RefreshCw className="w-3 h-3 animate-spin" />
                              <span>در حال تست...</span>
                            </span>
                          ) : item.status === 'ok' ? (
                            <span className="text-emerald-400 font-sans text-[11px] flex items-center space-x-1 space-x-reverse">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>فعال و همگام با استخر</span>
                            </span>
                          ) : item.status === 'fail' ? (
                            <span className="text-rose-400 font-sans text-[11px]">تایم‌اوت / مسدود</span>
                          ) : (
                            <span className="text-white/40 font-sans text-[11px]">آماده اسکن</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        /* Community Shared IP & Domain Pool Section */
        <div className="bg-[#0d0d0f] border border-white/10 rounded-3xl p-6 space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-light text-white flex items-center space-x-2 space-x-reverse">
                <Database className="w-5 h-5 text-cyan-400" />
                <span>{isFa ? '🏊‍♂️ استخر همگانی دامنه‌ها و آی‌پی‌های طلایی کلاودفلر' : 'Community Shared Clean Domains & IPs Pool'}</span>
              </h3>
              <p className="text-xs text-white/40 mt-1">
                {isFa
                  ? 'بانک زنده و همگام دامنه‌های تمیز (Clean SNI) و آی‌پی‌های تایید شده توسط اسکن واقعی کاربران'
                  : 'Collective low-latency clean domains & IPs tested and verified across real user scans'}
              </p>
            </div>

            <div className="flex items-center space-x-2 space-x-reverse">
              <button
                onClick={fetchCommunityPool}
                disabled={poolLoading}
                className="py-2.5 px-4 bg-white/5 hover:bg-white/10 text-white text-xs font-medium rounded-xl border border-white/10 transition flex items-center space-x-1.5 space-x-reverse"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${poolLoading ? 'animate-spin' : ''}`} />
                <span>{isFa ? 'بروزرسانی استخر' : 'Refresh Pool'}</span>
              </button>

              {onExportCleanIpsToNodes && communityPool.length > 0 && (
                <button
                  onClick={() => handleApplyPoolToNodes(filteredPool.map((p) => p.ip))}
                  className="py-2.5 px-4 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-cyan-600/20 transition flex items-center space-x-1.5 space-x-reverse"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isFa ? 'اعمال تمام موارد استخر' : 'Apply Pool to Nodes'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Filter Bar inside Pool */}
          <div className="flex items-center space-x-1.5 space-x-reverse bg-black/60 p-1.5 rounded-2xl border border-white/10 max-w-sm">
            <button
              onClick={() => setPoolTypeFilter('all')}
              className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-medium transition ${
                poolTypeFilter === 'all' ? 'bg-white text-black font-bold' : 'text-white/50 hover:text-white'
              }`}
            >
              {isFa ? 'همه موارد' : 'All'}
            </button>
            <button
              onClick={() => setPoolTypeFilter('domain')}
              className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-medium transition flex items-center justify-center space-x-1 space-x-reverse ${
                poolTypeFilter === 'domain' ? 'bg-emerald-600 text-white font-bold' : 'text-white/50 hover:text-white'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{isFa ? '🌐 دامنه‌ها' : 'Domains'}</span>
            </button>
            <button
              onClick={() => setPoolTypeFilter('ip')}
              className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-medium transition flex items-center justify-center space-x-1 space-x-reverse ${
                poolTypeFilter === 'ip' ? 'bg-indigo-600 text-white font-bold' : 'text-white/50 hover:text-white'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>{isFa ? '📡 آی‌پی‌ها' : 'IPs'}</span>
            </button>
          </div>

          <div className="bg-white/[0.02] border border-white/10 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-black text-white/40 border-b border-white/10 text-[10px] font-mono uppercase tracking-wider">
                  <tr>
                    <th className="p-4 font-normal">نوع / آدرس (IP یا دامنه)</th>
                    <th className="p-4 font-normal">اپراتور سازگار</th>
                    <th className="p-4 font-normal">میانگین پینگ</th>
                    <th className="p-4 font-normal">تعداد تایید کاربران</th>
                    <th className="p-4 font-normal">وضعیت استخر</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-mono">
                  {filteredPool.map((item, idx) => {
                    const isDomain = item.type === 'domain' || !item.ip.match(/^\d+\.\d+\.\d+\.\d+$/);

                    return (
                      <tr key={idx} className="hover:bg-white/[0.02] transition">
                        <td className="p-4 text-cyan-400 font-bold">
                          <div className="flex items-center space-x-2 space-x-reverse">
                            <span
                              className={`p-1 rounded-md text-[10px] ${
                                isDomain
                                  ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                                  : 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20'
                              }`}
                            >
                              {isDomain ? <Globe className="w-3.5 h-3.5" /> : <Radio className="w-3.5 h-3.5" />}
                            </span>
                            <span>{item.ip}</span>
                          </div>
                        </td>
                        <td className="p-4 text-white/80 font-sans">{item.isp}</td>
                        <td className="p-4">
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            {item.pingMs} ms
                          </span>
                        </td>
                        <td className="p-4 text-white/70">
                          <span className="px-2 py-0.5 bg-blue-500/10 text-blue-300 rounded-md text-[10px] font-mono">
                            {item.verifiedCount} {isFa ? 'بار تایید' : 'verifications'}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className="text-emerald-400 font-sans text-[11px] flex items-center space-x-1 space-x-reverse">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>آماده استفاده</span>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

