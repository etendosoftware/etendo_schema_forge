import { Building2, Landmark, Wallet, CreditCard } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ACCOUNT_TYPE } from './tokens';

const TYPE_ICON = {
  [ACCOUNT_TYPE.BANK]: Landmark,
  [ACCOUNT_TYPE.CASH]: Wallet,
  [ACCOUNT_TYPE.CARD]: CreditCard,
};

/**
 * Round 32x32 avatar shown at the start of each row. Uses the generic per-type
 * icon centered in a neutral gray circle (Figma `3012:25602`, bg #E8EAEF,
 * icon #828FA3). Bank brand logos are not wired in T1.
 */
export function AccountLogoAvatar({ account, className }) {
  const Icon = TYPE_ICON[account?.type] ?? Building2;
  return (
    <div
      className={cn(
        'flex h-8 w-8 items-center justify-center rounded-full bg-[#E8EAEF] text-[#828FA3]',
        className,
      )}
      aria-hidden="true"
    >
      <Icon className="h-4 w-4" data-testid="Icon__e6d2a0" />
    </div>
  );
}
