/**
 * Shared CodeMirror appearance for Dockge editors (compose / .env).
 *
 * Background / gutter chrome is handled in CSS (.editor-box) so:
 * - gutters stay transparent (no “square” number column)
 * - view mode vs edit-mode can use different panel colors (original Dockge feel)
 *
 * This theme only sets font metrics (alignment) + muted syntax colors.
 */
import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import type { Extension } from "@codemirror/state";

/** Match upstream Compose.vue: JetBrains Mono 14px */
const FONT_SIZE = "14px";
const LINE_HEIGHT = "1.5";
const FONT_FAMILY = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

/**
 * Identical font metrics on content and line numbers — no vertical gutter padding
 * (padding-top on gutters is the usual cause of “some lines misaligned”).
 */
export const softEditorChrome: Extension = EditorView.theme({
    "&": {
        fontSize: FONT_SIZE,
        fontFamily: FONT_FAMILY,
        backgroundColor: "transparent",
    },
    "&.cm-focused": {
        outline: "none",
    },
    ".cm-scroller": {
        fontFamily: FONT_FAMILY,
        fontSize: FONT_SIZE,
        lineHeight: LINE_HEIGHT,
        backgroundColor: "transparent",
    },
    ".cm-content": {
        fontFamily: FONT_FAMILY,
        fontSize: FONT_SIZE,
        lineHeight: LINE_HEIGHT,
        caretColor: "#b1b8c0",
        outline: "none",
        backgroundColor: "transparent",
        /* small gap after line numbers; no vertical pad */
        paddingLeft: "6px",
        paddingRight: "4px",
        paddingTop: "0",
        paddingBottom: "0",
    },
    ".cm-line": {
        fontFamily: FONT_FAMILY,
        fontSize: FONT_SIZE,
        lineHeight: LINE_HEIGHT,
        padding: "0",
        backgroundColor: "transparent",
    },
    ".cm-activeLine": {
        backgroundColor: "transparent",
    },
    "&.cm-focused .cm-activeLine": {
        backgroundColor: "transparent",
    },
    ".cm-gutters": {
        backgroundColor: "transparent",
        color: "#575c62",
        border: "none",
        fontFamily: FONT_FAMILY,
        fontSize: FONT_SIZE,
        lineHeight: LINE_HEIGHT,
        paddingTop: "0",
        paddingBottom: "0",
    },
    ".cm-gutter": {
        backgroundColor: "transparent",
        fontFamily: FONT_FAMILY,
        fontSize: FONT_SIZE,
        lineHeight: LINE_HEIGHT,
    },
    ".cm-lineNumbers .cm-gutterElement": {
        fontFamily: FONT_FAMILY,
        fontSize: FONT_SIZE,
        lineHeight: LINE_HEIGHT,
        minWidth: "2.5ch",
        padding: "0 8px 0 4px",
        textAlign: "right",
        boxSizing: "border-box",
        backgroundColor: "transparent",
    },
    ".cm-activeLineGutter": {
        backgroundColor: "transparent",
        color: "#b1b8c0",
    },
    "&.cm-focused .cm-activeLineGutter": {
        backgroundColor: "transparent",
    },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
        backgroundColor: "rgba(116, 194, 255, 0.22) !important",
    },
    ".cm-selectionLayer .cm-selectionBackground": {
        backgroundColor: "rgba(116, 194, 255, 0.22) !important",
    },
}, { dark: true });

/** Soft syntax (readable on both slightly lighter edit panel and dark view panel) */
export const softEditorHighlight: Extension = syntaxHighlighting(HighlightStyle.define([
    { tag: t.comment, color: "#6a7380" },
    { tag: [ t.string, t.special(t.brace) ], color: "#a3b06a" },
    { tag: [ t.number, t.self, t.bool, t.null ], color: "#9b86c0" },
    { tag: [ t.keyword, t.operator ], color: "#c07a9e" },
    { tag: [ t.definitionKeyword, t.typeName ], color: "#6ea0ad" },
    {
        tag: [
            t.propertyName,
            t.definition(t.propertyName),
            t.attributeName,
            t.className,
            t.function(t.variableName),
        ],
        color: "#6db384",
    },
    { tag: t.variableName, color: "#b1b8c0" },
    { tag: t.meta, color: "#6a7380" },
]));

export const dockgeEditorAppearance: Extension[] = [
    softEditorChrome,
    softEditorHighlight,
];
