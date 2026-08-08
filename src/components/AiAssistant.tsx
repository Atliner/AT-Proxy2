import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Send, Bot, User, RefreshCw, Zap, CheckCircle2, Sliders, ShieldCheck, Play, Key, Trash2, ArrowLeftRight, Activity } from 'lucide-react';
import { Language, ProxyNode } from '../types';
import { generateRandomUuid } from '../utils/configParsers';
import { autoSyncWorkerToCloudflare } from '../utils/cloudflareClient';

interface AiAssistantProps {
  lang: Language;
  nodes?: ProxyNode[];
  setNodes?: React.Dispatch<React.SetStateAction<ProxyNode[]>>;
  isDeployed?: boolean;
  deployedWorkerUrl?: string;
  subUrl?: string;
  activeWorkerName?: string;
  setActiveTab?: (tab: string) => void;
}

export interface ActionProposal {
  type: 'apply_fragment' | 'add_clean_ips' | 'regen_uuid' | 'sync_cf_worker' | 'navigate_tab';
  titleFa: string;
  titleEn: string;
  data: {
    preset?: 'mci' | 'irancell' | 'mokhaberat' | 'shatel' | 'custom';
    length?: string;
    interval?: string;
    packets?: string;
    cleanIps?: string[];
    tab?: string;
  };
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  time: string;
  actionProposal?: ActionProposal;
  actionExecuted?: boolean;
}

