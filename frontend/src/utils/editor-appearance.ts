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

/** Base chrome: font, size, dim default text, original-like panel bg, no focus flash */
export const softEditorChrome: Extension = EditorView.theme({
    "&": {
        fontSize: "15.5px",
        fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
        color: "#a8b0bd",
        backgroundColor: EDITOR_BG,
    },
    ".cm-content": {
        fontFamily: "inherit",
        fontSize: "inherit",
        caretColor: "#a8b0bd",
        outline: "none",
        lineHeight: "1.55",
        backgroundColor: EDITOR_BG,
    },
    ".cm-scroller": {
        fontFamily: "inherit",
        lineHeight: "1.55",
        backgroundColor: EDITOR_BG,
    },
    "&.cm-focused": {
        outline: "none",
    },
    ".cm-gutters": {
        backgroundColor: EDITOR_GUTTER_BG,
        color: "#6e7681",
        border: "none",
        fontSize: "13px",
    },
    ".cm-activeLine": {
        backgroundColor: "rgba(68, 71, 90, 0.35)",
    },
    ".cm-activeLineGutter": {
        backgroundColor: "rgba(68, 71, 90, 0.35)",
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
