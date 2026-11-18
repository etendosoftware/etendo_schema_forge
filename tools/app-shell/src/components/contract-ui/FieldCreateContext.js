import { createContext } from 'react';

/**
 * Lets a custom window give a form selector field a "+ create" row that opens the window's OWN
 * create modal, when the generic `allowCreate` (a `{ name }` POST to a CRUD spec,
 * `InlineCreateSelector`) cannot create that record — e.g. sales-quotation's `rejectReason`,
 * created through the `createRejectReason` action by `CreateRejectReasonModal` (ETP-6209).
 *
 * Read by EntityForm's searchable selector (`renderSearchSelectField`, `CreatableSearchSelect`).
 * Shape when provided, keyed by the form field's key:
 *   {
 *     [fieldKey]: {
 *       label: string,                                   // the create row, e.g. "+ Crear razón"
 *       onOpen: (query, onSelect: ({ id, name }) => void) => void,
 *     },
 *   }
 * The default (`null`) and any field not listed keep the field exactly as before. A field that
 * also declares `allowCreate` keeps the generic create; this context is not consulted for it.
 */
export const FieldCreateContext = createContext(null);
