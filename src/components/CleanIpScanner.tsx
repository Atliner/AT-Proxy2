import React, { useState } from 'react';
import { Network, RefreshCw, CheckCircle2, Plus, Zap, Filter, ShieldCheck, ArrowUpRight } from 'lucide-react';
import { Language, CleanIpItem, ProxyNode } from '../types';
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

  const [ipList, setIpList] = useState<CleanIpItem[]>(INITIAL_CLEAN_IPS);
  const [selectedIsp, setSelectedIsp] = useState<string>('all');
  const [scanning, setScanning] = useState(false);
  const [newIp, setNewIp] = useState('');
  const [newIsp, setNewIsp] = useState('Hamrah Avval (MCI)');

  // Run live TCP ping scan across selected clean IPs
  const handleScanAll = async () => {
    setScanning(true);

    const updated = [...ipList];

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
      } catch (err) {
        item.pingMs = 3000;
        item.status = 'fail';
      }

      setIpList([...updated]);
    }

    setScanning(false);
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
      {/* Top Scanner Banner */}
      <div className="bg-[#0d0d0f] border border-white/10 rounded-3xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-light text-white flex items-center space-x-2 space-x-reverse">
              <Network className="w-5 h-5 text-blue-400" />
              <span>{isFa ? 'اسکنر هوشمند آی‌پی تمیز کلاودفلر (IP Clean)' : 'Cloudflare Clean IP Latency Scanner'}</span>
            </h3>
            <p className="text-xs text-white/40 mt-1">
              {isFa
                ? 'تست تاخیر زنده و پیدا کردن تمیزترین آی‌پی‌ها برای اپراتورهای همراه اول، ایرانسل، مخابرات و شاتل'
                : 'Real-time HTTP/TCP ping scan targeting low-latency Cloudflare clean edge IPs'}
            </p>
          </div>

          <div className="flex items-center space-x-2 space-x-reverse">
            <button
              onClick={handleScanAll}
              disabled={scanning}
              className="py-3 px-5 border border-blue-500/50 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 font-bold text-xs uppercase tracking-widest rounded-2xl transition flex items-center space-x-2 space-x-reverse disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} />
              <span>{scanning ? (isFa ? 'در حال اسکن...' : 'Scanning IPs...') : (isFa ? '🚀 شروع اسکن زنده آی‌پی‌ها' : 'Start Live Scan')}</span>
            </button>
          </div>
        </div>

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
          <span className="text-[11px] text-white/30 font-mono">
            {isFa ? 'پینگ کمتر از ۲۰۰ میلی ثانیه عالی است' : 'Green badges indicate low latency'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-black text-white/40 border-b border-white/10 text-[10px] font-mono uppercase tracking-wider">
              <tr>
                <th className="p-4 font-normal">آدرس آی‌پی / دامنه</th>
                <th className="p-4 font-normal">اپراتور (ISP)</th>
                <th className="p-4 font-normal">موقعیت/شهر</th>
                <th className="p-4 font-normal">تاخیر پینگ (Ping)</th>
                <th className="p-4 font-normal">وضعیت</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-mono">
              {filteredList.map((item, index) => (
                <tr key={index} className="hover:bg-white/[0.02] transition">
                  <td className="p-4 text-blue-400 font-bold">{item.ip}</td>
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
                      <span className="text-emerald-400 font-sans text-[11px]">فعال و تمیز</span>
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
    </div>
  );
};
