<template>
    <div class="images-page">
        <h1 class="mb-3">
            {{ $t("images") }}
        </h1>

        <!-- Global actions (all hosts) -->
        <div class="mb-3 toolbar">
            <button class="btn btn-primary" :disabled="anyChecking || anyLoading" @click="checkAllUpdates">
                <font-awesome-icon icon="cloud-arrow-down" class="me-1" :spin="anyChecking" />
                {{ anyChecking ? $t("checkingUpdates") : $t("checkImageUpdates") }}
            </button>
            <button class="btn btn-normal" :disabled="anyLoading" @click="loadAllImages">
                <font-awesome-icon icon="arrows-rotate" class="me-1" />
                {{ $t("refresh") }}
            </button>
        </div>

        <!-- List panel: one section per host (never merge lists) -->
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

            <div
                v-for="section in imageSections"
                :key="sectionKey(section.endpoint)"
                class="agent-image-section"
            >
                <!-- Host header (only when multi-agent) -->
                <div
                    v-if="showAgentHeaders"
                    class="agent-select"
                    @click="toggleAgent(section.endpoint)"
                >
                    <span class="me-1">
                        <font-awesome-icon v-show="isClosed(section.endpoint)" icon="chevron-circle-right" />
                        <font-awesome-icon v-show="!isClosed(section.endpoint)" icon="chevron-circle-down" />
                    </span>
                    <span class="agent-label">{{ section.label }}</span>
                    <span
                        class="agent-status-dot"
                        :class="section.status"
                        :title="section.status"
                    ></span>
                    <span v-if="section.status !== 'online' && section.endpoint !== ''" class="agent-offline-text">
                        ({{ $t(section.status === 'connecting' ? 'connecting' : 'agentOffline') }})
                    </span>
                    <span
                        v-if="sectionUpdateCount(section.endpoint) > 0"
                        class="agent-update-badge"
                        :title="$t('updatesAvailable')"
                    >{{ sectionUpdateCount(section.endpoint) }}</span>
                    <span class="agent-image-count">
                        {{ sectionImageCount(section.endpoint) }}
                    </span>
                </div>

                <div v-show="!showAgentHeaders || !isClosed(section.endpoint)" class="section-body">
                    <!-- Per-host toolbar: actions only affect this host -->
                    <div class="section-toolbar">
                        <button
                            class="btn btn-sm btn-primary"
                            :disabled="!section.online || isChecking(section.endpoint) || isLoading(section.endpoint)"
                            @click="checkUpdates(section.endpoint)"
                        >
                            <font-awesome-icon
                                icon="cloud-arrow-down"
                                class="me-1"
                                :spin="isChecking(section.endpoint)"
                            />
                            {{ isChecking(section.endpoint) ? $t("checkingUpdates") : $t("checkImageUpdates") }}
                        </button>
                        <button
                            class="btn btn-sm btn-normal"
                            :disabled="!section.online || isLoading(section.endpoint)"
                            @click="loadImages(section.endpoint)"
                        >
                            <font-awesome-icon icon="arrows-rotate" class="me-1" />
                            {{ $t("refresh") }}
                        </button>
                        <button
                            class="btn btn-sm btn-normal"
                            :disabled="!section.online || isLoading(section.endpoint) || unusedCount(section.endpoint) === 0"
                            @click="confirmPruneUnused(section.endpoint)"
                        >
                            <font-awesome-icon icon="trash" class="me-1" />
                            {{ $t("pruneUnusedImages") }}
                            <span v-if="unusedCount(section.endpoint) > 0" class="count-pill">{{ unusedCount(section.endpoint) }}</span>
                        </button>
                        <button
                            class="btn btn-sm btn-normal"
                            :disabled="!section.online || isLoading(section.endpoint) || danglingCount(section.endpoint) === 0"
                            @click="confirmPruneDangling(section.endpoint)"
                        >
                            <font-awesome-icon icon="trash" class="me-1" />
                            {{ $t("pruneDanglingImages") }}
                            <span v-if="danglingCount(section.endpoint) > 0" class="count-pill">{{ danglingCount(section.endpoint) }}</span>
                        </button>
                        <button
                            v-if="selectedIds(section.endpoint).length > 0"
                            class="btn btn-sm btn-danger"
                            :disabled="!section.online || isLoading(section.endpoint)"
                            @click="confirmRemoveSelected(section.endpoint)"
                        >
                            <font-awesome-icon icon="trash" class="me-1" />
                            {{ $t("deleteSelected") }}
                            <span class="count-pill danger">{{ selectedIds(section.endpoint).length }}</span>
                        </button>
                        <span v-if="lastChecked(section.endpoint)" class="meta-line">
                            {{ $t("lastChecked") }}: {{ formatTime(lastChecked(section.endpoint)) }}
                        </span>
                    </div>

                    <div v-if="!section.online && section.endpoint !== ''" class="empty-state">
                        {{ $t("agentOffline") }}
                    </div>
                    <div v-else-if="isLoading(section.endpoint) && sectionImages(section.endpoint).length === 0" class="empty-state">
                        {{ $t("loading") }}...
                    </div>
                    <div v-else-if="filteredList(section.endpoint).length === 0" class="empty-state">
                        {{ $t("noImages") }}
                    </div>
                    <div v-else class="image-list">
                        <div class="image-row select-all-row">
                            <label class="row-check">
                                <input
                                    class="form-check-input"
                                    type="checkbox"
                                    :checked="allSelectableSelected(section.endpoint)"
                                    @change="toggleSelectAll(section.endpoint, $event)"
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
                            v-for="img in filteredList(section.endpoint)"
                            :key="sectionKey(section.endpoint) + '|' + img.id + '|' + img.name + '|' + img.tag"
                            class="image-row"
                            :class="{ disabled: img.inUsed }"
                        >
                            <label class="row-check">
                                <input
                                    class="form-check-input"
                                    type="checkbox"
                                    :checked="!!selectedMapFor(section.endpoint)[img.id]"
                                    :disabled="img.inUsed"
                                    :title="img.inUsed ? $t('imageInUse') : ''"
                                    @change="setSelected(section.endpoint, img.id, $event.target.checked)"
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
                                    :disabled="img.inUsed || isLoading(section.endpoint)"
                                    :title="img.inUsed ? $t('imageInUse') : $t('deleteImage')"
                                    @click="confirmRemoveOne(section.endpoint, img)"
                                >
                                    <font-awesome-icon icon="trash" />
                                </button>
                            </div>
                        </div>
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
            /** endpoint -> state (lists never merged) */
            byEndpoint: {},
            searchText: "",
            filterUnusedOnly: false,
            filterDanglingOnly: false,
            filterUpdateOnly: false,
            closedAgents: {},
            confirmMessage: "",
            pendingAction: null,
        };
    },
    computed: {
        showAgentHeaders() {
            return this.$root.agentCount > 1;
        },
        /** One section per known agent; local "" first; lists stay separate */
        imageSections() {
            const list = this.$root.agentList || {};
            const endpoints = Object.keys(list);
            // Ensure local host always present even before agentList arrives
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
        anyLoading() {
            return Object.values(this.byEndpoint).some((s) => s && s.loading);
        },
        anyChecking() {
            return Object.values(this.byEndpoint).some((s) => s && s.checking);
        },
    },
    watch: {
        // Reload when agent list or online status changes
        "$root.agentList": {
            deep: true,
            handler() {
                this.loadAllImages();
            },
        },
        "$root.agentStatusList": {
            deep: true,
            handler() {
                // Only fetch newly online agents that we don't have yet
                for (const section of this.imageSections) {
                    if (section.online && !this.byEndpoint[this.sectionKey(section.endpoint)]) {
                        this.loadImages(section.endpoint);
                    }
                }
            },
        },
    },
    mounted() {
        this.loadAllImages();
    },
    methods: {
        sectionKey(endpoint) {
            return endpoint === "" || endpoint == null ? "__local__" : endpoint;
        },
        ensureState(endpoint) {
            const key = this.sectionKey(endpoint);
            if (!this.byEndpoint[key]) {
                // Vue 3: direct assign is reactive; keep pattern simple for both
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
        isClosed(endpoint) {
            return !!this.closedAgents[this.sectionKey(endpoint)];
        },
        toggleAgent(endpoint) {
            const key = this.sectionKey(endpoint);
            this.closedAgents = {
                ...this.closedAgents,
                [key]: !this.closedAgents[key],
            };
        },
        isLoading(endpoint) {
            return !!this.state(endpoint).loading;
        },
        isChecking(endpoint) {
            return !!this.state(endpoint).checking;
        },
        sectionImages(endpoint) {
            return this.state(endpoint).imageList || [];
        },
        sectionImageCount(endpoint) {
            return this.sectionImages(endpoint).length;
        },
        sectionUpdateCount(endpoint) {
            const st = this.state(endpoint).checkStatus;
            if (st && typeof st.imageUpdateCount === "number") {
                return st.imageUpdateCount;
            }
            return this.sectionImages(endpoint).filter((i) => i.needUpdate).length;
        },
        lastChecked(endpoint) {
            return this.state(endpoint).checkStatus?.lastCheckAt || 0;
        },
        selectedMapFor(endpoint) {
            return this.state(endpoint).selectedMap || {};
        },
        setSelected(endpoint, id, checked) {
            const st = this.ensureState(endpoint);
            st.selectedMap = {
                ...st.selectedMap,
                [id]: checked,
            };
            this.touchState(endpoint, st);
        },
        touchState(endpoint, st) {
            const key = this.sectionKey(endpoint);
            this.byEndpoint = {
                ...this.byEndpoint,
                [key]: st,
            };
        },
        filteredList(endpoint) {
            let list = this.sectionImages(endpoint);
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
        unusedCount(endpoint) {
            return this.sectionImages(endpoint).filter((img) => !img.inUsed).length;
        },
        danglingCount(endpoint) {
            return this.sectionImages(endpoint).filter((img) => img.dangling).length;
        },
        selectedIds(endpoint) {
            const map = this.selectedMapFor(endpoint);
            return Object.keys(map).filter((id) => map[id]);
        },
        selectableIds(endpoint) {
            return this.filteredList(endpoint).filter((img) => !img.inUsed).map((img) => img.id);
        },
        allSelectableSelected(endpoint) {
            const ids = this.selectableIds(endpoint);
            const map = this.selectedMapFor(endpoint);
            return ids.length > 0 && ids.every((id) => map[id]);
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
        loadAllImages() {
            for (const section of this.imageSections) {
                if (section.online) {
                    this.loadImages(section.endpoint);
                }
            }
        },
        loadImages(endpoint) {
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
                    if (res) {
                        this.$root.toastRes(res);
                    }
                }
            });
        },
        checkAllUpdates() {
            for (const section of this.imageSections) {
                if (section.online) {
                    this.checkUpdates(section.endpoint);
                }
            }
        },
        checkUpdates(endpoint) {
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
                    this.loadImages(endpoint);
                }
            });
        },
        /** Push each host's count into root map; badge = sum (lists stay separate) */
        syncRootUpdateCount() {
            if (!this.$root?.setImageUpdateCountForEndpoint) {
                return;
            }
            for (const section of this.imageSections) {
                if (!section.online) {
                    continue;
                }
                const st = this.state(section.endpoint).checkStatus || {};
                if (typeof st.imageUpdateCount === "number") {
                    this.$root.setImageUpdateCountForEndpoint(
                        section.endpoint || "",
                        st.imageUpdateCount,
                        st.lastCheckAt || 0,
                    );
                }
            }
        },
        toggleSelectAll(endpoint, e) {
            const checked = e.target.checked;
            const st = this.ensureState(endpoint);
            const map = {
                ...st.selectedMap,
            };
            for (const id of this.selectableIds(endpoint)) {
                map[id] = checked;
            }
            st.selectedMap = map;
            this.touchState(endpoint, st);
        },
        confirmRemoveOne(endpoint, img) {
            this.confirmMessage = this.$t("deleteImageConfirm", [ `${img.name}:${img.tag}` ]);
            this.pendingAction = {
                type: "removeOne",
                endpoint,
                id: img.id,
            };
            this.$refs.confirmRemove.show();
        },
        confirmRemoveSelected(endpoint) {
            this.confirmMessage = this.$t("deleteSelectedImagesConfirm", [ this.selectedIds(endpoint).length ]);
            this.pendingAction = {
                type: "removeSelected",
                endpoint,
            };
            this.$refs.confirmRemove.show();
        },
        confirmPruneUnused(endpoint) {
            this.confirmMessage = this.$t("pruneUnusedImagesConfirm");
            this.pendingAction = {
                type: "pruneUnused",
                endpoint,
            };
            this.$refs.confirmRemove.show();
        },
        confirmPruneDangling(endpoint) {
            this.confirmMessage = this.$t("pruneDanglingImagesConfirm");
            this.pendingAction = {
                type: "pruneDangling",
                endpoint,
            };
            this.$refs.confirmRemove.show();
        },
        doRemove() {
            const action = this.pendingAction;
            this.pendingAction = null;
            if (!action) {
                return;
            }
            const endpoint = action.endpoint;
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
                this.loadImages(endpoint);
            };

            if (action.type === "removeOne") {
                this.$root.emitAgent(endpoint, "removeImage", action.id, false, done);
            } else if (action.type === "removeSelected") {
                this.$root.emitAgent(endpoint, "removeImages", this.selectedIds(endpoint), false, done);
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

.toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
}

