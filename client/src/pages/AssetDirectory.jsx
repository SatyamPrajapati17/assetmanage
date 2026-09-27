import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api, { apiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import {
  Badge, Banner, Button, Card, Drawer, EmptyState, Field, Input, Loading, PageHeader,
  Select, Tabs,
} from '../components/ui';

const STATUSES = ['Available', 'Allocated', 'Reserved', 'Under Maintenance', 'Lost', 'Retired', 'Disposed'];

export default function AssetDirectory() {
  const { role } = useAuth();
  const [params] = useSearchParams();

  const [data, setData] = useState(null);
  const [q, setQ] = useState(params.get('q') || '');
  const [filters, setFilters] = useState({ status: '', category: '', department: '', location: '' });
  const [categories, setCategories] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [registerOpen, setRegisterOpen] = useState(params.get('register') === '1');
  const [detail, setDetail] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [error, setError] = useState('');

  const canRegister = role === 'assetManager' || role === 'admin';

  const load = () => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    Object.entries(filters).forEach(([k, v]) => v && p.set(k, v));
    api.get(`/assets?${p}`).then((r) => setData(r.data.data)).catch((e) => setError(apiError(e)));
  };
  useEffect(() => { load(); }, [q, filters]);

  useEffect(() => {
    api.get('/categories').then((r) => setCategories(r.data.data.items)).catch(() => {});
    api.get('/departments').then((r) => setDepartments(r.data.data.items)).catch(() => {});
  }, []);

  const openDetail = (asset) => {
    setDetail(asset);
    api.get(`/assets/${asset._id}`).then((r) => setDetailData(r.data.data)).catch(() => setDetailData(null));
  };

  return (
    <div>
      <PageHeader
        title="Asset Directory"
        subtitle="Register, search and browse every asset with its lifecycle status"
        actions={canRegister && <Button onClick={() => setRegisterOpen(true)}>Register Asset</Button>}
      />

      {/* Search + filter chips */}
      <Card className="mb-4">
        <div className="flex flex-wrap gap-2 items-center">
          <Input
            placeholder="Search by Asset Tag, name, serial or QR…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="flex-1 min-w-[220px]"
          />
          <Select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} className="w-[170px]">
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </Select>
          <Select value={filters.category} onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))} className="w-[160px]">
            <option value="">All categories</option>
            {categories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
          </Select>
          <Select value={filters.department} onChange={(e) => setFilters((f) => ({ ...f, department: e.target.value }))} className="w-[170px]">
            <option value="">All departments</option>
            {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
          </Select>
          <Input
            placeholder="Location…"
            value={filters.location}
            onChange={(e) => setFilters((f) => ({ ...f, location: e.target.value }))}
            className="w-[150px]"
          />
        </div>
      </Card>

      {error && <Banner tone="error">{error}</Banner>}
      {!data ? (
        <Loading />
      ) : data.items.length === 0 ? (
        <Card><EmptyState title="No assets match" hint="Adjust the filters or register a new asset." /></Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {data.items.map((a) => (
            <button key={a._id} onClick={() => openDetail(a)} className="text-left">
              <Card className="h-full hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono text-[12px] text-mid-gray">{a.assetTag}</span>
                  <Badge status={a.status}>{a.status}</Badge>
                </div>
                <div className="font-medium mt-2 text-[15px] leading-snug">{a.name}</div>
                <div className="text-[13px] text-mid-gray mt-1">
                  {a.category?.name || 'Uncategorized'} · {a.location || 'No location'}
                </div>
                {a.isBookable ? <Badge soft className="mt-2">Bookable</Badge> : null}
              </Card>
            </button>
          ))}
        </div>
      )}

      {/* Register drawer */}
      <Drawer open={registerOpen} onClose={() => setRegisterOpen(false)} title="Register Asset" width="max-w-lg">
        <RegisterForm
          categories={categories}
          departments={departments}
          onDone={(asset) => {
            setRegisterOpen(false);
            load();
            if (asset) openDetail(asset);
          }}
        />
      </Drawer>

      {/* Detail modal */}
      <ModalishDetail
        open={!!detail}
        onClose={() => { setDetail(null); setDetailData(null); }}
        data={detailData}
        onChanged={() => detail && openDetail(detail)}
      />
    </div>
  );
}

