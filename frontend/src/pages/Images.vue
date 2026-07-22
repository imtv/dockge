<template>
    <div class="images-page">
        <h1 class="mb-3">
            {{ $t("images") }}
        </h1>

        <!-- Host switcher: Current + agents (only when multi-agent) -->
        <ul v-if="showHostTabs" class="nav nav-pills host-tabs mb-3">
            <li
                v-for="tab in hostTabs"
                :key="sectionKey(tab.endpoint)"
                class="nav-item"
            >
                <button
                    type="button"
                    class="nav-link host-tab"
                    :class="{ active: activeEndpoint === tab.endpoint }"
                    :disabled="!tab.online && tab.endpoint !== ''"
                    @click="selectHost(tab.endpoint)"
                >
                    <span class="tab-label">{{ tab.label }}</span>
                    <!-- All hosts get a dot: green=ok, yellow=updates, red/orange=offline/connecting -->
                    <span
                        class="tab-status-dot"
                        :class="tabDotClass(tab)"
                        :title="tabDotTitle(tab)"
                    ></span>
                    <span
                        v-if="sectionUpdateCount(tab.endpoint) > 0 && tab.online"
                        class="tab-update-badge"
                        :title="$t('updatesAvailable')"
                    >{{ sectionUpdateCount(tab.endpoint) }}</span>
                </button>
            </li>
        </ul>

        <!-- Toolbar: same as original — only for the selected host -->
        <div class="mb-3 toolbar">
            <button
                class="btn btn-primary"
                :disabled="!activeOnline || loading || checking"
                @click="checkUpdates"
            >
                <font-awesome-icon
                    :icon="checking ? 'spinner' : 'cloud-arrow-down'"
                    class="me-1"
                    :spin="checking"
                />
                {{ checking ? $t("checkingUpdates") : $t("checkImageUpdates") }}
            </button>
            <button class="btn btn-normal" :disabled="!activeOnline || loading" @click="loadImages">
                <font-awesome-icon icon="arrows-rotate" class="me-1" />
                {{ $t("refresh") }}
            </button>
            <button
                class="btn btn-normal"
                :disabled="!activeOnline || loading || unusedCount === 0"
                @click="confirmPruneUnused"
            >
                <font-awesome-icon icon="trash" class="me-1" />
                {{ $t("pruneUnusedImages") }}
                <span v-if="unusedCount > 0" class="count-pill">{{ unusedCount }}</span>
            </button>
            <button
                class="btn btn-normal"
                :disabled="!activeOnline || loading || danglingCount === 0"
                @click="confirmPruneDangling"
            >
                <font-awesome-icon icon="trash" class="me-1" />
                {{ $t("pruneDanglingImages") }}
                <span v-if="danglingCount > 0" class="count-pill">{{ danglingCount }}</span>
            </button>
            <button
                v-if="selectedIds.length > 0"
                class="btn btn-danger"
                :disabled="!activeOnline || loading"
                @click="confirmRemoveSelected"
            >
                <font-awesome-icon icon="trash" class="me-1" />
                {{ $t("deleteSelected") }}
                <span class="count-pill danger">{{ selectedIds.length }}</span>
            </button>

            <span v-if="checkStatus.lastCheckAt" class="meta-line">
                {{ $t("lastChecked") }}: {{ formatTime(checkStatus.lastCheckAt) }}
            </span>
        </div>

        <!-- List panel — original structure, one host at a time -->
        <div class="shadow-box image-panel mb-3">
            <div class="list-header">
                <div class="header-top">
                    <div class="filters image-row-align">
                        <label class="filter-check filter-check-primary">
                            <span class="row-check">
                                <input v-model="filterUnusedOnly" class="form-check-input" type="checkbox">
                            </span>
                            <span>{{ $t("unusedOnly") }}</span>
                        </label>
                        <label class="filter-check">
                            <input v-model="filterDanglingOnly" class="form-check-input" type="checkbox">
                            <span>{{ $t("danglingOnly") }}</span>
                        </label>
                        <label class="filter-check">
                            <input v-model="filterUpdateOnly" class="form-check-input" type="checkbox">
                            <span>{{ $t("updateAvailableOnly") }}</span>
                        </label>
                    </div>
                    <div class="search-wrapper">
                        <a v-if="searchText === ''" class="search-icon">
                            <font-awesome-icon icon="search" />
                        </a>
                        <a v-else class="search-icon" style="cursor: pointer" @click="searchText = ''">
                            <font-awesome-icon icon="times" />
                        </a>
                        <form @submit.prevent>
                            <input
                                v-model="searchText"
                                class="form-control search-input"
                                autocomplete="off"
                                :placeholder="$t('searchImages')"
                            >
                        </form>
                    </div>
                </div>
            </div>

            <div v-if="!activeOnline && activeEndpoint !== ''" class="empty-state">
                {{ $t("agentOffline") }}
            </div>
            <div v-else-if="loading && imageList.length === 0" class="empty-state">
                {{ $t("loading") }}...
            </div>
            <div v-else-if="filteredList.length === 0" class="empty-state">
                {{ $t("noImages") }}
            </div>
            <div v-else class="image-list">
                <div class="image-row select-all-row">
                    <label class="row-check">
                        <input
                            class="form-check-input"
                            type="checkbox"
                            :checked="allSelectableSelected"
                            @change="toggleSelectAll"
                        >
                    </label>
                    <div class="row-main muted-label">
                        {{ $t("imageName") }}
                    </div>
                    <div class="row-id muted-label">{{ $t("imageId") }}</div>
                    <div class="row-meta muted-label">{{ $t("size") }}</div>
                    <div class="row-created muted-label">{{ $t("created") }}</div>
                    <div class="row-status muted-label">{{ $t("status") }}</div>
                    <div class="row-actions muted-label">{{ $t("actions") }}</div>
                </div>

                <div
                    v-for="img in filteredList"
                    :key="img.id + img.name + img.tag"
                    class="image-row"
                    :class="{ disabled: img.inUsed }"
                >
                    <label class="row-check">
                        <input
                            v-model="selectedMap[img.id]"
                            class="form-check-input"
                            type="checkbox"
                            :disabled="img.inUsed"
                            :title="img.inUsed ? $t('imageInUse') : ''"
                        >
                    </label>
                    <div class="row-main">
                        <div class="title-line">
                            <span class="name">{{ displayImageName(img) }}</span>
                            <span class="tag">:{{ displayImageTag(img) }}</span>
                            <span v-if="img.dangling" class="badge dangling-badge ms-2">{{ $t("dangling") }}</span>
                            <span v-if="img.needUpdate" class="badge update-badge ms-2">{{ $t("update") }}</span>
                        </div>
                        <div class="mobile-meta">
                            <span class="mobile-meta-item">{{ img.sizeFormat }}</span>
                            <span class="mobile-meta-item id-chip">{{ img.shortId }}</span>
                            <span
                                v-if="img.inUsed"
                                class="status-pill active"
                            >{{ $t("inUse") }}</span>
                            <span
                                v-else-if="img.dangling"
                                class="status-pill dangling"
                            >{{ $t("dangling") }}</span>
                            <span
                                v-else
                                class="status-pill unused"
                            >{{ $t("unused") }}</span>
                        </div>
                    </div>
                    <div class="row-id">
                        <code class="id-chip">{{ img.shortId }}</code>
                    </div>
                    <div class="row-meta">
                        {{ img.sizeFormat }}
                    </div>
                    <div class="row-created">
                        {{ img.createTime || "—" }}
                    </div>
                    <div class="row-status">
                        <span v-if="img.inUsed" class="status-pill active">{{ $t("inUse") }}</span>
                        <span v-else class="status-pill unused">{{ $t("unused") }}</span>
                        <span v-if="img.dangling" class="status-pill dangling ms-1">{{ $t("dangling") }}</span>
                    </div>
                    <div class="row-actions">
                        <button
                            class="btn btn-sm btn-normal delete-btn"
                            :disabled="img.inUsed || loading"
                            :title="img.inUsed ? $t('imageInUse') : $t('deleteImage')"
                            @click="confirmRemoveOne(img)"
                        >
                            <font-awesome-icon icon="trash" />
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <Confirm ref="confirmRemove" :yes-text="$t('Yes')" :no-text="$t('No')" @yes="doRemove">
            {{ confirmMessage }}
        </Confirm>
    </div>
