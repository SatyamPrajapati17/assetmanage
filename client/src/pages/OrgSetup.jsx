import { useEffect, useState } from 'react';
import api, { apiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import {
  Badge, Banner, Button, Card, ConfirmModal, Drawer, EmptyState, Field, Input, Loading,
  Modal, PageHeader, Select, Tabs,
} from '../components/ui';

export default function OrgSetup() {
  const [tab, setTab] = useState('departments');

  return (
    <div>
      <PageHeader title="Organization Setup" subtitle="Departments, asset categories, and role management (Admin only)" />
      <Tabs
        tabs={[
          { key: 'departments', label: 'Departments' },
          { key: 'categories', label: 'Asset Categories' },
          { key: 'employees', label: 'Employee Directory' },
        ]}
        active={tab}
        onChange={setTab}
      />
      <div className="mt-5">
        {tab === 'departments' && <DepartmentsTab />}
        {tab === 'categories' && <CategoriesTab />}
        {tab === 'employees' && <EmployeesTab />}
      </div>
    </div>
  );
}

/* ============================================================ Tab A — Departments */
function DepartmentsTab() {
  const [items, setItems] = useState(null);
  const [users, setUsers] = useState([]);
  const [drawer, setDrawer] = useState(null); // {} for new, or department object
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = () => {
    api.get('/departments').then((r) => setItems(r.data.data.items)).catch((e) => setError(apiError(e)));
    api.get('/employees?limit=200').then((r) => setUsers(r.data.data.items)).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-[16px]">Departments</h3>
        <Button onClick={() => setDrawer({})}>New Department</Button>
      </div>
      {error && <Banner tone="error">{error}</Banner>}
      {!items ? <Loading /> : items.length === 0 ? (
        <EmptyState title="No departments yet" hint="Create your first department to get started." />
      ) : (
        <Table head={['Name', 'Head', 'Parent', 'Status', '']}>
          {items.map((d) => (
            <tr key={d._id} className="border-t border-hairline">
              <td className="py-2.5 pr-3 font-medium">{d.name}</td>
              <td className="py-2.5 pr-3">{d.head?.name || '—'}</td>
              <td className="py-2.5 pr-3">{d.parentDepartment?.name || '—'}</td>
              <td className="py-2.5 pr-3"><Badge soft>{d.status}</Badge></td>
              <td className="py-2.5 text-right whitespace-nowrap">
                <button className="text-[13px] underline mr-3" onClick={() => setDrawer(d)}>Edit</button>
                <button className="text-[13px] text-ember underline" onClick={() => setConfirmDelete(d)}>Delete</button>
              </td>
            </tr>
          ))}
        </Table>
      )}

      <Drawer open={!!drawer} onClose={() => setDrawer(null)} title={drawer?.name ? 'Edit Department' : 'New Department'}>
        {drawer && (
          <DeptForm
            initial={drawer}
            users={users}
            departments={items || []}
            onDone={() => { setDrawer(null); load(); }}
          />
        )}
      </Drawer>

      <ConfirmModal
        open={!!confirmDelete}
        title="Delete department?"
        body={`"${confirmDelete?.name}" will be permanently removed. Departments with members, assets or sub-departments cannot be deleted.`}
        confirmLabel="Delete"
        onCancel={() => setConfirmDelete(null)}
        onConfirm={async () => {
          try {
            await api.delete(`/departments/${confirmDelete._id}`);
            setConfirmDelete(null);
            load();
          } catch (e) {
            setConfirmDelete(null);
            setError(apiError(e));
          }
        }}
      />
    </Card>
  );
}

function DeptForm({ initial, users, departments, onDone }) {
  const [form, setForm] = useState({
    name: initial.name || '',
    head: initial.head?._id || initial.head || '',
    parentDepartment: initial.parentDepartment?._id || initial.parentDepartment || '',
    status: initial.status || 'Active',
  });
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        head: form.head || null,
        parentDepartment: form.parentDepartment || null,
      };
      if (initial._id) await api.patch(`/departments/${initial._id}`, payload);
      else await api.post('/departments', payload);
      onDone();
    } catch (err) {
      setError(apiError(err));
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <Banner tone="error">{error}</Banner>}
      <Field label="Name"><Input required value={form.name} onChange={set('name')} /></Field>
      <Field label="Department Head">
        <Select value={form.head} onChange={set('head')}>
          <option value="">— None —</option>
          {users.map((u) => <option key={u._id} value={u._id}>{u.name} ({u.role})</option>)}
        </Select>
      </Field>
      <Field label="Parent Department">
        <Select value={form.parentDepartment} onChange={set('parentDepartment')}>
          <option value="">— None —</option>
          {departments.filter((d) => d._id !== initial._id).map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
        </Select>
      </Field>
      <Field label="Status">
        <Select value={form.status} onChange={set('status')}>
          <option>Active</option>
          <option>Inactive</option>
        </Select>
      </Field>
      <Button type="submit" className="w-full">{initial._id ? 'Save changes' : 'Create department'}</Button>
    </form>
  );
}

