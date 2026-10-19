// Step-navigation signals of the OCR review flow (ETP-5654).
//
// Every review step resolves with one of three things: its reviewed value (continue), `null`
// (cancel: the user abandons the import), or `BACK` (go to the previous step that was shown).
// Cancel and back must stay distinct: cancel marks the run cancelled, back never does.
//
// The step that reports BACK also hands its current editable state to the flow, which feeds it
// back as the step's initial state when the user moves forward again. Steps resolve with
// `{ value, state }` objects for that reason; see useOcrFlow.
export const BACK = Symbol('ocr-flow-back');

export const isBack = (value) => value === BACK;
