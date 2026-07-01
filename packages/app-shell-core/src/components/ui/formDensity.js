// Shared form-field density tokens (ETP-4321). Single source of truth so a
// density change propagates to every document window automatically.
export const FIELD_HEIGHT = 'h-9';        // 36px
// Important variant of FIELD_HEIGHT. Tailwind's JIT only emits CSS for class
// strings found LITERALLY in scanned source, so the important modifier must be
// a literal here (do NOT build it as `!${FIELD_HEIGHT}` at a call site — that
// string is never seen by the scanner and the rule gets purged). Keep in sync
// with FIELD_HEIGHT.
export const FIELD_HEIGHT_IMPORTANT = '!h-9'; // 36px, !important
export const FIELD_PADDING = 'px-2 py-1.5';
export const ROW_GAP_Y = 'gap-y-3';       // 12px
export const LABEL_GAP = 'space-y-1';     // 4px
