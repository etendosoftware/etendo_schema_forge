export default function SectionSaveButton({ error, hideSave, locked, save, saving, savingKey = 'fiscal.saving', ui }) {
  return (
    <>
      {error && <p className="text-sm text-destructive mt-4">{error}</p>}
      {!hideSave && !locked && (
        <div className="pt-4">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-[hsl(var(--foreground))] text-white text-sm font-medium hover:bg-[hsl(var(--foreground))]/90 disabled:opacity-50 transition-colors"
          >
            {saving ? ui(savingKey) : ui('fiscal.save')}
          </button>
        </div>
      )}
    </>
  );
}
