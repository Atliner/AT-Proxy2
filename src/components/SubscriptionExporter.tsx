import React, { useState } from 'react';
import { QrCode, Copy, Download, Check, Share2, Layers, FileCode2, Globe, Sparkles } from 'lucide-react';
import { Language, ProxyNode } from '../types';
import { generateClashYaml, generateSingboxJson, generateBase64Sub, generateNodeUri } from '../utils/configParsers';

interface SubscriptionExporterProps {
  lang: Language;
  nodes: ProxyNode[];
  subUrl?: string;
  onOpenQrModal: (title: string, content: string) => void;
}

export const SubscriptionExporter: React.FC<SubscriptionExporterProps> = ({
  lang,
  nodes,
  subUrl,
  onOpenQrModal,
}) => {
  const isFa = lang === 'fa';

  const [activeTab, setActiveTab] = useState<'b64' | 'clash' | 'singbox' | 'raw'>('b64');
  const [copied, setCopied] = useState(false);

  const currentSubUrl = subUrl || `${window.location.origin}/api/sub/demo`;
  const base64Sub = generateBase64Sub(nodes);
  const clashYaml = generateClashYaml(nodes);
  const singboxJson = generateSingboxJson(nodes);
  const rawUris = nodes.map((n) => generateNodeUri(n)).join('\n');

  const getActiveContent = () => {
    if (activeTab === 'clash') return clashYaml;
    if (activeTab === 'singbox') return singboxJson;
    if (activeTab === 'raw') return rawUris;
    return base64Sub;
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(getActiveContent());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const content = getActiveContent();
    let filename = 'nova-sub.txt';
    let type = 'text/plain';

    if (activeTab === 'clash') {
      filename = 'nova-clash.yaml';
      type = 'text/yaml';
    } else if (activeTab === 'singbox') {
      filename = 'nova-singbox.json';
      type = 'application/json';
    }

    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Top Subscription Banner */}
      <div className="bg-[#0d0d0f] border border-white/10 rounded-3xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-light text-white flex items-center space-x-2 space-x-reverse">
              <Share2 className="w-5 h-5 text-emerald-400" />
              <span>{isFa ? 'مرکز مدیریت لینک‌های اشتراک و خروجی کلاینت‌ها' : 'Subscription & Client Config Center'}</span>
            </h3>
            <p className="text-xs text-white/40 mt-1">
              {isFa
                ? 'لینک‌های اشتراک هوشمند برای v2rayNG، Hiddify، Clash Meta، و Sing-Box'
                : 'Auto-formatted subscription endpoint for v2rayNG, Hiddify, Clash & Sing-Box'}
            </p>
          </div>

          <button
            onClick={() => onOpenQrModal(isFa ? 'QR کد لینک اشتراک' : 'Subscription QR Code', currentSubUrl)}
            className="py-2.5 px-4 bg-white/5 text-white/80 border border-white/10 hover:bg-white/10 font-mono text-xs uppercase tracking-wider rounded-xl transition flex items-center space-x-2 space-x-reverse"
          >
            <QrCode className="w-4 h-4 text-emerald-400" />
            <span>{isFa ? 'نمایش QR کد اشتراک' : 'Show Subscription QR'}</span>
          </button>
        </div>

        {/* Live Subscription URL Box */}
        <div className="space-y-1.5">
          <label className="block text-[10px] uppercase tracking-widest text-white/40 font-mono">
            {isFa ? 'آدرس ثابت لینک اشتراک (Subscription URL):' : 'Live Subscription URL:'}
          </label>
          <div className="flex items-center space-x-2 space-x-reverse bg-black border border-white/10 p-3 rounded-2xl">
            <Globe className="w-4 h-4 text-blue-400 flex-shrink-0" />
            <input
              type="text"
              readOnly
              value={currentSubUrl}
              className="w-full bg-transparent text-xs text-emerald-400 font-mono focus:outline-none"
            />
            <button
              onClick={() => {
                navigator.clipboard.writeText(currentSubUrl);
                alert(isFa ? 'لینک اشتراک کپی شد!' : 'Subscription link copied!');
              }}
              className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-mono rounded-lg transition flex items-center space-x-1 space-x-reverse border border-white/10"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{isFa ? 'کپی' : 'Copy'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tabs for Formatted Exports */}
      <div className="bg-white/[0.03] border border-white/10 rounded-3xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between border-b border-white/10 pb-3 gap-3">
          <div className="flex space-x-2 space-x-reverse">
            {[
              { id: 'b64', label: 'V2Ray / Base64' },
              { id: 'clash', label: 'Clash Meta (YAML)' },
              { id: 'singbox', label: 'Sing-Box (JSON)' },
              { id: 'raw', label: 'Raw URIs' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3.5 py-1.5 text-xs font-mono rounded-xl transition border ${
                  activeTab === tab.id
                    ? 'bg-white text-black font-bold border-white'
                    : 'bg-white/5 text-white/50 border-white/10 hover:text-white hover:bg-white/10'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center space-x-2 space-x-reverse">
            <button
              onClick={handleCopy}
              className="py-1.5 px-3.5 bg-white/5 hover:bg-white/10 text-white font-mono text-xs rounded-xl transition flex items-center space-x-1.5 space-x-reverse border border-white/10"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? (isFa ? 'کپی شد!' : 'Copied!') : (isFa ? 'کپی محتوا' : 'Copy Content')}</span>
            </button>

            <button
              onClick={handleDownload}
              className="py-1.5 px-3.5 bg-blue-600 hover:bg-blue-500 text-white font-mono text-xs rounded-xl transition flex items-center space-x-1.5 space-x-reverse"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isFa ? 'دانلود فایل' : 'Download File'}</span>
            </button>
          </div>
        </div>

        {/* Code Content View */}
        <div className="bg-black p-4 rounded-2xl border border-white/10 max-h-96 overflow-y-auto font-mono text-xs text-blue-300 leading-relaxed whitespace-pre-wrap select-all">
          {getActiveContent()}
        </div>
      </div>
    </div>
  );
};
