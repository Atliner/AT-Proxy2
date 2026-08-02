import React, { useState } from 'react';
import { Cpu, Copy, Download, Check, RefreshCw, FileCode, Play, Zap } from 'lucide-react';
import { Language, WorkerScriptConfig } from '../types';
import { generateWorkerScript } from '../data/workerTemplate';

interface WorkerCodeEditorProps {
  lang: Language;
}

export const WorkerCodeEditor: React.FC<WorkerCodeEditorProps> = ({ lang }) => {
  const isFa = lang === 'fa';

  const [uuid, setUuid] = useState('0a1b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d');
  const [proxyIp, setProxyIp] = useState('104.16.51.111');
  const [cleanIpText, setCleanIpText] = useState('104.16.51.111\n104.19.241.93\nicook.hk');
  const [subPath, setSubPath] = useState('/sub-secret');

  const [copied, setCopied] = useState(false);

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

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-[#0d0d0f] border border-white/10 rounded-3xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-light text-white flex items-center space-x-2 space-x-reverse">
              <Cpu className="w-5 h-5 text-blue-400" />
              <span>{isFa ? 'کد کامل سورس کلاودفلر وورکر (Cloudflare Worker Script)' : 'Worker Source Code Editor'}</span>
            </h3>
            <p className="text-xs text-white/40 mt-1">
              {isFa
                ? 'مشاهده و دانلود سورس استاندارد جاوااسکریپت VLESS 0-RTT جهت قرار دادن دستی در داشبورد Cloudflare'
                : 'View, edit & download VLESS WS 0-RTT Cloudflare Worker JavaScript code'}
            </p>
          </div>

          <div className="flex items-center space-x-2 space-x-reverse">
            <button
              onClick={handleCopy}
              className="py-2.5 px-4 bg-white/5 hover:bg-white/10 text-white font-mono text-xs uppercase tracking-wider rounded-xl transition flex items-center space-x-1.5 space-x-reverse border border-white/10"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? (isFa ? 'کپی شد!' : 'Copied!') : (isFa ? 'کپی سورس کد' : 'Copy JS Code')}</span>
            </button>

            <button
              onClick={handleDownload}
              className="py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white font-mono text-xs uppercase tracking-wider rounded-xl transition flex items-center space-x-1.5 space-x-reverse"
            >
              <Download className="w-4 h-4" />
              <span>{isFa ? 'دانلود nova-worker.js' : 'Download worker.js'}</span>
            </button>
          </div>
        </div>

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