export const AiAssistant: React.FC<AiAssistantProps> = ({
  lang,
  nodes = [],
  setNodes,
  isDeployed = false,
  deployedWorkerUrl = '',
  subUrl = '',
  activeWorkerName = '',
  setActiveTab,
}) => {
  const isFa = lang === 'fa';
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [prompt, setPrompt] = useState('');
  const [ispName, setIspName] = useState('همراه اول (MCI)');
  const [loading, setLoading] = useState(false);
  const [executingActionId, setExecutingActionId] = useState<string | null>(null);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [customApiKey, setCustomApiKey] = useState(() => localStorage.getItem('nova_custom_gemini_key') || '');

  // Initial welcome message with live status summary
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'msg-init',
      role: 'assistant',
      text: isFa
        ? `سلام! من **دستیار هوشمند شبکه و کنترل‌کننده لبه Nova Proxy** هستم.\n\nمن به پنل شما دسترسی کامل خوندن و اعمال تغییرات دارم. در حال حاضر **${nodes.length} نود فعال** روی سیستم شما بارگذاری شده است.\n\nچطور می‌تونم در بهینه‌سازی کانفیگ‌های VLESS، تنظیم فرگمنت یا آپدیت ورکر کمکتون کنم؟`
        : `Hello! I am your **Nova Proxy Ultra AI Copilot & Edge Panel Controller**.\n\nI have live read/write access to your panel. Currently **${nodes.length} nodes** are configured.\n\nHow can I help optimize your VLESS Worker, Fragment parameters, or Clean IPs today?`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const quickPrompts = [
    {
      labelFa: '⚡ بهینه‌سازی فرگمنت همراه اول',
      labelEn: '⚡ Optimize MCI Fragment',
      query: 'بهترین فرگمنت برای همراه اول چیه؟ لطفا تنظیماتش رو روی نودهای پنل اعمال کن.',
    },
    {
      labelFa: '🚀 حل قطعی و افت ایرانسل',
      labelEn: '🚀 Fix Irancell Dropping',
      query: 'کانفیگ من روی ایرانسل قطعی داره. لطفا فرگمنت و آی‌پی تمیز ایرانسل رو برام تنظیم کن.',
    },
    {
      labelFa: '🔑 تولید UUID جدید و امن',
      labelEn: '🔑 Generate New UUID',
      query: 'میخوام کلید UUID امنیتی جدید بسازی و روی نودها تنظیم کنی.',
    },
    {
      labelFa: '🌐 همگام‌سازی و آپدیت ورکر',
      labelEn: '🌐 Sync Cloudflare Worker',
      query: 'لطفا آخرین تغییرات نودها رو روی ورکر کلاودفلر انتشار بده.',
    },
  ];

  // Helper to construct current panel context for AI prompt
  const getPanelContext = () => {
    let cleanIpsList: string[] = [];
    try {
      const saved = localStorage.getItem('nova_cf_clean_ips');
      if (saved) cleanIpsList = JSON.parse(saved);
    } catch (e) {}

    return {
      nodesCount: nodes.length,
      isDeployed,
      deployedWorkerUrl,
      activeWorkerName,
      subUrl,
      hasCloudflareToken: !!localStorage.getItem('nova_cf_token'),
      cleanIpsCount: cleanIpsList.length,
      cleanIpsSample: cleanIpsList.slice(0, 5),
      currentNodesSample: nodes.slice(0, 3).map((n) => ({
        name: n.name,
        address: n.address,
        port: n.port,
        ispTag: n.ispTag,
        fragment: n.fragment,
      })),
    };
  };

  // Helper to parse ACTION_PROPOSAL from text
  const parseActionProposal = (text: string): { displayText: string; actionProposal?: ActionProposal } => {
    const proposalRegex = /ACTION_PROPOSAL:\s*({[\s\S]*})/i;
    const match = text.match(proposalRegex);

    if (match && match[1]) {
      try {
        const rawJson = match[1].trim();
        const parsed = JSON.parse(rawJson) as ActionProposal;
        const displayText = text.replace(proposalRegex, '').trim();
        return { displayText, actionProposal: parsed };
      } catch (e) {
        console.warn('Failed to parse ACTION_PROPOSAL JSON:', e);
      }
    }

    return { displayText: text };
  };

  // Call AI Service with Fallback to Public Free Keyless Endpoint
  const queryAiService = async (historyMessages: ChatMessage[], newPrompt: string): Promise<string> => {
    const panelContext = getPanelContext();

    // 1. First Attempt: Express Backend /api/ai/optimize
    try {
      const resp = await fetch('/api/ai/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ispName,
          prompt: newPrompt,
          messages: historyMessages.map((m) => ({ role: m.role, text: m.text })),
          panelContext,
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        if (data.advice) return data.advice;
      }
    } catch (err) {
      console.warn('Express backend AI unavailable, trying public keyless AI engine...');
    }

    // 2. Second Attempt: Custom Gemini Key or Public Free Keyless AI Endpoint (Pollinations AI)
    const customKey = customApiKey || localStorage.getItem('nova_custom_gemini_key');
    if (customKey) {
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${customKey}`;
        const sysPrompt = `You are Nova Proxy Ultra AI Network Engineer & Panel Controller. Respond in fluent Persian.
Context: ${JSON.stringify(panelContext)}
If user asks to change settings, append ACTION_PROPOSAL: {"type": "apply_fragment"|"add_clean_ips"|"regen_uuid"|"sync_cf_worker", "titleFa": "...", "data": {...}} at the end.`;

        const geminiResp = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: sysPrompt },
                  ...historyMessages.slice(-6).map((m) => ({ text: `${m.role}: ${m.text}` })),
                  { text: `User (${ispName}): ${newPrompt}` },
                ],
              },
            ],
          }),
        });

        const gData = await geminiResp.json();
        const text = gData?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return text;
      } catch (err) {
        console.warn('Custom Gemini API call failed:', err);
      }
    }

    // 3. Third Attempt: Public Free Keyless Endpoint (Pollinations AI)
    try {
      const pollPrompt = `System: You are Nova Proxy AI Network Engineer. Respond in Persian.
Panel Status: Nodes=${panelContext.nodesCount}, Deployed=${panelContext.isDeployed}.
If user asks to set fragment for MCI, append:
ACTION_PROPOSAL: {"type": "apply_fragment", "titleFa": "اعمال فرگمنت همراه اول", "data": {"preset": "mci", "length": "10-20", "interval": "10-20", "packets": "tlshello"}}
If user asks for Irancell, append:
ACTION_PROPOSAL: {"type": "apply_fragment", "titleFa": "اعمال فرگمنت ایرانسل", "data": {"preset": "irancell", "length": "100-200", "interval": "5-10", "packets": "1-3"}}
If user asks for UUID, append:
ACTION_PROPOSAL: {"type": "regen_uuid", "titleFa": "تولید UUID جدید", "data": {}}
If user asks for Sync/Deploy, append:
ACTION_PROPOSAL: {"type": "sync_cf_worker", "titleFa": "انتشار مجدد روی کلاودفلر", "data": {}}

User question (${ispName}): ${newPrompt}`;

      const pollResp = await fetch('https://text.pollinations.ai/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: pollPrompt }],
          model: 'openai',
          seed: Math.floor(Math.random() * 1000),
        }),
      });

      if (pollResp.ok) {
        const text = await pollResp.text();
        if (text && text.length > 10) return text;
      }
    } catch (e) {
      console.warn('Public keyless AI call failed, using client rule engine:', e);
    }

    // 4. Final Client Rule Engine Fallback
    const p = newPrompt.toLowerCase();
    if (p.includes('فرگمنت') || p.includes('همراه اول') || p.includes('mci')) {
      return `🤖 **تحلیل و راهکار پیشرفته Nova AI برای همراه اول:**

برای رفع کامل اختلالات و SNI Blocking روی همراه اول، فرگمنت با طول **۱۰ تا ۲۰** و اینتروال **۱۰ms** بالاترین پایداری را ارائه می‌دهد.

آیا مایلید این پارامترها را مستقیماً روی تمام کانفیگ‌های پنل اعمال کنم؟

ACTION_PROPOSAL: {
  "type": "apply_fragment",
  "titleFa": "اعمال پارامترهای فرگمنت همراه اول روی تمام نودها",
  "titleEn": "Apply MCI Fragment Preset to Nodes",
  "data": { "preset": "mci", "length": "10-20", "interval": "10-20", "packets": "tlshello" }
}`;
    }

    if (p.includes('ایرانسل') || p.includes('قطعی') || p.includes('افت')) {
      return `🤖 **راهکار بهینه‌سازی ایرانسل:**

روی شبکه ایرانسل ترکیب فرگمنت طولانی‌تر (100-200) به همراه دامنه‌های تمیز CDN مانند \`icook.hk\` بالاترین سرعت را ایفا می‌کند.

ACTION_PROPOSAL: {
  "type": "apply_fragment",
  "titleFa": "اعمال پارامترهای فرگمنت و آی‌پی تمیز ایرانسل",
  "titleEn": "Apply Irancell Fragment Preset",
  "data": { "preset": "irancell", "length": "100-200", "interval": "5-10", "packets": "1-3" }
}`;
    }

    if (p.includes('uuid') || p.includes('کلید') || p.includes('امنیت')) {
      return `🤖 **تولید کلید امنیتی جدید (UUID Generator):**

ساخت UUID جدید باعث غیرفعال شدن کلیدهای قدیمی و افزایش پایداری امنیت اتصال شما می‌شود.

ACTION_PROPOSAL: {
  "type": "regen_uuid",
  "titleFa": "تولید و جایگزینی UUID جدید برای تمام نودهای پنل",
  "titleEn": "Generate & Apply New UUID Security Key",
  "data": {}
}`;
    }

    if (p.includes('ورکر') || p.includes('آپدیت') || p.includes('کلاودفلر') || p.includes('sync')) {
      return `🤖 **همگام‌سازی ورکر کلاودفلر:**

کد لبه ورکر آماده به‌روزرسانی با آخرین دامنه‌ها و تنظیمات فرگمنت است.

ACTION_PROPOSAL: {
  "type": "sync_cf_worker",
  "titleFa": "ارسال و انتشار مستقیم تنظیمات روی ورکر کلاودفلر",
  "titleEn": "Deploy & Sync Worker to Cloudflare Edge",
  "data": {}
}`;
    }

    return `🤖 **دستیار شبکه‌ای Nova AI:**

در حال حاضر شما **${nodes.length} نود فعال** در پنل دارید. 
شما می‌توانید از من بخواهید:
- **فرگمنت اختصاصی** همراه اول، ایرانسل یا مخابرات را تنظیم کنم.
- **UUID جدید** برای تمام کانفیگ‌ها بسازم.
- **آی‌پی‌های تمیز جدید** را به نودها ملحق کرده و ورکر کلاودفلر را آپدیت کنم.`;
  };

  const handleSend = async (customText?: string) => {
    const queryText = customText || prompt;
    if (!queryText.trim()) return;

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      text: queryText.trim(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const updatedHistory = [...messages, userMsg];
    setMessages(updatedHistory);
    if (!customText) setPrompt('');
    setLoading(true);

    try {
      const rawAiText = await queryAiService(updatedHistory, queryText.trim());
      const { displayText, actionProposal } = parseActionProposal(rawAiText);

      const aiMsg: ChatMessage = {
        id: `msg-ai-${Date.now()}`,
        role: 'assistant',
        text: displayText,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        actionProposal,
        actionExecuted: false,
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-err-${Date.now()}`,
          role: 'assistant',
          text: isFa ? `خطا در دریافت پاسخ: ${err.message}` : `Error: ${err.message}`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // Execute Proposed Action Directly on Panel
  const handleExecuteAction = async (msgId: string, proposal: ActionProposal) => {
    setExecutingActionId(msgId);

    try {
      let resultText = '';

      if (proposal.type === 'apply_fragment' && setNodes) {
        const preset = proposal.data.preset || 'mci';
        const length = proposal.data.length || '10-20';
        const interval = proposal.data.interval || '10-20';
        const packets = proposal.data.packets || 'tlshello';

        setNodes((prev) =>
          prev.map((n) => ({
            ...n,
            fragment: {
              enabled: true,
              length,
              interval,
              packets,
              preset,
            },
          }))
        );

        resultText = isFa
          ? `✅ تنظیمات فرگمنت (${preset.toUpperCase()} - Length: ${length}, Interval: ${interval}) با موفقیت روی تمام ${nodes.length} نود پنل اعمال شد!`
          : `✅ Fragment preset (${preset.toUpperCase()}) applied to all ${nodes.length} nodes!`;

        // Try auto-syncing worker to CF if token available
        if (localStorage.getItem('nova_cf_token')) {
          await autoSyncWorkerToCloudflare();
          resultText += isFa ? ' ⚡ و کد ورکر کلاودفلر نیز آپدیت گردید!' : ' ⚡ Cloudflare worker updated!';
        }
      } else if (proposal.type === 'regen_uuid' && setNodes) {
        const newUuid = generateRandomUuid();
        setNodes((prev) => prev.map((n) => ({ ...n, uuid: newUuid })));
        localStorage.setItem('nova_cf_uuid', newUuid);

        resultText = isFa
          ? `✅ کلید امنیتی UUID جدید (\`${newUuid.substring(0, 8)}...\`) تولید و روی تمام کانفیگ‌ها جایگزین شد!`
          : `✅ New security UUID generated and applied to all nodes!`;

        if (localStorage.getItem('nova_cf_token')) {
          await autoSyncWorkerToCloudflare({ uuid: newUuid });
          resultText += isFa ? ' ⚡ ورکر کلاودفلر نیز با کلید جدید آپدیت شد.' : ' ⚡ Cloudflare worker synced!';
        }
      } else if (proposal.type === 'add_clean_ips' && setNodes) {
        const ips = proposal.data.cleanIps || ['104.16.51.111', 'icook.hk'];
        let savedIps: string[] = [];
        try {
          const s = localStorage.getItem('nova_cf_clean_ips');
          if (s) savedIps = JSON.parse(s);
        } catch (e) {}

        const merged = Array.from(new Set([...savedIps, ...ips]));
        localStorage.setItem('nova_cf_clean_ips', JSON.stringify(merged));

        resultText = isFa
          ? `✅ آی‌پی‌های تمیز (${ips.join(', ')}) به استخر آی‌پی‌های پنل اضافه و ذخیره شدند!`
          : `✅ Clean IPs added to panel!`;

        if (localStorage.getItem('nova_cf_token')) {
          await autoSyncWorkerToCloudflare({ cleanIps: merged });
          resultText += isFa ? ' ⚡ ورکر لبه همگام‌سازی شد.' : ' ⚡ Worker synced!';
        }
      } else if (proposal.type === 'sync_cf_worker') {
        const syncRes = await autoSyncWorkerToCloudflare();
        if (syncRes.success) {
          resultText = isFa
            ? `⚡ کد ورکر وورکر کلاودفلر با موفقیت کاملاً روی شبکه لبه کلاودفلر منتشر و آپدیت شد!`
            : `⚡ Cloudflare Worker updated successfully!`;
        } else {
          resultText = isFa
            ? `⚠️ خطا در همگام‌سازی با کلاودفلر: ${syncRes.error}`
            : `⚠️ Sync failed: ${syncRes.error}`;
        }
      } else if (proposal.type === 'navigate_tab' && setActiveTab) {
        if (proposal.data.tab) {
          setActiveTab(proposal.data.tab);
          resultText = isFa
            ? `🔄 انتقال به زبانه «${proposal.data.tab}» انجام شد.`
            : `Switched tab to ${proposal.data.tab}`;
        }
      }

      // Mark message action as executed
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, actionExecuted: true } : m))
      );

      // Append confirmation response from assistant
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-confirm-${Date.now()}`,
          role: 'assistant',
          text: resultText,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch (err: any) {
      alert(`خطا در اجرای تغییرات: ${err.message}`);
    } finally {
      setExecutingActionId(null);
    }
  };

  const handleSaveApiKey = () => {
    if (customApiKey.trim()) {
      localStorage.setItem('nova_custom_gemini_key', customApiKey.trim());
    } else {
      localStorage.removeItem('nova_custom_gemini_key');
    }
    setShowApiKeyModal(false);
  };

  const handleClearChat = () => {
    setMessages([
      {
        id: 'msg-init-reset',
        role: 'assistant',
        text: isFa
          ? 'چت بازنشانی شد. چطور می‌تونم در بهینه‌سازی نودها یا ورکر کمکتون کنم؟'
          : 'Chat history cleared. How can I assist you with your proxy setup?',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Control Bar */}
      <div className="bg-[#0d0d0f] border border-white/10 rounded-3xl p-6 space-y-4 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/5 blur-3xl pointer-events-none rounded-full" />

        <div className="flex flex-wrap items-center justify-between gap-4 relative z-10">
          <div className="flex items-center space-x-3 space-x-reverse">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-blue-600/20 to-cyan-500/20 border border-blue-500/30 text-blue-400 flex items-center justify-center shadow-inner">
              <Sparkles className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center space-x-2 space-x-reverse">
                <h3 className="text-lg font-medium text-white">
                  {isFa ? 'دستیار تعاملی AI و کنترل‌کننده هوشمند پنل' : 'Interactive AI & Live Panel Controller'}
                </h3>
                <span className="px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-full text-[10px] font-mono">
                  Read/Write Panel Access
                </span>
              </div>
              <p className="text-xs text-white/50 mt-0.5">
                {isFa
                  ? 'ارسال دستورات متنی، تحلیل اختلالات TLS، تنظیم هوشمند فرگمنت و آپدیت خودکار ورکر کلاودفلر'
                  : 'Interactive chat, live network diagnostics, fragment auto-tuning, and direct worker deployment'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 space-x-reverse">
            <select
              value={ispName}
              onChange={(e) => setIspName(e.target.value)}
              className="bg-black/80 border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
            >
              <option value="همراه اول (MCI)">همراه اول (MCI)</option>
              <option value="ایرانسل (MTN)">ایرانسل (MTN)</option>
              <option value="مخابرات (TCI)">مخابرات (TCI)</option>
              <option value="شاتل (Shatel)">شاتل (Shatel)</option>
              <option value="رایتل (Rightel)">رایتل (Rightel)</option>
            </select>

            <button
              onClick={() => setShowApiKeyModal(!showApiKeyModal)}
              title={isFa ? 'تنظیم کلید اختصاصی AI' : 'Set Custom AI Key'}
              className={`p-2 rounded-xl border text-xs font-mono transition flex items-center space-x-1 space-x-reverse ${
                customApiKey
                  ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
                  : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
              }`}
            >
              <Key className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{customApiKey ? 'Gemini Key (OK)' : 'API Key'}</span>
            </button>

            <button
              onClick={handleClearChat}
              title={isFa ? 'پاک‌سازی چت' : 'Clear Chat'}
              className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white/50 hover:text-white transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Custom API Key Input Drawer */}
        {showApiKeyModal && (
          <div className="bg-black/90 border border-blue-500/30 rounded-2xl p-4 space-y-3 transition animate-fadeIn">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-blue-400 flex items-center gap-1.5">
                <Key className="w-4 h-4" />
                {isFa ? 'تنظیم کلید Gemini API اختصاصی (اختیاری):' : 'Custom Gemini API Key (Optional):'}
              </span>
              <span className="text-[10px] text-white/40">
                {isFa ? 'به صورت پیش‌فرض بدون کلید کار می‌کند' : 'Works keyless by default'}
              </span>
            </div>
            <div className="flex items-center space-x-2 space-x-reverse">
              <input
                type="password"
                value={customApiKey}
                onChange={(e) => setCustomApiKey(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-xs font-mono text-white placeholder-white/20 focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={handleSaveApiKey}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-medium transition flex-shrink-0"
              >
                {isFa ? 'ذخیره' : 'Save'}
              </button>
            </div>
          </div>
        )}

        {/* Quick Prompts */}
        <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5">
          {quickPrompts.map((qp, idx) => (
            <button
              key={idx}
              onClick={() => handleSend(qp.query)}
              disabled={loading}
              className="py-1.5 px-3 bg-white/5 hover:bg-white/10 text-blue-400 border border-white/10 hover:border-blue-500/30 rounded-xl text-xs transition font-mono flex items-center space-x-1.5 space-x-reverse"
            >
              <span>{isFa ? qp.labelFa : qp.labelEn}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Conversational Chat Panel */}
      <div className="bg-[#0a0a0c] border border-white/10 rounded-3xl p-6 space-y-4 shadow-xl">
        <div className="space-y-4 max-h-[520px] min-h-[350px] overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-white/10">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex items-start space-x-3 space-x-reverse ${
                msg.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''
              }`}
            >
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md ${
                  msg.role === 'user'
                    ? 'bg-white text-black font-bold'
                    : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                }`}
              >
                {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>

              <div className="max-w-[85%] sm:max-w-[75%] space-y-2">
                <div
                  className={`rounded-2xl p-4 text-xs leading-relaxed space-y-2 ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white font-medium rounded-tr-none'
                      : 'bg-white/[0.04] text-white/90 border border-white/10 rounded-tl-none whitespace-pre-wrap'
                  }`}
                >
                  <p>{msg.text}</p>

                  {/* Interactive Action Proposal Card */}
                  {msg.actionProposal && (
                    <div className="mt-3 pt-3 border-t border-blue-500/20 bg-blue-950/20 rounded-xl p-3 space-y-2.5">
                      <div className="flex items-center space-x-2 space-x-reverse text-blue-400 font-medium text-xs">
                        <Sliders className="w-4 h-4 text-blue-400 animate-bounce" />
                        <span>
                          {isFa ? msg.actionProposal.titleFa : msg.actionProposal.titleEn}
                        </span>
                      </div>

                      <div className="text-[11px] font-mono text-white/60 bg-black/50 p-2 rounded-lg border border-white/5 space-y-1">
                        <div>دستور پیشنهادی: {msg.actionProposal.type}</div>
                        {msg.actionProposal.data.preset && (
                          <div>پریست: {msg.actionProposal.data.preset} (طول: {msg.actionProposal.data.length})</div>
                        )}
                        {msg.actionProposal.data.cleanIps && (
                          <div>آی‌پی‌ها: {msg.actionProposal.data.cleanIps.join(', ')}</div>
                        )}
                      </div>

                      {!msg.actionExecuted ? (
                        <div className="flex items-center space-x-2 space-x-reverse pt-1">
                          <button
                            onClick={() => handleExecuteAction(msg.id, msg.actionProposal!)}
                            disabled={executingActionId === msg.id}
                            className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white rounded-xl text-xs font-medium transition shadow-lg shadow-emerald-900/30 flex items-center space-x-1.5 space-x-reverse disabled:opacity-50"
                          >
                            {executingActionId === msg.id ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            )}
                            <span>
                              {isFa ? 'تایید و اعمال مستقیم روی پنل' : 'Approve & Execute Action'}
                            </span>
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-1.5 space-x-reverse text-emerald-400 text-[11px] font-medium pt-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span>{isFa ? 'تغییرات با موفقیت روی پنل اعمال شد' : 'Action Applied Successfully'}</span>
                        </div>
                      )}
                    </div>
                  )}

                  <span className="text-[10px] text-white/30 block text-left font-mono pt-1">
                    {msg.time}
                  </span>
                </div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex items-center space-x-3 space-x-reverse text-xs text-blue-400 font-mono bg-blue-500/5 border border-blue-500/10 p-3 rounded-2xl w-fit animate-pulse">
              <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
              <span>
                {isFa ? 'هوش مصنوعی در حال تحلیل وضعیت پنل و تولید پاسخ...' : 'AI analyzing panel state...'}
              </span>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Chat Input Bar */}
        <div className="flex items-center space-x-2 space-x-reverse pt-3 border-t border-white/10">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !loading && handleSend()}
            placeholder={
              isFa
                ? 'دستور خود را بنویسید (مثلاً: فرگمنت همراه اول رو تنظیم کن یا UUID جدید بساز)...'
                : 'Ask AI or type command to control panel...'
            }
            className="w-full bg-black border border-white/10 rounded-2xl px-4 py-3.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-blue-500 transition"
          />
          <button
            onClick={() => handleSend()}
            disabled={loading || !prompt.trim()}
            className="p-3.5 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl transition disabled:opacity-40 flex-shrink-0 shadow-lg shadow-blue-600/30"
          >
            <Send className="w-4.5 h-4.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