</template>

<script>
import Confirm from "../components/Confirm.vue";

function emptyEndpointState() {
    return {
        imageList: [],
        loading: false,
        checking: false,
        checkStatus: {},
        selectedMap: {},
        error: null,
    };
}

export default {
    components: {
        Confirm,
    },
    data() {
        return {
            /** Currently selected host endpoint ("" = current) */
            activeEndpoint: "",
            /** Cache per host — lists never merged */
            byEndpoint: {},
            searchText: "",
            filterUnusedOnly: false,
            filterDanglingOnly: false,
            filterUpdateOnly: false,
            confirmMessage: "",
            pendingAction: null,
        };
    },
    computed: {
        showHostTabs() {
            return this.$root.agentCount > 1;
        },
        hostTabs() {
            const list = this.$root.agentList || {};
            const endpoints = Object.keys(list);
            if (!endpoints.includes("")) {
                endpoints.unshift("");
            } else {
                endpoints.sort((a, b) => {
                    if (a === "") {
                        return -1;
                    }
                    if (b === "") {
                        return 1;
                    }
                    return a.localeCompare(b);
                });
            }
            return endpoints.map((endpoint) => {
                const agent = list[endpoint] || {};
                const status = endpoint === ""
                    ? "online"
                    : (this.$root.agentStatusList[endpoint] || "offline");
                return {
                    endpoint,
                    label: this.endpointLabel(endpoint, agent),
                    status,
                    online: status === "online" || endpoint === "",
                };
            });
        },
        activeOnline() {
            if (this.activeEndpoint === "") {
                return true;
            }
            return this.$root.agentStatusList[this.activeEndpoint] === "online";
        },
        activeState() {
            return this.state(this.activeEndpoint);
        },
        imageList() {
            return this.activeState.imageList || [];
        },
        loading() {
            return !!this.activeState.loading;
        },
        checking() {
            return !!this.activeState.checking;
        },
        checkStatus() {
            return this.activeState.checkStatus || {};
        },
        selectedMap: {
            get() {
                return this.activeState.selectedMap || {};
            },
            set(map) {
                const st = this.ensureState(this.activeEndpoint);
                st.selectedMap = map;
                this.touchState(this.activeEndpoint, st);
            },
        },
        filteredList() {
            let list = this.imageList;
            if (this.searchText) {
                const q = this.searchText.toLowerCase();
                list = list.filter((img) =>
                    img.name.toLowerCase().includes(q) ||
                    img.tag.toLowerCase().includes(q) ||
                    img.shortId.toLowerCase().includes(q) ||
                    (img.dangling && (
                        q.includes("dangling") ||
                        q.includes("untagged") ||
                        q.includes("none") ||
                        q.includes("无标签") ||
                        q.includes("旧镜像")
                    ))
                );
            }
            if (this.filterUnusedOnly) {
                list = list.filter((img) => !img.inUsed);
            }
            if (this.filterDanglingOnly) {
                list = list.filter((img) => img.dangling);
            }
            if (this.filterUpdateOnly) {
                list = list.filter((img) => img.needUpdate);
            }
            return list;
        },
        unusedCount() {
            return this.imageList.filter((img) => !img.inUsed).length;
        },
        danglingCount() {
            return this.imageList.filter((img) => img.dangling).length;
        },
        selectedIds() {
            return Object.keys(this.selectedMap).filter((id) => this.selectedMap[id]);
        },
        selectableIds() {
            return this.filteredList.filter((img) => !img.inUsed).map((img) => img.id);
        },
        allSelectableSelected() {
            return this.selectableIds.length > 0 && this.selectableIds.every((id) => this.selectedMap[id]);
        },
    },
    watch: {
        "$root.agentList": {
            deep: true,
            handler() {
                // Keep selection valid if agent removed
                const ok = this.hostTabs.some((t) => t.endpoint === this.activeEndpoint);
                if (!ok) {
                    this.activeEndpoint = "";
                }
            },
        },
        activeEndpoint() {
            // Load when switching tab if empty / offline handled in loadImages
            if (this.activeOnline) {
                this.loadImages();
            }
        },
    },
    mounted() {
        this.loadImages();
        // Prefetch update counts for tab badges (online agents only)
        for (const tab of this.hostTabs) {
            if (tab.endpoint !== this.activeEndpoint && tab.online) {
                this.loadImagesFor(tab.endpoint);
            }
        }
    },
    methods: {
        sectionKey(endpoint) {
            return endpoint === "" || endpoint == null ? "__local__" : endpoint;
        },
        ensureState(endpoint) {
            const key = this.sectionKey(endpoint);
            if (!this.byEndpoint[key]) {
                this.byEndpoint = {
                    ...this.byEndpoint,
                    [key]: emptyEndpointState(),
                };
            }
            return this.byEndpoint[key];
        },
        state(endpoint) {
            return this.byEndpoint[this.sectionKey(endpoint)] || emptyEndpointState();
        },
        touchState(endpoint, st) {
            const key = this.sectionKey(endpoint);
            this.byEndpoint = {
                ...this.byEndpoint,
                [key]: st,
            };
        },
        endpointLabel(endpoint, agent) {
            if (!endpoint) {
                return this.$t("currentEndpoint");
            }
            const named = this.$root.endpointDisplayFunction?.(endpoint);
            if (named) {
                return named;
            }
            if (agent?.name) {
                return agent.name;
            }
            return agent?.url || endpoint;
        },
        selectHost(endpoint) {
            this.activeEndpoint = endpoint;
            // Clear filters selection noise when switching? keep filters, clear selection is automatic via per-endpoint map
        },
        sectionUpdateCount(endpoint) {
            const st = this.state(endpoint).checkStatus;
            if (st && typeof st.imageUpdateCount === "number") {
                return st.imageUpdateCount;
            }
            return (this.state(endpoint).imageList || []).filter((i) => i.needUpdate).length;
        },
        /** Dot: offline/connecting take priority; else yellow if updates, green if ok */
        tabDotClass(tab) {
            if (tab.endpoint !== "" && tab.status === "offline") {
                return "offline";
            }
            if (tab.endpoint !== "" && tab.status === "connecting") {
                return "connecting";
            }
            if (tab.online && this.sectionUpdateCount(tab.endpoint) > 0) {
                return "update";
            }
            return "online";
        },
        tabDotTitle(tab) {
            if (tab.endpoint !== "" && tab.status === "offline") {
                return this.$t("agentOffline");
            }
            if (tab.endpoint !== "" && tab.status === "connecting") {
                return this.$t("connecting");
            }
            const n = this.sectionUpdateCount(tab.endpoint);
            if (tab.online && n > 0) {
                return this.$t("updatesAvailable") + (n ? ` (${n})` : "");
            }
            return this.$t("agentOnline");
        },
        formatTime(ts) {
            if (!ts) {
                return "";
            }
            return new Date(ts).toLocaleString();
        },
        displayImageName(img) {
            if (!img) {
                return "";
            }
            if (img.name && img.name !== "<none>") {
                return img.name;
            }
            return this.$t("danglingImage");
        },
        displayImageTag(img) {
            if (!img) {
                return "";
            }
            if (img.dangling || !img.tag || img.tag === "<none>") {
                return this.$t("danglingTag");
            }
            return img.tag;
        },
        loadImages() {
            this.loadImagesFor(this.activeEndpoint);
        },
        loadImagesFor(endpoint) {
            if (endpoint !== "" && this.$root.agentStatusList[endpoint] && this.$root.agentStatusList[endpoint] !== "online") {
                return;
            }
            const st = this.ensureState(endpoint);
            st.loading = true;
            st.error = null;
            this.touchState(endpoint, st);

            this.$root.emitAgent(endpoint, "getImageList", (res) => {
                const cur = this.ensureState(endpoint);
                cur.loading = false;
                if (res && res.ok) {
                    cur.imageList = res.imageList || [];
                    cur.checkStatus = res.checkStatus || {};
                    const ids = new Set(cur.imageList.map((i) => i.id));
                    for (const id of Object.keys(cur.selectedMap)) {
                        if (!ids.has(id)) {
                            delete cur.selectedMap[id];
                        }
                    }
                    this.touchState(endpoint, cur);
                    this.syncRootUpdateCount();
                } else {
                    cur.error = res?.msg || "error";
                    this.touchState(endpoint, cur);
                    if (res && endpoint === this.activeEndpoint) {
                        this.$root.toastRes(res);
                    }
                }
            });
        },
        checkUpdates() {
            const endpoint = this.activeEndpoint;
            if (endpoint !== "" && this.$root.agentStatusList[endpoint] && this.$root.agentStatusList[endpoint] !== "online") {
                return;
            }
            const st = this.ensureState(endpoint);
            st.checking = true;
            this.touchState(endpoint, st);

            this.$root.emitAgent(endpoint, "checkImageUpdates", (res) => {
                const cur = this.ensureState(endpoint);
                cur.checking = false;
                this.touchState(endpoint, cur);
                this.$root.toastRes(res);
                if (res && res.ok) {
                    cur.checkStatus = res.checkStatus || {};
                    this.touchState(endpoint, cur);
                    this.syncRootUpdateCount();
                    this.loadImagesFor(endpoint);
                }
            });
        },
        syncRootUpdateCount() {
            if (!this.$root?.setImageUpdateCountForEndpoint) {
                return;
            }
            for (const tab of this.hostTabs) {
                if (!tab.online) {
                    continue;
                }
                const st = this.state(tab.endpoint).checkStatus || {};
                if (typeof st.imageUpdateCount === "number") {
                    this.$root.setImageUpdateCountForEndpoint(
                        tab.endpoint || "",
                        st.imageUpdateCount,
                        st.lastCheckAt || 0,
                    );
                }
            }
        },
        toggleSelectAll(e) {
            const checked = e.target.checked;
            const st = this.ensureState(this.activeEndpoint);
            const map = {
                ...st.selectedMap,
            };
            for (const id of this.selectableIds) {
                map[id] = checked;
            }
            st.selectedMap = map;
            this.touchState(this.activeEndpoint, st);
        },
        confirmRemoveOne(img) {
            this.confirmMessage = this.$t("deleteImageConfirm", [ `${img.name}:${img.tag}` ]);
            this.pendingAction = {
                type: "removeOne",
                id: img.id,
            };
            this.$refs.confirmRemove.show();
        },
        confirmRemoveSelected() {
            this.confirmMessage = this.$t("deleteSelectedImagesConfirm", [ this.selectedIds.length ]);
            this.pendingAction = { type: "removeSelected" };
            this.$refs.confirmRemove.show();
        },
        confirmPruneUnused() {
            this.confirmMessage = this.$t("pruneUnusedImagesConfirm");
            this.pendingAction = { type: "pruneUnused" };
            this.$refs.confirmRemove.show();
        },
        confirmPruneDangling() {
            this.confirmMessage = this.$t("pruneDanglingImagesConfirm");
            this.pendingAction = { type: "pruneDangling" };
            this.$refs.confirmRemove.show();
        },
        doRemove() {
            const action = this.pendingAction;
            this.pendingAction = null;
            if (!action) {
                return;
            }
            const endpoint = this.activeEndpoint;
            const st = this.ensureState(endpoint);
            st.loading = true;
            this.touchState(endpoint, st);

            const done = (res) => {
                const cur = this.ensureState(endpoint);
                cur.loading = false;
                this.touchState(endpoint, cur);
                this.$root.toastRes(res);
                if (action.type === "removeSelected") {
                    cur.selectedMap = {};
                    this.touchState(endpoint, cur);
                }
                this.loadImagesFor(endpoint);
            };

            if (action.type === "removeOne") {
                this.$root.emitAgent(endpoint, "removeImage", action.id, false, done);
            } else if (action.type === "removeSelected") {
                this.$root.emitAgent(endpoint, "removeImages", this.selectedIds, false, done);
            } else if (action.type === "pruneUnused") {
                this.$root.emitAgent(endpoint, "pruneImages", false, done);
            } else if (action.type === "pruneDangling") {
                this.$root.emitAgent(endpoint, "pruneImages", true, done);
            }
        },
    },
};
</script>

