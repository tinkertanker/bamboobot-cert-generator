import { GetServerSideProps } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import { prisma } from '@/lib/server/prisma';
import { getTierLimits } from '@/types/user';
import type { UserTier } from '@/types/user';
import AdminLayout from '@/components/admin/AdminLayout';
import Segmented from '@/components/admin/Segmented';
import { useEffect, useMemo, useState } from 'react';

type StorageItem = { key: string; size: number; lastModified?: string };
type ListResponse = {
  provider: 'local' | 'cloudflare-r2' | 'amazon-s3';
  total: { count: number; size: number };
  items: StorageItem[];
  aggregates: {
    byPrefixTop: Array<{ prefix: string; count: number; size: number }>;
    byDate: Array<{ date: string; count: number; size: number }>;
    largest: StorageItem[];
  };
};

function formatBytes(bytes: number): string {
  if (!bytes && bytes !== 0) return '-';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const v = bytes / Math.pow(k, i);
  return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${sizes[i]}`;
}

type ViewMode = 'files' | 'folders' | 'date' | 'largest';

type Scope = 'generated' | 'temp_images';

export default function StoragePage() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>('files');
  const [scope, setScope] = useState<Scope>('generated');
  const [search, setSearch] = useState('');
  const [minSizeMB, setMinSizeMB] = useState<number | ''>('');
  const [sortBy, setSortBy] = useState<'size' | 'date' | 'name'>('size');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const res = await fetch(`/api/admin/storage/list?prefix=${scope}%2F`);
        if (!res.ok) throw new Error('Failed to load');
        const json = (await res.json()) as ListResponse;
        setData(json);
      } catch (e) {
        setError('Failed to load storage data');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [scope]);

  const filteredFiles = useMemo(() => {
    if (!data) return [] as StorageItem[];
    let items = data.items;
    if (search) {
      const s = search.toLowerCase();
      items = items.filter(i => i.key.toLowerCase().includes(s));
    }
    if (minSizeMB !== '' && !Number.isNaN(minSizeMB)) {
      const minBytes = Number(minSizeMB) * 1024 * 1024;
      items = items.filter(i => (i.size || 0) >= minBytes);
    }
    const cmp = (a: StorageItem, b: StorageItem) => {
      switch (sortBy) {
        case 'size': return (a.size - b.size) * (sortDir === 'asc' ? 1 : -1);
        case 'date': return ((new Date(a.lastModified || 0)).getTime() - (new Date(b.lastModified || 0)).getTime()) * (sortDir === 'asc' ? 1 : -1);
        case 'name': return a.key.localeCompare(b.key) * (sortDir === 'asc' ? 1 : -1);
      }
    };
    return [...items].sort(cmp);
  }, [data, search, minSizeMB, sortBy, sortDir]);

  // Folder view = aggregate by top-level prefix (e.g., generated/<id>/)
  const folderGroups = useMemo(() => {
    if (!data) return [] as Array<{ prefix: string; count: number; size: number }>;
    const groups = data.aggregates.byPrefixTop;
    let rows = groups;
    if (search) {
      const s = search.toLowerCase();
      rows = rows.filter(r => r.prefix.toLowerCase().includes(s));
    }
    if (minSizeMB !== '' && !Number.isNaN(minSizeMB)) {
      const minBytes = Number(minSizeMB) * 1024 * 1024;
      rows = rows.filter(r => r.size >= minBytes);
    }
    rows = [...rows].sort((a, b) => (sortBy === 'name' ? a.prefix.localeCompare(b.prefix) : a.size - b.size) * (sortDir === 'asc' ? 1 : -1));
    return rows;
  }, [data, search, minSizeMB, sortBy, sortDir]);

  // Date view
  const dateGroups = useMemo(() => {
    if (!data) return [] as Array<{ date: string; count: number; size: number }>;
    let rows = data.aggregates.byDate;
    if (minSizeMB !== '' && !Number.isNaN(minSizeMB)) {
      const minBytes = Number(minSizeMB) * 1024 * 1024;
      rows = rows.filter(r => r.size >= minBytes);
    }
    return rows;
  }, [data, minSizeMB]);

  function toggleAllCurrentView(select: boolean) {
    if (!data) return;
    const updates: Record<string, boolean> = { ...selected };
    if (view === 'files') {
      for (const it of filteredFiles) updates[it.key] = select;
    } else if (view === 'folders') {
      for (const g of folderGroups) updates[`prefix:${g.prefix}`] = select;
    } else if (view === 'date') {
      for (const g of dateGroups) updates[`date:${g.date}`] = select;
    } else if (view === 'largest') {
      for (const it of data.aggregates.largest) updates[it.key] = select;
    }
    setSelected(updates);
  }

  function previewUrlFor(key: string): string {
    return `/api/admin/storage/get?key=${encodeURIComponent(key)}`;
  }

  async function executeDeletion() {
    if (!data) return;
    const items: Array<{ key: string; isPrefix?: boolean }> = [];

    if (view === 'files') {
      for (const it of filteredFiles) if (selected[it.key]) items.push({ key: it.key });
    }
    if (view === 'largest') {
      for (const it of data.aggregates.largest) if (selected[it.key]) items.push({ key: it.key });
    }
    if (view === 'folders') {
      for (const g of folderGroups) if (selected[`prefix:${g.prefix}`]) items.push({ key: g.prefix, isPrefix: true });
    }
    if (view === 'date') {
      const keysToDelete: string[] = [];
      const dateSelected = new Set<string>();
      for (const g of dateGroups) if (selected[`date:${g.date}`]) dateSelected.add(g.date);
      if (dateSelected.size > 0) {
        for (const it of data.items) {
          const d = (it.lastModified ? new Date(it.lastModified) : null);
          if (!d) continue;
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          if (dateSelected.has(key)) keysToDelete.push(it.key);
        }
      }
      for (const k of keysToDelete) items.push({ key: k });
    }

    if (items.length === 0) {
      alert('No items selected.');
      return;
    }

    const confirmText = `Delete ${items.length} item(s)? This cannot be undone.`;
    if (!window.confirm(confirmText)) return;

    try {
      const res = await fetch('/api/admin/storage/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Delete failed');
      // Refresh
      setSelected({});
      const fresh = await fetch(`/api/admin/storage/list?prefix=${scope}%2F`);
      const freshJson = (await fresh.json()) as ListResponse;
      setData(freshJson);
      alert(`Deleted ${json.deleted?.length || 0} item(s).`);
    } catch (e) {
      alert('Failed to delete selected items');
    }
  }

  const subNav = (
    <div className="hidden md:flex items-center gap-4">
      <Segmented
        ariaLabel="Scope"
        items={[
          { label: 'generated', value: 'generated' },
          { label: 'temp_images', value: 'temp_images' },
        ]}
        value={scope}
        onChange={setScope}
      />
      <Segmented
        ariaLabel="View"
        items={[
          { label: 'Files', value: 'files' },
          { label: 'Folders', value: 'folders' },
          { label: 'Date', value: 'date' },
          { label: 'Largest', value: 'largest' },
        ] as any}
        // Type cast for union compatibility
        value={view as any}
        onChange={(v: any) => setView(v as ViewMode)}
      />
    </div>
  );

  return (
    <AdminLayout title="Storage Management" subNav={subNav}>
        {/* Summary */}
        <div className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-xs text-gray-500">Provider</div>
            <div className="text-lg font-semibold">{data?.provider || '—'}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-xs text-gray-500">Total Files</div>
            <div className="text-lg font-semibold">{data?.total.count ?? '—'}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-xs text-gray-500">Total Size</div>
            <div className="text-lg font-semibold">{data ? formatBytes(data.total.size) : '—'}</div>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-lg shadow p-4 mb-4 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name/prefix" className="h-9 text-sm px-3 border rounded w-56" />
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Min size (MB)</label>
              <input type="number" min={0} value={minSizeMB} onChange={e=>setMinSizeMB(e.target.value===''?'':Number(e.target.value))} className="h-9 text-sm px-3 border rounded w-28" />
            </div>
            <div className="flex items-center gap-2">
              <select value={sortBy} onChange={e=>setSortBy(e.target.value as any)} className="h-9 text-sm px-2 border rounded">
                <option value="size">Sort: Size</option>
                <option value="date">Sort: Date</option>
                <option value="name">Sort: Name</option>
              </select>
              <button className="h-9 text-sm px-3 border rounded" onClick={()=>setSortDir(d=>d==='desc'?'asc':'desc')}>{sortDir==='desc'?'Desc':'Asc'}</button>
            </div>
          </div>
        </div>

        {/* Bulk actions */}
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm text-gray-600">{loading ? 'Loading…' : error ? error : ''}</div>
          <div className="flex items-center gap-2">
            <button className="px-3 py-1.5 text-sm border rounded" onClick={()=>toggleAllCurrentView(true)}>Select All in View</button>
            <button className="px-3 py-1.5 text-sm border rounded" onClick={()=>toggleAllCurrentView(false)}>Clear Selection</button>
            <button className="px-3 py-1.5 text-sm rounded bg-red-600 text-white" onClick={executeDeletion}>Delete Selected</button>
          </div>
        </div>

        {/* Tables */}
        {view === 'files' && (
          <div className="bg-white rounded-lg shadow overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2"><input type="checkbox" onChange={e=>toggleAllCurrentView(e.target.checked)} /></th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Preview</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Key</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Size</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Last Modified</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredFiles.map((it) => (
                  <tr key={it.key} className="hover:bg-gray-50">
                    <td className="px-4 py-2"><input type="checkbox" checked={!!selected[it.key]} onChange={e=>setSelected(s=>({ ...s, [it.key]: e.target.checked }))} /></td>
                    <td className="px-4 py-2 text-sm">
                      {/[.](png|jpg|jpeg)$/i.test(it.key) ? (
                        <img src={previewUrlFor(it.key)} alt="preview" className="h-16 w-auto rounded border" />
                      ) : (/\.pdf$/i.test(it.key) ? (
                        <a href={previewUrlFor(it.key)} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">Open PDF</a>
                      ) : (
                        <span className="text-gray-400">—</span>
                      ))}
                    </td>
                    <td className="px-4 py-2 text-sm font-mono">{it.key}</td>
                    <td className="px-4 py-2 text-sm">{formatBytes(it.size)}</td>
                    <td className="px-4 py-2 text-sm">{it.lastModified ? new Date(it.lastModified).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {view === 'folders' && (
          <div className="bg-white rounded-lg shadow overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2"><input type="checkbox" onChange={e=>toggleAllCurrentView(e.target.checked)} /></th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Prefix</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Files</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Total Size</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {folderGroups.map((g) => (
                  <tr key={g.prefix} className="hover:bg-gray-50">
                    <td className="px-4 py-2"><input type="checkbox" checked={!!selected[`prefix:${g.prefix}`]} onChange={e=>setSelected(s=>({ ...s, [`prefix:${g.prefix}`]: e.target.checked }))} /></td>
                    <td className="px-4 py-2 text-sm font-mono">{g.prefix}</td>
                    <td className="px-4 py-2 text-sm">{g.count}</td>
                    <td className="px-4 py-2 text-sm">{formatBytes(g.size)}</td>
                    <td className="px-4 py-2 text-right">
                      <button className="px-3 py-1.5 text-sm rounded bg-red-600 text-white" onClick={()=>{ setSelected(s=>({ ...s, [`prefix:${g.prefix}`]: true })); executeDeletion(); }}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {view === 'date' && (
          <div className="bg-white rounded-lg shadow overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2"><input type="checkbox" onChange={e=>toggleAllCurrentView(e.target.checked)} /></th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Files</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Total Size</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {dateGroups.map((g) => (
                  <tr key={g.date} className="hover:bg-gray-50">
                    <td className="px-4 py-2"><input type="checkbox" checked={!!selected[`date:${g.date}`]} onChange={e=>setSelected(s=>({ ...s, [`date:${g.date}`]: e.target.checked }))} /></td>
                    <td className="px-4 py-2 text-sm">{g.date}</td>
                    <td className="px-4 py-2 text-sm">{g.count}</td>
                    <td className="px-4 py-2 text-sm">{formatBytes(g.size)}</td>
                    <td className="px-4 py-2 text-right">
                      <button className="px-3 py-1.5 text-sm rounded bg-red-600 text-white" onClick={()=>{ setSelected(s=>({ ...s, [`date:${g.date}`]: true })); executeDeletion(); }}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {view === 'largest' && (
          <div className="bg-white rounded-lg shadow overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2"><input type="checkbox" onChange={e=>toggleAllCurrentView(e.target.checked)} /></th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Key</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Size</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Last Modified</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data?.aggregates.largest.map((it) => (
                  <tr key={it.key} className="hover:bg-gray-50">
                    <td className="px-4 py-2"><input type="checkbox" checked={!!selected[it.key]} onChange={e=>setSelected(s=>({ ...s, [it.key]: e.target.checked }))} /></td>
                    <td className="px-4 py-2 text-sm font-mono">
                      <div className="flex items-center gap-3">
                        {/[.](png|jpg|jpeg)$/i.test(it.key) ? (
                          <img src={previewUrlFor(it.key)} alt="preview" className="h-10 w-auto rounded border" />
                        ) : (/\.pdf$/i.test(it.key) ? (
                          <a href={previewUrlFor(it.key)} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">Open PDF</a>
                        ) : null)}
                        <span className="font-mono">{it.key}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-sm">{formatBytes(it.size)}</td>
                    <td className="px-4 py-2 text-sm">{it.lastModified ? new Date(it.lastModified).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </AdminLayout>
  );
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const session = await getServerSession(context.req, context.res, authOptions);
  if (!session?.user?.id) {
    return { redirect: { destination: '/', permanent: false } } as const;
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { tier: true } });
  const limits = getTierLimits((user?.tier as UserTier) || 'free');
  if (!limits.canAccessAdmin) {
    return { redirect: { destination: '/', permanent: false } } as const;
  }

  return { props: {} } as const;
};
