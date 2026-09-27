import { useEffect, useState } from 'react';
import api, { apiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import {
  Badge, Banner, Button, Card, ConfirmModal, EmptyState, Field, Input, Loading, Modal,
  PageHeader, Tabs,
} from '../components/ui';

export default function Audit() {
  const [cycles, setCycles] = useState(null);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [tab, setTab] = useState('checklist');
  const [createOpen, setCreateOpen] = useState(false);
  const [closeTarget, setCloseTarget] = useState(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const load = () => api.get('/audits').then((r) => setCycles(r.data.data.items)).catch((e) => setError(apiError(e)));
  useEffect(() => { load(); }, []);

  const loadDetail = (id) => api.get(`/audits/${id}`).then((r) => setDetail(r.data.data)).catch((e) => setError(apiError(e)));
  useEffect(() => {
    if (selected) {
      loadDetail(selected);
      setTab('checklist');
    }
  }, [selected]);

  return (
    <div>
      <PageHeader
        title="Asset Audit"
        subtitle="Scheduled verification cycles with discrepancy reports"
        actions={<Button onClick={() => setCreateOpen(true)}>New Audit Cycle</Button>}
      />
      {error && <Banner tone="error" onClose={() => setError('')}>{error}</Banner>}
      {info && <Banner tone="info" onClose={() => setInfo('')}>{info}</Banner>}

      {/* Cycle list */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cycles === null ? (
          <Loading />
        ) : cycles.length === 0 ? (
          <Card className="md:col-span-2 lg:col-span-3"><EmptyState title="No audit cycles yet" hint="Create the first cycle to start verifying assets." /></Card>
        ) : (
          cycles.map((c) => (
            <button key={c._id} className="text-left" onClick={() => setSelected(c._id)}>
              <Card className={`h-full hover:shadow-md transition-shadow ${selected === c._id ? 'border-ink' : ''}`}>
                <div className="flex items-center justify-between">
                  <Badge status={c.status}>{c.status}</Badge>
                  <span className="text-[12px] text-mid-gray">{c.total} assets</span>
                </div>
                <div className="font-medium mt-2 text-[15px]">{c.name}</div>
                <div className="text-[12.5px] text-mid-gray mt-1">
                  {c.scope?.departments?.map((d) => d.name).join(', ') || 'All departments'}
                  {c.scope?.locations?.length ? ` · ${c.scope.locations.join(', ')}` : ''}
                </div>
                {/* progress bar */}
                <div className="mt-3">
                  <div className="h-1.5 rounded-pill bg-canvas overflow-hidden flex">
                    <div className="bg-ink" style={{ width: `${pct(c.counts?.Verified, c.total)}` }} />
                    <div className="bg-ember" style={{ width: `${pct(c.counts?.Missing, c.total)}` }} />
                    <div className="bg-mid-gray" style={{ width: `${pct(c.counts?.Damaged, c.total)}` }} />
                  </div>
                  <div className="text-[11.5px] text-mid-gray mt-1.5">
                    {c.counts?.Verified || 0} verified · {c.counts?.Missing || 0} missing · {c.counts?.Damaged || 0} damaged · {c.counts?.Pending || 0} pending
                  </div>
                </div>
              </Card>
            </button>
          ))
        )}
      </div>

      {/* Cycle detail */}
      {detail && (
        <Card className="mt-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="font-semibold text-[16px]">{detail.cycle.name}</h3>
              <div className="text-[12.5px] text-mid-gray mt-0.5">
                Auditors: {detail.cycle.auditors?.map((a) => a.name).join(', ') || '—'}
                {detail.cycle.dateRange?.start ? ` · ${new Date(detail.cycle.dateRange.start).toLocaleDateString()} → ${new Date(detail.cycle.dateRange.end).toLocaleDateString()}` : ''}
              </div>
            </div>
            <div className="flex gap-2">
              {detail.cycle.status === 'Planned' && (
                <Button variant="secondary" onClick={async () => {
                  try { await api.post(`/audits/${detail.cycle._id}/activate`); loadDetail(detail.cycle._id); load(); }
                  catch (e) { setError(apiError(e)); }
                }}>Activate</Button>
              )}
              {detail.cycle.status !== 'Closed' && (
                <Button variant="danger" onClick={() => setCloseTarget(detail.cycle)}>Close Cycle</Button>
              )}
            </div>
          </div>

          <Tabs
            tabs={[
              { key: 'checklist', label: 'Checklist' },
              { key: 'discrepancies', label: 'Discrepancy Report' },
            ]}
            active={tab}
            onChange={setTab}
          />

          <div className="mt-4">
            {tab === 'checklist' && <Checklist detail={detail} onReload={() => { loadDetail(detail.cycle._id); load(); }} />}
            {tab === 'discrepancies' && <Discrepancies cycleId={detail.cycle._id} />}
          </div>
        </Card>
      )}

      {/* Create modal */}
      {createOpen && (
        <CreateCycleModal
          onClose={() => setCreateOpen(false)}
          onDone={() => { setCreateOpen(false); load(); }}
        />
      )}

      {/* Close confirm */}
      <ConfirmModal
        open={!!closeTarget}
        title="Close audit cycle?"
        body="This will lock the cycle and update asset statuses: Missing → Lost, Damaged → Under Maintenance. Items still pending will be force-closed as-is."
        confirmLabel="Close cycle"
        onCancel={() => setCloseTarget(null)}
        onConfirm={async () => {
          try {
            const res = await api.post(`/audits/${closeTarget._id}/close`, { force: true });
            setCloseTarget(null);
            setInfo(res.data.message || 'Cycle closed.');
            loadDetail(closeTarget._id);
            load();
          } catch (e) { setCloseTarget(null); setError(apiError(e)); }
        }}
      />
    </div>
  );
}

function pct(n, total) {
  if (!total) return '0%';
  return `${Math.round(((n || 0) / total) * 100)}%`;
}

/* ============================================================ Checklist */
function Checklist({ detail, onReload }) {
  const { user } = useAuth();
  const [error, setError] = useState('');
  const isAuditor = detail.cycle.auditors?.some((a) => String(a._id || a) === String(user.id));
  const isManager = ['assetManager', 'admin'].includes(user.role);
  const canMark = (isAuditor || isManager) && detail.cycle.status !== 'Closed';

  const mark = async (item, result) => {
    try {
      await api.patch(`/audits/${detail.cycle._id}/items/${item._id}`, { result });
      onReload();
    } catch (e) { setError(apiError(e)); }
  };

  if (!detail.items.length) return <EmptyState title="No in-scope assets" hint="No assets matched this cycle's scope." />;

  return (
    <div>
      {error && <Banner tone="error">{error}</Banner>}
      <ul className="divide-y divide-hairline">
        {detail.items.map((item) => (
          <li key={item._id} className="py-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[14px]">
                <span className="font-mono text-[12px] text-mid-gray mr-2">{item.asset?.assetTag}</span>
                <span className="font-medium">{item.asset?.name}</span>
              </div>
              <div className="text-[12px] text-mid-gray">
                {item.asset?.location || '—'} · asset status: {item.asset?.status}
                {item.markedBy?.name ? ` · marked by ${item.markedBy.name}` : ''}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {canMark ? (
                <>
                  <button
                    onClick={() => mark(item, 'Verified')}
                    className={`rounded-pill px-2.5 h-7 text-[12px] font-medium border ${item.result === 'Verified' ? 'bg-ink text-[#fafafa] border-ink' : 'border-hairline hover:bg-surface-alt'}`}
                  >Verified</button>
                  <button
                    onClick={() => mark(item, 'Missing')}
                    className={`rounded-pill px-2.5 h-7 text-[12px] font-medium border ${item.result === 'Missing' ? 'bg-ember text-[#fafafa] border-ember' : 'border-hairline hover:bg-surface-alt'}`}
                  >Missing</button>
                  <button
                    onClick={() => mark(item, 'Damaged')}
                    className={`rounded-pill px-2.5 h-7 text-[12px] font-medium border ${item.result === 'Damaged' ? 'bg-ember text-[#fafafa] border-ember' : 'border-hairline hover:bg-surface-alt'}`}
                  >Damaged</button>
                </>
              ) : (
                <Badge status={item.result}>{item.result}</Badge>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ============================================================ Discrepancy report */
function Discrepancies({ cycleId }) {
  const [rows, setRows] = useState(null);
  const [csv, setCsv] = useState('');

  useEffect(() => {
    api.get(`/audits/${cycleId}/discrepancy-report`)
      .then((r) => { setRows(r.data.data.rows); setCsv(r.data.data.csv); })
      .catch(() => setRows([]));
  }, [cycleId]);

  if (rows === null) return <Loading />;
  if (rows.length === 0) return <EmptyState title="No discrepancies" hint="Every in-scope asset is Verified so far." />;

  const download = () => {
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-${cycleId}-discrepancies.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="flex justify-end mb-2">
        <Button variant="outline" onClick={download}>Export CSV</Button>
      </div>
      <ul className="divide-y divide-hairline">
        {rows.map((r, i) => (
          <li key={i} className="py-3 flex items-center justify-between gap-3">
            <div>
              <span className="font-mono text-[12px] text-mid-gray mr-2">{r.assetTag}</span>
              <span className="font-medium">{r.name}</span>
              <div className="text-[12px] text-mid-gray">{r.location}{r.note ? ` · ${r.note}` : ''}</div>
            </div>
            <Badge status={r.result}>{r.result}</Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ============================================================ Create cycle modal */
function CreateCycleModal({ onClose, onDone }) {
  const [departments, setDepartments] = useState([]);
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ name: '', departments: [], locations: '', auditors: [], start: '', end: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/departments').then((r) => setDepartments(r.data.data.items)).catch(() => {});
    api.get('/employees?limit=200').then((r) => setUsers(r.data.data.items)).catch(() => {});
  }, []);

  const toggle = (k, v) => setForm((f) => ({
    ...f,
    [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v],
  }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/audits', {
        name: form.name,
        scope: {
          departments: form.departments,
          locations: form.locations ? form.locations.split(',').map((s) => s.trim()).filter(Boolean) : [],
        },
        dateRange: form.start ? { start: form.start, end: form.end || form.start } : null,
        auditors: form.auditors,
      });
      onDone();
    } catch (err) { setError(apiError(err)); }
    finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title="New audit cycle" width="max-w-lg">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Cycle name"><Input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Q3 Floor-3 audit" /></Field>

        <Field label="Departments in scope">
          <div className="flex flex-wrap gap-2">
            {departments.map((d) => (
              <button
                type="button"
                key={d._id}
                onClick={() => toggle('departments', d._id)}
                className={`rounded-pill px-3 h-8 text-[13px] border ${form.departments.includes(d._id) ? 'bg-ink text-[#fafafa] border-ink' : 'border-hairline hover:bg-surface-alt'}`}
              >{d.name}</button>
            ))}
          </div>
        </Field>

        <Field label="Locations in scope" hint="Comma-separated; leave empty for all">
          <Input value={form.locations} onChange={(e) => setForm((f) => ({ ...f, locations: e.target.value }))} placeholder="HQ · Floor 2, HQ · Floor 3" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Start date"><Input type="date" value={form.start} onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))} /></Field>
          <Field label="End date"><Input type="date" value={form.end} onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))} /></Field>
        </div>

        <Field label="Auditors">
          <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
            {users.map((u) => (
              <button
                type="button"
                key={u._id}
                onClick={() => toggle('auditors', u._id)}
                className={`rounded-pill px-3 h-8 text-[13px] border ${form.auditors.includes(u._id) ? 'bg-ink text-[#fafafa] border-ink' : 'border-hairline hover:bg-surface-alt'}`}
              >{u.name}</button>
            ))}
          </div>
        </Field>

        {error && <Banner tone="error">{error}</Banner>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create cycle'}</Button>
        </div>
      </form>
    </Modal>
  );
}
