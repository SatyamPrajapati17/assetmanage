import { useEffect, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import api from '../api/client';
import { Badge, Banner, Button, Card, EmptyState, Loading, PageHeader, Select } from '../components/ui';
import { Table } from './OrgSetup';

export default function Reports() {
  const [departments, setDepartments] = useState([]);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/departments').then((r) => setDepartments(r.data.data.items)).catch(() => {});
    api.get('/categories').then((r) => setCategories(r.data.data.items)).catch(() => {});
  }, []);

  return (
    <div>
      <PageHeader title="Reports & Analytics" subtitle="Utilization, maintenance load, retirement risk and booking patterns" />

      {/* Filter bar (FR-9 filters feed client-side into per-report fetches) */}
      <Card className="mb-4">
        <div className="flex flex-wrap gap-2">
          <Select className="w-[190px]" defaultValue="">
            <option value="">All departments</option>
            {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
          </Select>
          <Select className="w-[170px]" defaultValue="">
            <option value="">All categories</option>
            {categories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
          </Select>
          <Inputish type="date" className="w-[160px]" />
          <Inputish type="date" className="w-[160px]" />
        </div>
      </Card>

      {error && <Banner tone="error">{error}</Banner>}

      <div className="grid lg:grid-cols-2 gap-4">
        <UtilizationReport />
        <MaintenanceFrequency />
        <NearingRetirement />
        <DepartmentSummary />
        <div className="lg:col-span-2"><BookingHeatmap /></div>
      </div>
    </div>
  );
}

function Inputish(props) {
  return (
    <input
      className="h-9 rounded-pill bg-canvas px-3 text-[14px] border border-transparent focus:border-hairline"
      {...props}
    />
  );
}

/* ---------------------------------------------------------- FR-9.1 utilization */
function UtilizationReport() {
  const [data, setData] = useState(null);
  useEffect(() => {
    api.get('/reports/utilization').then((r) => setData(r.data.data)).catch(() => setData({ rows: [] }));
  }, []);
  if (!data) return <Card><Loading /></Card>;

  const top = data.rows.slice(0, 8);
  const idle = data.rows.filter((r) => r.uses === 0).length;

  return (
    <Card>
      <ReportHead title="Asset Utilization" sub={`${idle} idle asset(s) · most-used top ${top.length}`} onExport={() => exportCsv('utilization.csv', data.csv)} />
      {top.length === 0 ? <EmptyState title="No data yet" /> : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={top} layout="vertical" margin={{ left: 8, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
            <Tooltip cursor={{ fill: '#f5f5f5' }} />
            <Bar dataKey="uses" name="Total uses" fill="#0a0a0a" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

/* ---------------------------------------------------------- FR-9.2 maintenance frequency */
function MaintenanceFrequency() {
  const [data, setData] = useState(null);
  useEffect(() => {
    api.get('/reports/maintenance-frequency').then((r) => setData(r.data.data)).catch(() => setData({ byAsset: [] }));
  }, []);
  if (!data) return <Card><Loading /></Card>;

  return (
    <Card>
      <ReportHead title="Maintenance Frequency" sub="Requests per asset (top 10)" onExport={() => exportCsv('maintenance-frequency.csv', data.csv)} />
      {data.byAsset.length === 0 ? <EmptyState title="No maintenance history" /> : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data.byAsset.slice(0, 10)}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
            <XAxis dataKey="assetTag" tick={{ fontSize: 10 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip cursor={{ fill: '#f5f5f5' }} />
            <Bar dataKey="count" name="Requests" fill="#0a0a0a" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
      {data.byCategory?.length ? (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {data.byCategory.slice(0, 6).map((c) => <Badge key={c._id} soft>{c._id}: {c.count}</Badge>)}
        </div>
      ) : null}
    </Card>
  );
}

/* ---------------------------------------------------------- FR-9.3 nearing retirement */
function NearingRetirement() {
  const [data, setData] = useState(null);
  useEffect(() => {
    api.get('/reports/nearing-retirement').then((r) => setData(r.data.data)).catch(() => setData({ rows: [] }));
  }, []);
  if (!data) return <Card><Loading /></Card>;

  return (
    <Card>
      <ReportHead title="Nearing Retirement" sub="Age + condition risk heuristic" onExport={() => exportCsv('retirement-risk.csv', data.csv)} />
      {data.rows.length === 0 ? <EmptyState title="No assets" /> : (
        <Table head={['Asset', 'Condition', 'Age', 'Flag']}>
          {data.rows.slice(0, 8).map((r) => (
            <tr key={r.assetTag} className="border-t border-hairline">
              <td className="py-2 pr-3">
                <span className="font-mono text-[12px] text-mid-gray mr-1.5">{r.assetTag}</span>
                {r.name}
              </td>
              <td className="py-2 pr-3">{r.condition}</td>
              <td className="py-2 pr-3">{r.ageYears != null ? `${r.ageYears}y` : '—'}</td>
              <td className="py-2 pr-3">
                <Badge soft>{r.flag}</Badge>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}

/* ---------------------------------------------------------- FR-9.4 department summary */
function DepartmentSummary() {
  const [data, setData] = useState(null);
  useEffect(() => {
    api.get('/reports/department-summary').then((r) => setData(r.data.data)).catch(() => setData({ rows: [] }));
  }, []);
  if (!data) return <Card><Loading /></Card>;

  return (
    <Card>
      <ReportHead title="Department Allocation Summary" sub="Active allocations & asset counts" onExport={() => exportCsv('department-summary.csv', data.csv)} />
      {data.rows.length === 0 ? <EmptyState title="No departments" /> : (
        <Table head={['Department', 'Active allocations', 'Assets owned']}>
          {data.rows.map((r) => (
            <tr key={r.department} className="border-t border-hairline">
              <td className="py-2 pr-3 font-medium">{r.department}</td>
              <td className="py-2 pr-3">{r.activeAllocations}</td>
              <td className="py-2 pr-3">{r.totalAssets}</td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}

/* ---------------------------------------------------------- FR-9.5 booking heatmap */
function BookingHeatmap() {
  const [grid, setGrid] = useState(null);
  const [csv, setCsv] = useState('');
  useEffect(() => {
    api.get('/reports/booking-heatmap').then((r) => { setGrid(r.data.data.grid); setCsv(r.data.data.csv); }).catch(() => setGrid({}));
  }, []);
  if (!grid) return <Card><Loading /></Card>;

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const hours = Array.from({ length: 15 }, (_, i) => i + 7); // 07:00–21:00
  const max = Math.max(1, ...days.flatMap((d) => hours.map((h) => grid[d]?.[h] || 0)));

  return (
    <Card>
      <ReportHead title="Booking Heatmap" sub="Peak usage windows — hour × day" onExport={() => exportCsv('booking-heatmap.csv', csv)} />
      <div className="overflow-x-auto">
        <table className="border-separate" style={{ borderSpacing: 2 }}>
          <thead>
            <tr>
              <th />
              {hours.map((h) => <th key={h} className="text-[10px] text-mid-gray font-medium w-8">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d}>
                <td className="text-[11px] text-mid-gray pr-1.5">{d}</td>
                {hours.map((h) => {
                  const v = grid[d]?.[h] || 0;
                  const intensity = v / max;
                  return (
                    <td key={h}>
                      <div
                        title={`${d} ${h}:00 — ${v} booking(s)`}
                        className="h-6 w-8 rounded-md"
                        style={{
                          background: v === 0 ? '#fafafa' : `rgba(10,10,10,${0.12 + intensity * 0.88})`,
                          border: '1px solid #e5e5e5',
                        }}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------- shared bits */
function ReportHead({ title, sub, onExport }) {
  return (
    <div className="flex items-start justify-between mb-3">
      <div>
        <h3 className="font-semibold text-[16px]">{title}</h3>
        {sub ? <p className="text-[12.5px] text-mid-gray mt-0.5">{sub}</p> : null}
      </div>
      <Button variant="outline" className="h-8 px-3 text-[12.5px]" onClick={onExport}>Export CSV</Button>
    </div>
  );
}

function exportCsv(filename, csv) {
  if (!csv) return;
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
