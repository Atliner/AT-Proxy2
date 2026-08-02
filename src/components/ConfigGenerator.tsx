import React, { useState } from 'react';
import { Zap, Plus, Copy, QrCode, Trash2, Check, RefreshCw, Layers, Shield, Settings2, Sparkles, Filter } from 'lucide-react';
import { Language, ProxyNode, FragmentConfig } from '../types';
import { generateVlessUri, generateVmessUri, generateTrojanUri, generateNodeUri, generateRandomUuid, generateMultiNodesBatch } from '../utils/configParsers';
import { INITIAL_CLEAN_IPS, POPULAR_PROXY_IPS, CF_HTTPS_PORTS, CF_HTTP_PORTS } from '../data/cleanIps';

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
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-[#0d0d0f] border border-white/10 p-6 rounded-3xl">
        <div>
          <h3 className="text-lg font-light text-white flex items-center space-x-2 space-x-reverse">
            <Zap className="w-5 h-5 text-blue-400" />
            <span>{isFa ? 'سازنده کانفیگ VLESS / VMESS و فرگمنت پیشرفته' : 'VLESS / VMESS Config Generator'}</span>
          </h3>
          <p className="text-xs text-white/40 mt-1">
            {isFa ? 'ایجاد کانفیگ‌های تک‌نود یا تولید دسته‌ای برای همراه اول، ایرانسل و مخابرات' : 'Create optimized single nodes or batch generate for all ISPs'}
          </p>
        </div>

        <button
          onClick={handleGenerateBatch}
          className="py-3 px-5 border border-blue-500/50 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 font-bold text-xs uppercase tracking-widest rounded-2xl transition flex items-center space-x-2 space-x-reverse whitespace-nowrap"
        >
          <Layers className="w-4 h-4" />
          <span>{isFa ? '⚡ تولید دسته‌ای ۲۰ کانفیگ برای تمام اپراتورها' : 'Batch Generate 20+ ISP Nodes'}</span>
        </button>
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
