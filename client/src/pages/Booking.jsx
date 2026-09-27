import { useEffect, useState } from 'react';
import api, { apiError, apiErrorDetails } from '../api/client';
import { useAuth } from '../context/AuthContext';
import {
  Badge, Banner, Button, Card, ConfirmModal, EmptyState, Field, Input, Loading, Modal,
  PageHeader, Select, Textarea,
} from '../components/ui';

const HOUR_H = 44; // px per hour in the calendar grid

function startOfWeek(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay()); // Sunday
  return x;
}

export default function Booking() {
  const [resources, setResources] = useState([]);
  const [selected, setSelected] = useState(null);
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date()));
  const [bookings, setBookings] = useState([]);
  const [mine, setMine] = useState([]);
  const [modal, setModal] = useState(null); // { mode: 'new' | 'edit', booking? }
  const [cancelTarget, setCancelTarget] = useState(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const { role } = useAuth();

  useEffect(() => {
    api.get('/assets/bookable')
      .then((r) => {
        setResources(r.data.data.items);
        if (r.data.data.items.length) setSelected(r.data.data.items[0]);
      })
      .catch((e) => setError(apiError(e)));
  }, []);

  const loadBookings = () => {
    if (!selected) return;
    const from = weekStart.toISOString();
    const to = new Date(weekStart.getTime() + 7 * 24 * 3600 * 1000).toISOString();
    api.get(`/bookings?resource=${selected._id}&from=${from}&to=${to}&limit=200`)
      .then((r) => setBookings(r.data.data.items))
      .catch(() => {});
    api.get('/bookings?mine=true&limit=100').then((r) => setMine(r.data.data.items)).catch(() => {});
  };
  useEffect(() => { loadBookings(); }, [selected, weekStart]);

  return (
    <div>
      <PageHeader
        title="Resource Booking"
        subtitle="Shared rooms, projectors and equipment — with hard overlap protection"
        actions={<Button onClick={() => setModal({ mode: 'new' })} disabled={!selected}>New Booking</Button>}
      />
      {error && <Banner tone="error" onClose={() => setError('')}>{error}</Banner>}
      {info && <Banner tone="info" onClose={() => setInfo('')}>{info}</Banner>}

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4 mt-4">
        {/* Resource list */}
        <Card className="h-fit">
          <h3 className="font-semibold text-[15px] mb-2">Bookable resources</h3>
          {resources.length === 0 ? (
            <p className="text-[13px] text-mid-gray">No bookable assets yet — mark an asset as bookable when registering.</p>
          ) : (
            <ul className="space-y-1">
              {resources.map((r) => (
                <li key={r._id}>
                  <button
                    onClick={() => setSelected(r)}
                    className={`w-full text-left rounded-xl px-3 py-2 transition-colors ${
                      selected?._id === r._id ? 'bg-canvas font-medium' : 'hover:bg-surface-alt'
                    }`}
                  >
                    <div className="text-[14px]">{r.name}</div>
                    <div className="text-[12px] text-mid-gray">{r.assetTag} · {r.location || '—'}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Calendar */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-[15px]">
              {selected?.name || 'Select a resource'} — week of {weekStart.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
            </h3>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setWeekStart((w) => new Date(w.getTime() - 7 * 86400000))}>←</Button>
              <Button variant="outline" onClick={() => setWeekStart(startOfWeek(new Date()))}>Today</Button>
              <Button variant="outline" onClick={() => setWeekStart((w) => new Date(w.getTime() + 7 * 86400000))}>→</Button>
            </div>
          </div>

          {selected ? <WeekGrid bookings={bookings} weekStart={weekStart} onNew={(d, h) => setModal({ mode: 'new', day: d, hour: h })} /> : <EmptyState title="No bookable resources" />}
        </Card>
      </div>

      {/* My bookings list */}
      <Card className="mt-4">
        <h3 className="font-semibold text-[15px] mb-3">All bookings (this resource + mine)</h3>
        {bookings.length === 0 && mine.length === 0 ? (
          <EmptyState title="No bookings" hint="Pick a slot in the calendar above." />
        ) : (
          <BookingList
            bookings={[...bookings, ...mine.filter((m) => !bookings.some((b) => b._id === m._id))]}
            onCancel={(b) => setCancelTarget(b)}
            onReschedule={(b) => setModal({ mode: 'edit', booking: b })}
          />
        )}
      </Card>

      {modal && (
        <BookingModal
          mode={modal.mode}
          initial={modal.mode === 'edit' ? modal.booking : null}
          preset={modal.mode === 'new' && modal.day ? { day: modal.day, hour: modal.hour } : null}
          resources={resources}
          selected={selected}
          onClose={() => setModal(null)}
          onDone={(msg) => { setModal(null); setInfo(msg); loadBookings(); }}
        />
      )}

      <ConfirmModal
        open={!!cancelTarget}
        title="Cancel booking?"
        body={`This frees the slot (${cancelTarget && new Date(cancelTarget.start).toLocaleString()} — ${cancelTarget && new Date(cancelTarget.end).toLocaleTimeString()}). This cannot be undone.`}
        confirmLabel="Cancel booking"
        onCancel={() => setCancelTarget(null)}
        onConfirm={async () => {
          try {
            await api.post(`/bookings/${cancelTarget._id}/cancel`, {});
            setCancelTarget(null);
            setInfo('Booking cancelled — the slot is free again.');
            loadBookings();
          } catch (e) { setCancelTarget(null); setError(apiError(e)); }
        }}
      />
    </div>
  );
}

/* ============================================================ Week grid calendar */
function WeekGrid({ bookings, weekStart, onNew }) {
  const days = Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * 86400000));
  const hours = Array.from({ length: 14 }, (_, i) => i + 7); // 07:00–20:00

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[760px]">
        {/* Day headers */}
        <div className="grid" style={{ gridTemplateColumns: `48px repeat(7, 1fr)` }}>
          <div />
          {days.map((d, i) => (
            <div key={i} className="text-center pb-2">
              <div className="text-[11px] uppercase tracking-[0.05em] text-mid-gray">
                {d.toLocaleDateString(undefined, { weekday: 'short' })}
              </div>
              <div className={`text-[14px] font-medium ${d.toDateString() === new Date().toDateString() ? 'underline' : ''}`}>
                {d.getDate()}
              </div>
            </div>
          ))}
        </div>

        {/* Hour rows */}
        <div className="relative border-t border-hairline">
          {hours.map((h) => (
            <div key={h} className="grid border-b border-hairline" style={{ gridTemplateColumns: `48px repeat(7, 1fr)` }}>
              <div className="text-[11px] text-mid-gray text-right pr-2" style={{ height: HOUR_H }}>
                {String(h).padStart(2, '0')}:00
              </div>
              {days.map((d, di) => (
                <button
                  key={di}
                  title="Click to book this slot"
                  onClick={() => onNew(d, h)}
                  className="border-l border-hairline/60 hover:bg-canvas transition-colors"
                  style={{ height: HOUR_H }}
                />
              ))}
            </div>
          ))}

          {/* Booking blocks positioned over the grid */}
          {bookings.map((b) => {
            const s = new Date(b.start);
            const e = new Date(b.end);
            const dayIdx = Math.round((startOfDay(s) - weekStart) / 86400000);
            if (dayIdx < 0 || dayIdx > 6) return null;
            const startH = s.getHours() + s.getMinutes() / 60;
            const top = (startH - 7) * HOUR_H;
            const durH = Math.max((e - s) / 3600000, 0.5);
            if (top < 0 || top + durH * HOUR_H > 14 * HOUR_H) return null;
            return (
              <div
                key={b._id}
                className="absolute rounded-lg bg-ink text-[#fafafa] text-[11px] px-2 py-1 overflow-hidden shadow-card"
                style={{
                  top: top + 1,
                  height: durH * HOUR_H - 2,
                  left: `calc(48px + (100% - 48px) * ${dayIdx} / 7 + 2px)`,
                  width: `calc((100% - 48px) / 7 - 4px)`,
                }}
                title={`${b.purpose || 'Booking'} · ${s.toLocaleTimeString()}–${e.toLocaleTimeString()}`}
              >
                <div className="font-medium truncate">{b.purpose || 'Booked'}</div>
                <div className="opacity-70">{s.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}–{e.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/* ============================================================ Booking list rows */
function BookingList({ bookings, onCancel, onReschedule }) {
  const { user } = useAuth();
  return (
    <ul className="divide-y divide-hairline">
      {bookings.map((b) => {
        const ownerId = b.bookedBy?._id || b.bookedBy?.id;
        const own = ownerId && user && String(ownerId) === String(user.id);
        return (
          <li key={b._id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[14px]">
                <span className="font-medium">{b.resource?.name || 'Resource'}</span>
                {' · '}{new Date(b.start).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                {' → '}{new Date(b.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
              <div className="text-[12px] text-mid-gray">
                {b.purpose || 'No purpose'}{b.bookedBy?.name ? ` · by ${b.bookedBy.name}` : ''}
                {b.onBehalfOfDepartment ? ` · for ${b.onBehalfOfDepartment.name}` : ''}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge status={b.status}>{b.status}</Badge>
              {(own || b.canModify) && ['Upcoming'].includes(b.status) && (
                <>
                  <button className="text-[13px] underline" onClick={() => onReschedule(b)}>Reschedule</button>
                  <button className="text-[13px] text-ember underline" onClick={() => onCancel(b)}>Cancel</button>
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ============================================================ Booking modal (overlap conflict inline) */
function BookingModal({ mode, initial, preset, resources, selected, onClose, onDone }) {
  const [form, setForm] = useState(() => {
    if (mode === 'edit' && initial) {
      const s = new Date(initial.start);
      const e = new Date(initial.end);
      return {
        resourceId: initial.resource?._id || initial.resource,
        date: toLocalDate(s),
        startTime: toLocalTime(s),
        endTime: toLocalTime(e),
        purpose: initial.purpose || '',
      };
    }
    const day = preset?.day || new Date();
    return {
      resourceId: selected?._id || '',
      date: toLocalDate(day),
      startTime: preset ? `${String(preset.hour).padStart(2, '0')}:00` : '09:00',
      endTime: preset ? `${String(Math.min(preset.hour + 1, 21)).padStart(2, '0')}:00` : '10:00',
      purpose: '',
    };
  });
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const buildIso = () => {
    const start = new Date(`${form.date}T${form.startTime}:00`);
    const end = new Date(`${form.date}T${form.endTime}:00`);
    return { start, end };
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(''); setConflict(null);
    const { start, end } = buildIso();
    try {
      if (mode === 'edit') {
        await api.patch(`/bookings/${initial._id}`, { start: start.toISOString(), end: end.toISOString(), purpose: form.purpose });
        onDone('Booking rescheduled — overlap re-validated.');
      } else {
        await api.post('/bookings', { resourceId: form.resourceId, start: start.toISOString(), end: end.toISOString(), purpose: form.purpose });
        onDone('Booking confirmed — reminder will be sent before the slot starts.');
      }
    } catch (err) {
      const details = apiErrorDetails(err);
      if (details?.conflict) {
        setConflict(details.conflict);
        setError('');
      } else {
        setError(apiError(err));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={mode === 'edit' ? 'Reschedule booking' : 'New booking'}
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4">
        {mode === 'new' && (
          <Field label="Resource">
            <Select required value={form.resourceId} onChange={set('resourceId')}>
              <option value="">Select resource…</option>
              {resources.map((r) => <option key={r._id} value={r._id}>{r.name} ({r.assetTag})</option>)}
            </Select>
          </Field>
        )}
        <div className="grid grid-cols-3 gap-3">
          <Field label="Date"><Input type="date" required value={form.date} onChange={set('date')} /></Field>
          <Field label="Start"><Input type="time" required value={form.startTime} onChange={set('startTime')} /></Field>
          <Field label="End"><Input type="time" required value={form.endTime} onChange={set('endTime')} /></Field>
        </div>
        <Field label="Purpose"><Input value={form.purpose} onChange={set('purpose')} placeholder="Sprint planning…" /></Field>

        {conflict && (
          <Banner tone="error" title="That slot overlaps an existing booking">
            Conflicting booking: {new Date(conflict.start).toLocaleString()} → {new Date(conflict.end).toLocaleTimeString()} ({conflict.status}).
            Try an adjacent slot — back-to-back bookings are allowed.
          </Banner>
        )}
        {error && <Banner tone="error">{error}</Banner>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Checking…' : mode === 'edit' ? 'Save new time' : 'Confirm booking'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function toLocalDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function toLocalTime(d) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
