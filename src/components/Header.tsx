import React from 'react';
import { Shield, Zap, Cloud, Cpu, Sparkles, QrCode, Code2, Network, Globe, LogOut } from 'lucide-react';
import { Language } from '../types';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  lang: Language;
  setLang: (lang: Language) => void;
  cfConnected: boolean;
  activeWorkerName?: string;
  isDeployed?: boolean;
  deployedWorkerUrl?: string;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  lang,
  setLang,
  cfConnected,
  activeWorkerName,
  isDeployed,
  deployedWorkerUrl,
  onLogout,
}) => {
  const isFa = lang === 'fa';

  const navItems = [
    { id: 'deploy', icon: Cloud, labelFa: 'تنظیمات استقرار و توکن', labelEn: 'Deploy & Token' },
    { id: 'generator', icon: Zap, labelFa: 'سازنده کانفیگ VLESS/VMESS', labelEn: 'Config Builder' },
    { id: 'sub', icon: QrCode, labelFa: 'لینک اشتراک و خروجی', labelEn: 'Subscriptions' },
    { id: 'clean-ip', icon: Network, labelFa: 'اسکنر آی‌پی تمیز', labelEn: 'Clean IP Scanner' },
    { id: 'decoder', icon: Code2, labelFa: 'دیکودر و تزریق فرگمنت', labelEn: 'Link Decoder' },
    { id: 'editor', icon: Cpu, labelFa: 'کد وورکر', labelEn: 'Worker Code' },
    { id: 'ai', icon: Sparkles, labelFa: 'دستیار هوشمند (AI)', labelEn: 'AI Copilot' },
  ];

  return (
    <header className="bg-[#050505]/90 backdrop-blur-md border-b border-white/10 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Logo & Brand */}
          <div className="flex items-center space-x-3 space-x-reverse">
            <div className="w-10 h-10 bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-cyan-500/20 font-bold border border-cyan-400/30">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2.5 space-x-reverse">
                <span className="text-lg font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-cyan-100 to-cyan-400">
                  NOVA EDGE X
                </span>
                <span className="px-2.5 py-0.5 text-[10px] font-mono font-bold uppercase tracking-widest rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 shadow-sm">
                  v4.8 MAX
                </span>
              </div>
              <p className="text-xs text-white/50 hidden sm:block">
                {isFa ? 'سامانه هوشمند استقرار پراکسی لبه، لایه فرگمنت و پنل اختصاصی Edge' : 'Next-Gen Cloudflare Edge Proxy & Fragment Management Suite'}
              </p>
            </div>
          </div>

          {/* Cloudflare Connection Status & Controls */}
          <div className="flex items-center space-x-3 space-x-reverse">
            {/* Connection Badge */}
            <div className={`flex items-center space-x-2 space-x-reverse px-3.5 py-1.5 rounded-full border text-xs font-mono tracking-wide ${
              isDeployed || cfConnected
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
            }`}>
              <span className={`w-2 h-2 rounded-full ${isDeployed || cfConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <span className="text-[11px] truncate max-w-[180px]">
                {isDeployed
                  ? (isFa ? '🟢 پنل فعال روی Cloudflare' : '🟢 Panel Active')
                  : (cfConnected
                    ? (activeWorkerName ? `${isFa ? 'وورکر:' : 'Worker:'} ${activeWorkerName}` : (isFa ? 'متصل به Cloudflare' : 'API Ready'))
                    : (isFa ? '🔑 نیازمند توکن کلاودفلر' : 'API Token Needed'))}
              </span>
            </div>

            {/* Language Switcher */}
            <button
              onClick={() => setLang(lang === 'fa' ? 'en' : 'fa')}
              className="flex items-center space-x-1.5 space-x-reverse px-3 py-1.5 rounded-xl bg-white/5 text-white/70 hover:text-white hover:bg-white/10 transition border border-white/10 text-xs font-medium"
              title={isFa ? 'تغییر زبان به انگلیسی' : 'Switch to Persian'}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{lang === 'fa' ? 'EN' : 'فا'}</span>
            </button>

            {/* Logout / Reset Session Button */}
            {(isDeployed || cfConnected) && onLogout && (
              <button
                onClick={onLogout}
                className="flex items-center space-x-1.5 space-x-reverse px-3 py-1.5 rounded-xl bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 hover:text-rose-200 transition border border-rose-500/20 text-xs font-medium"
                title={isFa ? 'خروج و پاک‌سازی توکن / نشست' : 'Logout & Reset Session'}
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{isFa ? 'خروج' : 'Logout'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Tab Navigation - Only unlocked when panel is deployed */}
        {isDeployed && (
          <div className="flex overflow-x-auto no-scrollbar border-t border-white/10 py-2 gap-1.5 animate-in fade-in duration-300">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center space-x-2 space-x-reverse px-4 py-2.5 rounded-xl font-medium text-xs sm:text-sm whitespace-nowrap transition-all border ${
                    isActive
                      ? 'bg-white/10 border-white/20 text-white shadow-sm'
                      : 'border-transparent text-white/50 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-blue-400' : 'text-white/40'}`} />
                  <span>{isFa ? item.labelFa : item.labelEn}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </header>
  );
};