<style lang="scss" scoped>
@import "../styles/vars.scss";

.host-tabs {
    flex-wrap: wrap;
    gap: 0.35rem;
}

.host-tab {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 1px solid transparent;
    cursor: pointer;

    &:disabled {
        opacity: 0.55;
        cursor: not-allowed;
    }

    .dark &.nav-link:not(.active) {
        color: $dark-font-color3;
    }
}

.tab-label {
    max-width: 12em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.tab-status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #6c757d;
    flex-shrink: 0;

    /* Healthy — no image updates */
    &.online {
        background: #4caf50;
    }

    /* Has registry updates */
    &.update {
        background: #f0ad4e;
    }

    /* Agent connecting */
    &.connecting {
        background: #f0ad4e;
        opacity: 0.75;
    }

    /* Agent offline */
    &.offline {
        background: #dc3545;
    }
}

.tab-update-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.15rem;
    height: 1.15rem;
    padding: 0 5px;
    border-radius: 10px;
    font-size: 11px;
    font-weight: 700;
    background: #f0ad4e;
    color: #212529;
    line-height: 1;
}

.toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
}

.count-pill {
    display: inline-block;
    margin-left: 6px;
    padding: 0 7px;
    border-radius: 10px;
    font-size: 12px;
    background: rgba(0, 0, 0, 0.08);
    color: inherit;

    &.danger {
        background: rgba(255, 255, 255, 0.2);
    }

    .dark & {
        background: rgba(255, 255, 255, 0.08);
    }
}