/* ============================================================ Register form (multi-section) */
function RegisterForm({ categories, departments, onDone }) {
  const [form, setForm] = useState({
    name: '', category: '', serialNumber: '', condition: 'New', location: '',
    department: '', acquisitionDate: '', acquisitionCost: '', isBookable: false,
  });
  const [custom, setCustom] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const category = categories.find((c) => c._id === form.category);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('name', form.name);
      fd.append('category', form.category);
      if (form.serialNumber) fd.append('serialNumber', form.serialNumber);
      fd.append('condition', form.condition);
      if (form.location) fd.append('location', form.location);
      if (form.department) fd.append('department', form.department);
      if (form.acquisitionDate) fd.append('acquisitionDate', form.acquisitionDate);
      if (form.acquisitionCost) fd.append('acquisitionCost', form.acquisitionCost);
      fd.append('isBookable', form.isBookable);
      fd.append('customFieldValues', JSON.stringify(custom));
      const photos = document.querySelector('input[name="photos"]')?.files;
      if (photos) Array.from(photos).forEach((f) => fd.append('photos', f));

      const res = await api.post('/assets', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      onDone(res.data.data.asset);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <Banner tone="error">{error}</Banner>}

      <div className="text-[12px] uppercase tracking-[0.05em] text-mid-gray">Basic info</div>
      <Field label="Name"><Input required value={form.name} onChange={set('name')} placeholder="Dell XPS 15 Laptop" /></Field>
      <Field label="Category">
        <Select required value={form.category} onChange={set('category')}>
          <option value="">Select category…</option>
          {categories.filter((c) => c.status === 'Active').map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
        </Select>
      </Field>

      {/* Category-driven custom fields (FR-4.1) */}
      {category && category.customFields.length > 0 && (
        <>
          <div className="text-[12px] uppercase tracking-[0.05em] text-mid-gray">
            {category.name} custom fields
          </div>
          <div className="grid grid-cols-2 gap-3">
            {category.customFields.map((f) => (
              <Field key={f.key} label={f.label}>
                {f.type === 'boolean' ? (
                  <Select value={custom[f.key] ?? ''} onChange={(e) => setCustom((c) => ({ ...c, [f.key]: e.target.value === 'true' }))}>
                    <option value="">—</option>
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </Select>
                ) : (
                  <Input
                    type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                    value={custom[f.key] ?? ''}
                    onChange={(e) => setCustom((c) => ({ ...c, [f.key]: e.target.value }))}
                  />
                )}
              </Field>
            ))}
          </div>
        </>
      )}

      <div className="text-[12px] uppercase tracking-[0.05em] text-mid-gray">Acquisition</div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Serial number"><Input value={form.serialNumber} onChange={set('serialNumber')} /></Field>
        <Field label="Condition">
          <Select value={form.condition} onChange={set('condition')}>
            {['New', 'Good', 'Fair', 'Poor', 'Damaged'].map((c) => <option key={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="Acquisition date"><Input type="date" value={form.acquisitionDate} onChange={set('acquisitionDate')} /></Field>
        <Field label="Acquisition cost" hint="Report-only — not linked to accounting"><Input type="number" min="0" value={form.acquisitionCost} onChange={set('acquisitionCost')} /></Field>
        <Field label="Location"><Input value={form.location} onChange={set('location')} placeholder="HQ · Floor 2" /></Field>
        <Field label="Owning department">
          <Select value={form.department} onChange={set('department')}>
            <option value="">— None —</option>
            {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
          </Select>
        </Field>
      </div>

      <Field label="Photo">
        <Input type="file" name="photos" accept="image/*" multiple />
      </Field>

      <label className="flex items-center gap-2 text-[14px]">
        <input type="checkbox" checked={form.isBookable} onChange={set('isBookable')} />
        Shared / bookable resource
      </label>

      <p className="text-[12px] text-mid-gray">Asset Tag is auto-generated on save (e.g. AF-0007) and a QR code is created automatically.</p>
      <Button type="submit" disabled={busy} className="w-full h-10">{busy ? 'Registering…' : 'Register asset'}</Button>
    </form>
  );
}

/* ============================================================ Asset detail (modal with tabs) */
function ModalishDetail({ open, onClose, data, onChanged }) {
  const [tab, setTab] = useState('overview');
  const { role } = useAuth();
  useEffect(() => setTab('overview'), [open]);

  if (!open) return null;
  const asset = data?.asset;

  return (
    <Drawer open={open} onClose={onClose} title={asset ? `${asset.assetTag} · ${asset.name}` : 'Asset detail'} width="max-w-2xl">
      {!data ? <Loading /> : (
        <>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            {asset.qrCode && (
              <img src={asset.qrCode} alt={`QR for ${asset.assetTag}`} className="w-20 h-20 border border-hairline rounded-xl" />
            )}
            <div className="flex-1">
              <Badge status={asset.status}>{asset.status}</Badge>
              <div className="text-[13px] text-mid-gray mt-1">
                {asset.category?.name} · {asset.location || 'No location'} · {asset.condition}
                {asset.serialNumber ? ` · SN ${asset.serialNumber}` : ''}
              </div>
            </div>
          </div>

          <Tabs
            tabs={[
              { key: 'overview', label: 'Overview' },
              { key: 'allocations', label: 'Allocation History' },
              { key: 'maintenance', label: 'Maintenance History' },
            ]}
            active={tab}
            onChange={setTab}
          />

          <div className="mt-4">
            {tab === 'overview' && <Overview data={data} role={role} onChanged={onChanged} />}
            {tab === 'allocations' && <AllocationHistory items={data.allocationHistory} />}
            {tab === 'maintenance' && <MaintenanceHistory items={data.maintenanceHistory} />}
          </div>
        </>
      )}
    </Drawer>
  );
}

function Overview({ data, role, onChanged }) {
  const { asset, holder } = data;
  const [error, setError] = useState('');
  const canManage = role === 'assetManager' || role === 'admin';

  const setStatus = async (status) => {
    try {
      await api.patch(`/assets/${asset._id}/status`, { status });
      onChanged();
    } catch (e) { setError(apiError(e)); }
  };

  return (
    <div className="space-y-4">
      {error && <Banner tone="error">{error}</Banner>}
      {holder && (
        <Banner tone="info" title="Currently held">
          {holder.kind === 'Employee' ? holder.name : `${holder.kind}: ${holder.name}`} — allocated{' '}
          {holder.allocationDate ? new Date(holder.allocationDate).toLocaleDateString() : ''}
        </Banner>
      )}

      {canManage && (
        <div className="flex flex-wrap gap-2">
          {asset.status === 'Available' && (
            <Button onClick={() => setStatus('Reserved')}>Mark Reserved</Button>
          )}
          {asset.status === 'Reserved' && <Button onClick={() => setStatus('Available')}>Release reservation</Button>}
          {['Available', 'Lost'].includes(asset.status) && (
            <Button variant="secondary" onClick={() => setStatus('Retired')}>Retire</Button>
          )}
          {asset.status === 'Retired' && (
            <Button variant="danger" onClick={() => setStatus('Disposed')}>Dispose</Button>
          )}
          {asset.status === 'Lost' && (
            <Button variant="secondary" onClick={() => setStatus('Available')}>Mark recovered</Button>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 text-[14px]">
        <InfoRow label="Acquisition date">{asset.acquisitionDate ? new Date(asset.acquisitionDate).toLocaleDateString() : '—'}</InfoRow>
        <InfoRow label="Acquisition cost">{asset.acquisitionCost != null ? `$${asset.acquisitionCost.toLocaleString()}` : '—'}</InfoRow>
        <InfoRow label="Bookable">{asset.isBookable ? 'Yes' : 'No'}</InfoRow>
        <InfoRow label="Department">{asset.department?.name || '—'}</InfoRow>
      </div>

      {Object.keys(asset.customFieldValues || {}).length > 0 && (
        <>
          <div className="text-[12px] uppercase tracking-[0.05em] text-mid-gray">Custom fields</div>
          <div className="grid grid-cols-2 gap-3 text-[14px]">
            {Object.entries(asset.customFieldValues).map(([k, v]) => <InfoRow key={k} label={k}>{String(v)}</InfoRow>)}
          </div>
        </>
      )}
    </div>
  );
}

function InfoRow({ label, children }) {
  return (
    <div>
      <div className="text-[12px] uppercase tracking-[0.05em] text-mid-gray">{label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

function AllocationHistory({ items }) {
  if (!items?.length) return <EmptyState title="Never allocated" />;
  return (
    <Tableish
      rows={items.map((a) => ({
        main: a.allocatedTo?.employee?.name || a.allocatedTo?.department?.name || '—',
        meta: `Allocated ${new Date(a.allocationDate).toLocaleDateString()}${a.expectedReturnDate ? ` · expected back ${new Date(a.expectedReturnDate).toLocaleDateString()}` : ''}`,
        badge: a.status,
        right: a.returnConditionNotes || '',
      }))}
    />
  );
}

function MaintenanceHistory({ items }) {
  if (!items?.length) return <EmptyState title="No maintenance history" />;
  return (
    <Tableish
      rows={items.map((m) => ({
        main: m.issueDescription?.slice(0, 80),
        meta: `Raised by ${m.raisedBy?.name || '—'} · ${new Date(m.createdAt).toLocaleDateString()}${m.technicianName ? ` · tech: ${m.technicianName}` : m.technician ? ` · tech: ${m.technician.name}` : ''}`,
        badge: m.status,
        right: '',
      }))}
    />
  );
}

function Tableish({ rows }) {
  return (
    <ul className="divide-y divide-hairline">
      {rows.map((r, i) => (
        <li key={i} className="py-3 flex items-start justify-between gap-3">
          <div>
            <div className="text-[14px] font-medium">{r.main}</div>
            <div className="text-[12px] text-mid-gray mt-0.5">{r.meta}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {r.right ? <span className="text-[12px] text-mid-gray max-w-[180px]">{r.right}</span> : null}
            <Badge status={r.badge}>{String(r.badge)}</Badge>
          </div>
        </li>
      ))}
    </ul>
  );
}
