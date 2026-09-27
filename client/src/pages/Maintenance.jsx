import { useEffect, useState } from 'react';
import api, { apiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import {
  Badge, Banner, Button, Card, ConfirmModal, EmptyState, Field, Input, Loading, Modal,
  PageHeader, Select, Textarea,
} from '../components/ui';

const COLUMNS = [
  { key: 'Pending', label: 'Pending' },
  { key: 'Approved', label: 'Approved' },
  { key: 'TechnicianAssigned', label: 'Technician Assigned' },
  { key: 'InProgress', label: 'In Progress' },
  { key: 'Resolved', label: 'Resolved' },
];

export default function Maintenance() {
  const { role } = useAuth();
  const isManager = role === 'assetManager' || role === 'admin';
  const [data, setData] = useState(null);
  const [assets, setAssets] = useState([]);
  const [users, setUsers] = useState([]);
  const [raiseOpen, setRaiseOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const load = () => api.get('/maintenance?limit=100').then((r) => setData(r.data.data)).catch((e) => setError(apiError(e)));
  useEffect(() => { load(); }, []);

  useEffect(() => {
    api.get('/assets?limit=200').then((r) => setAssets(r.data.data.items)).catch(() => {});
    if (isManager) api.get('/employees?limit=200').then((r) => setUsers(r.data.data.items)).catch(() => {});
  }, [isManager]);

  const act = async (id, action, body = {}) => {
    try {
      const res = await api.post(`/maintenance/${id}/${action}`, body);
      const msg = res.data.message || 'Done';
      setInfo(msg);
      load();
    } catch (e) { setError(apiError(e)); }
  };

  const byStatus = (status) => data?.items.filter((r) => r.status === status) || [];

  return (
    <div>
      <PageHeader
        title="Maintenance Management"
        subtitle="Approval-gated pipeline: Pending → Approved → Technician → In Progress → Resolved"
        actions={<Button onClick={() => setRaiseOpen(true)}>Raise Request</Button>}
      />
      {error && <Banner tone="error" onClose={() => setError('')}>{error}</Banner>}
      {info && <Banner tone="info" onClose={() => setInfo('')}>{info}</Banner>}

      {!data ? (
        <Loading />
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-3">
          {COLUMNS.map((col) => (
            <div key={col.key} className="w-[240px] shrink-0">
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-[12px] uppercase tracking-[0.05em] text-mid-gray">{col.label}</span>
                <Badge soft>{byStatus(col.key).length}</Badge>
              </div>
              <div className="space-y-2">
                {byStatus(col.key).length === 0 && (
                  <div className="text-[12px] text-mid-gray px-1 py-3">Nothing here.</div>
                )}
                {byStatus(col.key).map((r) => (
                  <Card key={r._id} className="p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[12px] text-mid-gray">{r.asset?.assetTag}</span>
                      <Badge status={r.priority}>{r.priority}</Badge>
                    </div>
                    <div className="text-[14px] font-medium mt-1 leading-snug">{r.asset?.name}</div>
                    <p className="text-[13px] text-ink-soft mt-1 line-clamp-3">{r.issueDescription}</p>
                    <div className="text-[11.5px] text-mid-gray mt-1.5">
                      {r.raisedBy?.name ? `by ${r.raisedBy.name} · ` : ''}{new Date(r.createdAt).toLocaleDateString()}
                      {r.technician?.name ? ` · tech: ${r.technician.name}` : r.technicianName ? ` · tech: ${r.technicianName}` : ''}
                    </div>
                    {/* Manager actions */}
                    {isManager && r.status === 'Pending' && (
                      <div className="flex gap-2 mt-2.5">
                        <Button className="h-7 px-2.5 text-[12px]" onClick={() => act(r._id, 'approve')}>Approve</Button>
                        <Button variant="ghostDanger" className="h-7 px-2.5 text-[12px]" onClick={() => setRejectTarget(r)}>Reject</Button>
                      </div>
                    )}
                    {isManager && r.status === 'Approved' && (
                      <Button className="h-7 px-2.5 text-[12px] mt-2.5" onClick={() => setAssignTarget(r)}>Assign Technician</Button>
                    )}
                    {r.status === 'TechnicianAssigned' && (
                      <Button className="h-7 px-2.5 text-[12px] mt-2.5" onClick={() => act(r._id, 'advance')}>Start work</Button>
                    )}
                    {r.status === 'InProgress' && (
                      <Button className="h-7 px-2.5 text-[12px] mt-2.5" onClick={() => act(r._id, 'advance')}>Mark resolved</Button>
                    )}
                  </Card>
                ))}
              </div>
            </div>
          ))}

          {/* Rejected collapsible side column */}
          {byStatus('Rejected').length > 0 && (
            <div className="w-[240px] shrink-0">
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-[12px] uppercase tracking-[0.05em] text-mid-gray">Rejected</span>
                <Badge soft>{byStatus('Rejected').length}</Badge>
              </div>
              <div className="space-y-2">
                {byStatus('Rejected').map((r) => (
                  <Card key={r._id} className="p-3.5 opacity-75">
                    <span className="font-mono text-[12px] text-mid-gray">{r.asset?.assetTag}</span>
                    <div className="text-[14px] font-medium mt-1">{r.asset?.name}</div>
                    {r.rejectionReason ? <p className="text-[12px] text-mid-gray mt-1">Reason: {r.rejectionReason}</p> : null}
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Raise request modal */}
      {raiseOpen && (
        <RaiseModal
          assets={assets}
          onClose={() => setRaiseOpen(false)}
          onDone={(msg) => { setRaiseOpen(false); setInfo(msg); load(); }}
        />
      )}

      {/* Assign technician modal */}
      {assignTarget && (
        <AssignModal
          request={assignTarget}
          users={users}
          onClose={() => setAssignTarget(null)}
          onDone={(msg) => { setAssignTarget(null); setInfo(msg); load(); }}
        />
      )}

      {/* Reject confirm */}
      <ConfirmModal
        open={!!rejectTarget}
        title="Reject maintenance request?"
        body={rejectTarget ? `"${rejectTarget.asset?.name}" — ${rejectTarget.issueDescription?.slice(0, 80)}` : ''}
        confirmLabel="Reject"
        onCancel={() => setRejectTarget(null)}
        onConfirm={async () => {
          await act(rejectTarget._id, 'reject', {});
          setRejectTarget(null);
        }}
      />
    </div>
  );
}

function RaiseModal({ assets, onClose, onDone }) {
  const [form, setForm] = useState({ assetId: '', issueDescription: '', priority: 'Medium' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      let photo = null;
      const fileInput = document.querySelector('input[name="mPhoto"]');
      if (fileInput?.files?.[0]) {
        const fd = new FormData();
        fd.append('file', fileInput.files[0]);
        const up = await api.post('/uploads', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        photo = up.data.data.url;
      }
      await api.post('/maintenance', { ...form, photo });
      onDone('Maintenance request raised — awaiting approval.');
    } catch (err) { setError(apiError(err)); }
    finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title="Raise maintenance request">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Asset">
          <Select required value={form.assetId} onChange={set('assetId')}>
            <option value="">Select asset…</option>
            {assets.filter((a) => !['Retired', 'Disposed'].includes(a.status)).map((a) => (
              <option key={a._id} value={a._id}>{a.assetTag} · {a.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Issue description">
          <Textarea required minLength={5} value={form.issueDescription} onChange={set('issueDescription')} placeholder="Describe the problem…" />
        </Field>
        <Field label="Priority">
          <Select value={form.priority} onChange={set('priority')}>
            {['Low', 'Medium', 'High', 'Critical'].map((p) => <option key={p}>{p}</option>)}
          </Select>
        </Field>
        <Field label="Photo (optional)">
          <Input type="file" name="mPhoto" accept="image/*" />
        </Field>
        {error && <Banner tone="error">{error}</Banner>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Submitting…' : 'Submit request'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function AssignModal({ request, users, onClose, onDone }) {
  const [mode, setMode] = useState('internal');
  const [technicianId, setTechnicianId] = useState('');
  const [technicianName, setTechnicianName] = useState('');
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/maintenance/${request._id}/assign`, mode === 'internal' ? { technicianId } : { technicianName });
      onDone('Technician assigned.');
    } catch (err) { setError(apiError(err)); }
  };

  return (
    <Modal open onClose={onClose} title="Assign technician">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Technician type">
          <Select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="internal">Internal (user)</option>
            <option value="external">External (name only)</option>
          </Select>
        </Field>
        {mode === 'internal' ? (
          <Field label="User">
            <Select required value={technicianId} onChange={(e) => setTechnicianId(e.target.value)}>
              <option value="">Select user…</option>
              {users.map((u) => <option key={u._id} value={u._id}>{u.name} ({u.email})</option>)}
            </Select>
          </Field>
        ) : (
          <Field label="Technician name">
            <Input required value={technicianName} onChange={(e) => setTechnicianName(e.target.value)} placeholder="ACME Repair Co." />
          </Field>
        )}
        {error && <Banner tone="error">{error}</Banner>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit">Assign</Button>
        </div>
      </form>
    </Modal>
  );
}
