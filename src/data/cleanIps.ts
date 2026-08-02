import { CleanIpItem } from '../types';

export const INITIAL_CLEAN_IPS: CleanIpItem[] = [
  // MCI (Hamrah Avval) Clean IPs
  { ip: '104.16.51.111', isp: 'Hamrah Avval (MCI)', city: 'Tehran', pingMs: null, status: 'idle', type: 'ip' },
  { ip: '104.17.147.22', isp: 'Hamrah Avval (MCI)', city: 'Shiraz', pingMs: null, status: 'idle', type: 'ip' },
  { ip: '162.159.137.85', isp: 'Hamrah Avval (MCI)', city: 'Isfahan', pingMs: null, status: 'idle', type: 'ip' },
  { ip: '172.67.182.201', isp: 'Hamrah Avval (MCI)', city: 'Tehran', pingMs: null, status: 'idle', type: 'ip' },
  { ip: '188.114.97.3', isp: 'Hamrah Avval (MCI)', city: 'Tabriz', pingMs: null, status: 'idle', type: 'ip' },

  // Irancell (MTN) Clean IPs
  { ip: '104.19.241.93', isp: 'Irancell (MTN)', city: 'Tehran', pingMs: null, status: 'idle', type: 'ip' },
  { ip: '104.18.23.109', isp: 'Irancell (MTN)', city: 'Mashhad', pingMs: null, status: 'idle', type: 'ip' },
  { ip: '162.159.138.12', isp: 'Irancell (MTN)', city: 'Ahvaz', pingMs: null, status: 'idle', type: 'ip' },
  { ip: '172.67.74.155', isp: 'Irancell (MTN)', city: 'Tehran', pingMs: null, status: 'idle', type: 'ip' },
  { ip: '104.21.32.180', isp: 'Irancell (MTN)', city: 'Karaj', pingMs: null, status: 'idle', type: 'ip' },

  // Mokhaberat (ADSL/FTTH) Clean IPs
  { ip: '104.16.12.56', isp: 'Mokhaberat (TCI)', city: 'Tehran', pingMs: null, status: 'idle', type: 'ip' },
  { ip: '162.159.192.1', isp: 'Mokhaberat (TCI)', city: 'Isfahan', pingMs: null, status: 'idle', type: 'ip' },
  { ip: '172.67.200.45', isp: 'Mokhaberat (TCI)', city: 'Shiraz', pingMs: null, status: 'idle', type: 'ip' },

  // Clean Cloudflare Domains (دامنه‌های تمیز کلودفلر)
  { ip: 'icook.hk', isp: 'Global Edge CDN', city: 'Hong Kong (Clean SNI)', pingMs: null, status: 'idle', type: 'domain' },
  { ip: 'zyd.fr', isp: 'Global Edge CDN', city: 'Paris (Clean SNI)', pingMs: null, status: 'idle', type: 'domain' },
  { ip: 'speed.cloudflare.com', isp: 'Cloudflare Network', city: 'Global CDN', pingMs: null, status: 'idle', type: 'domain' },
  { ip: 'dash.cloudflare.com', isp: 'Cloudflare Core', city: 'Global CDN', pingMs: null, status: 'idle', type: 'domain' },
  { ip: 'cloudflare.com', isp: 'Cloudflare Core', city: 'Global CDN', pingMs: null, status: 'idle', type: 'domain' },
  { ip: 'cf-ipfs.com', isp: 'IPFS Edge CDN', city: 'Global', pingMs: null, status: 'idle', type: 'domain' },
  { ip: 'pages.dev', isp: 'Cloudflare Pages', city: 'Global Edge', pingMs: null, status: 'idle', type: 'domain' },
  { ip: 'workers.dev', isp: 'Cloudflare Workers', city: 'Global Edge', pingMs: null, status: 'idle', type: 'domain' },
  { ip: 'trycloudflare.com', isp: 'Cloudflare Tunnel', city: 'Global Edge', pingMs: null, status: 'idle', type: 'domain' },
  { ip: 'visa.com', isp: 'Visa Edge CDN', city: 'Global CDN', pingMs: null, status: 'idle', type: 'domain' },
  { ip: 'time.is', isp: 'Time Edge CDN', city: 'Global CDN', pingMs: null, status: 'idle', type: 'domain' },
  { ip: 'udemy.com', isp: 'Udemy CDN', city: 'Global CDN', pingMs: null, status: 'idle', type: 'domain' },
  { ip: 'subscene.com', isp: 'Subscene CDN', city: 'Global CDN', pingMs: null, status: 'idle', type: 'domain' },
  { ip: 'cdn.jsdelivr.net', isp: 'JsDelivr Edge', city: 'Global CDN', pingMs: null, status: 'idle', type: 'domain' }
];

export const POPULAR_CLEAN_DOMAINS = [
  'icook.hk',
  'zyd.fr',
  'speed.cloudflare.com',
  'dash.cloudflare.com',
  'cloudflare.com',
  'cf-ipfs.com',
  'pages.dev',
  'workers.dev',
  'trycloudflare.com',
  'visa.com',
  'time.is',
  'udemy.com',
  'subscene.com',
  'cdn.jsdelivr.net',
  'medium.com',
  'zoom.us'
];

export const POPULAR_PROXY_IPS = [
  '104.16.51.111',
  '104.19.241.93',
  '162.159.137.85',
  'icook.hk',
  'zyd.fr',
  'speed.cloudflare.com',
  '104.16.12.56',
  '172.67.182.201'
];

export const CF_HTTP_PORTS = [80, 8080, 8880, 2052, 2082, 2086, 2095];
export const CF_HTTPS_PORTS = [443, 2053, 2083, 2087, 2096, 8443];

export const ISP_PRESETS = [
  { id: 'all', nameEn: 'All ISPs', nameFa: 'همه اپراتورها' },
  { id: 'mci', nameEn: 'Hamrah Avval (MCI)', nameFa: 'همراه اول' },
  { id: 'irancell', nameEn: 'Irancell (MTN)', nameFa: 'ایرانسل' },
  { id: 'mokhaberat', nameEn: 'Mokhaberat', nameFa: 'مخابرات' },
  { id: 'shatel', nameEn: 'Shatel', nameFa: 'شاتل' },
  { id: 'rightel', nameEn: 'Rightel', nameFa: 'رایتل' },
];
