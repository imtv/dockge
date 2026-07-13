<template>
    <div>
        <div v-if="settingsLoaded" class="my-4">
            <form class="my-4" autocomplete="off" @submit.prevent="saveGeneral">
                <div class="shadow-box mb-3 editor-box edit-mode">
                    <code-mirror
                        ref="editor"
                        v-model="settings.globalENV"
                        :extensions="extensionsEnv"
                        minimal
                        wrap="true"
                        dark="true"
                        tab="true"
                        :hasFocus="editorFocus"
                        @change="onChange"
                    />
                </div>

                <div class="my-4">
                    <!-- Save Button -->
                    <div>
                        <button class="btn btn-primary" type="submit">
                            {{ $t("Save") }}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    </div>
</template>

<script>
import CodeMirror from "vue-codemirror6";
import { python } from "@codemirror/lang-python"; // good enough for .env key=value highlighting
import { lineNumbers, EditorView } from "@codemirror/view";
import { ref } from "vue";
import { dockgeEditorAppearance } from "../../utils/editor-appearance";

export default {
    name: "GlobalEnv",
    components: {
        CodeMirror,
    },

    setup() {
        const editorFocus = ref(false);

        const focusEffectHandler = (state, focusing) => {
            editorFocus.value = focusing;
            return null;
        };

        const extensionsEnv = [
            ...dockgeEditorAppearance,
            python(),
            lineNumbers(),
            EditorView.focusChangeEffect.of(focusEffectHandler),
        ];

        return { editorFocus,
            extensionsEnv };
    },

    computed: {
        settings() {
            return this.$parent.$parent.$parent.settings;
        },
        saveSettings() {
            return this.$parent.$parent.$parent.saveSettings;
        },
        settingsLoaded() {
            return this.$parent.$parent.$parent.settingsLoaded;
        },
    },

    methods: {
        /** Save the settings */
        saveGeneral() {
            this.saveSettings();
        },

        onChange() {
            // hook for future live validation if desired
        },
    },
};
</script>

<style scoped lang="scss">
.editor-box {
    /* Same as Compose.vue editor */
    font-family: "JetBrains Mono", monospace;
    font-size: 14px;
    overflow: hidden;
    background-color: #0d1117 !important;

    &.edit-mode {
        background-color: #2d2f3f !important;
    }

    :deep(.cm-editor),
    :deep(.cm-scroller),
    :deep(.cm-content),
    :deep(.cm-gutters),
    :deep(.cm-gutter),
    :deep(.cm-gutterElement),
    :deep(.cm-line),
    :deep(.cm-activeLine),
    :deep(.cm-activeLineGutter) {
        background-color: transparent !important;
        font-family: inherit !important;
        font-size: inherit !important;
    }

    :deep(.cm-gutters) {
        border: none !important;
    }

    :deep(.cm-lineNumbers .cm-gutterElement) {
        padding-left: 4px !important;
        padding-right: 8px !important;
        min-width: 2.5ch;
        text-align: right;
    }

    :deep(.cm-content) {
        padding-left: 6px !important;
        padding-right: 4px !important;
    }
}
</style>
