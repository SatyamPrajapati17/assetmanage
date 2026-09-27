import { useEffect } from 'react';

/* ------------------------------------------------------------ Buttons */
const BTN_BASE =
  'inline-flex items-center justify-center gap-2 rounded-pill px-4 h-9 text-[14px] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap';

export function Button({ variant = 'primary', className = '', ...props }) {
  const styles = {
    primary: 'bg-ink text-[#fafafa] hover:bg-ink-soft',           // dark inversion — the only primary treatment
    secondary: 'bg-canvas text-ink hover:bg-hairline',            // ghost sibling
    outline: 'bg-transparent text-ink border border-hairline hover:bg-surface-alt',
    danger: 'bg-ember text-[#fafafa] hover:opacity-90',           // destructive only
    ghostDanger: 'bg-transparent text-ember hover:bg-canvas',
  }[variant];
  return <button className={`${BTN_BASE} ${styles} ${className}`} {...props} />;
}

/* ------------------------------------------------------------ Card */
export function Card({ className = '', children, ...props }) {
  return (
    <div
      className={`bg-paper border border-hairline rounded-card shadow-card p-5 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------ Inputs */
const FIELD =
  'w-full rounded-pill bg-canvas px-3 py-2 text-[14px] text-ink border border-transparent focus:border-hairline focus:bg-paper transition-colors';

export function Input({ className = '', ...props }) {
  return <input className={`${FIELD} ${className}`} {...props} />;
}

export function Textarea({ className = '', ...props }) {
  return <textarea className={`${FIELD} rounded-xl min-h-[80px] ${className}`} {...props} />;
}

export function Select({ className = '', children, ...props }) {
  return (
    <select className={`${FIELD} appearance-none ${className}`} {...props}>
      {children}
    </select>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="block text-[12px] uppercase tracking-[0.05em] text-mid-gray mb-1.5">{label}</span>
      {children}
      {hint ? <span className="block text-[12px] text-mid-gray mt-1">{hint}</span> : null}
    </label>
  );
}

/* ------------------------------------------------------------ Badges */
const STATUS_STYLES = {
  // lifecycle badges — monochrome tones; ember reserved for Lost/error states
  Available: 'bg-surface-alt text-ink border border-hairline',
  Allocated: 'bg-ink text-[#fafafa]',
  Reserved: 'bg-canvas text-ink border border-hairline',
  'Under Maintenance': 'bg-canvas text-ink border border-hairline',
  Lost: 'bg-ember text-[#fafafa]',
  Retired: 'bg-mid-gray text-[#fafafa]',
  Disposed: 'bg-mid-gray text-[#fafafa]',
  // booking / workflow pills
  Upcoming: 'bg-surface-alt text-ink border border-hairline',
  Ongoing: 'bg-ink text-[#fafafa]',
  Completed: 'bg-canvas text-mid-gray border border-hairline',
  Cancelled: 'bg-canvas text-mid-gray border border-hairline',
  Requested: 'bg-surface-alt text-ink border border-hairline',
  Approved: 'bg-ink text-[#fafafa]',
  Rejected: 'bg-ember text-[#fafafa]',
  TransferredOut: 'bg-canvas text-mid-gray border border-hairline',
  Returned: 'bg-canvas text-mid-gray border border-hairline',
  Active: 'bg-ink text-[#fafafa]',
  Inactive: 'bg-canvas text-mid-gray border border-hairline',
  Pending: 'bg-canvas text-ink border border-hairline',
  TechnicianAssigned: 'bg-surface-alt text-ink border border-hairline',
  InProgress: 'bg-ink text-[#fafafa]',
  Resolved: 'bg-canvas text-mid-gray border border-hairline',
  Planned: 'bg-surface-alt text-ink border border-hairline',
  Closed: 'bg-ink text-[#fafafa]',
  Verified: 'bg-surface-alt text-ink border border-hairline',
  Missing: 'bg-ember text-[#fafafa]',
  Damaged: 'bg-ember text-[#fafafa]',
  Low: 'bg-surface-alt text-ink border border-hairline',
  Medium: 'bg-canvas text-ink border border-hairline',
  High: 'bg-ink text-[#fafafa]',
  Critical: 'bg-ember text-[#fafafa]',
};

export function Badge({ status, children, soft = false, className = '' }) {
  const style = STATUS_STYLES[status] || 'bg-surface-alt text-ink border border-hairline';
  const softStyle = 'bg-canvas text-ink border border-hairline';
  return (
    <span
      className={`inline-flex items-center rounded-pill px-2 py-0.5 text-[12px] font-medium ${soft ? softStyle : style} ${className}`}
    >
      {children ?? status}
    </span>
  );
}

/* ------------------------------------------------------------ Modal */
export function Modal({ open, onClose, title, children, width = 'max-w-lg' }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose && onClose();
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/20" onClick={onClose} />
      <div className={`relative bg-paper border border-hairline rounded-card shadow-card w-full ${width} max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h3 className="text-[18px] font-semibold">{title}</h3>
          <button onClick={onClose} className="text-mid-gray hover:text-ink text-xl leading-none px-1">×</button>
        </div>
        <div className="px-5 pb-5">{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ Drawer (right side panel) */
export function Drawer({ open, onClose, title, children, width = 'max-w-md' }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-ink/20" onClick={onClose} />
      <div className={`absolute right-0 top-0 h-full w-full ${width} bg-paper border-l border-hairline shadow-card overflow-y-auto`}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h3 className="text-[18px] font-semibold">{title}</h3>
          <button onClick={onClose} className="text-mid-gray hover:text-ink text-xl leading-none px-1">×</button>
        </div>
        <div className="px-5 pb-8">{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ Stat block (DESIGN.md: typographic metric) */
export function Stat({ label, value, sub }) {
  return (
    <div>
      <div className="text-[12px] uppercase tracking-[0.05em] text-mid-gray">{label}</div>
      <div className="text-[30px] font-semibold leading-tight tracking-[-0.025em] mt-1">{value}</div>
      {sub ? <div className="text-[14px] text-mid-gray mt-0.5">{sub}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------ Inline banner (conflict messages live here, not toasts) */
export function Banner({ tone = 'info', title, children, onClose }) {
  const tones = {
    info: 'bg-surface-alt border-hairline text-ink',
    error: 'bg-paper border-ember text-ink',
    success: 'bg-surface-alt border-hairline text-ink',
  };
  return (
    <div className={`rounded-xl border px-4 py-3 text-[14px] ${tones[tone]} ${tone === 'error' ? 'shadow-card' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          {title ? (
            <div className={`font-semibold ${tone === 'error' ? 'text-ember' : ''}`}>{title}</div>
          ) : null}
          <div className={title ? 'mt-1' : ''}>{children}</div>
        </div>
        {onClose ? (
          <button onClick={onClose} className="text-mid-gray hover:text-ink leading-none">×</button>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ Tabs */
export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="flex gap-1 rounded-pill bg-canvas p-1 w-fit">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`rounded-pill px-3.5 h-8 text-[13px] font-medium transition-colors ${
            active === t.key ? 'bg-paper shadow-card text-ink' : 'text-mid-gray hover:text-ink'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ Empty / loading / error states */
export function EmptyState({ title, hint }) {
  return (
    <div className="text-center py-12">
      <div className="text-[16px] font-medium">{title}</div>
      {hint ? <div className="text-[14px] text-mid-gray mt-1">{hint}</div> : null}
    </div>
  );
}

export function Loading({ label = 'Loading…' }) {
  return <div className="text-mid-gray text-[14px] py-8 text-center">{label}</div>;
}

export function ErrorState({ message }) {
  return (
    <div className="text-ember text-[14px] py-6 text-center">{message}</div>
  );
}

/* ------------------------------------------------------------ Page header */
export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
      <div>
        <h1 className="text-[24px] font-semibold tracking-[-0.025em]">{title}</h1>
        {subtitle ? <p className="text-[14px] text-mid-gray mt-0.5">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------ Confirm modal (destructive actions) */
export function ConfirmModal({ open, title, body, confirmLabel = 'Confirm', danger = true, onConfirm, onCancel, busy }) {
  return (
    <Modal open={open} onClose={onCancel} title={title} width="max-w-md">
      <p className="text-[14px] text-ink-soft">{body}</p>
      <div className="flex justify-end gap-2 mt-5">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy}>
          {busy ? 'Working…' : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
