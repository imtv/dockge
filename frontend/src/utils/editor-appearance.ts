/**
 * Shared CodeMirror appearance for Dockge editors (compose / .env).
 * Softer than stock Dracula so text is less glaring on dark UI.
 */
import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import type { Extension } from "@codemirror/state";

/** Soft blue-gray like original Dracula panel (#2d2f3f), not pure black */
const EDITOR_BG = "#2d2f3f";
const EDITOR_GUTTER_BG = "#282a36";
const LINE_HEIGHT = "1.55";
const FONT_SIZE = "15.5px";
const FONT_FAMILY = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace";

/**
 * Base chrome: font, size, dim default text, original-like panel bg.
 * Line numbers use the same font-size/line-height as content so they stay aligned.
 */
export const softEditorChrome: Extension = EditorView.theme({
    "&": {
        fontSize: FONT_SIZE,
        fontFamily: FONT_FAMILY,
        color: "#a8b0bd",
        backgroundColor: EDITOR_BG,
    },
    ".cm-scroller": {
        fontFamily: "inherit",
        fontSize: "inherit",
        lineHeight: LINE_HEIGHT,
        backgroundColor: EDITOR_BG,
    },
    ".cm-content": {
        fontFamily: "inherit",
        fontSize: "inherit",
        caretColor: "#a8b0bd",
        outline: "none",
        lineHeight: LINE_HEIGHT,
        backgroundColor: EDITOR_BG,
        // Match gutter vertical metrics
        paddingTop: "4px",
        paddingBottom: "4px",
    },
    ".cm-line": {
        fontFamily: "inherit",
        fontSize: "inherit",
        lineHeight: LINE_HEIGHT,
        padding: "0 4px 0 2px",
    },
    "&.cm-focused": {
        outline: "none",
    },
    ".cm-gutters": {
        backgroundColor: EDITOR_GUTTER_BG,
        color: "#7a8494",
        border: "none",
        fontFamily: "inherit",
        fontSize: "inherit",
        lineHeight: LINE_HEIGHT,
        // Keep gutters aligned with content padding
        paddingTop: "4px",
        paddingBottom: "4px",
    },
    ".cm-gutter": {
        fontFamily: "inherit",
        fontSize: "inherit",
        lineHeight: LINE_HEIGHT,
    },
    ".cm-gutterElement": {
        fontFamily: "inherit",
        fontSize: "inherit",
        lineHeight: LINE_HEIGHT,
        // CM sets height via style; line-height match avoids visual offset
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        boxSizing: "border-box",
        padding: "0 10px 0 8px",
        minWidth: "2.75em",
    },
    ".cm-lineNumbers .cm-gutterElement": {
        textAlign: "right",
    },
    ".cm-activeLine": {
        backgroundColor: "rgba(68, 71, 90, 0.35)",
    },
    ".cm-activeLineGutter": {
        backgroundColor: "rgba(68, 71, 90, 0.35)",
        color: "#a8b0bd",
    },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
        backgroundColor: "rgba(116, 194, 255, 0.18) !important",
    },
}, { dark: true });

/**
 * Muted syntax colors (dimmed Dracula-like palette).
 * Keys stay green but softer; plain text not pure white.
 */
export const softEditorHighlight: Extension = syntaxHighlighting(HighlightStyle.define([
    {
        tag: t.comment,
        color: "#5c6a8a",
    },
    {
        tag: [ t.string, t.special(t.brace) ],
        color: "#a8ad72",
    },
    {
        tag: [ t.number, t.self, t.bool, t.null ],
        color: "#9580b8",
    },
    {
        tag: [ t.keyword, t.operator ],
        color: "#b875a0",
    },
    {
        tag: [ t.definitionKeyword, t.typeName ],
        color: "#6a9eac",
    },
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
    {
        tag: t.variableName,
        color: "#9aa3b0",
    },
    {
        tag: t.meta,
        color: "#6e7785",
    },
]));

/** Compose + .env editors: chrome + soft highlight + no focus outline */
export const dockgeEditorAppearance: Extension[] = [
    softEditorChrome,
    softEditorHighlight,
];
