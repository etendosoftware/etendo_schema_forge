import { TranslateIcon } from '@phosphor-icons/react';
import { useUI } from '@/i18n';

/**
 * The languages the app offers in its user menu: one row per locale, with its flag and its own
 * name. Extracted from `UserAvatarButton` (ETP-6209) so the customer portal, which has no user
 * menu, offers exactly the same list.
 */
export const APP_LOCALES = Object.freeze([
  { code: 'en_US', flag: '🇺🇸', label: 'English' },
  { code: 'es_ES', flag: '🇪🇸', label: 'Español' },
]);

/**
 * The "Idioma" section of the app's user menu (`UserAvatarButton`): the `TranslateIcon` title, then one
 * row per {@link APP_LOCALES} entry; the active one on `bg-muted` and semibold. Meant to sit inside
 * a `DropdownMenuContent`.
 *
 * @param {string} locale the active locale code
 * @param {Function} setLocale switches the locale
 * @param {(code: string) => string} testIdFor each row's `data-testid`
 */
export function LanguageMenuSection({ locale, setLocale, testIdFor = (code) => `user-menu-language-${code}` }) {
  const ui = useUI();
  return (
    <div className="px-2 pt-2 pb-1">
      <p className="flex items-center gap-1.5 px-2 pb-1 text-xs font-medium text-muted-foreground">
        <TranslateIcon className="h-3.5 w-3.5" data-testid="Languages__9f3744" />
        {ui('language')}
      </p>
      {APP_LOCALES.map((l) => (
        <button
          key={l.code}
          type="button"
          onClick={() => setLocale(l.code)}
          data-testid={testIdFor(l.code)}
          className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors ${
            locale === l.code
              ? 'bg-muted font-semibold text-foreground'
              : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
          }`}
        >
          <span className="text-sm leading-none">{l.flag}</span>
          {l.label}
        </button>
      ))}
    </div>
  );
}
