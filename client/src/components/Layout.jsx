import { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import { Badge } from './ui';

/** Role-filtered nav (UI Flow §1 matrix). */
function navItems(role) {
  const isManager = role === 'assetManager' || role === 'admin';
  return [
    { to: '/', label: 'Dashboard', show: true },
    { to: '/org-setup', label: 'Organization Setup', show: role === 'admin' },
    { to: '/assets', label: 'Asset Directory', show: true },
    { to: '/allocation', label: 'Allocation & Transfer', show: true },
    { to: '/booking', label: 'Resource Booking', show: true },
    { to: '/maintenance', label: 'Maintenance', show: true },
    { to: '/audit', label: 'Audit', show: isManager },
    { to: '/reports', label: 'Reports', show: true },
    { to: '/logs', label: 'Activity Logs', show: true },
  ];
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const navigate = useNavigate();
  const ref = useRef(null);

  const load = () => {
    api.get('/notifications').then((res) => {
      setItems(res.data.data.items);
      setUnread(res.data.data.unread);
    }).catch(() => {});
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 15000); // light polling for demo freshness
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const markRead = async (n) => {
    if (!n.read) {
      await api.post(`/notifications/${n._id}/read`).catch(() => {});
      load();
    }
    if (n.relatedEntity?.kind === 'Booking') navigate('/booking');
    if (n.relatedEntity?.kind === 'MaintenanceRequest') navigate('/maintenance');
    if (n.relatedEntity?.kind === 'Allocation') navigate('/allocation');
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative h-9 w-9 rounded-pill bg-canvas hover:bg-hairline flex items-center justify-center"
        aria-label="Notifications"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-pill bg-ember text-[#fafafa] text-[10px] font-semibold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-96 max-w-[90vw] bg-paper border border-hairline rounded-card shadow-card overflow-hidden z-40">
          <div className="flex items-center justify-between px-4 py-3 border-b border-hairline">
            <span className="font-semibold text-[14px]">Notifications</span>
            <button
              className="text-[12px] text-mid-gray hover:text-ink"
              onClick={async () => { await api.post('/notifications/read-all').catch(() => {}); load(); }}
            >
              Mark all read
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto divide-y divide-hairline">
            {items.length === 0 && <div className="px-4 py-6 text-center text-mid-gray text-[14px]">No notifications yet</div>}
            {items.map((n) => (
              <button
                key={n._id}
                onClick={() => markRead(n)}
                className={`w-full text-left px-4 py-3 hover:bg-surface-alt transition-colors ${n.read ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start gap-2">
                  {!n.read && <span className="mt-1.5 h-2 w-2 rounded-full bg-ember shrink-0" />}
                  <div>
                    <div className="text-[13px]">{n.message}</div>
                    <div className="text-[11px] text-mid-gray mt-0.5">
                      {n.type} · {new Date(n.createdAt).toLocaleString()}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Layout({ children }) {
  const { user, logout, role } = useAuth();
  const navigate = useNavigate();
  const [userMenu, setUserMenu] = useState(false);
  const [search, setSearch] = useState('');

  const items = navItems(role);

  const ROLE_LABEL = {
    admin: 'Admin',
    assetManager: 'Asset Manager',
    departmentHead: 'Department Head',
    employee: 'Employee',
  };

  const submitSearch = (e) => {
    e.preventDefault();
    navigate(`/assets?q=${encodeURIComponent(search)}`);
  };

  return (
    <div className="min-h-screen flex">
      {/* Sidebar — surface #fafafa per DESIGN.md */}
      <aside className="w-60 shrink-0 bg-surface-alt border-r border-hairline hidden md:flex flex-col">
        <div className="px-5 pt-6 pb-5">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-ink" />
            <span className="font-semibold text-[16px] tracking-[-0.01em]">AssetFlow</span>
          </div>
          <div className="text-[11px] text-mid-gray mt-1 uppercase tracking-[0.05em]">Asset & Resource ERP</div>
        </div>
        <nav className="flex-1 px-3 space-y-0.5">
          {items.filter((i) => i.show).map((i) => (
            <NavLink
              key={i.to}
              to={i.to}
              end={i.to === '/'}
              className={({ isActive }) =>
                `block rounded-pill px-3.5 h-9 leading-9 text-[13.5px] transition-colors ${
                  isActive ? 'bg-paper shadow-card font-medium' : 'text-ink-soft hover:bg-paper/60'
                }`
              }
            >
              {i.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-5 py-4 text-[11px] text-mid-gray">Hackathon build · v1.0</div>
      </aside>

      {/* Main column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-canvas/90 backdrop-blur border-b border-hairline">
          <div className="h-14 px-5 flex items-center gap-3">
            <form onSubmit={submitSearch} className="flex-1 max-w-md">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search assets by tag, name, serial…"
                className="w-full h-9 rounded-pill bg-paper border border-hairline px-4 text-[13.5px] focus:border-mid-gray"
              />
            </form>
            <div className="flex-1" />
            <NotificationBell />
            <div className="relative">
              <button
                onClick={() => setUserMenu((o) => !o)}
                className="h-9 rounded-pill bg-paper border border-hairline pl-1.5 pr-3 flex items-center gap-2 hover:bg-surface-alt"
              >
                <span className="h-6 w-6 rounded-full bg-ink text-[#fafafa] text-[11px] font-semibold flex items-center justify-center">
                  {user?.name?.split(' ').map((p) => p[0]).slice(0, 2).join('') || '?'}
                </span>
                <span className="text-[13px] font-medium hidden sm:block">{user?.name?.split(' ')[0]}</span>
              </button>
              {userMenu && (
                <div className="absolute right-0 mt-2 w-64 bg-paper border border-hairline rounded-card shadow-card p-2 z-40">
                  <div className="px-3 py-2">
                    <div className="font-medium text-[14px]">{user?.name}</div>
                    <div className="text-[12px] text-mid-gray">{user?.email}</div>
                    <div className="mt-1.5"><Badge soft>{ROLE_LABEL[role] || role}</Badge></div>
                  </div>
                  <div className="border-t border-hairline my-1" />
                  <button
                    onClick={() => { logout(); navigate('/login'); }}
                    className="w-full text-left rounded-xl px-3 py-2 text-[14px] text-ember hover:bg-canvas"
                  >
                    Log out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-5 max-w-[1280px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