.meta-line {
    font-size: 13px;
    color: $dark-font-color3;
    margin-left: 0.25rem;
}

.update-badge {
    background-color: #f0ad4e;
    color: #212529;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 6px;
    vertical-align: middle;
}

.dangling-badge {
    background-color: rgba(240, 173, 78, 0.25);
    color: #a66b00;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 6px;
    vertical-align: middle;

    .dark & {
        background-color: rgba(240, 173, 78, 0.18);
        color: #e0a54a;
    }
}

.image-panel {
    padding: 0;
    overflow: hidden;
}

.list-header {
    border-bottom: 1px solid #dee2e6;
    border-radius: 10px 10px 0 0;
    padding: 10px 8px;
    margin: 0;

    .dark & {
        background-color: $dark-header-bg;
        border-bottom: 0;
    }
}

.header-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
}

.filters.image-row-align {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 14px;
    padding-left: 10px;
    min-width: 0;
}

.filter-check {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    font-size: 13px;
    color: $dark-font-color3;
    cursor: pointer;
    user-select: none;

    .form-check-input {
        margin: 0;
        cursor: pointer;
    }

    &.filter-check-primary {
        gap: 6px;

        .row-check {
            flex: 0 0 28px;
        }
    }
}

.search-wrapper {
    display: flex;
    align-items: center;
}