/* ============================================================ Tab B — Asset Categories */
function CategoriesTab() {
  const [items, setItems] = useState(null);
  const [drawer, setDrawer] = useState(null);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = () => api.get('/categories').then((r) => setItems(r.data.data.items)).catch((e) => setError(apiError(e)));
  useEffect(() => { load(); }, []);

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-[16px]">Asset Categories</h3>
        <Button onClick={() => setDrawer({})}>New Category</Button>
      </div>
      {error && <Banner tone="error">{error}</Banner>}
      {!items ? <Loading /> : (
        <Table head={['Name', 'Custom Fields', 'Status', '']}>
          {items.map((c) => (
            <tr key={c._id} className="border-t border-hairline">
              <td className="py-2.5 pr-3 font-medium">{c.name}</td>
              <td className="py-2.5 pr-3">
                {c.customFields.length === 0 ? '—' : (
                  <div className="flex flex-wrap gap-1">
                    {c.customFields.map((f) => <Badge key={f.key} soft>{f.label}</Badge>)}
                  </div>
                )}
              </td>
              <td className="py-2.5 pr-3"><Badge soft>{c.status}</Badge></td>
              <td className="py-2.5 text-right whitespace-nowrap">
                <button className="text-[13px] underline mr-3" onClick={() => setDrawer(JSON.parse(JSON.stringify(c)))}>Edit</button>
                <button className="text-[13px] text-ember underline" onClick={() => setConfirmDelete(c)}>Delete</button>
              </td>
            </tr>
          ))}
        </Table>
      )}

      <Drawer open={!!drawer} onClose={() => setDrawer(null)} title={drawer?.name ? 'Edit Category' : 'New Category'}>
        {drawer && <CategoryForm initial={drawer} onDone={() => { setDrawer(null); load(); }} />}
      </Drawer>

      <ConfirmModal
        open={!!confirmDelete}
        title="Delete category?"
        body={`"${confirmDelete?.name}" will be removed. Categories in use by assets cannot be deleted.`}
        confirmLabel="Delete"
        onCancel={() => setConfirmDelete(null)}
        onConfirm={async () => {
          try { await api.delete(`/categories/${confirmDelete._id}`); setConfirmDelete(null); load(); }
          catch (e) { setConfirmDelete(null); setError(apiError(e)); }
        }}
      />
    </Card>
  );
}

function CategoryForm({ initial, onDone }) {
  const [name, setName] = useState(initial.name || '');
  const [fields, setFields] = useState(initial.customFields || []);
  const [error, setError] = useState('');

  const addField = () => setFields((f) => [...f, { key: '', label: '', type: 'text' }]);
  const updField = (i, k, v) => setFields((f) => f.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const rmField = (i) => setFields((f) => f.filter((_, j) => j !== i));

  const submit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        name,
        customFields: fields.filter((f) => f.key && f.label).map((f) => ({ ...f, key: f.key.trim() })),
      };
      if (initial._id) await api.patch(`/categories/${initial._id}`, payload);
      else await api.post('/categories', payload);
      onDone();
    } catch (err) { setError(apiError(err)); }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <Banner tone="error">{error}</Banner>}
      <Field label="Name"><Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Electronics" /></Field>
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[12px] uppercase tracking-[0.05em] text-mid-gray">Custom fields</span>
          <button type="button" className="text-[13px] underline" onClick={addField}>+ Add field</button>
        </div>
        <div className="space-y-2">
          {fields.length === 0 && <p className="text-[13px] text-mid-gray">No custom fields — e.g. add “Warranty (months)”.</p>}
          {fields.map((f, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 items-center">
              <Input required placeholder="key (e.g. warranty)" value={f.key} onChange={(e) => updField(i, 'key', e.target.value)} />
              <Input required placeholder="Label" value={f.label} onChange={(e) => updField(i, 'label', e.target.value)} />
              <Select value={f.type} onChange={(e) => updField(i, 'type', e.target.value)}>
                <option value="text">text</option>
                <option value="number">number</option>
                <option value="date">date</option>
                <option value="boolean">boolean</option>
              </Select>
              <button type="button" className="text-ember px-1" onClick={() => rmField(i)}>×</button>
            </div>
          ))}
        </div>
      </div>
      <Button type="submit" className="w-full">{initial._id ? 'Save changes' : 'Create category'}</Button>
    </form>
  );
}

