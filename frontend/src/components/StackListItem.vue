<template>
    <router-link :to="url" :class="{ 'dim' : !stack.isManagedByDockge }" class="item">
        <Uptime :stack="stack" :fixed-width="true" class="me-2" />
        <div class="title">
            <span>{{ stackName }}</span>
            <!-- imtv: image update available -->
            <span
                v-if="stack.hasUpdate"
                class="badge update-badge ms-2"
                :title="$t('imageUpdateAvailable')"
            >{{ $t("update") }}</span>
        </div>
        <!-- imtv: published / host ports on the right -->
        <div v-if="displayPorts.length > 0" class="ports" :title="portsTitle">
            <span v-if="stack.hostNetwork" class="host-tag">host</span>
            <span
                v-for="(p, i) in displayPorts"
                :key="i"
                class="port-chip"
            >{{ p }}</span>
            <span v-if="extraPortCount > 0" class="port-chip more">+{{ extraPortCount }}</span>
        </div>
    </router-link>
</template>

<script>
import Uptime from "./Uptime.vue";

const MAX_VISIBLE_PORTS = 4;

export default {
    components: {
        Uptime
    },
    props: {
        /** Stack this represents */
        stack: {
            type: Object,
            default: null,
        },
        /** If the user is in select mode */
        isSelectMode: {
            type: Boolean,
            default: false,
        },
        /** How many ancestors are above this stack */
        depth: {
            type: Number,
            default: 0,
        },
        /** Callback to determine if stack is selected */
        isSelected: {
            type: Function,
            default: () => {}
        },
        /** Callback fired when stack is selected */
        select: {
            type: Function,
            default: () => {}
        },
        /** Callback fired when stack is deselected */
        deselect: {
            type: Function,
            default: () => {}
        },
    },
    data() {
        return {
            isCollapsed: true,
        };
    },
    computed: {
        endpointDisplay() {
            return this.$root.endpointDisplayFunction(this.stack.endpoint);
        },
        url() {
            if (this.stack.endpoint) {
                return `/compose/${this.stack.name}/${this.stack.endpoint}`;
            } else {
                return `/compose/${this.stack.name}`;
            }
        },
        depthMargin() {
            return {
                marginLeft: `${31 * this.depth}px`,
            };
        },
        stackName() {
            return this.stack.name;
        },
        allPorts() {
            const ports = this.stack?.ports;
            return Array.isArray(ports) ? ports : [];
        },
        displayPorts() {
            return this.allPorts.slice(0, MAX_VISIBLE_PORTS);
        },
        extraPortCount() {
            return Math.max(0, this.allPorts.length - MAX_VISIBLE_PORTS);
        },
        portsTitle() {
            const list = this.allPorts.join(", ");
            if (this.stack.hostNetwork) {
                return `host: ${list}`;
            }
            return list;
        },
    },
    watch: {
        isSelectMode() {
            // TODO: Resize the heartbeat bar, but too slow
            // this.$refs.heartbeatBar.resize();
        }
    },
    beforeMount() {

    },
    methods: {
        /**
         * Changes the collapsed value of the current stack and saves
         * it to local storage
         * @returns {void}
         */
        changeCollapsed() {
            this.isCollapsed = !this.isCollapsed;

            // Save collapsed value into local storage
            let storage = window.localStorage.getItem("stackCollapsed");
            let storageObject = {};
            if (storage !== null) {
                storageObject = JSON.parse(storage);
            }
            storageObject[`stack_${this.stack.id}`] = this.isCollapsed;

            window.localStorage.setItem("stackCollapsed", JSON.stringify(storageObject));
        },

        /**
         * Toggle selection of stack
         * @returns {void}
         */
        toggleSelection() {
            if (this.isSelected(this.stack.id)) {
                this.deselect(this.stack.id);
            } else {
                this.select(this.stack.id);
            }
        },
    },
};
</script>

<style lang="scss" scoped>
@import "../styles/vars.scss";

.small-padding {
    padding-left: 5px !important;
    padding-right: 5px !important;
}

.collapse-padding {
    padding-left: 8px !important;
    padding-right: 2px !important;
}

.item {
    text-decoration: none;
    display: flex;
    align-items: center;
    min-height: 52px;
    border-radius: 10px;
    transition: all ease-in-out 0.15s;
    width: 100%;
    padding: 5px 8px;
    gap: 6px;
    &.disabled {
        opacity: 0.3;
    }
    &:hover {
        background-color: $highlight-white;
    }
    &.active {
        background-color: #cdf8f4;
    }
    .title {
        margin-top: -4px;
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 2px;
        min-width: 0;
        flex: 1 1 auto;
    }
    .update-badge {
        background-color: #f0ad4e;
        color: #212529;
        font-size: 11px;
        font-weight: 600;
        padding: 2px 6px;
        border-radius: 6px;
        line-height: 1.2;
        vertical-align: middle;
    }
    .endpoint {
        font-size: 12px;
        color: $dark-font-color3;
    }
}

.ports {
    margin-left: auto;
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    align-items: center;
    gap: 4px;
    max-width: 48%;
    flex: 0 1 auto;
}

.host-tag {
    font-size: 10px;
    font-weight: 600;
    text-transform: lowercase;
    color: $dark-font-color3;
    border: 1px solid rgba(87, 92, 98, 0.45);
    border-radius: 4px;
    padding: 1px 4px;
    line-height: 1.2;
}

.port-chip {
    font-size: 11px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    padding: 2px 6px;
    border-radius: 6px;
    background: rgba(116, 194, 255, 0.14);
    color: #4a8fbf;
    white-space: nowrap;

    &.more {
        background: rgba(87, 92, 98, 0.12);
        color: $dark-font-color3;
    }

    .dark & {
        background: rgba(116, 194, 255, 0.12);
        color: #74c2ff;

        &.more {
            background: rgba(255, 255, 255, 0.06);
            color: $dark-font-color3;
        }
    }
}

.dark .host-tag {
    color: $dark-font-color3;
    border-color: $dark-border-color;
}

.collapsed {
    transform: rotate(-90deg);
}

.animated {
    transition: all 0.2s $easing-in;
}

.select-input-wrapper {
    float: left;
    margin-top: 15px;
    margin-left: 3px;
    margin-right: 10px;
    padding-left: 4px;
    position: relative;
    z-index: 15;
}

.dim {
    opacity: 0.5;
}

</style>
