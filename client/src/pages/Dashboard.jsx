import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import { Badge, Button, Card, ErrorState, Loading, PageHeader, Stat } from '../components/ui';

export default function Dashboard() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/dashboard/summary')
      .then((res) => setData(res.data.data))
      .catch((err) => setError(err?.response?.data?.error?.message || 'Failed to load dashboard'));
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!data) return <Loading />;

  const k = data.kpis;

  const ROLE_LABEL = { admin: 'Admin', assetManager: 'Asset Manager', departmentHead: 'Department Head', employee: 'Employee' };

  return (
    <div>
      <PageHeader
        title={`Good day, ${user?.name?.split(' ')[0]}`}
        subtitle={`${ROLE_LABEL[role] || role} view · ${new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`}
        actions={
          <>
            {(role === 'assetManager' || role === 'admin') && (
              <Button onClick={() => navigate('/assets?register=1')}>Register Asset</Button>
            )}
            <Button variant="secondary" onClick={() => navigate('/booking')}>Book Resource</Button>
            <Button variant="secondary" onClick={() => navigate('/maintenance')}>Raise Maintenance Request</Button>
          </>
        }
      />

      {/* KPI row — 6 stat blocks */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-5">
        {[
          ['Assets Available', k.assetsAvailable],
          ['Assets Allocated', k.assetsAllocated],
          ['Maintenance Today', k.maintenanceToday],
          ['Active Bookings', k.activeBookings],
          ['Pending Transfers', k.pendingTransfers],
          ['Upcoming Returns', k.upcomingReturns],
        ].map(([label, value]) => (
          <Card key={label}><Stat label={label} value={value} /></Card>
        ))}
      </div>

      {/* Overdue (ember-accented) + Upcoming returns */}
      <div className="grid md:grid-cols-2 gap-4 mb-5">
        <Card className={data.overdueReturns.count > 0 ? 'border-ember' : ''}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-[16px]">Overdue Returns</h3>
            <Badge status={data.overdueReturns.count > 0 ? 'Missing' : 'Verified'}>
              {data.overdueReturns.count} overdue
            </Badge>
          </div>
          {data.overdueReturns.items.length === 0 ? (
            <p className="text-[14px] text-mid-gray">Nothing overdue — all returns on schedule.</p>
          ) : (
            <ul className="divide-y divide-hairline">
              {data.overdueReturns.items.map((a) => (
                <li key={a._id} className="py-2.5 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[14px] font-medium">
                      {a.asset?.assetTag} · {a.asset?.name}
                    </div>
                    <div className="text-[12px] text-mid-gray">
                      Held by {a.allocatedTo?.employee?.name || a.allocatedTo?.department?.name || '—'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[13px] text-ember font-medium">
                      Due {new Date(a.expectedReturnDate).toLocaleDateString()}
                    </div>
                    <Link to="/allocation" className="text-[12px] text-mid-gray hover:text-ink underline">Review</Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h3 className="font-semibold text-[16px] mb-3">Upcoming Returns (next 7 days)</h3>
          {data.upcomingReturnsList.length === 0 ? (
            <p className="text-[14px] text-mid-gray">No returns due this week.</p>
          ) : (
            <ul className="divide-y divide-hairline">
              {data.upcomingReturnsList.map((a) => (
                <li key={a._id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="text-[14px]">
                    <span className="font-medium">{a.asset?.assetTag}</span> · {a.asset?.name}
                    <span className="text-[12px] text-mid-gray block">
                      Held by {a.allocatedTo?.employee?.name || a.allocatedTo?.department?.name || '—'}
                    </span>
                  </div>
                  <Badge soft>Due {new Date(a.expectedReturnDate).toLocaleDateString()}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Two-column: activity feed + booking preview */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <h3 className="font-semibold text-[16px] mb-3">Recent Activity</h3>
          {data.recentActivity.length === 0 ? (
            <p className="text-[14px] text-mid-gray">No activity yet.</p>
          ) : (
            <ul className="space-y-2.5">
              {data.recentActivity.map((a) => (
                <li key={a._id} className="flex items-start gap-3 text-[13.5px]">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-mid-gray shrink-0" />
                  <div>
                    <span className="font-medium">{a.actor?.name || 'System'}</span>{' '}
                    <span className="text-mid-gray">{formatAction(a.action)}</span>{' '}
                    {a.metadata?.assetTag ? <span className="font-mono text-[12px]">{a.metadata.assetTag}</span> : null}
                    <div className="text-[11.5px] text-mid-gray">{new Date(a.timestamp).toLocaleString()}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-[16px]">Upcoming Bookings</h3>
            <Link to="/booking" className="text-[13px] text-mid-gray hover:text-ink underline">Open calendar</Link>
          </div>
          {data.bookingPreview.length === 0 ? (
            <p className="text-[14px] text-mid-gray">No upcoming bookings.</p>
          ) : (
            <ul className="divide-y divide-hairline">
              {data.bookingPreview.map((b) => (
                <li key={b._id} className="py-2.5 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[14px] font-medium">{b.resource?.name}</div>
                    <div className="text-[12px] text-mid-gray">
                      {new Date(b.start).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      {' → '}
                      {new Date(b.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {b.bookedBy?.name ? ` · ${b.bookedBy.name}` : ''}
                    </div>
                  </div>
                  <Badge status={b.status}>{b.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function formatAction(action) {
  return String(action || '')
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
