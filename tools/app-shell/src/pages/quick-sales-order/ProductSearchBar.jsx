import { useUI } from '@/i18n';
import { Search, X } from 'lucide-react';

export default function ProductSearchBar({ query, onChange, inputRef, onEnter }) {
  const ui = useUI();

  function handleKeyDown(e) {
    if (e.key === 'Enter' && onEnter) {
      e.preventDefault();
      onEnter(query);
    }
  }

  return (
    <div className="relative">
      <Search
        className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
        data-testid="Search__d6f047" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={ui('qsoSearchProducts')}
        className="w-full rounded-lg border border-border bg-white pl-10 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-colors"
      />
      {query && (
        <button
          onClick={() => onChange('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" data-testid="X__d6f047" />
        </button>
      )}
    </div>
  );
}
