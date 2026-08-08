import React, { useState } from 'react';
import { Cpu, Copy, Download, Check, RefreshCw, FileCode, Play, Zap, Cloud, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Language, WorkerScriptConfig } from '../types';
import { generateWorkerScript } from '../data/workerTemplate';
import { autoSyncWorkerToCloudflare } from '../utils/cloudflareClient';

interface WorkerCodeEditorProps {
  lang: Language;
}

export const WorkerCodeEditor: React.FC<WorkerCodeEditorProps> = ({ lang }) => {
  const isFa = lang === 'fa';

  const [uuid, setUuid] = useState(() => localStorage.getItem('nova_cf_uuid') || '0a1b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d');
  const [proxyIp, setProxyIp] = useState(() => localStorage.getItem('nova_cf_proxy_ip') || '104.16.51.111');
  const [cleanIpText, setCleanIpText] = useState(() => {
    try {
      const saved = localStorage.getItem('nova_cf_clean_ips');
      if (saved) {
        const arr = JSON.parse(saved);
        if (Array.isArray(arr) && arr.length > 0) return arr.join('\n');
      }
    } catch (e) {}
    return '104.16.51.111\n104.19.241.93\nicook.hk';
  });
  const [subPath, setSubPath] = useState('/sub-secret');

  const [copied, setCopied] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const scriptConfig: WorkerScriptConfig = {
    uuid,
    proxyIPs: [proxyIp],
    cleanIPs: cleanIpText.split('\n').map((s) => s.trim()).filter(Boolean),
    subPath,
    subTitle: 'Nova Proxy Ultra Edge Node',
    enableFragment: true,
    fragmentLength: '10-20',
    fragmentInterval: '10-20',
    enableVless: true,
    enableVmess: true,
    enableTrojan: false,
    customSNIs: [],
  };

  const code = generateWorkerScript(scriptConfig);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([code], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nova-worker.js';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleAutoDeployToCloudflare = async () => {
    setSyncing(true);
    setSyncMessage(null);

    const cleanIpsArr = cleanIpText.split('\n').map((s) => s.trim()).filter(Boolean);

    try {
      const res = await autoSyncWorkerToCloudflare({
        uuid,
        proxyIp,
        cleanIps: cleanIpsArr,
      });

      if (res.success) {
        setSyncMessage({
          type: 'success',
          text: isFa
            ? '🚀 کد ورکر با موفقیت مستقیماً روی حساب کلاودفلر شما آپدیت شد! تغییرات در کل لبه به صورت آنی اعمال گردید.'
            : '🚀 Worker code successfully deployed and updated directly on Cloudflare Edge!',
        });
      } else {
        setSyncMessage({
          type: 'error',
          text: res.error || (isFa ? 'خطا در بروزرسانی ورکر' : 'Failed to update worker'),
        });
      }
    } catch (err: any) {
      setSyncMessage({
        type: 'error',
        text: err.message || (isFa ? 'خطای ناشناخته در ارتباط با کلاودفلر' : 'Cloudflare API sync error'),
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-[#0d0d0f] border border-white/10 rounded-3xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-light text-white flex items-center space-x-2 space-x-reverse">
              <Cpu className="w-5 h-5 text-blue-400" />
              <span>{isFa ? 'کد سورس ورکر کلاودفلر و همگام‌سازی اتوماتیک API' : 'Worker Source Code & Auto API Deploy'}</span>
            </h3>
            <p className="text-xs text-white/40 mt-1">
              {isFa
                ? 'با استفاده از توکن API کلاودفلر، کد زیر بدون نیاز به کپی و پیست دستی، به صورت خودکار روی ورکر شما ارسال و آپدیت می‌شود.'
                : 'Automatically publish & update your Cloudflare Worker script via API Token without manual copy-pasting.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleAutoDeployToCloudflare}
              disabled={syncing}
              className="py-2.5 px-4 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-cyan-600/20 transition flex items-center space-x-2 space-x-reverse disabled:opacity-50"
            >
              <Zap className={`w-4 h-4 text-cyan-300 ${syncing ? 'animate-spin' : ''}`} />
              <span>{syncing ? (isFa ? 'در حال ارسال و آپدیت...' : 'Deploying to Cloudflare...') : (isFa ? '⚡ آپدیت مستقیم کد روی ورکر کلاودفلر' : '⚡ Auto-Deploy Code to Cloudflare')}</span>
            </button>

            <button
              onClick={handleCopy}
              className="py-2.5 px-3.5 bg-white/5 hover:bg-white/10 text-white font-mono text-xs rounded-xl transition flex items-center space-x-1.5 space-x-reverse border border-white/10"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? (isFa ? 'کپی شد!' : 'Copied!') : (isFa ? 'کپی کد' : 'Copy')}</span>
            </button>

            <button
              onClick={handleDownload}
              className="py-2.5 px-3.5 bg-white/5 hover:bg-white/10 text-white font-mono text-xs rounded-xl transition flex items-center space-x-1.5 space-x-reverse border border-white/10"
            >
              <Download className="w-4 h-4" />
              <span>{isFa ? 'دانلود' : 'Download'}</span>
            </button>
          </div>
        </div>

        {syncMessage && (
          <div
            className={`p-4 rounded-2xl text-xs font-medium flex items-center space-x-2 space-x-reverse ${
              syncMessage.type === 'success'
                ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
            }`}
          >
            {syncMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
            <span>{syncMessage.text}</span>
          </div>
        )}

        {/* Quick parameters editor */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 text-xs">
          <div>
            <label className="block text-white/40 font-mono text-[10px] uppercase mb-1">UUID:</label>
            <input
              type="text"
              value={uuid}
              onChange={(e) => setUuid(e.target.value)}
              className="w-full bg-black border border-white/10 rounded-xl p-2.5 text-white font-mono"
            />
          </div>
          <div>
            <label className="block text-white/40 font-mono text-[10px] uppercase mb-1">Proxy IP:</label>
            <input
              type="text"
              value={proxyIp}
              onChange={(e) => setProxyIp(e.target.value)}
              className="w-full bg-black border border-white/10 rounded-xl p-2.5 text-white font-mono"
            />
          </div>
          <div>
            <label className="block text-white/40 font-mono text-[10px] uppercase mb-1">Sub Path:</label>
            <input
              type="text"
              value={subPath}
              onChange={(e) => setSubPath(e.target.value)}
              className="w-full bg-black border border-white/10 rounded-xl p-2.5 text-white font-mono"
            />
          </div>
        </div>
      </div>

      {/* Code Viewer Container */}
      <div className="bg-black border border-white/10 rounded-3xl p-5 overflow-hidden">
        <div className="flex items-center justify-between pb-3 border-b border-white/10 text-xs text-white/40 font-mono">
          <span>nova-worker.js (ES Module format)</span>
          <span>Size: {(code.length / 1024).toFixed(1)} KB</span>
        </div>
        <pre className="p-4 max-h-[500px] overflow-y-auto text-xs font-mono text-blue-300 leading-relaxed select-all">
          {code}
        </pre>
      </div>
    </div>
  );
};

