import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { CloudflareDeployer } from './components/CloudflareDeployer';
import { ConfigGenerator } from './components/ConfigGenerator';
import { SubscriptionExporter } from './components/SubscriptionExporter';
import { CleanIpScanner } from './components/CleanIpScanner';
import { ConfigDecoder } from './components/ConfigDecoder';
import { WorkerCodeEditor } from './components/WorkerCodeEditor';
import { AiAssistant } from './components/AiAssistant';
import { QrCodeModal } from './components/QrCodeModal';
import { Language, ProxyNode } from './types';
import { generateRandomUuid, generateMultiNodesBatch } from './utils/configParsers';
import { INITIAL_CLEAN_IPS } from './data/cleanIps';

export default function App() {
  const [lang, setLang] = useState<Language>('fa');
  const [activeTab, setActiveTab] = useState<string>('deploy');
  const [cfConnected, setCfConnected] = useState<boolean>(false);
  const [activeWorkerName, setActiveWorkerName] = useState<string>('');
  const [subUrl, setSubUrl] = useState<string>('');
  const [isDeployed, setIsDeployed] = useState<boolean>(false);
  const [deployedWorkerUrl, setDeployedWorkerUrl] = useState<string>('');

  // Initial nodes preset
  const defaultUuid = generateRandomUuid();
  const [nodes, setNodes] = useState<ProxyNode[]>([
    {
      id: 'default-1',
      name: 'Nova-MCI-HamrahAvval-P443',
      protocol: 'vless',
      address: '104.16.51.111',
      port: 443,
      uuid: defaultUuid,
      path: '/vless-ws?ed=2048',
      host: 'edge-nova.workers.dev',
      sni: 'edge-nova.workers.dev',
      tls: true,
      security: 'tls',
      transport: 'ws',
      ispTag: 'Hamrah Avval (MCI)',
      fragment: {
        enabled: true,
        length: '10-20',
        interval: '10-20',
        packets: 'tlshello',
        preset: 'mci',
      },
    },
    {
      id: 'default-2',
      name: 'Nova-Irancell-MTN-P2053',
      protocol: 'vless',
      address: '104.19.241.93',
      port: 2053,
      uuid: defaultUuid,
      path: '/vless-ws?ed=2048',
      host: 'edge-nova.workers.dev',
      sni: 'edge-nova.workers.dev',
      tls: true,
      security: 'tls',
      transport: 'ws',
      ispTag: 'Irancell (MTN)',
      fragment: {
        enabled: true,
        length: '100-200',
        interval: '5-10',
        packets: '1-3',
        preset: 'irancell',
      },
    },
    {
      id: 'default-3',
      name: 'Nova-Mokhaberat-TCI-P2087',
      protocol: 'vless',
      address: '104.16.12.56',
      port: 2087,
      uuid: defaultUuid,
      path: '/vless-ws?ed=2048',
      host: 'edge-nova.workers.dev',
      sni: 'edge-nova.workers.dev',
      tls: true,
      security: 'tls',
      transport: 'ws',
      ispTag: 'Mokhaberat (TCI)',
      fragment: {
        enabled: true,
        length: '20-50',
        interval: '15-30',
        packets: 'tlshello',
        preset: 'mokhaberat',
      },
    },
  ]);

  // Restore session state on initial load
  useEffect(() => {
    try {
      const savedToken = localStorage.getItem('nova_cf_token');
      const savedIsDeployed = localStorage.getItem('nova_cf_is_deployed') === 'true';
      const savedWorkerUrl = localStorage.getItem('nova_cf_worker_url');
      const savedSubUrl = localStorage.getItem('nova_cf_sub_url');
      const savedWorkerName = localStorage.getItem('nova_cf_worker_name');
      const savedNodes = localStorage.getItem('nova_cf_nodes');

      if (savedToken) {
        setCfConnected(true);
      }

      if (savedIsDeployed && savedWorkerUrl) {
        setIsDeployed(true);
        setCfConnected(true);
        setDeployedWorkerUrl(savedWorkerUrl);
        if (savedSubUrl) setSubUrl(savedSubUrl);
        if (savedWorkerName) setActiveWorkerName(savedWorkerName);
        if (savedNodes) {
          try {
            const parsed = JSON.parse(savedNodes);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setNodes(parsed);
            }
          } catch (e) {
            console.error('Failed to parse stored nodes:', e);
          }
        }
        setActiveTab('sub');
      }
    } catch (e) {
      console.error('Error restoring session in App.tsx:', e);
    }
  }, []);

  // Update stored nodes whenever nodes change
  useEffect(() => {
    if (isDeployed && nodes.length > 0) {
      try {
        localStorage.setItem('nova_cf_nodes', JSON.stringify(nodes));
      } catch (e) {
        console.error('Failed to save nodes update', e);
      }
    }
  }, [nodes, isDeployed]);

  const handleLogout = () => {
    try {
      localStorage.removeItem('nova_cf_token');
      localStorage.removeItem('nova_cf_is_deployed');
      localStorage.removeItem('nova_cf_worker_url');
      localStorage.removeItem('nova_cf_sub_url');
      localStorage.removeItem('nova_cf_worker_name');
      localStorage.removeItem('nova_cf_nodes');
    } catch (e) {
      console.error('Logout error:', e);
    }
    setIsDeployed(false);
    setCfConnected(false);
    setDeployedWorkerUrl('');
    setSubUrl('');
    setActiveWorkerName('');
    setActiveTab('deploy');
  };

  // QR Modal State
  const [qrModal, setQrModal] = useState<{
    isOpen: boolean;
    title: string;
    content: string;
  }>({
    isOpen: false,
    title: '',
    content: '',
  });

  const handleOpenQrModal = (title: string, content: string) => {
    setQrModal({ isOpen: true, title, content });
  };

  const handleDeploySuccess = (workerUrl: string, subscriptionUrl: string, newNodes: ProxyNode[]) => {
    setDeployedWorkerUrl(workerUrl);
    setSubUrl(subscriptionUrl);
    setNodes(newNodes);
    setIsDeployed(true);
    setActiveTab('sub');
  };

  return (
    <div
      dir={lang === 'fa' ? 'rtl' : 'ltr'}
      className="min-h-screen bg-[#050505] text-[#e0e0e0] font-sans selection:bg-blue-600 selection:text-white pb-12"
    >
      {/* Header Bar */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        lang={lang}
        setLang={setLang}
        cfConnected={cfConnected}
        activeWorkerName={activeWorkerName}
        isDeployed={isDeployed}
        deployedWorkerUrl={deployedWorkerUrl}
        onLogout={handleLogout}
      />

      {/* Main Content Body */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {!isDeployed ? (
          <CloudflareDeployer
            lang={lang}
            onDeploySuccess={handleDeploySuccess}
            setCfConnected={setCfConnected}
            setActiveWorkerName={setActiveWorkerName}
          />
        ) : (
          <>
            {activeTab === 'deploy' && (
              <CloudflareDeployer
                lang={lang}
                onDeploySuccess={handleDeploySuccess}
                setCfConnected={setCfConnected}
                setActiveWorkerName={setActiveWorkerName}
              />
            )}

            {activeTab === 'generator' && (
              <ConfigGenerator
                lang={lang}
                nodes={nodes}
                setNodes={setNodes}
                onOpenQrModal={handleOpenQrModal}
              />
            )}

            {activeTab === 'sub' && (
              <SubscriptionExporter
                lang={lang}
                nodes={nodes}
                subUrl={subUrl}
                onOpenQrModal={handleOpenQrModal}
              />
            )}

            {activeTab === 'clean-ip' && (
              <CleanIpScanner
                lang={lang}
                onExportCleanIpsToNodes={(cleanIps) => {
                  const currentWorker = deployedWorkerUrl
                    ? new URL(deployedWorkerUrl).hostname
                    : 'edge-nova.workers.dev';
                  const createdBatch = generateMultiNodesBatch(
                    currentWorker,
                    generateRandomUuid(),
                    cleanIps.map((ip) => ({
                      ip,
                      isp: ip.includes('.') && !ip.match(/^\d+\.\d+\.\d+\.\d+$/) ? 'Clean SNI' : 'Clean IP',
                    }))
                  );
                  setNodes((prev) => [...createdBatch, ...prev]);
                  setActiveTab('sub');
                }}
              />
            )}

            {activeTab === 'decoder' && (
              <ConfigDecoder
                lang={lang}
                onOpenQrModal={handleOpenQrModal}
                onSaveToNodes={(newNode) => setNodes((prev) => [newNode, ...prev])}
              />
            )}

            {activeTab === 'editor' && <WorkerCodeEditor lang={lang} />}

            {activeTab === 'ai' && (
              <AiAssistant
                lang={lang}
                nodes={nodes}
                setNodes={setNodes}
                isDeployed={isDeployed}
                deployedWorkerUrl={deployedWorkerUrl}
                subUrl={subUrl}
                activeWorkerName={activeWorkerName}
                setActiveTab={setActiveTab}
              />
            )}
          </>
        )}
      </main>

      {/* QR Code Modal Popup */}
      <QrCodeModal
        isOpen={qrModal.isOpen}
        onClose={() => setQrModal((prev) => ({ ...prev, isOpen: false }))}
        title={qrModal.title}
        content={qrModal.content}
        lang={lang}
      />
    </div>
  );
}