.search-icon {
    padding: 10px;
    color: #c0c0c0;

    svg[data-icon="times"] {
        cursor: pointer;
        transition: all ease-in-out 0.1s;

        &:hover {
            opacity: 0.5;
        }
    }
}

.search-input {
    max-width: 15em;
}

.empty-state {
    padding: 2rem 1rem;
    text-align: center;
    color: $dark-font-color3;
}

.image-list {
    max-height: calc(100vh - 280px);
    overflow-y: auto;
    padding: 6px 8px 10px;
}

.image-row {
    display: grid;
    align-items: center;
    column-gap: 0.5rem;
    row-gap: 0;
    min-height: 52px;
    padding: 8px 6px;
    border-radius: 10px;
    transition: background-color 0.15s ease-in-out;

    grid-template-columns: 1.75rem minmax(0, 1fr) 2.25rem;

    .row-id,
    .row-meta,
    .row-created,
    .row-status {
        display: none;
    }

    .mobile-meta {
        display: flex;
    }

    .select-all-row .mobile-meta {
        display: none;
    }

    @media (min-width: 768px) {
        grid-template-columns:
            1.75rem
            minmax(0, 2.6fr)
            minmax(0, 0.72fr)
            minmax(0, 0.58fr)
            2.25rem;
        padding: 8px 10px;
        column-gap: 0.35rem;

        .row-id,
        .row-meta {
            display: flex;
        }

        .mobile-meta {
            display: none;
        }
    }

    @media (min-width: 992px) {
        grid-template-columns:
            1.75rem
            minmax(0, 2.55fr)
            minmax(0, 0.62fr)
            minmax(0, 0.48fr)
            minmax(0, 0.72fr)
            minmax(0, 0.52fr)
            2.25rem;
        column-gap: 0.28rem;

        .row-created,
        .row-status {
            display: flex;
        }

        .row-created {
            padding-right: 0;
            margin-right: -0.15rem;
        }

        .row-status {
            padding-left: 0;
            margin-left: -0.15rem;
        }
    }

    &:not(.select-all-row):hover {
        background-color: $highlight-white;

        .dark & {
            background-color: rgba(255, 255, 255, 0.03);
        }
    }

    &.select-all-row {
        min-height: 36px;
        padding-top: 4px;
        padding-bottom: 4px;
        margin-bottom: 2px;
        border-bottom: 1px solid #dee2e6;

        .dark & {
            border-bottom-color: $dark-border-color;
        }

        @media (max-width: 767.98px) {
            .row-id,
            .row-meta,
            .row-created,
            .row-status {
                display: none;
            }
        }
    }

    &.disabled .name,
    &.disabled .tag {
        opacity: 0.85;
    }
}

