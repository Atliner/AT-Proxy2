import React, { useState } from 'react';
import { Sparkles, Send, Bot, User, RefreshCw, Zap, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { Language } from '../types';

interface AiAssistantProps {
  lang: Language;
}

export const AiAssistant: React.FC<AiAssistantProps> = ({ lang }) => {
  const isFa = lang === 'fa';

  const [prompt, setPrompt] = useState('');
  const [ispName, setIspName] = useState('همراه اول (MCI)');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<
    { role: 'user' | 'assistant'; text: string; time: string }[]
  >([
    {
      role: 'assistant',
      text: isFa
        ? 'سلام! من دستیار هوشمند Nova Proxy Ultra هستم. چطور می‌تونم در بهینه‌سازی کانفیگ‌های VLESS، تنظیم پارامترهای فرگمنت یا رفع اختلالات اپراتورها کمکتون کنم؟'
        : 'Hello! I am your Nova Proxy Ultra AI Network Copilot. How can I help optimize your VLESS Worker or Fragment settings?',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const quickPrompts = [
    { labelFa: 'بهترین فرگمنت برای همراه اول', labelEn: 'Best MCI Fragment', query: 'بهترین پارامترهای فرگمنت برای اپراتور همراه اول (MCI) چیست؟' },
    { labelFa: 'رفع قطع و وصلی ایرانسل', labelEn: 'Fix Irancell Drops', query: 'کانفیگ VLESS روی ایرانسل دچار افت پینگ و قطعی می‌شود، چطور بهینه‌اش کنم؟' },
    { labelFa: 'تنظیمات اختلالات مخابرات', labelEn: 'Mokhaberat Optimization', query: 'روی ADSL مخابرات پکت لاس دارم، چه پورت و فرگمنتی پیشنهاد می‌دهید؟' },
  ];

  const handleSend = async (customText?: string) => {
    const queryText = customText || prompt;
    if (!queryText.trim()) return;

    const userMsg = {
      role: 'user' as const,
      text: queryText.trim(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!customText) setPrompt('');
    setLoading(true);

    try {
      const resp = await fetch('/api/ai/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ispName,
          prompt: queryText,
        }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        throw new Error(data.error || 'AI generation failed.');
      }

      const aiMsg = {
        role: 'assistant' as const,
        text: data.advice,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: isFa
            ? `خطا در برقراری ارتباط با هوش مصنوعی: ${err.message}`
            : `AI Error: ${err.message}`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-[#0d0d0f] border border-white/10 rounded-3xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3 space-x-reverse">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-light text-white">
                {isFa ? 'دستیار هوشمند رفع اختلال و بهینه‌سازی شبکه‌ای' : 'AI Network & Anti-Censorship Copilot'}
              </h3>
              <p className="text-xs text-white/40">
                {isFa
                  ? 'قدرتمند شده با Gemini 2.5 Flash برای تحلیل اختلالات TLS، پیشنهاد فرگمنت و کانفیگ Sing-Box'
                  : 'Powered by Gemini for network diagnostics, Fragment optimization, and routing rules'}
              </p>
            </div>
          </div>

          <select
            value={ispName}
            onChange={(e) => setIspName(e.target.value)}
            className="bg-black border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none"
          >
            <option value="همراه اول (MCI)">همراه اول (MCI)</option>
            <option value="ایرانسل (MTN)">ایرانسل (MTN)</option>
            <option value="مخابرات (TCI)">مخابرات (TCI)</option>
            <option value="شاتل (Shatel)">شاتل (Shatel)</option>
            <option value="رایتل (Rightel)">رایتل (Rightel)</option>
          </select>
        </div>

        {/* Quick Prompts */}
        <div className="flex flex-wrap gap-2 pt-1">
          {quickPrompts.map((qp, idx) => (
            <button
              key={idx}
              onClick={() => handleSend(qp.query)}
              disabled={loading}
              className="py-1.5 px-3 bg-white/5 hover:bg-white/10 text-blue-400 border border-white/10 rounded-xl text-xs transition font-mono flex items-center space-x-1 space-x-reverse"
            >
              <Zap className="w-3 h-3 text-blue-400" />
              <span>{isFa ? qp.labelFa : qp.labelEn}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Chat Messages */}
      <div className="bg-white/[0.03] border border-white/10 rounded-3xl p-6 space-y-4">
        <div className="space-y-4 max-h-[450px] overflow-y-auto p-2">
          {messages.map((msg, index) => (
            <div
              key={index}
              className={`flex items-start space-x-3 space-x-reverse ${
                msg.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''
              }`}
            >
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  msg.role === 'user'
                    ? 'bg-white text-black font-bold'
                    : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                }`}
              >
                {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>

              <div
                className={`max-w-[80%] rounded-2xl p-4 text-xs leading-relaxed space-y-1 ${
                  msg.role === 'user'
                    ? 'bg-white text-black font-medium rounded-tr-none'
                    : 'bg-black text-white/90 border border-white/10 rounded-tl-none whitespace-pre-wrap'
                }`}
              >
                <p>{msg.text}</p>
                <span className="text-[10px] text-white/40 block text-left font-mono">{msg.time}</span>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex items-center space-x-3 space-x-reverse text-xs text-blue-400 font-mono">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>{isFa ? 'هوش مصنوعی در حال تحلیل و پاسخ‌دهی...' : 'AI thinking...'}</span>
            </div>
          )}
        </div>

        {/* Input Bar */}
        <div className="flex items-center space-x-2 space-x-reverse pt-2 border-t border-white/10">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={isFa ? 'سوال خود را درباره فرگمنت، آی‌پی تمیز یا اختلال بپرسید...' : 'Ask AI about proxy settings...'}
            className="w-full bg-black border border-white/10 rounded-2xl px-4 py-3 text-xs text-white placeholder-white/20 focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={() => handleSend()}
            disabled={loading || !prompt.trim()}
            className="p-3 bg-white text-black hover:bg-blue-400 rounded-2xl transition disabled:opacity-50 flex-shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
