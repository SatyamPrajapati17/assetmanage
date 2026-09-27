import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { apiError, apiErrorDetails } from '../api/client';
import { useAuth } from '../context/AuthContext';
import {
  Badge, Banner, Button, Card, ConfirmModal, EmptyState, Field, Input, Loading, Modal,
  PageHeader, Select, Tabs, Textarea,
} from '../components/ui';
import { Table } from './OrgSetup';

export default function Allocation() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('assets');

  return (
    <div>
      <PageHeader
        title="Allocation & Transfer"
        subtitle="Allocate available assets, request transfers of held assets, process returns"
      />
      <Tabs
        tabs={[
          { key: 'assets', label: 'Allocate' },
          { key: 'transfers', label: 'Transfer Requests' },
          { key: 'returns', label: 'Returns' },
        ]}
        active={tab}
        onChange={setTab}
      />
      <div className="mt-5">
        {tab === 'assets' && <AllocateTab onGoTransfers={() => navigate('/allocation', { state: { tab: 'transfers' } })} />}
        {tab === 'transfers' && <TransfersTab />}
        {tab === 'returns' && <ReturnsTab />}
      </div>
    </div>
  );
}

/* ============================================================ Allocate tab */
function AllocateTab({ onGoTransfers }) {
  const { role } = useAuth();
  const [data, setData] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [q, setQ] = useState('');
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [allocateTarget, setAllocateTarget] = useState(null);
  const [returnTarget, setReturnTarget] = useState(null);
  const [transferTarget, setTransferTarget] = useState(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const load = () => {
    const p = new URLSearchParams({ limit: 100 });
    if (statusFilter) p.set('status', statusFilter);
    if (q) p.set('q', q);
    api.get(`/allocations?${p}`).then((r) => setData(r.data.data)).catch((e) => setError(apiError(e)));
  };
  useEffect(() => { load(); }, [statusFilter, q]);

  useEffect(() => {
    api.get('/employees?limit=200').then((r) => setUsers(r.data.data.items)).catch(() => {});
    api.get('/departments').then((r) => setDepartments(r.data.data.items)).catch(() => {});
  }, []);

  const isApprover = ['admin', 'assetManager'].includes(role);

  return (
    <Card>
      <div className="flex flex-wrap gap-2 mb-4">
        <Input placeholder="Search holder or asset…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-[170px]">
          <option value="">All allocation statuses</option>
          <option value="Active">Active</option>
          <option value="Returned">Returned</option>
          <option value="TransferredOut">Transferred out</option>
        </Select>
      </div>

      {error && <Banner tone="error" onClose={() => setError('')}>{error}</Banner>}
      {info && <Banner tone="info" onClose={() => setInfo('')}>{info}</Banner>}

      {!data ? <Loading /> : data.items.length === 0 ? (
        <EmptyState title="No allocations found" hint="Allocate an asset from the Asset Directory." />
      ) : (
        <Table head={['Asset', 'Holder', 'Allocated', 'Expected back', 'Status', '']}>
          {data.items.map((al) => (
            <tr key={al._id} className={`border-t border-hairline ${al.isOverdue ? 'bg-ember/5' : ''}`}>
              <td className="py-2.5 pr-3">
                <div className="font-medium">{al.asset?.assetTag}</div>
                <div className="text-[12px] text-mid-gray">{al.asset?.name}</div>
              </td>
              <td className="py-2.5 pr-3">
                {al.allocatedTo?.employee?.name || al.allocatedTo?.department?.name || '—'}
              </td>
              <td className="py-2.5 pr-3">{new Date(al.allocationDate).toLocaleDateString()}</td>
              <td className="py-2.5 pr-3">
                {al.expectedReturnDate ? (
                  <span className={al.isOverdue ? 'text-ember font-medium' : ''}>
                    {new Date(al.expectedReturnDate).toLocaleDateString()}
                    {al.isOverdue ? ' · overdue' : ''}
                  </span>
                ) : '—'}
              </td>
              <td className="py-2.5 pr-3"><Badge status={al.status}>{al.status}</Badge></td>
              <td className="py-2.5 text-right whitespace-nowrap">
                {al.status === 'Active' && (
                  <>
                    <button className="text-[13px] underline mr-3" onClick={() => setReturnTarget(al)}>Mark returned</button>
                    {isApprover && <button className="text-[13px] underline" onClick={() => setTransferTarget(al)}>Transfer</button>}
                  </>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}

      {/* Allocate modal — includes the FR-5.2 conflict banner + Transfer CTA */}
      {allocateTarget && (
        <AllocateModal
          target={allocateTarget}
          users={users}
          departments={departments}
          onClose={() => setAllocateTarget(null)}
          onDone={() => { setAllocateTarget(null); load(); }}
        />
      )}

      {/* Return modal */}
      {returnTarget && (
        <ReturnModal
          allocation={returnTarget}
          onClose={() => setReturnTarget(null)}
          onDone={() => { setReturnTarget(null); setInfo('Return recorded — asset is Available again.'); load(); }}
        />
      )}

      {/* Transfer modal */}
      {transferTarget && (
        <TransferModal
          allocation={transferTarget}
          users={users}
          departments={departments}
          onClose={() => setTransferTarget(null)}
          onDone={() => { setTransferTarget(null); setInfo('Transfer request submitted for approval.'); }}
        />
      )}
    </Card>
  );
}

/* Allocate modal: pick employee/department + expected return.
   If the asset is not Available, the server 409s and we render the
   "currently held by X → Transfer Request" banner inline (FR-5.2). */
function AllocateModal({ target, users, departments, onClose, onDone }) {
  const [form, setForm] = useState({ type: 'Employee', employee: '', department: '', expectedReturnDate: '' });
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(''); setConflict(null);
    try {
      const allocatedTo =
        form.type === 'Employee'
          ? { type: 'Employee', employee: form.employee }
          : { type: 'Department', department: form.department };
      await api.post(`/assets/${target.asset._id}/allocate`, {
        allocatedTo,
        expectedReturnDate: form.expectedReturnDate || null,
      });
      onDone();
    } catch (err) {
      const details = apiErrorDetails(err);
      if (details?.currentHolder || details?.currentStatus) {
        setConflict(details);
      } else {
        setError(apiError(err));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modalish
      title={`Allocate ${target.asset?.assetTag} — ${target.asset?.name}`}
      onClose={onClose}
    >
      {conflict && (
        <div className="space-y-3">
          <Banner tone="error" title="Allocation blocked">
            {conflict.currentHolder
              ? `Currently held by ${conflict.currentHolder.name}${conflict.currentHolder.allocationDate ? ` — allocated ${new Date(conflict.currentHolder.allocationDate).toLocaleDateString()}` : ''}.`
              : `Asset is ${conflict.currentStatus}.`}
            {' '}Use a Transfer Request instead.
          </Banner>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => { onClose(); onGoTransfers(); }}>
              View Transfer Requests →
            </Button>
          </div>
        </div>
      )}
      {!conflict && (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Allocate to">
            <Select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
              <option>Employee</option>
              <option>Department</option>
            </Select>
          </Field>
          {form.type === 'Employee' ? (
            <Field label="Employee">
              <Select required value={form.employee} onChange={(e) => setForm((f) => ({ ...f, employee: e.target.value }))}>
                <option value="">Select employee…</option>
                {users.map((u) => <option key={u._id} value={u._id}>{u.name} ({u.email})</option>)}
              </Select>
            </Field>
          ) : (
            <Field label="Department">
              <Select required value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}>
                <option value="">Select department…</option>
                {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
              </Select>
            </Field>
          )}
          <Field label="Expected return date" hint="Optional — overdue returns are flagged automatically">
            <Input type="date" value={form.expectedReturnDate} onChange={(e) => setForm((f) => ({ ...f, expectedReturnDate: e.target.value }))} />
          </Field>
          {error && <Banner tone="error">{error}</Banner>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Allocating…' : 'Confirm allocation'}</Button>
          </div>
        </form>
      )}
    </Modalish>
  );
}

/* Return modal (FR-5.4): condition check-in notes */
function ReturnModal({ allocation, onClose, onDone }) {
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/allocations/${allocation._id}/return`, { returnConditionNotes: notes });
      onDone();
    } catch (err) { setError(apiError(err)); }
    finally { setBusy(false); }
  };

  return (
    <Modalish title={`Return ${allocation.asset?.assetTag} — ${allocation.asset?.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Condition check-in notes" hint="Describe the state the asset came back in">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="No visible damage, all accessories present…" />
        </Field>
        {error && <Banner tone="error">{error}</Banner>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Confirm return'}</Button>
        </div>
      </form>
    </Modalish>
  );
}

/* Transfer request modal */
function TransferModal({ allocation, users, departments, onClose, onDone }) {
  const [form, setForm] = useState({ type: 'Employee', employee: '', department: '', reason: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const requestedTo =
        form.type === 'Employee'
          ? { type: 'Employee', employee: form.employee }
          : { type: 'Department', department: form.department };
      await api.post('/transfer-requests', {
        assetId: allocation.asset._id,
        requestedTo,
        reason: form.reason || null,
      });
      onDone();
    } catch (err) { setError(apiError(err)); }
    finally { setBusy(false); }
  };

  return (
    <Modalish title={`Transfer request — ${allocation.asset?.assetTag}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-[13px] text-mid-gray">
          Requesting transfer of <span className="font-medium text-ink">{allocation.asset?.name}</span> from{' '}
          {allocation.allocatedTo?.employee?.name || allocation.allocatedTo?.department?.name || 'current holder'}.
        </p>
        <Field label="Transfer to">
          <Select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
            <option>Employee</option>
            <option>Department</option>
          </Select>
        </Field>
        {form.type === 'Employee' ? (
          <Field label="Employee">
            <Select required value={form.employee} onChange={(e) => setForm((f) => ({ ...f, employee: e.target.value }))}>
              <option value="">Select employee…</option>
              {users.map((u) => <option key={u._id} value={u._id}>{u.name} ({u.email})</option>)}
            </Select>
          </Field>
        ) : (
          <Field label="Department">
            <Select required value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}>
              <option value="">Select department…</option>
              {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Reason" hint="Optional context for the approver">
          <Input value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
        </Field>
        {error && <Banner tone="error">{error}</Banner>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Submitting…' : 'Submit transfer request'}</Button>
        </div>
      </form>
    </Modalish>
  );
}

/* ============================================================ Transfers tab */
function TransfersTab() {
  const { role } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(null); // { action, id }

  const load = () => api.get('/transfer-requests').then((r) => setData(r.data.data)).catch((e) => setError(apiError(e)));
  useEffect(() => { load(); }, []);

  const isApprover = ['admin', 'assetManager', 'departmentHead'].includes(role);

  const act = async (id, action) => {
    try {
      await api.post(`/transfer-requests/${id}/${action}`);
      load();
    } catch (e) { setError(apiError(e)); }
  };

  return (
    <Card>
      {error && <Banner tone="error" onClose={() => setError('')}>{error}</Banner>}
      {!data ? <Loading /> : data.items.length === 0 ? (
        <EmptyState title="No transfer requests" hint="Transfer requests for allocated assets appear here." />
      ) : (
        <Table head={['Asset', 'From → To', 'Reason', 'Requested by', 'Status', '']}>
          {data.items.map((t) => (
            <tr key={t._id} className="border-t border-hairline">
              <td className="py-2.5 pr-3">
                <div className="font-medium">{t.asset?.assetTag}</div>
                <div className="text-[12px] text-mid-gray">{t.asset?.name}</div>
              </td>
              <td className="py-2.5 pr-3">
                {t.requestedBy?.name || '—'} → {t.requestedTo?.employee?.name || t.requestedTo?.department?.name || '—'}
              </td>
              <td className="py-2.5 pr-3 max-w-[220px]">{t.reason || '—'}</td>
              <td className="py-2.5 pr-3">{t.requestedBy?.name || '—'}</td>
              <td className="py-2.5 pr-3"><Badge status={t.status}>{t.status}</Badge></td>
              <td className="py-2.5 text-right whitespace-nowrap">
                {t.status === 'Requested' && isApprover && (
                  <>
                    <button className="text-[13px] underline mr-3" onClick={() => setConfirm({ action: 'approve', id: t._id })}>Approve</button>
                    <button className="text-[13px] text-ember underline" onClick={() => setConfirm({ action: 'reject', id: t._id })}>Reject</button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}

      <ConfirmModal
        open={!!confirm}
        title={confirm?.action === 'approve' ? 'Approve transfer?' : 'Reject transfer?'}
        body={
          confirm?.action === 'approve'
            ? 'The current allocation will be closed (TransferredOut) and a new allocation opened atomically. History is preserved.'
            : 'The requester will be notified that the transfer was rejected.'
        }
        confirmLabel={confirm?.action === 'approve' ? 'Approve' : 'Reject'}
        danger={confirm?.action === 'reject'}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          const c = confirm;
          setConfirm(null);
          await act(c.id, c.action);
        }}
      />
    </Card>
  );
}

/* ============================================================ Returns tab */
function ReturnsTab() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [returnTarget, setReturnTarget] = useState(null);

  const load = () => {
    api.get('/allocations?status=Active&limit=100')
      .then((r) => setData(r.data.data))
      .catch((e) => setError(apiError(e)));
  };
  useEffect(() => { load(); }, []);

  return (
    <Card>
      {error && <Banner tone="error">{error}</Banner>}
      {!data ? <Loading /> : data.items.length === 0 ? (
        <EmptyState title="No active allocations" />
      ) : (
        <Table head={['Asset', 'Holder', 'Allocated', 'Expected back', 'Overdue', '']}>
          {data.items.map((al) => (
            <tr key={al._id} className={`border-t border-hairline ${al.isOverdue ? 'bg-ember/5' : ''}`}>
              <td className="py-2.5 pr-3"><span className="font-medium">{al.asset?.assetTag}</span> · {al.asset?.name}</td>
              <td className="py-2.5 pr-3">{al.allocatedTo?.employee?.name || al.allocatedTo?.department?.name || '—'}</td>
              <td className="py-2.5 pr-3">{new Date(al.allocationDate).toLocaleDateString()}</td>
              <td className="py-2.5 pr-3">{al.expectedReturnDate ? new Date(al.expectedReturnDate).toLocaleDateString() : '—'}</td>
              <td className="py-2.5 pr-3">{al.isOverdue ? <Badge status="Missing">Overdue</Badge> : '—'}</td>
              <td className="py-2.5 text-right">
                <button className="text-[13px] underline" onClick={() => setReturnTarget(al)}>Mark returned</button>
              </td>
            </tr>
          ))}
        </Table>
      )}

      {returnTarget && (
        <ReturnModal
          allocation={returnTarget}
          onClose={() => setReturnTarget(null)}
          onDone={() => { setReturnTarget(null); load(); }}
        />
      )}
    </Card>
  );
}

/* Local modal wrapper */
function Modalish({ title, onClose, children }) {
  return <Modal open title={title} onClose={onClose}>{children}</Modal>;
}
