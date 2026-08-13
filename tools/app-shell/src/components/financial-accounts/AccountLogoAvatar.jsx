import { useEffect, useState } from 'react';
import { Building2, Landmark, Wallet, CreditCard } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ACCOUNT_TYPE } from './tokens';

const TYPE_ICON = {
  [ACCOUNT_TYPE.BANK]: Landmark,
  [ACCOUNT_TYPE.CASH]: Wallet,
  [ACCOUNT_TYPE.CARD]: CreditCard,
};

/**
 * Round 40x40 avatar shown at the start of each row and in the account detail's IBAN/card
 * summary strip (`AccountSummaryStrip`) — both read the same default; a caller can still override
 * the size via `className` (resolved through `cn()`'s `tailwind-merge`) if a layout ever needs a
 * different one.
 *
 * Shows the connected bank's real logo (`account.providerLogoUrl`, persisted from Salt Edge's
 * provider catalog — see `PSD2_Provider.Logo_Url`, ETP-4764 follow-up) when there is one, falling
 * back to the generic per-type icon (Figma `3012:25602`, bg hsl(var(--border-subtle)), icon
 * hsl(var(--text-disabled))) for cash/card accounts and for any bank account without a logo on
 * record — either because its provider hasn't been synced yet, or because the URL failed to load
 * (caught via `onError`, so a dead/403 logo degrades to the icon instead of a broken image).
 *
 * The logo sits on a white/card background rather than the icon's gray circle: bank logos are
 * typically SVGs/PNGs with a transparent backdrop, and the muted gray showed through around the
 * mark instead of framing it cleanly — the same reason the bank picker and account-selector logos
 * elsewhere in the app (`NewAccountWizard`, `BankConnectionFlowUI`) already sit on `bg-card`.
 *
 * No inner padding on the `<img>` — per Figma (`3012:25602`), the logo fills the circle, unlike
 * the generic icon which needs breathing room around its glyph. `object-contain` still guards
 * against cropping a non-square logotype. Note some providers' assets (e.g. Salt Edge's own square
 * icons) bake a transparent safe-zone margin INTO the file itself, so the rendered mark can still
 * look smaller than the circle even with zero outer padding here — that is the asset, not this
 * component, and a bigger circle is what narrows the gap without a per-provider hack.
 */
export function AccountLogoAvatar({ account, className }) {
  const [imgFailed, setImgFailed] = useState(false);
  const logoUrl = account?.providerLogoUrl;
  // A row can be re-rendered for the same account after its provider syncs a logo for the first
  // time (or a different one), without the component remounting — retry instead of staying stuck
  // on the previous failure.
  useEffect(() => setImgFailed(false), [logoUrl]);
  const showLogo = Boolean(logoUrl) && !imgFailed;
  const Icon = TYPE_ICON[account?.type] ?? Building2;

  return (
    <div
      className={cn(
        'flex h-10 w-10 items-center justify-center overflow-hidden rounded-full text-[hsl(var(--text-disabled))]',
        showLogo
          ? 'border border-[hsl(var(--border-subtle))] bg-card'
          : 'bg-[hsl(var(--border-subtle))]',
        className,
      )}
      aria-hidden="true"
    >
      {showLogo ? (
        <img
          src={logoUrl}
          alt=""
          className="h-full w-full object-contain"
          onError={() => setImgFailed(true)}
          data-testid="AccountLogoAvatarImg__e6d2a0"
        />
      ) : (
        <Icon className="h-5 w-5" data-testid="Icon__e6d2a0" />
      )}
    </div>
  );
}