.section-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    padding: 8px 10px 4px;
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

.agent-image-section {
    border-bottom: 1px solid #dee2e6;

    &:last-child {
        border-bottom: 0;
    }

    .dark & {
        border-bottom-color: $dark-border-color;
    }
}

.agent-select {
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    color: $dark-font-color3;
    padding: 10px 12px;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    user-select: none;

    .dark & {
        background-color: rgba(255, 255, 255, 0.02);
    }

    &:hover {
        background-color: $highlight-white;

        .dark & {
            background-color: rgba(255, 255, 255, 0.04);
        }
    }
}

.agent-label {
    color: inherit;
}

.agent-status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
    background: #6c757d;

    &.online {
        background: #4caf50;
    }

    &.connecting {
        background: #f0ad4e;
    }

    &.offline {
        background: #dc3545;
    }
}

.agent-offline-text {
    font-size: 12px;
    opacity: 0.8;
}

.agent-update-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.25rem;
    height: 1.25rem;
    padding: 0 6px;
    border-radius: 10px;
    font-size: 11px;
    font-weight: 700;
    background: #f0ad4e;
    color: #212529;
}

.agent-image-count {
    margin-left: auto;
    font-size: 12px;
    opacity: 0.75;
}

.section-body {
    padding-bottom: 6px;
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
    padding: 1.5rem 1rem;
    text-align: center;
    color: $dark-font-color3;
}

.image-list {
    max-height: calc(100vh - 320px);
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
