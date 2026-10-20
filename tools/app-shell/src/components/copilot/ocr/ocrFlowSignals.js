// Step-navigation signals of the OCR review flow (ETP-5654).
//
// Every review step resolves with one of three things: its reviewed value (continue), `null`
// (cancel: the user abandons the import), or `BACK` (go to the previous step that was shown).
// Cancel and back must stay distinct: cancel marks the run cancelled, back never does.
//
// A step that reports BACK (or continues) first hands its current editable state to the flow
// through its `onStateChange` prop; the flow feeds it back as the step's initial state when the
// user moves forward again. See useOcrFlow.
export const BACK = Symbol('ocr-flow-back');

export const isBack = (value) => value === BACK;
