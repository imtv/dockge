<template>
    <div class="images-page">
        <h1 class="mb-3">
            {{ $t("images") }}
        </h1>

        <!-- Toolbar: same button language as rest of Dockge -->
        <div class="mb-3 toolbar">
            <button class="btn btn-primary" :disabled="loading || checking" @click="checkUpdates">
                <font-awesome-icon icon="cloud-arrow-down" class="me-1" :spin="checking" />
                {{ checking ? $t("checkingUpdates") : $t("checkImageUpdates") }}
            </button>
            <button class="btn btn-normal" :disabled="loading" @click="loadImages">
                <font-awesome-icon icon="arrows-rotate" class="me-1" />
                {{ $t("refresh") }}
            </button>
            <button class="btn btn-normal" :disabled="loading || unusedCount === 0" @click="confirmPruneUnused">
                <font-awesome-icon icon="trash" class="me-1" />
                {{ $t("pruneUnusedImages") }}
                <span v-if="unusedCount > 0" class="count-pill">{{ unusedCount }}</span>
            </button>
            <button class="btn btn-normal" :disabled="loading || danglingCount === 0" @click="confirmPruneDangling">
                <font-awesome-icon icon="trash" class="me-1" />
                {{ $t("pruneDanglingImages") }}
                <span v-if="danglingCount > 0" class="count-pill">{{ danglingCount }}</span>
            </button>
            <button
                v-if="selectedIds.length > 0"
                class="btn btn-danger"
                :disabled="loading"
                @click="confirmRemoveSelected"
            >
                <font-awesome-icon icon="trash" class="me-1" />
                {{ $t("deleteSelected") }}
                <span class="count-pill danger">{{ selectedIds.length }}</span>
            </button>

            <span v-if="checkStatus.lastCheckAt" class="meta-line">
                {{ $t("lastChecked") }}: {{ formatTime(checkStatus.lastCheckAt) }}
                <span v-if="checkStatus.imageUpdateCount > 0" class="badge update-badge ms-2">
                    {{ checkStatus.imageUpdateCount }} {{ $t("updatesAvailable") }}
                </span>
            </span>
        </div>

        <!-- List panel mirrors StackList chrome -->
        <div class="shadow-box image-panel mb-3">
            <div class="list-header">
                <div class="header-top">
                    <!-- Same left padding + 28px check column as image-row -->
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

            <div v-if="loading && imageList.length === 0" class="empty-state">
                {{ $t("loading") }}...
            </div>
            <div v-else-if="filteredList.length === 0" class="empty-state">
                {{ $t("noImages") }}
            </div>
            <div v-else class="image-list">
                <!-- Select-all / column headers -->
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
                        <!-- Mobile: meta under name (no fixed-width side columns) -->
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

export default {
    components: {
        Confirm,
    },
    data() {
        return {
            imageList: [],
            loading: false,
            checking: false,
            searchText: "",
            filterUnusedOnly: false,
            filterDanglingOnly: false,
            filterUpdateOnly: false,
            selectedMap: {},
            checkStatus: {},
            confirmMessage: "",
            pendingAction: null,
        };
    },
    computed: {
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
    mounted() {
        this.loadImages();
    },
    methods: {
        formatTime(ts) {
            if (!ts) {
                return "";
            }
            return new Date(ts).toLocaleString();
        },
        /** Avoid raw "<none>" looking like a blank/missing row */
        displayImageName(img) {
            if (!img) {
                return "";
            }
            if (img.name && img.name !== "<none>") {
                return img.name;
            }
            // Fallback: still show something cleanable
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
            this.loading = true;
            this.$root.emitAgent("", "getImageList", (res) => {
                this.loading = false;
                if (res.ok) {
                    this.imageList = res.imageList || [];
                    this.checkStatus = res.checkStatus || {};
                    const ids = new Set(this.imageList.map((i) => i.id));
                    for (const id of Object.keys(this.selectedMap)) {
                        if (!ids.has(id)) {
                            delete this.selectedMap[id];
                        }
                    }
                } else {
                    this.$root.toastRes(res);
                }
            });
        },
        checkUpdates() {
            this.checking = true;
            this.$root.emitAgent("", "checkImageUpdates", (res) => {
                this.checking = false;
                this.$root.toastRes(res);
                if (res.ok) {
                    this.checkStatus = res.checkStatus || {};
                    this.loadImages();
                }
            });
        },
        toggleSelectAll(e) {
            const checked = e.target.checked;
            for (const id of this.selectableIds) {
                this.selectedMap[id] = checked;
            }
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
            this.loading = true;

            if (action.type === "removeOne") {
                this.$root.emitAgent("", "removeImage", action.id, false, (res) => {
                    this.loading = false;
                    this.$root.toastRes(res);
                    this.loadImages();
                });
            } else if (action.type === "removeSelected") {
                this.$root.emitAgent("", "removeImages", this.selectedIds, false, (res) => {
                    this.loading = false;
                    this.$root.toastRes(res);
                    this.selectedMap = {};
                    this.loadImages();
                });
            } else if (action.type === "pruneUnused") {
                this.$root.emitAgent("", "pruneImages", false, (res) => {
                    this.loading = false;
                    this.$root.toastRes(res);
                    this.loadImages();
                });
            } else if (action.type === "pruneDangling") {
                this.$root.emitAgent("", "pruneImages", true, (res) => {
                    this.loading = false;
                    this.$root.toastRes(res);
                    this.loadImages();
                });
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

/* StackList-like panel */
.image-panel {
    padding: 0;
    overflow: hidden;
}

.list-header {
    border-bottom: 1px solid #dee2e6;
    border-radius: 10px 10px 0 0;
    /* Horizontal padding matches .image-list so filter checkbox lines up with rows */
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

/* Same left padding as .image-row so first checkbox column aligns */
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

    /* Primary filter reuses .row-check (28px) so it lines up with list checkboxes */
    &.filter-check-primary {
        gap: 6px;

        .row-check {
            flex: 0 0 28px;
        }
    }
}

/* Match StackList search chrome */
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
    /* Same as StackList: inherit form-control radius (no extra 8px override) */
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
    /*
     * Fluid columns only (fr + minmax(0,…)) — no fixed px side columns.
     * Breakpoints control how many tracks exist so hidden cols don’t crush mobile.
     */
    display: grid;
    align-items: center;
    column-gap: 0.5rem;
    row-gap: 0;
    min-height: 52px;
    padding: 8px 6px;
    border-radius: 10px;
    transition: background-color 0.15s ease-in-out;

    /* phone: check | name(+meta) | actions */
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

    /* tablet: check | name | id | size | actions */
    @media (min-width: 768px) {
        grid-template-columns:
            1.75rem
            minmax(0, 2.6fr)
            minmax(0, 0.72fr)
            minmax(0, 0.58fr)
            2.25rem;
        padding: 8px 10px;
        /* tighter gap between ID / size (and later created / status) */
        column-gap: 0.35rem;

        .row-id,
        .row-meta {
            display: flex;
        }

        .mobile-meta {
            display: none;
        }
    }

    /* desktop: + created + status (created/status tracks a bit tighter) */
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

        /* pull 创建时间 ↔ 状态 a touch closer without squeezing other cols */
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

        /* header: hide labels for columns not in current breakpoint grid */
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

<!-- Checkbox visibility on dark theme (body.dark is outside scoped root) -->
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

    /* Stack list titles use default link/body color */
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
