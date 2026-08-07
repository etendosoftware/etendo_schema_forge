import React from 'react';
import { X, Trash2 } from 'lucide-react';
import { AddLineButton } from '@/components/ui/add-line-button.jsx';
import LinesSelectionBar from './LinesSelectionBar.jsx';
import { evalTabReadOnly } from './evalTabReadOnly.js';
import {
  resolveCanAddSecondaryLines,
  getAddLineWrapperStyle,
  secondaryTabEmptyState,
  getSecondaryLinesTableRef,
  resolveSecondaryRowClickHandler,
  getSecondaryEditRowHandler,
  getSecondarySelectionChangeHandler,
  getSecondaryRowUpdateHandler,
} from './detailViewHelpers.jsx';

function secondaryDetailSidebar(props) {
  if (!(props.st.Form && !props.st.Panel && (props.selectedSecondaryLine?._tabKey === props.st.key || props.closingSecondaryLine))) {
    return null;
  }
  return (
    <div
        className={`w-[48rem] shrink-0 border-l border-border pl-4 self-stretch overflow-hidden ${props.closingSecondaryLine ? "sidebar-slide-out" : "sidebar-slide-in"}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-foreground">{props.detailPanelTitle}</span>
        <button
            onClick={props.onCloseDetailPanel}
            className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-3.5 w-3.5" data-testid="X__fa3275" />
        </button>
      </div>
      <props.st.Form
          data={props.secondaryLineEdits ?? props.selectedSecondaryLine}
          readOnly={!props.hook.editing}
          onChange={props.onChange}
          entity={props.st.key}
          catalogs={props.catalogs}
          token={props.token}
          apiBaseUrl={props.apiBaseUrl}
          selectorContext={props.selectorContextByEntity[props.st.key]}
          excludeFields={props.st.key === "contact" ? ["active"] : []}
          labelOverrides={props.labelOverrides}
      />
      {props.hook.editing && (props.secondaryLineEdits || props.selectedSecondaryLine?.id) && (
          <div className="flex gap-2 mt-4">
            {props.secondaryLineEdits && (
                <>
                  <button
                      disabled={props.savingLine}
                      onClick={props.onSaveLine}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {props.savingLine ? props.loadingLabel : props.saveLabel}
                  </button>
                  <button
                      onClick={props.onDiscardLine}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md border hover:bg-accent"
                  >
                    {props.discardLabel}
                  </button>
                </>
            )}
            {(props.crud?.[props.st.key]?.delete ?? true) && props.selectedSecondaryLine?.id && (
                <button
                    disabled={props.savingLine}
                    onClick={props.onDeleteLine}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md border border-destructive text-destructive hover:bg-destructive/10 disabled:opacity-50 ml-auto"
                >
                  <Trash2 className="h-4 w-4" data-testid="Trash2__fa3275" />
                  {props.deleteLabel}
                </button>
            )}
          </div>
      )}
    </div>
  );
}

function secondaryAddLineBar(props) {
  const secondaryChildCount = (props.secondaryHooks?.[props.stIdx]?.children ?? []).length;
  if (!((props.st.addLineFields?.entry?.length > 0 || props.st.customAddModal) && props.hook.editing
      && resolveCanAddSecondaryLines(props.st, secondaryChildCount))) {
    return null;
  }
  return (
    // Wrapper measured by the secondary selection bar — its
    // `position: fixed` portal overlays exactly this region.
    // Mirrors the primary header-lines add-button wrapper (shared
    // getAddLineWrapperClassName/Style helpers) so both paths get the
    // same top border, vertical spacing and padding — keeps alignment
    // consistent across primary and secondary tabs.
    // Always `relative` (never sticky): the child-tab add-line button
    // must stay in flow below the table. getAddLineWrapperClassName's
    // sticky bottom-0 variant is only correct for the tall PRIMARY
    // header-lines area — applying it here makes the button overlap the
    // last table row when the scroll container is resized.
    <div
      ref={props.secondaryAddLineWrapperRef}
      className="relative"
      // No borderTop: the child table already renders its own bottom
      // border, so the primary path's top divider would double up here.
      // noTopPadding: keep the button snug under the table (no vertical
      // gap above it) while preserving horizontal alignment.
      style={getAddLineWrapperStyle(props.linesLayout, { withBorder: false, noTopPadding: true })}
    >
      {/* alignSelf:flex-start keeps this span from being stretched by
          the flex-column parent — otherwise data-inline-add-portal would
          cover the whole bar and the outside-click save would never fire. */}
      <span data-inline-add-portal="true" style={{ alignSelf: 'flex-start' }}>
        <AddLineButton
          onClick={props.onAddLineClick}
          label={props.addLineLabel}
          hideChevron={props.hideChevron}
          data-testid="AddLineButton__fa3275" />
      </span>
      {/* ETP-4656 (Gap 4) — `enableSecondaryRowDelete` also unlocks the bulk-select bar
          for non-inlineEditable tabs (e.g. Direcciones/Personas de contacto), matching
          the onSelectionChange wiring above and the row-level onDeleteRow gate below. */}
      {(props.linesLayout === "inlineEditable" || props.enableSecondaryRowDelete) && (props.crud?.[props.st.key]?.delete ?? true) && (
          <LinesSelectionBar
            visible={props.secondaryBarVisible[props.st.key] ?? false}
            closing={props.secondaryBarClosing[props.st.key] ?? false}
            barRect={props.secondaryBarRects[props.st.key]}
            count={(props.secondarySelectedRows[props.st.key] ?? []).length}
            selectedLabel={props.selectedLabel}
            totalLabel={null}
            deleting={props.secondaryDeleting[props.st.key] ?? false}
            deleteTitle={props.deleteLabel}
            closeTitle={props.closeTitle}
            compact
            onDelete={props.onDelete}
            onClose={props.onClose}
            data-testid="LinesSelectionBar__fa3275" />
      )}
    </div>
  );
}

export function SecondaryTableTab(props) {
  // Evaluates the tab's own readOnlyLogic (if declared) against the current
  // header record — independent of the document-wide isDocumentReadOnly, which
  // only governs the primary lines table. Most tabs declare no readOnlyLogic
  // and this stays false, preserving today's behavior everywhere else.
  const tabReadOnly = evalTabReadOnly(props.st, props.hook.selected);
  const secondaryChildren = props.secondaryHooks[props.stIdx]?.children ?? [];
  const isAddingThis = props.addingSecondaryLine?.[props.st.key] ?? false;
  const hasAddFields = (props.st.addLineFields?.entry?.length ?? 0) > 0;
  // ETP-4565 — st.maxDetailLines caps this tab's own child count (declared per
  // secondary tab in decisions.json). At this point secondaryChildren.length is
  // always 0 when showEmptyState is being evaluated below, so this only ever
  // blocks the empty-state add trigger for the maxDetailLines:0 (import-only)
  // case — a tab capped at >=1 still shows it while empty, same as today.
  const canAddMore = resolveCanAddSecondaryLines(props.st, secondaryChildren.length);
  const showEmptyState = secondaryChildren.length === 0 && !isAddingThis
    && props.hook.editing && hasAddFields && canAddMore && !props.st.customAddModal && !tabReadOnly;
  if (showEmptyState) {
    return secondaryTabEmptyState({ ui: props.ui, onAddLineClick: props.onAddLineClick, addLineLabel: props.addLineLabel });
  }
  return (
    <>
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <props.st.Table
              ref={getSecondaryLinesTableRef(props.linesLayout, props.secondaryInlineLinesRef, props.st)}
              data={props.secondaryHooks[props.stIdx]?.children ?? []}
              entity={props.st.key}
              token={props.token}
              apiBaseUrl={props.apiBaseUrl}
              labelOverrides={props.labelOverrides}
              selectorContext={props.selectorContextByEntity[props.st.key]}
              linesLayout={props.linesLayout}
              isDocumentReadOnly={tabReadOnly}
              onRowClick={resolveSecondaryRowClickHandler(props.st, {
                openCustomModal: props.openCustomModal,
                openSecondaryLine: props.openSecondaryLine,
                linesLayout: props.linesLayout,
              })}
              onEditRow={getSecondaryEditRowHandler(props.st, props.setCustomModalState)}
              selectedRowId={props.selectedSecondaryLine?._tabKey === props.st.key ? props.selectedSecondaryLine?.id : undefined}
              onSelectionChange={getSecondarySelectionChangeHandler(props.linesLayout, props.setSecondarySelectedRows, props.st, props.enableSecondaryRowDelete)}
              onDeleteRow={(props.enableSecondaryRowDelete || (props.linesLayout === 'inlineEditable' && !props.st.customAddModal)) && !tabReadOnly && (props.crud?.[props.st.key]?.delete ?? true) ? props.onDeleteRow : undefined}
              // Inline edit save for secondary-tab rows. Fires when a
              // cell loses focus while in edit mode. Optimistic flow:
              // we update the local cache FIRST so the Radix Select
              // (and read-mode label) reflect the new pick instantly,
              // then PATCH the server and roll back if it rejects.
              onUpdateRow={getSecondaryRowUpdateHandler(props.st, props.linesLayout, {
                api: props.api,
                apiBaseUrl: props.apiBaseUrl,
                secondaryHooks: props.secondaryHooks,
                stIdx: props.stIdx,
                token: props.token,
                ui: props.ui,
                extractErrorMessage: props.extractErrorMessage,
                isDocumentReadOnly: tabReadOnly,
                hook: props.hook,
              })}
              addRow={props.st.addLineFields?.entry?.length > 0 && !tabReadOnly && canAddMore ? {
                ref: props.secondaryAddRowRef,
                active: props.addingSecondaryLine[props.st.key] ?? false,
                fields: props.st.addLineFields.entry,
                onAdd: props.onAdd,
                onCancel: props.onCancel,
                catalogs: props.catalogs,
                seedValues: props.secondaryAddRowSeed,
                resolvedDefaults: props.secondaryChildDefaults,
              } : undefined}
          />
        </div>
        {secondaryDetailSidebar(props)}
      </div>
      {!tabReadOnly && secondaryAddLineBar(props)}
    </>
  );
}
