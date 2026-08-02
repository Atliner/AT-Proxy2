import { CleanIpItem } from '../types';

export const INITIAL_CLEAN_IPS: CleanIpItem[] = [
  // MCI (Hamrah Avval)
  { ip: '104.16.51.111', isp: 'Hamrah Avval (MCI)', city: 'Tehran', pingMs: null, status: 'idle' },
  { ip: '104.17.147.22', isp: 'Hamrah Avval (MCI)', city: 'Shiraz', pingMs: null, status: 'idle' },
  { ip: '162.159.137.85', isp: 'Hamrah Avval (MCI)', city: 'Isfahan', pingMs: null, status: 'idle' },
  { ip: '172.67.182.201', isp: 'Hamrah Avval (MCI)', city: 'Tehran', pingMs: null, status: 'idle' },
  { ip: '188.114.97.3', isp: 'Hamrah Avval (MCI)', city: 'Tabriz', pingMs: null, status: 'idle' },

  // Irancell (MTN)
  { ip: '104.19.241.93', isp: 'Irancell (MTN)', city: 'Tehran', pingMs: null, status: 'idle' },
  { ip: '104.18.23.109', isp: 'Irancell (MTN)', city: 'Mashhad', pingMs: null, status: 'idle' },
  { ip: '162.159.138.12', isp: 'Irancell (MTN)', city: 'Ahvaz', pingMs: null, status: 'idle' },
  { ip: '172.67.74.155', isp: 'Irancell (MTN)', city: 'Tehran', pingMs: null, status: 'idle' },
  { ip: '104.21.32.180', isp: 'Irancell (MTN)', city: 'Karaj', pingMs: null, status: 'idle' },

  // Mokhaberat (ADSL/FTTH)
  { ip: '104.16.12.56', isp: 'Mokhaberat (TCI)', city: 'Tehran', pingMs: null, status: 'idle' },
  { ip: '162.159.192.1', isp: 'Mokhaberat (TCI)', city: 'Isfahan', pingMs: null, status: 'idle' },
  { ip: '172.67.200.45', isp: 'Mokhaberat (TCI)', city: 'Shiraz', pingMs: null, status: 'idle' },
  { ip: '188.114.96.7', isp: 'Mokhaberat (TCI)', city: 'Mashhad', pingMs: null, status: 'idle' },

  // Shatel
  { ip: '104.16.20.10', isp: 'Shatel', city: 'Tehran', pingMs: null, status: 'idle' },
  { ip: '104.18.33.210', isp: 'Shatel', city: 'Qom', pingMs: null, status: 'idle' },
  { ip: '162.159.135.90', isp: 'Shatel', city: 'Tehran', pingMs: null, status: 'idle' },

  // Rightel
  { ip: '104.16.88.99', isp: 'Rightel', city: 'Tehran', pingMs: null, status: 'idle' },
  { ip: '172.67.140.80', isp: 'Rightel', city: 'Tehran', pingMs: null, status: 'idle' },

  // Global / Domain clean endpoints
  { ip: 'icook.hk', isp: 'Global Edge CDN', city: 'Hong Kong', pingMs: null, status: 'idle' },
  { ip: 'zyd.fr', isp: 'Global Edge CDN', city: 'Paris', pingMs: null, status: 'idle' },
  { ip: 'workers.dev', isp: 'Global Cloudflare', city: 'Global', pingMs: null, status: 'idle' },
  { ip: 'cloudflare.com', isp: 'Global Cloudflare', city: 'Global', pingMs: null, status: 'idle' },
  { ip: '104.16.0.0', isp: 'CF Subnet 104.16.x', city: 'Global', pingMs: null, status: 'idle' },
  { ip: '162.159.0.0', isp: 'CF Subnet 162.159.x', city: 'Global', pingMs: null, status: 'idle' }
];

export const POPULAR_PROXY_IPS = [
  '104.16.51.111',
  '104.19.241.93',
  '162.159.137.85',
  'icook.hk',
  'zyd.fr',
  'cloudflare.com',
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
