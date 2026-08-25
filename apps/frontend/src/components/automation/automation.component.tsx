'use client';

import { useState, useCallback } from 'react';
import { SVGLine } from '@gitroom/frontend/components/launches/launches.component';
import clsx from 'clsx';

const platforms = [
  { id: 'devto',     name: 'Dev.to',    icon: '📝', color: '#08090a' },
  { id: 'hashnode',  name: 'Hashnode',  icon: '📰', color: '#2962FF' },
  { id: 'medium',    name: 'Medium',    icon: '✍️',  color: '#00ab6c' },
  { id: 'ghost',     name: 'Ghost',     icon: '👻', color: '#15171A' },
  { id: 'wordpress', name: 'WordPress', icon: '🌐', color: '#21759b' },
  { id: 'beehiiv',   name: 'Beehiiv',  icon: '🐝', color: '#f5a623' },
  { id: 'substack',  name: 'Substack', icon: '📮', color: '#FF6719' },
  { id: 'linkedin',  name: 'LinkedIn',  icon: '💼', color: '#0077B5' },
];

type Log = {
  platform: string;
  status: 'success' | 'error' | 'pending';
  url?: string;
  message?: string;
  time: string;
};

// --- Real API publishers ---

async function publishToDevto(apiKey: string, title: string, content: string): Promise<{ url: string }> {
  const res = await fetch('https://dev.to/api/articles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
    body: JSON.stringify({ article: { title, body_markdown: content, published: true } }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `Dev.to error ${res.status}`);
  }
  const data = await res.json();
  return { url: data.url };
}

async function publishToHashnode(apiKey: string, title: string, content: string): Promise<{ url: string }> {
  // Hashnode requires a publicationId — we first fetch the user's publications
  const meRes = await fetch('https://gql.hashnode.com/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: apiKey },
    body: JSON.stringify({
      query: `{ me { publications(first: 1) { edges { node { id url } } } } }`,
    }),
  });
  const meData = await meRes.json();
  const pub = meData?.data?.me?.publications?.edges?.[0]?.node;
  if (!pub) throw new Error('No Hashnode publication found');

  const postRes = await fetch('https://gql.hashnode.com/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: apiKey },
    body: JSON.stringify({
      query: `
        mutation PublishPost($input: PublishPostInput!) {
          publishPost(input: $input) { post { url } }
        }
      `,
      variables: {
        input: {
          title,
          contentMarkdown: content,
          publicationId: pub.id,
          tags: [],
        },
      },
    }),
  });
  const postData = await postRes.json();
  if (postData.errors) throw new Error(postData.errors[0]?.message || 'Hashnode error');
  return { url: postData?.data?.publishPost?.post?.url };
}

