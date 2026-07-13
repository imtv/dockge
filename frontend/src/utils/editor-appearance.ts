/**
 * Shared CodeMirror appearance for Dockge editors (compose / .env).
 *
 * Alignment: no vertical padding on gutters (keeps line numbers locked to text).
 * Background: always solid panel color — kill CM light active-line flash on focus/edit.
 */
import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import type { Extension } from "@codemirror/state";

const EDITOR_BG = "#2d2f3f";
const EDITOR_GUTTER_BG = "#282a36";
const FONT_SIZE = "15px";
const LINE_HEIGHT = "1.5";
const FONT_FAMILY =
    "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace";

export const softEditorChrome: Extension = EditorView.theme({
    "&": {
        color: "#a8b0bd",
        backgroundColor: EDITOR_BG,
        fontSize: FONT_SIZE,
        fontFamily: FONT_FAMILY,
    },
    "&.cm-focused": {
        outline: "none",
    },
    ".cm-scroller": {
        fontFamily: FONT_FAMILY,
        fontSize: FONT_SIZE,
        lineHeight: LINE_HEIGHT,
        backgroundColor: EDITOR_BG,
    },
    ".cm-content": {
        fontFamily: FONT_FAMILY,
        fontSize: FONT_SIZE,
        lineHeight: LINE_HEIGHT,
        caretColor: "#a8b0bd",
        outline: "none",
        backgroundColor: EDITOR_BG,
        paddingLeft: "8px",
        paddingRight: "8px",
    },
    ".cm-line": {
        fontFamily: FONT_FAMILY,
        fontSize: FONT_SIZE,
        lineHeight: LINE_HEIGHT,
        padding: "0 1px 0 0",
        backgroundColor: "transparent",
    },
    /* CM base light active-line (#cceeff / #99eeff) looks “white” on dark panel — remove */
    ".cm-activeLine": {
        backgroundColor: "transparent",
    },
    "&.cm-focused .cm-activeLine": {
        backgroundColor: "transparent",
    },
    ".cm-gutters": {
        backgroundColor: EDITOR_GUTTER_BG,
        color: "#7a8494",
        border: "none",
        borderRight: "1px solid rgba(255, 255, 255, 0.06)",
        fontFamily: FONT_FAMILY,
        fontSize: FONT_SIZE,
        lineHeight: LINE_HEIGHT,
    },
    ".cm-gutter": {
        fontFamily: FONT_FAMILY,
        fontSize: FONT_SIZE,
        lineHeight: LINE_HEIGHT,
        backgroundColor: EDITOR_GUTTER_BG,
    },
    ".cm-lineNumbers .cm-gutterElement": {
        fontFamily: FONT_FAMILY,
        fontSize: FONT_SIZE,
        lineHeight: LINE_HEIGHT,
        minWidth: "3ch",
        padding: "0 10px 0 8px",
        textAlign: "right",
        boxSizing: "border-box",
        backgroundColor: "transparent",
    },
    ".cm-activeLineGutter": {
        backgroundColor: "transparent",
        color: "#a8b0bd",
    },
    "&.cm-focused .cm-activeLineGutter": {
        backgroundColor: "transparent",
        color: "#a8b0bd",
    },
    /* Selection: soft blue, not white wash */
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
        backgroundColor: "rgba(116, 194, 255, 0.22) !important",
    },
    ".cm-selectionLayer .cm-selectionBackground": {
        backgroundColor: "rgba(116, 194, 255, 0.22) !important",
    },
}, { dark: true });

export const softEditorHighlight: Extension = syntaxHighlighting(HighlightStyle.define([
    { tag: t.comment, color: "#5c6a8a" },
    { tag: [ t.string, t.special(t.brace) ], color: "#a8ad72" },
    { tag: [ t.number, t.self, t.bool, t.null ], color: "#9580b8" },
    { tag: [ t.keyword, t.operator ], color: "#b875a0" },
    { tag: [ t.definitionKeyword, t.typeName ], color: "#6a9eac" },
    {
        tag: [
            t.propertyName,
            t.definition(t.propertyName),
            t.attributeName,
            t.className,
            t.function(t.variableName),
        ],
        color: "#6aad80",
    },
    { tag: t.variableName, color: "#9aa3b0" },
    { tag: t.meta, color: "#6e7785" },
]));

export const dockgeEditorAppearance: Extension[] = [
    softEditorChrome,
    softEditorHighlight,
];
