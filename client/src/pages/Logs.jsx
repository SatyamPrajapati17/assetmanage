import { useEffect, useState } from 'react';
import api, { apiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Badge, Banner, Card, EmptyState, Input, Loading, PageHeader, Select } from '../components/ui';

export default function Logs() {
  const { role } = useAuth();
  const [data, setData] = useState(null);
  const [filters, setFilters] = useState({ actor: '', entityKind: '', from: '', to: '', action: '' });
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');

  const load = () => {
    const p = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && p.set(k, v));
    api.get(`/activity-logs?${p}`).then((r) => setData(r.data.data)).catch((e) => setError(apiError(e)));
  };
  useEffect(() => { load(); }, [filters]);

  useEffect(() => {
    if (['admin', 'assetManager'].includes(role)) {
      api.get('/employees?limit=200').then((r) => setUsers(r.data.data.items)).catch(() => {});
    }
  }, [role]);

  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div>
      <PageHeader
        title="Activity Logs"
        subtitle="Append-only trail of every state-changing action (actor · action · entity · timestamp)"
      />

      <Card className="mb-4">
        <div className="flex flex-wrap gap-2">
          {['admin', 'assetManager'].includes(role) && (
            <Select value={filters.actor} onChange={set('actor')} className="w-[190px]">
              <option value="">All actors</option>
              {users.map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}
            </Select>
          )}
          <Select value={filters.entityKind} onChange={set('entityKind')} className="w-[180px]">
            <option value="">All entity types</option>
            {['Asset', 'Allocation', 'TransferRequest', 'Booking', 'MaintenanceRequest', 'AuditCycle', 'AuditItem', 'User'].map((k) => (
              <option key={k}>{k}</option>
            ))}
          </Select>
          <Input placeholder="Action contains…" value={filters.action} onChange={set('action')} className="w-[180px]" />
          <Input type="date" value={filters.from} onChange={set('from')} className="w-[150px]" />
          <Input type="date" value={filters.to} onChange={set('to')} className="w-[150px]" />
        </div>
      </Card>

      {error && <Banner tone="error">{error}</Banner>}

      {!data ? (
        <Loading />
      ) : data.items.length === 0 ? (
        <Card><EmptyState title="No log entries" hint="Actions will appear here as they happen." /></Card>
      ) : (
        <Card>
          <ul className="divide-y divide-hairline">
            {data.items.map((l) => (
              <li key={l._id} className="py-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <Badge soft>{l.action}</Badge>
                  <div>
                    <span className="text-[14px] font-medium">{l.actor?.name || 'System'}</span>
                    {l.actor?.role ? <span className="text-[12px] text-mid-gray"> ({l.actor.role})</span> : null}
                    {l.metadata?.assetTag ? (
                      <span className="font-mono text-[12px] text-mid-gray"> · {l.metadata.assetTag}</span>
                    ) : null}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[12px] text-mid-gray">
                    {l.entity?.kind ? `${l.entity.kind}` : ''}
                  </div>
                  <div className="text-[12px] text-mid-gray">{new Date(l.timestamp).toLocaleString()}</div>
                </div>
              </li>
            ))}
          </ul>
          <div className="text-[12px] text-mid-gray mt-3 text-center">
            {data.total} entr{data.total === 1 ? 'y' : 'ies'} · page {data.page} of {data.pages}
          </div>
        </Card>
      )}
    </div>
  );
}
