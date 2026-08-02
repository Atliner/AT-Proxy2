import React, { useState } from 'react';
import { Code2, ArrowDown, Copy, QrCode, Shield, Check, RefreshCw, Sparkles, Layers } from 'lucide-react';
import { Language, ProxyNode, FragmentConfig } from '../types';
import { parseProxyUri, generateNodeUri } from '../utils/configParsers';

interface ConfigDecoderProps {
  lang: Language;
  onOpenQrModal: (title: string, content: string) => void;
  onSaveToNodes: (node: ProxyNode) => void;
}

export const ConfigDecoder: React.FC<ConfigDecoderProps> = ({
  lang,
  onOpenQrModal,
  onSaveToNodes,
}) => {
  const isFa = lang === 'fa';

  const [inputLink, setInputLink] = useState('');
  const [parsedNode, setParsedNode] = useState<ProxyNode | null>(null);
  const [copied, setCopied] = useState(false);

  const handleDecode = () => {
    if (!inputLink.trim()) return;
    const node = parseProxyUri(inputLink.trim());
    if (node) {
      setParsedNode(node);
    } else {
      alert(isFa ? 'فرمت لینک نامعتبر است. لطفا یک لینک vless:// یا vmess:// معتبر وارد کنید.' : 'Invalid link format.');
    }
  };

  const handleInjectFragment = (preset: 'mci' | 'irancell' | 'mokhaberat') => {
    if (!parsedNode) return;

    let frag: FragmentConfig = {
      enabled: true,
      length: '10-20',
      interval: '10-20',
      packets: 'tlshello',
      preset,
    };

    if (preset === 'irancell') {
      frag = { enabled: true, length: '100-200', interval: '5-10', packets: '1-3', preset };
    } else if (preset === 'mokhaberat') {
      frag = { enabled: true, length: '20-50', interval: '15-30', packets: 'tlshello', preset };
    }

    setParsedNode({
      ...parsedNode,
      fragment: frag,
      name: `${parsedNode.name}-Frag-${preset.toUpperCase()}`,
    });
  };

  const updatedUri = parsedNode ? generateNodeUri(parsedNode) : '';

  const handleCopy = () => {
    navigator.clipboard.writeText(updatedUri);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-[#0d0d0f] border border-white/10 rounded-3xl p-6 space-y-4">
        <div>
          <h3 className="text-lg font-light text-white flex items-center space-x-2 space-x-reverse">
            <Code2 className="w-5 h-5 text-blue-400" />
            <span>{isFa ? 'دیکودر کانفیگ و تزریق فرگمنت هوشمند' : 'Config Decoder & Fragment Injector'}</span>
          </h3>
          <p className="text-xs text-white/40 mt-1">
            {isFa
              ? 'هر لینک VLESS یا VMESS را پیست کنید، پارامترهای آن را تحلیل کنید و تزریق پارامترهای Anti-Censorship Fragment انجام دهید'
              : 'Paste any VLESS or VMESS URI to decode parameters and inject fragment rules'}
          </p>
        </div>

        {/* Input Textarea */}
        <div className="space-y-2">
          <textarea
            value={inputLink}
            onChange={(e) => setInputLink(e.target.value)}
            placeholder="vless://xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx@104.16.51.111:443?encryption=none&security=tls&type=ws&host=myworker.dev&path=%2Fvless-ws#Nova-Node"
            rows={3}
            className="w-full bg-white/5 border border-white/15 rounded-2xl p-4 text-xs text-white placeholder-white/20 focus:outline-none focus:border-blue-500 font-mono leading-relaxed"
          />

          <button
            onClick={handleDecode}
            className="py-3 px-5 border border-blue-500/50 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 font-bold text-xs uppercase tracking-widest rounded-2xl transition flex items-center space-x-2 space-x-reverse"
          >
            <Sparkles className="w-4 h-4" />
            <span>{isFa ? 'رمزگشایی و تحلیل لینک (Decode Link)' : 'Decode URI Now'}</span>
          </button>
        </div>
      </div>

      {/* Parsed Output & Injector Controls */}
      {parsedNode && (
        <div className="bg-white/[0.03] border border-white/10 rounded-3xl p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div className="flex items-center space-x-2 space-x-reverse">
              <span className="px-2.5 py-1 text-xs font-bold rounded bg-blue-500/10 text-blue-400 uppercase font-mono border border-blue-500/20">
                {parsedNode.protocol}
              </span>
              <h4 className="text-sm font-bold text-white">{parsedNode.name}</h4>
            </div>

            <button
              onClick={() => onSaveToNodes(parsedNode)}
              className="px-4 py-2 bg-white text-black hover:bg-blue-400 font-bold text-xs uppercase tracking-wider rounded-xl transition"
            >
              {isFa ? 'ذخیره در لیست کانفیگ‌ها' : 'Save to Nodes List'}
            </button>
          </div>

          {/* Parsed Fields Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="bg-black p-3.5 rounded-2xl border border-white/10">
              <span className="text-white/40 block text-[10px] font-mono uppercase mb-1">UUID / User ID:</span>
              <input
                type="text"
                value={parsedNode.uuid}
                onChange={(e) => setParsedNode({ ...parsedNode, uuid: e.target.value })}
                className="w-full bg-transparent text-white font-mono text-xs focus:outline-none"
              />
            </div>

            <div className="bg-black p-3.5 rounded-2xl border border-white/10">
              <span className="text-white/40 block text-[10px] font-mono uppercase mb-1">Clean IP / Address:</span>
              <input
                type="text"
                value={parsedNode.address}
                onChange={(e) => setParsedNode({ ...parsedNode, address: e.target.value })}
                className="w-full bg-transparent text-white font-mono text-xs focus:outline-none"
              />
            </div>

            <div className="bg-black p-3.5 rounded-2xl border border-white/10">
              <span className="text-white/40 block text-[10px] font-mono uppercase mb-1">Host Header / SNI:</span>
              <input
                type="text"
                value={parsedNode.host}
                onChange={(e) => setParsedNode({ ...parsedNode, host: e.target.value, sni: e.target.value })}
                className="w-full bg-transparent text-white font-mono text-xs focus:outline-none"
              />
            </div>
          </div>

          {/* Quick Fragment Injection Buttons */}
          <div className="p-4 bg-black border border-white/10 rounded-2xl space-y-3">
            <span className="text-xs font-mono uppercase tracking-wider text-blue-400 flex items-center space-x-1.5 space-x-reverse">
              <Shield className="w-4 h-4" />
              <span>{isFa ? 'تزریق سریع پارامترهای فرگمنت (Fragment Injector):' : 'Inject Fragment Preset:'}</span>
            </span>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleInjectFragment('mci')}
                className="px-3.5 py-1.5 bg-white/5 hover:bg-white/10 text-amber-300 rounded-xl text-xs font-mono border border-white/10"
              >
                {isFa ? 'تزریق فرگمنت همراه اول (MCI)' : 'Inject MCI Fragment'}
              </button>

              <button
                onClick={() => handleInjectFragment('irancell')}
                className="px-3.5 py-1.5 bg-white/5 hover:bg-white/10 text-yellow-300 rounded-xl text-xs font-mono border border-white/10"
              >
                {isFa ? 'تزریق فرگمنت ایرانسل (MTN)' : 'Inject Irancell Fragment'}
              </button>

              <button
                onClick={() => handleInjectFragment('mokhaberat')}
                className="px-3.5 py-1.5 bg-white/5 hover:bg-white/10 text-cyan-300 rounded-xl text-xs font-mono border border-white/10"
              >
                {isFa ? 'تزریق فرگمنت مخابرات (TCI)' : 'Inject Mokhaberat Fragment'}
              </button>
            </div>
          </div>

          {/* Generated Updated Link Result */}
          <div className="space-y-2">
            <span className="text-xs font-mono uppercase tracking-wider text-white/40 block">{isFa ? 'لینک نهایی به‌روزرسانی شده:' : 'Updated URI Link:'}</span>
            <div className="flex items-center space-x-2 space-x-reverse bg-black p-3.5 rounded-2xl border border-white/10 font-mono text-xs text-blue-300">
              <span className="truncate flex-1">{updatedUri}</span>

              <button
                onClick={handleCopy}
                className="px-3.5 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs rounded-xl transition flex items-center space-x-1 space-x-reverse border border-white/10"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? (isFa ? 'کپی شد' : 'Copied') : (isFa ? 'کپی' : 'Copy')}</span>
              </button>

              <button
                onClick={() => onOpenQrModal(parsedNode.name, updatedUri)}
                className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs transition border border-white/10"
              >
                <QrCode className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
