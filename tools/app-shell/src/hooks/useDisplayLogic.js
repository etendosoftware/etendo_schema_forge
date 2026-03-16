import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Hook that calls the NEO Headless evaluate-display endpoint to resolve
 * field visibility and read-only state based on AD metadata expressions
 * (AD_Column.ReadOnlyLogic, AD_Tab.DisplayLogic, etc.).
 *
 * Returns { readOnly: { fieldName: bool }, visibility: { fieldName: bool } }
 * which the form uses to disable/hide fields dynamically.
 *
 * Evaluates on record load and debounces on field changes (300ms).
 */
export function useDisplayLogic(entity, fieldValues, { token, apiBaseUrl }) {
  const [displayState, setDisplayState] = useState({ readOnly: {}, visibility: {} });
  const debounceRef = useRef(null);

  const evaluate = useCallback(async (values) => {
    if (!values || !token || !apiBaseUrl || !entity) return;
    // Skip evaluation for new records (no id) — they have no meaningful state to evaluate
    if (!values.id) return;

    try {
      const res = await fetch(`${apiBaseUrl}/${entity}/evaluate-display`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fieldValues: values }),
      });
      if (res.ok) {
        const data = await res.json();
        setDisplayState({
          readOnly: data.readOnly ?? {},
          visibility: data.visibility ?? {},
        });
      }
    } catch {
      // Best-effort — if evaluate-display fails, all fields remain editable
    }
  }, [entity, token, apiBaseUrl]);

  // Evaluate when fieldValues change (debounced to avoid flooding on rapid edits)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      evaluate(fieldValues);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [fieldValues, evaluate]);

  return displayState;
}