.row-check {
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0;
    cursor: pointer;

    .form-check-input {
        margin: 0;
        cursor: pointer;
    }
}

.row-main {
    min-width: 0;
}

.muted-label {
    font-size: 12px;
    font-weight: 600;
    color: $dark-font-color3;
    text-transform: none;
}

.title-line {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 2px;
    min-width: 0;
    line-height: 1.3;
}

.mobile-meta {
    display: none;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin-top: 4px;
    font-size: 12px;
    color: $dark-font-color3;
}

.mobile-meta-item {
    opacity: 0.9;
}

.name {
    color: inherit;
    word-break: break-all;
}

.tag {
    color: $dark-font-color3;
    word-break: break-all;
}

.id-chip {
    font-size: 11px;
    padding: 1px 5px;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.05);
    color: inherit;

    .dark & {
        background: $dark-bg2;
        border: 1px solid $dark-border-color;
        color: $dark-font-color;
    }
}

.row-id,
.row-meta,
.row-created,
.row-status,
.row-actions {
    min-width: 0;
    justify-content: center;
    align-items: center;
    text-align: center;
}

.row-actions {
    display: flex;
}

.row-id {
    font-size: 12px;
    color: $dark-font-color3;
}

.row-meta {
    font-size: 13px;
    color: $dark-font-color3;
}

