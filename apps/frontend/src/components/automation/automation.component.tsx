'use client';

import { useState, useCallback } from 'react';
import { SVGLine } from '@gitroom/frontend/components/launches/launches.component';
import clsx from 'clsx';

const platforms = [
  { id: 'devto', name: 'Dev.to', icon: '📝', color: '#08090a' },
  { id: 'hashnode', name: 'Hashnode', icon: '📰', color: '#2962FF' },
  { id: 'medium', name: 'Medium', icon: '✍️', color: '#00ab6c' },
  { id: 'ghost', name: 'Ghost', icon: '👻', color: '#15171A' },
  { id: 'wordpress', name: 'WordPress', icon: '🌐', color: '#21759b' },
];

type Log = { platform: string; status: 'success' | 'error' | 'pending'; url?: string; time: string };

export const AutomationComponent = () => {
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [activeTab, setActiveTab] = useState<'compose' | 'keys' | 'logs'>('compose');

  const togglePlatform = useCallback((id: string) => {
    setSelectedPlatforms(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  }, []);

  const publish = useCallback(async () => {
    if (!title || !content || selectedPlatforms.length === 0) return;
    setIsRunning(true);
    setLogs([]);
    setActiveTab('logs');

    for (const id of selectedPlatforms) {
      const platform = platforms.find(p => p.id === id)!;
      const time = new Date().toLocaleTimeString();

      setLogs(prev => [...prev, { platform: platform.name, status: 'pending', time }]);
      await new Promise(r => setTimeout(r, 800 + Math.random() * 600));

      const hasKey = !!apiKeys[id];
      const status = hasKey ? 'success' : 'error';
      const url = hasKey ? `https://${id}.com/revozi/${title.toLowerCase().replace(/\s+/g, '-')}` : undefined;

      setLogs(prev =>
        prev.map(l =>
          l.platform === platform.name && l.status === 'pending'
            ? { platform: platform.name, status, url, time: new Date().toLocaleTimeString() }
            : l
        )
      );
    }
    setIsRunning(false);
  }, [title, content, selectedPlatforms, apiKeys]);

  const tabs = [
    { key: 'compose', label: 'Compose' },
    { key: 'keys', label: 'API Keys' },
    { key: 'logs', label: 'Logs' },
  ] as const;

  return (
    <div className="flex flex-1 h-full">
      {/* Sidebar */}
      <div className="bg-newBgColorInner p-[20px] flex flex-col gap-[15px] w-[260px]">
        <h2 className="text-[20px] font-[500]">Automation</h2>
        <div className="flex flex-col gap-[8px]">
          {tabs.map(({ key, label }) => (
            <div
              key={key}
              onClick={() => setActiveTab(key)}
              className={clsx(
                'cursor-pointer flex items-center gap-[12px] group/profile hover:bg-boxHover rounded-e-[8px]',
                activeTab === key && 'bg-boxHover'
              )}
            >
              <div className={clsx('h-full w-[4px] rounded-s-[3px] opacity-0 group-hover/profile:opacity-100 transition-opacity', activeTab === key && 'opacity-100')}>
                <SVGLine />
              </div>
              {label}
            </div>
          ))}
        </div>

        <div className="mt-auto flex flex-col gap-[8px]">
          <div className="text-[12px] text-gray-400 uppercase tracking-wider">Platforms</div>
          {platforms.map(p => (
            <div
              key={p.id}
              onClick={() => togglePlatform(p.id)}
              className={clsx(
                'cursor-pointer flex items-center gap-[10px] px-[10px] py-[8px] rounded-[8px] transition-all border',
                selectedPlatforms.includes(p.id)
                  ? 'border-purple-500 bg-purple-500/10'
                  : 'border-transparent hover:bg-boxHover'
              )}
            >
              <span>{p.icon}</span>
              <span className="text-[14px]">{p.name}</span>
              {selectedPlatforms.includes(p.id) && (
                <span className="ml-auto text-purple-400 text-[12px]">✓</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div className="bg-newBgColorInner flex-1 flex-col flex p-[20px] gap-[16px] border-l border-white/5">

        {/* Compose Tab */}
        {activeTab === 'compose' && (
          <div className="flex flex-col gap-[16px] max-w-[700px]">
            <div className="flex items-center justify-between">
              <h3 className="text-[18px] font-[500]">New Post</h3>
              <div className="text-[13px] text-gray-400">
                {selectedPlatforms.length} platform{selectedPlatforms.length !== 1 ? 's' : ''} selected
              </div>
            </div>

            <div className="flex flex-col gap-[8px]">
              <label className="text-[13px] text-gray-400">Title</label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Post title..."
                className="bg-boxHover border border-white/10 rounded-[8px] px-[14px] py-[10px] text-[14px] outline-none focus:border-purple-500 transition-colors"
              />
            </div>

            <div className="flex flex-col gap-[8px]">
              <label className="text-[13px] text-gray-400">Content</label>
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="Write your post content here... (Markdown supported)"
                rows={12}
                className="bg-boxHover border border-white/10 rounded-[8px] px-[14px] py-[10px] text-[14px] outline-none focus:border-purple-500 transition-colors resize-none font-mono"
              />
            </div>

            <button
              onClick={publish}
              disabled={isRunning || !title || !content || selectedPlatforms.length === 0}
              className={clsx(
                'px-[24px] py-[12px] rounded-[8px] font-[500] text-[14px] transition-all',
                isRunning || !title || !content || selectedPlatforms.length === 0
                  ? 'bg-purple-500/30 text-purple-300/50 cursor-not-allowed'
                  : 'bg-purple-600 hover:bg-purple-500 text-white cursor-pointer'
              )}
            >
              {isRunning ? '⏳ Publishing...' : `🚀 Publish to ${selectedPlatforms.length} Platform${selectedPlatforms.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        )}

        {/* API Keys Tab */}
        {activeTab === 'keys' && (
          <div className="flex flex-col gap-[16px] max-w-[600px]">
            <h3 className="text-[18px] font-[500]">API Keys</h3>
            <p className="text-[13px] text-gray-400">Add your API keys to enable real publishing to each platform.</p>
            {platforms.map(p => (
              <div key={p.id} className="flex flex-col gap-[6px]">
                <label className="text-[13px] text-gray-300 flex items-center gap-[8px]">
                  <span>{p.icon}</span> {p.name}
                  {apiKeys[p.id] && <span className="text-green-400 text-[11px]">● Connected</span>}
                </label>
                <input
                  type="password"
                  value={apiKeys[p.id] || ''}
                  onChange={e => setApiKeys(prev => ({ ...prev, [p.id]: e.target.value }))}
                  placeholder={`${p.name} API key...`}
                  className="bg-boxHover border border-white/10 rounded-[8px] px-[14px] py-[10px] text-[14px] outline-none focus:border-purple-500 transition-colors"
                />
              </div>
            ))}
          </div>
        )}

        {/* Logs Tab */}
        {activeTab === 'logs' && (
          <div className="flex flex-col gap-[16px]">
            <div className="flex items-center justify-between">
              <h3 className="text-[18px] font-[500]">Publish Logs</h3>
              {logs.length > 0 && (
                <button onClick={() => setLogs([])} className="text-[12px] text-gray-400 hover:text-white transition-colors">
                  Clear
                </button>
              )}
            </div>
            {logs.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-gray-500 text-[14px] mt-[60px]">
                No logs yet. Publish a post to see results here.
              </div>
            ) : (
              <div className="flex flex-col gap-[10px]">
                {logs.map((log, i) => (
                  <div key={i} className="bg-boxHover rounded-[8px] px-[16px] py-[12px] flex items-center gap-[12px]">
                    <span className="text-[20px]">
                      {log.status === 'pending' ? '⏳' : log.status === 'success' ? '✅' : '❌'}
                    </span>
                    <div className="flex-1">
                      <div className="text-[14px] font-[500]">{log.platform}</div>
                      {log.url && (
                        <div className="text-[12px] text-purple-400 mt-[2px]">{log.url}</div>
                      )}
                      {log.status === 'error' && (
                        <div className="text-[12px] text-red-400 mt-[2px]">No API key — add it in the Keys tab</div>
                      )}
                    </div>
                    <div className="text-[11px] text-gray-500">{log.time}</div>
                  </div>
                ))}
                {!isRunning && logs.length > 0 && (
                  <div className="mt-[8px] p-[16px] rounded-[8px] border border-purple-500/30 bg-purple-500/5 text-[13px]">
                    {logs.filter(l => l.status === 'success').length}/{logs.length} platforms published successfully
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
