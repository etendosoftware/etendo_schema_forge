/**
 * Custom section preservation for frontend regeneration.
 *
 * When a window is re-extracted and components are regenerated, this module
 * extracts custom code blocks from the existing file and re-injects them
 * into the newly generated output so manual customizations survive.
 *
 * @module preserve-custom-sections
 */

import { readFileSync, existsSync } from 'node:fs';
import { MARKERS, PATTERNS } from './custom-section-markers.js';

/**
 * Extract all custom sections from file content.
 *
 * Scans for `@sf-custom-start ID` / `@sf-custom-end ID` pairs and
 * captures the code between them (excluding the marker lines themselves).
 *
 * @param {string} fileContent - Full source text of the existing file.
 * @returns {Map<string, string>} Map of sectionId to code content (trimmed).
 */
export function extractCustomSections(fileContent) {
  const sections = new Map();
  const lines = fileContent.split('\n');
  let currentId = null;
  let currentLines = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (currentId === null) {
      const startMatch = trimmed.match(PATTERNS.CUSTOM_START);
      if (startMatch) {
        currentId = startMatch[1];
        currentLines = [];
      }
    } else {
      const endMatch = trimmed.match(PATTERNS.CUSTOM_END);
      if (endMatch && endMatch[1] === currentId) {
        sections.set(currentId, currentLines.join('\n'));
        currentId = null;
        currentLines = [];
      } else {
        currentLines.push(line);
      }
    }
  }

  // Best-effort recovery for unclosed sections
  if (currentId !== null) {
    console.warn(
      `[preserve-custom-sections] WARNING: Unclosed custom section "${currentId}" ` +
      '(no matching @sf-custom-end found). Including content up to EOF.'
    );
    sections.set(currentId, currentLines.join('\n'));
  }

  return sections;
}

/**
 * Inject custom sections into newly generated content.
 *
 * For each `@sf-custom-slot ID` in the new content, if a matching custom
 * section exists, the slot line is replaced with the full custom block
 * (wrapped in `@sf-custom-start` / `@sf-custom-end` markers).
 *
 * @param {string} newFileContent - Newly generated source text (with slots).
 * @param {Map<string, string>} customSections - Sections extracted from old file.
 * @returns {{ content: string, injected: string[], remaining: string[] }}
 *   - content: merged source text
 *   - injected: IDs that were successfully injected
 *   - remaining: IDs from customSections that had no matching slot
 */
export function injectCustomSections(newFileContent, customSections) {
  const injected = [];
  const matchedIds = new Set();
  const lines = newFileContent.split('\n');
  const result = [];
  let skippingGeneratedId = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // If a custom section was injected for this ID, skip the generated default block
    if (skippingGeneratedId !== null) {
      const endMatch = trimmed.match(PATTERNS.GENERATED_END);
      if (endMatch && endMatch[1] === skippingGeneratedId) {
        skippingGeneratedId = null;
      }
      continue;
    }

    const slotMatch = trimmed.match(PATTERNS.CUSTOM_SLOT);
    const genStartMatch = trimmed.match(PATTERNS.GENERATED_START);

    if (slotMatch) {
      const id = slotMatch[1];
      if (customSections.has(id)) {
        // Replace slot with the preserved custom block
        const indent = line.match(/^(\s*)/)[1];
        result.push(`${indent}${MARKERS.CUSTOM_START(id)}`);
        result.push(customSections.get(id));
        result.push(`${indent}${MARKERS.CUSTOM_END(id)}`);
        injected.push(id);
        matchedIds.add(id);
      } else {
        // No custom section for this slot — keep the slot as-is
        result.push(line);
      }
    } else if (genStartMatch && matchedIds.has(genStartMatch[1])) {
      // A custom section was already injected for this ID — skip the generated default
      skippingGeneratedId = genStartMatch[1];
    } else {
      result.push(line);
    }
  }

  const remaining = [...customSections.keys()].filter(id => !matchedIds.has(id));

  return {
    content: result.join('\n'),
    injected,
    remaining,
  };
}

/**
 * Append unmatched custom sections at the end of the file with a warning.
 *
 * When old custom sections have no matching slot in the new file (e.g., a
 * field was removed), the code is appended so the developer can relocate
 * or discard it manually.
 *
 * @param {string} content - Current merged content.
 * @param {string[]} unmatchedIds - IDs with no slot in the new content.
 * @param {Map<string, string>} customSections - Full section map.
 * @returns {string} Content with unmatched sections appended.
 */
export function appendUnmatchedSections(content, unmatchedIds, customSections) {
  if (unmatchedIds.length === 0) return content;

  const lines = [
    content,
    '',
    '// --- WARNING: Unmatched custom sections (no matching slot in regenerated code) ---',
    '// Review these sections and relocate or remove them manually.',
  ];

  for (const id of unmatchedIds) {
    lines.push('');
    lines.push(MARKERS.CUSTOM_START(id));
    lines.push(customSections.get(id));
    lines.push(MARKERS.CUSTOM_END(id));
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Main entry point: preserve custom sections across a regeneration cycle.
 *
 * 1. Reads the existing file (if it exists) and extracts custom sections.
 * 2. Injects matching sections into the new content.
 * 3. Appends any unmatched sections with a warning comment.
 *
 * @param {string} existingFilePath - Path to the current generated file (may not exist).
 * @param {string} newContent - Newly generated source text.
 * @returns {{ content: string, preserved: string[], unmatched: string[] }}
 */
export function preserveAndRegenerate(existingFilePath, newContent) {
  if (!existingFilePath || !existsSync(existingFilePath)) {
    return { content: newContent, preserved: [], unmatched: [] };
  }

  const existingContent = readFileSync(existingFilePath, 'utf-8');
  const customSections = extractCustomSections(existingContent);

  if (customSections.size === 0) {
    return { content: newContent, preserved: [], unmatched: [] };
  }

  const { content: merged, injected, remaining } = injectCustomSections(newContent, customSections);
  const finalContent = appendUnmatchedSections(merged, remaining, customSections);

  return {
    content: finalContent,
    preserved: injected,
    unmatched: remaining,
  };
}
