import React, { useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { X, Copy, Download, QrCode } from 'lucide-react';

interface QrCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  content: string;
  lang: 'fa' | 'en';
}

export const QrCodeModal: React.FC<QrCodeModalProps> = ({
  isOpen,
  onClose,
  title,
  content,
  lang,
}) => {
  const isFa = lang === 'fa';
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (isOpen && canvasRef.current && content) {
      QRCode.toCanvas(canvasRef.current, content, {
        width: 250,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      }).catch((err) => console.error('QR rendering error:', err));
    }
  }, [isOpen, content]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    alert(isFa ? 'محتوا کپی شد!' : 'Content copied!');
  };

  const handleDownload = () => {
    if (canvasRef.current) {
      const url = canvasRef.current.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title.replace(/[^a-zA-Z0-9]/g, '-')}-qr.png`;
      a.click();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-[#0d0d0f] border border-white/10 rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 left-4 p-2 text-white/40 hover:text-white rounded-xl hover:bg-white/10 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center space-y-1">
          <h3 className="text-base font-light text-white flex items-center justify-center space-x-2 space-x-reverse">
            <QrCode className="w-4 h-4 text-blue-400" />
            <span>{title}</span>
          </h3>
          <p className="text-xs text-white/40">{isFa ? 'اسکن با کلاینت v2rayNG / Streisand / Shadowrocket' : 'Scan with mobile proxy app'}</p>
        </div>

        {/* QR Code Canvas Container */}
        <div className="flex justify-center bg-white p-4 rounded-2xl border border-white/10 shadow-inner">
          <canvas ref={canvasRef} />
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
          <button
            onClick={handleCopy}
            className="py-2.5 px-3 bg-white/5 hover:bg-white/10 text-white rounded-xl transition flex items-center justify-center space-x-1.5 space-x-reverse border border-white/10"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>{isFa ? 'کپی متن' : 'Copy Link'}</span>
          </button>

          <button
            onClick={handleDownload}
            className="py-2.5 px-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition flex items-center justify-center space-x-1.5 space-x-reverse font-bold"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isFa ? 'دانلود تصویر' : 'Download QR'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
