import React, { useState, useEffect } from 'react';
import { Network, RefreshCw, CheckCircle2, Plus, Zap, Filter, ShieldCheck, ArrowUpRight, Globe, Sparkles, Database, Send } from 'lucide-react';
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
  const [scanning, setScanning] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [newIp, setNewIp] = useState('');
  const [newIsp, setNewIsp] = useState('Hamrah Avval (MCI)');
  const [poolSyncStatus, setPoolSyncStatus] = useState<string | null>(null);

  // Community IP Pool state
  const [communityPool, setCommunityPool] = useState<
    { ip: string; isp: string; city: string; pingMs: number; status: string; verifiedCount: number }[]
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

  // Discover fresh candidate Cloudflare IPs across subnets
  const handleDiscoverNewIps = async () => {
    setDiscovering(true);
    try {
      const resp = await fetch('/api/clean-ips/discover?count=10');
      const data = await resp.json();
      if (data.success && Array.isArray(data.discovered)) {
        // Avoid duplicate IPs
        const existingSet = new Set(ipList.map((item) => item.ip));
        const newItems: CleanIpItem[] = data.discovered
          .filter((item: any) => !existingSet.has(item.ip))
          .map((item: any) => ({
            ip: item.ip,
            isp: item.isp,
            city: item.city,
            pingMs: null,
            status: 'idle',
          }));

        if (newItems.length > 0) {
          setIpList((prev) => [...newItems, ...prev]);
        }
      }
    } catch (err) {
      console.error('Failed to discover fresh IPs:', err);
    } finally {
      setDiscovering(false);
    }
  };

  // Run live TCP ping scan across selected clean IPs & sync working ones to Community Pool
  const handleScanAll = async () => {
    setScanning(true);
    setPoolSyncStatus(null);

    const updated = [...ipList];
    const workingFound: CleanIpItem[] = [];

    for (let i = 0; i < updated.length; i++) {
      const item = updated[i];
      item.status = 'testing';
      setIpList([...updated]);

      try {
        const resp = await fetch('/api/ping', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetHost: item.ip, port: 443 }),
        });
        const data = await resp.json();

        item.pingMs = data.pingMs;
        item.status = data.pingMs < 3000 ? 'ok' : 'fail';
        item.lastChecked = new Date().toLocaleTimeString();

        if (item.status === 'ok' && item.pingMs < 800) {
          workingFound.push(item);
        }
      } catch (err) {
        item.pingMs = 3000;
        item.status = 'fail';
      }

      setIpList([...updated]);
    }

    setScanning(false);

    // Sync working low-latency IPs to central Community Pool
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
              ? `✅ ${workingFound.length} آی‌پی سالم برتر در استخر همگانی ذخیره شد!`
              : `✅ ${workingFound.length} best IPs saved to Community Pool!`
          );
          fetchCommunityPool();
        }
      } catch (err) {
        console.error('Error syncing to community pool:', err);
      }
    }
  };

  const handleAddCustomIp = () => {
    if (!newIp.trim()) return;
    const newItem: CleanIpItem = {
      ip: newIp.trim(),
      isp: newIsp,
      city: 'Custom',
      pingMs: null,
      status: 'idle',
    };
    setIpList((prev) => [newItem, ...prev]);
    setNewIp('');
  };

  const handleApplyPoolToNodes = (ipsToApply: string[]) => {
    if (onExportCleanIpsToNodes && ipsToApply.length > 0) {
      onExportCleanIpsToNodes(ipsToApply);
      alert(
        isFa
          ? `تعداد ${ipsToApply.length} آی‌پی تمیز برتر با موفقیت به تمام نودهای وورکر اضافه گردید!`
          : `Added ${ipsToApply.length} clean IPs to worker node configurations!`
      );
    }
  };

  const filteredList = ipList.filter((item) => {
    if (selectedIsp === 'all') return true;
    if (selectedIsp === 'mci') return item.isp.toLowerCase().includes('mci') || item.isp.toLowerCase().includes('hamrah');
    if (selectedIsp === 'irancell') return item.isp.toLowerCase().includes('irancell') || item.isp.toLowerCase().includes('mtn');
    if (selectedIsp === 'mokhaberat') return item.isp.toLowerCase().includes('tci') || item.isp.toLowerCase().includes('mokhaberat');
    if (selectedIsp === 'shatel') return item.isp.toLowerCase().includes('shatel');
    if (selectedIsp === 'rightel') return item.isp.toLowerCase().includes('rightel');
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
          <span>{isFa ? 'اسکنر و کشف زنده آی‌پی' : 'Live Scanner & Discover'}</span>
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
          <span>{isFa ? '🏊‍♂️ استخر همگانی آی‌پی‌ها' : 'Community IP Pool'}</span>
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
                  <span>{isFa ? 'اسکنر و کشف هوشمند آی‌پی تمیز کلاودفلر' : 'Cloudflare Clean IP Auto-Scanner & Discovery'}</span>
                </h3>
                <p className="text-xs text-white/40 mt-1">
                  {isFa
                    ? 'تست تاخیر زنده، کشف آی‌پی‌های جدید از ساب‌نت‌ها و ذخیره خودکار بهترین آی‌پی‌ها در استخر همگانی'
                    : 'Real-time HTTP/TCP ping scan & auto-discovery targeting low-latency Cloudflare clean edge IPs'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleDiscoverNewIps}
                  disabled={discovering || scanning}
                  className="py-2.5 px-4 bg-indigo-600/20 border border-indigo-500/40 hover:bg-indigo-600/30 text-indigo-300 font-semibold text-xs rounded-xl transition flex items-center space-x-1.5 space-x-reverse disabled:opacity-50"
                  title="Discover fresh IP candidates from Cloudflare ranges"
                >
                  <Sparkles className={`w-4 h-4 text-indigo-400 ${discovering ? 'animate-spin' : ''}`} />
                  <span>{discovering ? (isFa ? 'در حال پیدا کردن...' : 'Discovering...') : (isFa ? '🔍 پیدا کردن آی‌پی جدید' : 'Discover Fresh IPs')}</span>
                </button>

                <button
                  onClick={handleScanAll}
                  disabled={scanning}
                  className="py-2.5 px-5 border border-blue-500/50 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition flex items-center space-x-2 space-x-reverse disabled:opacity-50 shadow-lg shadow-blue-600/20"
                >
                  <RefreshCw className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} />
                  <span>{scanning ? (isFa ? 'در حال اسکن...' : 'Scanning IPs...') : (isFa ? '🚀 شروع اسکن زنده' : 'Start Live Scan')}</span>
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
                  {isFa ? 'مشاهده استخر همگانی ←' : 'View IP Pool ←'}
                </button>
              </div>
            )}

            {/* Filters & Add Custom IP */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
              {/* ISP Tabs */}
              <div className="md:col-span-2 flex overflow-x-auto no-scrollbar space-x-1.5 space-x-reverse bg-black p-1.5 rounded-2xl border border-white/10">
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

              {/* Custom IP Input */}
              <div className="flex items-center space-x-2 space-x-reverse bg-black p-1.5 rounded-2xl border border-white/10">
                <input
                  type="text"
                  value={newIp}
                  onChange={(e) => setNewIp(e.target.value)}
                  placeholder="e.g. 104.16.51.111"
                  className="w-full bg-transparent px-2 text-xs text-white placeholder-white/20 focus:outline-none font-mono"
                />
                <button
                  onClick={handleAddCustomIp}
                  className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs transition flex-shrink-0 border border-white/10"
                  title="Add Custom Clean IP"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Clean IP Data Table */}
          <div className="bg-white/[0.03] border border-white/10 rounded-3xl overflow-hidden">
            <div className="p-5 border-b border-white/10 flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-widest text-white/40">
                {isFa ? `لیست آی‌پی‌های شناسایی شده (${filteredList.length})` : `Discovered Edge Clean IPs (${filteredList.length})`}
              </span>
              {onExportCleanIpsToNodes && (
                <button
                  onClick={() => {
                    const workingIps = filteredList
                      .filter((item) => item.status === 'ok' || item.pingMs !== null)
                      .map((item) => item.ip);
                    if (workingIps.length === 0) {
                      alert(isFa ? 'لطفاً ابتدا اسکن را انجام دهید تا آی‌پی‌های سالم شناسایی شوند.' : 'Please run scan first.');
                      return;
                    }
                    handleApplyPoolToNodes(workingIps);
                  }}
                  className="py-1.5 px-3 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-medium transition flex items-center space-x-1.5 space-x-reverse"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isFa ? 'اعمال آی‌پی‌های سالم به کانفیگ‌ها' : 'Apply Clean IPs to Configs'}</span>
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-black text-white/40 border-b border-white/10 text-[10px] font-mono uppercase tracking-wider">
                  <tr>
                    <th className="p-4 font-normal">آدرس آی‌پی / دامنه</th>
                    <th className="p-4 font-normal">اپراتور (ISP)</th>
                    <th className="p-4 font-normal">موقعیت/شهر</th>
                    <th className="p-4 font-normal">تاخیر پینگ (Ping)</th>
                    <th className="p-4 font-normal">وضعیت و اشتراک‌گذاری</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-mono">
                  {filteredList.map((item, index) => (
                    <tr key={index} className="hover:bg-white/[0.02] transition">
                      <td className="p-4 text-blue-400 font-bold">
                        <div className="flex items-center space-x-2 space-x-reverse">
                          <span>{item.ip}</span>
                          {item.discovered && (
                            <span className="px-1.5 py-0.5 bg-indigo-500/20 text-indigo-300 rounded text-[9px]">
                              {isFa ? 'جدید' : 'Fresh'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-white/80 font-sans">{item.isp}</td>
                      <td className="p-4 text-white/40 font-sans">{item.city || 'Global'}</td>
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
                            <span>فعال و ذخیره در استخر</span>
                          </span>
                        ) : item.status === 'fail' ? (
                          <span className="text-rose-400 font-sans text-[11px]">تایم‌اوت / مسدود</span>
                        ) : (
                          <span className="text-white/40 font-sans text-[11px]">آماده اسکن</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        /* Community Shared IP Pool Section */
        <div className="bg-[#0d0d0f] border border-white/10 rounded-3xl p-6 space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-light text-white flex items-center space-x-2 space-x-reverse">
                <Database className="w-5 h-5 text-cyan-400" />
                <span>{isFa ? '🏊‍♂️ استخر همگانی آی‌پی‌های طلایی کلاودفلر' : 'Community Shared Clean IP Pool'}</span>
              </h3>
              <p className="text-xs text-white/40 mt-1">
                {isFa
                  ? 'این آی‌پی‌ها حاصل اسکن و تایید گروهی کاربران تمام اپراتورها در همین لحظه هستند.'
                  : 'Collective low-latency clean IPs tested and verified across all user scans in real-time.'}
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
                  onClick={() => handleApplyPoolToNodes(communityPool.map((p) => p.ip))}
                  className="py-2.5 px-4 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-cyan-600/20 transition flex items-center space-x-1.5 space-x-reverse"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isFa ? 'اعمال تمام آی‌پی‌های استخر' : 'Apply Pool IPs to Nodes'}</span>
                </button>
              )}
            </div>
          </div>

          <div className="bg-white/[0.02] border border-white/10 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-black text-white/40 border-b border-white/10 text-[10px] font-mono uppercase tracking-wider">
                  <tr>
                    <th className="p-4 font-normal">آدرس آی‌پی / دامنه</th>
                    <th className="p-4 font-normal">اپراتور سازگار</th>
                    <th className="p-4 font-normal">میانگین پینگ</th>
                    <th className="p-4 font-normal">تعداد تایید کاربران</th>
                    <th className="p-4 font-normal">وضعیت استخر</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-mono">
                  {communityPool.map((item, idx) => (
                    <tr key={idx} className="hover:bg-white/[0.02] transition">
                      <td className="p-4 text-cyan-400 font-bold">{item.ip}</td>
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
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
