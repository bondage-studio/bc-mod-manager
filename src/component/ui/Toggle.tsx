import cn from '@/util/cn.ts';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  id?: string;
}

/**
 * Accessible on/off switch styled to match the app's controls.
 */
export default function Toggle({checked, onChange, disabled, label, id}: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 flex-none items-center rounded-full border transition-colors duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bmm-accent/30 focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-60',
        checked ? 'border-bmm-accent bg-bmm-accent' : 'border-bmm-border-strong bg-bmm-surface-muted',
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 transform rounded-full bg-white shadow-bmm-control transition-transform duration-200',
          checked ? 'translate-x-[1.375rem]' : 'translate-x-[0.1875rem]',
        )}
      />
    </button>
  );
}