async function publishToMedium(apiKey: string, title: string, content: string): Promise<{ url: string }> {
  // Get user ID first
  const meRes = await fetch('https://api.medium.com/v1/me', {
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  });
  if (!meRes.ok) throw new Error(`Medium auth error ${meRes.status}`);
  const meData = await meRes.json();
  const userId = meData?.data?.id;
  if (!userId) throw new Error('Could not get Medium user ID');

  const postRes = await fetch(`https://api.medium.com/v1/users/${userId}/posts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title,
      contentFormat: 'markdown',
      content,
      publishStatus: 'public',
    }),
  });
  if (!postRes.ok) {
    const err = await postRes.json().catch(() => ({}));
    throw new Error(err?.errors?.[0]?.message || `Medium error ${postRes.status}`);
  }
  const postData = await postRes.json();
  return { url: postData?.data?.url };
}

async function publishToGhost(apiKey: string, title: string, content: string): Promise<{ url: string }> {
  // Ghost key format: "https://yourblog.ghost.io:ADMIN_API_KEY"
  const [adminUrl, key] = apiKey.split('|');
  if (!adminUrl || !key) throw new Error('Ghost key format: https://yourblog.ghost.io|YOUR_ADMIN_KEY');

  const [id, secret] = key.split(':');
  if (!id || !secret) throw new Error('Ghost admin key format: id:secret');

  // Create JWT
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT', kid: id }));
  const now = Math.floor(Date.now() / 1000);
  const payload = btoa(JSON.stringify({ iat: now, exp: now + 300, aud: '/admin/' }));
  const secretBytes = new Uint8Array(secret.match(/.{2}/g)!.map(h => parseInt(h, 16)));
  const key2 = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key2, new TextEncoder().encode(`${header}.${payload}`));
  const token = `${header}.${payload}.${btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')}`;

  const res = await fetch(`${adminUrl}/ghost/api/admin/posts/`, {
    method: 'POST',
    headers: { Authorization: `Ghost ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ posts: [{ title, mobiledoc: JSON.stringify({ version: '0.3.1', markups: [], atoms: [], cards: [['markdown', { markdown: content }]], sections: [[10, 0]] }), status: 'published' }] }),
  });
  if (!res.ok) throw new Error(`Ghost error ${res.status}`);
  const data = await res.json();
  return { url: data?.posts?.[0]?.url };
}

async function publishToWordpress(apiKey: string, title: string, content: string): Promise<{ url: string }> {
  // Format: https://yoursite.com|username:app_password
  const [siteUrl, creds] = apiKey.split('|');
  if (!siteUrl || !creds) throw new Error('WP key format: https://yoursite.com|username:app_password');
  const auth = btoa(creds);

  const res = await fetch(`${siteUrl}/wp-json/wp/v2/posts`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, content, status: 'publish' }),
  });
  if (!res.ok) throw new Error(`WordPress error ${res.status}`);
  const data = await res.json();
  return { url: data?.link };
}

async function publishToBeehiiv(apiKey: string, title: string, content: string): Promise<{ url: string }> {
  // Format: publicationId|apiKey
  const [pubId, key] = apiKey.split('|');
  if (!pubId || !key) throw new Error('Beehiiv key format: publicationId|apiKey');

  const res = await fetch(`https://api.beehiiv.com/v2/publications/${pubId}/posts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ subject: title, content, status: 'draft', content_tags: [] }),
  });
  if (!res.ok) throw new Error(`Beehiiv error ${res.status}`);
  const data = await res.json();
  return { url: data?.data?.web_url || `https://beehiiv.com` };
}

async function publishPlatform(id: string, apiKey: string, title: string, content: string): Promise<{ url: string }> {
  switch (id) {
    case 'devto':     return publishToDevto(apiKey, title, content);
    case 'hashnode':  return publishToHashnode(apiKey, title, content);
    case 'medium':    return publishToMedium(apiKey, title, content);
    case 'ghost':     return publishToGhost(apiKey, title, content);
    case 'wordpress': return publishToWordpress(apiKey, title, content);
    case 'beehiiv':   return publishToBeehiiv(apiKey, title, content);
    case 'substack':  throw new Error('Substack has no public API yet — copy your content manually');
    case 'linkedin':  throw new Error('LinkedIn Articles API requires OAuth — coming soon');
    default:          throw new Error('Platform not supported');
  }
}

const PLATFORM_HINTS: Record<string, string> = {
  devto:     'Get from dev.to/settings/extensions',
  hashnode:  'Get from hashnode.com/settings/developer',
  medium:    'Get from medium.com/me/settings (Integration tokens)',
  ghost:     'Format: https://yourblog.ghost.io|id:secret — Staff → API Keys',
  wordpress: 'Format: https://yoursite.com|username:app_password',
  beehiiv:   'Format: publicationId|apiKey — from app.beehiiv.com/settings',
  substack:  'No public API yet',
  linkedin:  'Coming soon (requires OAuth)',
};

export const AutomationComponent = () => {
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
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

      try {
        const key = apiKeys[id];
        if (!key) throw new Error('No API key — add it in the Keys tab');
        const { url } = await publishPlatform(id, key, title, content);
        setLogs(prev => prev.map(l =>
          l.platform === platform.name && l.status === 'pending'
            ? { platform: platform.name, status: 'success', url, time: new Date().toLocaleTimeString() }
            : l
        ));
      } catch (err: any) {
        setLogs(prev => prev.map(l =>
          l.platform === platform.name && l.status === 'pending'
            ? { platform: platform.name, status: 'error', message: err.message, time: new Date().toLocaleTimeString() }
            : l
        ));
      }
    }
    setIsRunning(false);
  }, [title, content, tags, selectedPlatforms, apiKeys]);

  const tabs = [
    { key: 'compose', label: 'Compose' },
    { key: 'keys',    label: 'API Keys' },
    { key: 'logs',    label: 'Logs' },
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
          <div className="text-[12px] text-gray-400 uppercase tracking-wider">
            Platforms ({selectedPlatforms.length} selected)
          </div>
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
              {apiKeys[p.id] && <span className="ml-auto text-green-400 text-[10px]">●</span>}
              {selectedPlatforms.includes(p.id) && !apiKeys[p.id] && (
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
              <label className="text-[13px] text-gray-400">Tags <span className="text-gray-500">(comma separated, up to 4)</span></label>
              <input
                value={tags}
                onChange={e => setTags(e.target.value)}
                placeholder="webdev, javascript, tutorial..."
                className="bg-boxHover border border-white/10 rounded-[8px] px-[14px] py-[10px] text-[14px] outline-none focus:border-purple-500 transition-colors"
              />
            </div>

            <div className="flex flex-col gap-[8px]">
              <label className="text-[13px] text-gray-400">Content <span className="text-gray-500">(Markdown)</span></label>
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="Write your post content here..."
                rows={14}
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
              {isRunning
                ? '⏳ Publishing...'
                : `🚀 Publish to ${selectedPlatforms.length} Platform${selectedPlatforms.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        )}

        {/* API Keys Tab */}
        {activeTab === 'keys' && (
          <div className="flex flex-col gap-[16px] max-w-[600px]">
            <h3 className="text-[18px] font-[500]">API Keys</h3>
            <p className="text-[13px] text-gray-400">Keys are stored in memory this session only. Never shared or sent to our servers.</p>
            {platforms.map(p => (
              <div key={p.id} className="flex flex-col gap-[6px]">
                <label className="text-[13px] text-gray-300 flex items-center gap-[8px]">
                  <span>{p.icon}</span>
                  <span>{p.name}</span>
                  {apiKeys[p.id]
                    ? <span className="text-green-400 text-[11px]">● Connected</span>
                    : <span className="text-gray-500 text-[11px]">○ Not set</span>
                  }
                </label>
                <input
                  type="password"
                  value={apiKeys[p.id] || ''}
                  onChange={e => setApiKeys(prev => ({ ...prev, [p.id]: e.target.value }))}
                  placeholder={PLATFORM_HINTS[p.id] || `${p.name} API key...`}
                  className="bg-boxHover border border-white/10 rounded-[8px] px-[14px] py-[10px] text-[14px] outline-none focus:border-purple-500 transition-colors"
                />
                <div className="text-[11px] text-gray-500">{PLATFORM_HINTS[p.id]}</div>
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
                        <a href={log.url} target="_blank" rel="noreferrer" className="text-[12px] text-purple-400 mt-[2px] hover:underline block">
                          {log.url}
                        </a>
                      )}
                      {log.message && (
                        <div className="text-[12px] text-red-400 mt-[2px]">{log.message}</div>
                      )}
                    </div>
                    <div className="text-[11px] text-gray-500">{log.time}</div>
                  </div>
                ))}
                {!isRunning && logs.length > 0 && (
                  <div className="mt-[8px] p-[16px] rounded-[8px] border border-purple-500/30 bg-purple-500/5 text-[13px]">
                    ✅ {logs.filter(l => l.status === 'success').length} succeeded &nbsp;·&nbsp;
                    ❌ {logs.filter(l => l.status === 'error').length} failed &nbsp;·&nbsp;
                    {logs.length} total
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