.row-created {
    font-size: 12px;
    color: $dark-font-color3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.status-pill {
    display: inline-block;
    font-size: 11px;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 20px;
    line-height: 1.2;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    &.active {
        background: rgba(76, 175, 80, 0.18);
        color: #4caf50;
    }

    &.unused {
        background: rgba(87, 92, 98, 0.2);
        color: $dark-font-color3;
    }

    &.dangling {
        background: rgba(240, 173, 78, 0.18);
        color: #c98a1a;
    }
}

.delete-btn {
    padding: 4px 8px;
    border-radius: 8px;

    &:not(:disabled):hover {
        color: $danger;
    }
}
</style>

<style lang="scss">
@import "../styles/vars.scss";

.dark .images-page {
    .form-check-input {
        width: 1.1em;
        height: 1.1em;
        background-color: #21262d;
        border: 1.5px solid #b1bac4;
        cursor: pointer;

        &:focus {
            border-color: $primary;
            box-shadow: 0 0 0 0.15rem rgba(116, 194, 255, 0.2);
        }

        &:checked {
            background-color: $primary;
            border-color: $primary;
            background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'%3e%3cpath fill='none' stroke='%23020b05' stroke-linecap='round' stroke-linejoin='round' stroke-width='3' d='m6 10 3 3 6-6'/%3e%3c/svg%3e");
        }

        &:disabled {
            opacity: 0.45;
            cursor: not-allowed;
            background-color: #161b22;
            border-color: #6e7681;
        }
    }

    .meta-line,
    .filter-check,
    .muted-label,
    .tag,
    .row-meta,
    .row-created,
    .row-id {
        color: $dark-font-color3;
    }

    .name {
        color: inherit;
    }

    .status-pill.unused {
        background: rgba(255, 255, 255, 0.06);
        color: $dark-font-color3;
    }

    .status-pill.active {
        background: rgba(134, 230, 169, 0.12);
        color: #86e6a9;
    }
}
</style>
