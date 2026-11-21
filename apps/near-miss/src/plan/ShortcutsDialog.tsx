import { Dialog, Kbd } from '@x10/shared/ui';

const KEYS: [string[], string][] = [
  [['1', '–', '5'], 'Lens: potential, status, category, age, heat'],
  [['V'], 'View as reporter, supervisor or safety lead'],
  [['L'], 'Site plan or reports list'],
  [['S'], 'Next site'],
  [['P'], 'Play or pause the 90-day replay'],
  [['['], 'Previous pin'],
  [[']'], 'Next pin'],
  [['Esc'], 'Clear the focus, back to today'],
  [['R'], 'Report a hazard'],
  [['?'], 'This cheat sheet'],
];

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Keyboard shortcuts">
      <dl className="m-0 divide-y divide-[var(--line)]">
        {KEYS.map(([keys, what]) => (
          <div key={what} className="flex items-center justify-between gap-4 py-2.5">
            <dt className="text-sm text-fg">{what}</dt>
            <dd className="m-0 flex shrink-0 items-center gap-1">
              {keys.map((k) => (k === '–' ? <span key={k} className="text-faint">–</span> : <Kbd key={k}>{k}</Kbd>))}
            </dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}