/* ============================================================ Tab C — Employee Directory */
function EmployeesTab() {
  const { user: meRaw } = useAuth();
  const me = { _id: meRaw?.id || meRaw?._id };
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [departments, setDepartments] = useState([]);
  const [manage, setManage] = useState(null);
  const [error, setError] = useState('');

  const load = () => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (deptFilter) params.set('department', deptFilter);
    api.get(`/employees?${params}`).then((r) => setData(r.data.data)).catch((e) => setError(apiError(e)));
  };
  useEffect(() => { load(); }, [q, deptFilter]);
  useEffect(() => { api.get('/departments').then((r) => setDepartments(r.data.data.items)).catch(() => {}); }, []);

  return (
    <Card>
      <div className="flex flex-wrap gap-2 mb-4">
        <Input placeholder="Search name or email…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <Select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="max-w-[200px]">
          <option value="">All departments</option>
          {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
        </Select>
      </div>
      {error && <Banner tone="error">{error}</Banner>}
      {!data ? <Loading /> : (
        <Table head={['Name', 'Email', 'Department', 'Role', 'Status', '']}>
          {data.items.map((u) => (
            <tr key={u._id} className="border-t border-hairline">
              <td className="py-2.5 pr-3 font-medium">{u.name}{u._id === me._id ? ' (you)' : ''}</td>
              <td className="py-2.5 pr-3 text-mid-gray">{u.email}</td>
              <td className="py-2.5 pr-3">{u.department?.name || '—'}</td>
              <td className="py-2.5 pr-3">
                <Badge soft>{ROLE_LABELS[u.role] || u.role}</Badge>
              </td>
              <td className="py-2.5 pr-3"><Badge soft>{u.status}</Badge></td>
              <td className="py-2.5 text-right">
                <button className="text-[13px] underline" onClick={() => setManage(u)}>Manage Role</button>
              </td>
            </tr>
          ))}
        </Table>
      )}

      <Modal open={!!manage} onClose={() => setManage(null)} title="Manage Role" width="max-w-md">
        {manage && <RoleForm user={manage} departments={departments} onDone={() => { setManage(null); load(); }} />}
      </Modal>
    </Card>
  );
}

const ROLE_LABELS = { employee: 'Employee', departmentHead: 'Department Head', assetManager: 'Asset Manager', admin: 'Admin' };

function RoleForm({ user, departments, onDone }) {
  const { user: meRaw } = useAuth();
  const meId = meRaw?.id || meRaw?._id;
  const [role, setRole] = useState(user.role);
  const [status, setStatus] = useState(user.status);
  const [department, setDepartment] = useState(user.department?._id || user.department || '');
  const [error, setError] = useState('');

  const submit = async () => {
    try {
      await api.patch(`/employees/${user._id}/role`, {
        role: String(user._id) === String(meId) ? undefined : role,
        status,
        department: department || null,
      });
      onDone();
    } catch (err) { setError(apiError(err)); }
  };

  return (
    <div className="space-y-4">
      {error && <Banner tone="error">{error}</Banner>}
      <div>
        <div className="font-medium">{user.name}</div>
        <div className="text-[13px] text-mid-gray">{user.email}</div>
      </div>
      <Field label="Role" hint="This is the only place in the product where a role can change.">
        <Select value={role} disabled={String(user._id) === String(meId)} onChange={(e) => setRole(e.target.value)}>
          <option value="employee">Employee</option>
          <option value="departmentHead">Department Head</option>
          <option value="assetManager">Asset Manager</option>
          <option value="admin">Admin</option>
        </Select>
      </Field>
      <Field label="Department">
        <Select value={department} onChange={(e) => setDepartment(e.target.value)}>
          <option value="">— None —</option>
          {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
        </Select>
      </Field>
      <Field label="Status">
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option>Active</option>
          <option>Inactive</option>
        </Select>
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>Cancel</Button>
        <Button onClick={submit}>Save</Button>
      </div>
    </div>
  );
}

/* ============================================================ Shared table shell */
export function Table({ head, children }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[14px]">
        <thead>
          <tr className="text-left text-[12px] uppercase tracking-[0.05em] text-mid-gray">
            {head.map((h, i) => <th key={i} className="py-2 pr-3 font-medium">{h}</th>)}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
