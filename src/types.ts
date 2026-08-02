export type Language = 'fa' | 'en';

export interface CloudflareCredentials {
  apiToken: string;
  accountId: string;
  zoneId?: string;
  workerName: string;
  customDomain?: string;
  subdomain?: string;
}

export interface CloudflareAccount {
  id: string;
  name: string;
}

export interface CloudflareZone {
  id: string;
  name: string;
  status: string;
}

export interface FragmentConfig {
  enabled: boolean;
  length: string; // e.g. "10-20" or "100-200"
  interval: string; // e.g. "10-20"
  packets: string; // e.g. "tlshello" or "1-3"
  preset?: 'mci' | 'irancell' | 'mokhaberat' | 'shatel' | 'custom';
}

export interface NoiseConfig {
  enabled: boolean;
  type: 'rand' | 'str' | 'hex';
  packetSize: string; // e.g. "10-20"
  delay: string;
}

export interface ProxyNode {
  id: string;
  name: string;
  protocol: 'vless' | 'vmess' | 'trojan';
  address: string; // Clean IP or host
  port: number;
  uuid: string;
  path: string;
  host: string;
  sni: string;
  tls: boolean;
  security: 'tls' | 'none';
  transport: 'ws' | 'grpc';
  alterId?: number; // for vmess
  cipher?: string;  // for vmess
  proxyIp?: string; // Cloudflare reverse proxy outbound IP
  fragment?: FragmentConfig;
  noise?: NoiseConfig;
  ispTag?: string; // e.g. 'Hamrah Avval', 'Irancell', 'Mokhaberat', 'Shatel', 'Global'
  pingMs?: number | null;
  status?: 'ok' | 'timeout' | 'error' | 'untested';
}

export interface CleanIpItem {
  ip: string;
  isp: string;
  city?: string;
  pingMs?: number | null;
  jitter?: number;
  status?: 'ok' | 'testing' | 'fail' | 'idle';
  lastChecked?: string;
}

export interface WorkerScriptConfig {
  uuid: string;
  proxyIPs: string[];
  cleanIPs: string[];
  subPath: string;
  subTitle: string;
  enableFragment: boolean;
  fragmentLength: string;
  fragmentInterval: string;
  enableVless: boolean;
  enableVmess: boolean;
  enableTrojan: boolean;
  customSNIs: string[];
}

export interface DeployStep {
  title: string;
  titleFa: string;
  status: 'idle' | 'loading' | 'success' | 'error';
  message?: string;
}

export interface SubscriptionConfig {
  id: string;
  title: string;
  token: string;
  nodes: ProxyNode[];
  createdAt: string;
  updatedAt: string;
}
