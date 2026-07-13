<template>
    <div>
        <h1 class="mb-3">
            <font-awesome-icon icon="images" class="me-2" />
            {{ $t("images") }}
        </h1>

        <div class="mb-3 d-flex flex-wrap gap-2 align-items-center">
            <button class="btn btn-primary" :disabled="loading || checking" @click="checkUpdates">
                <font-awesome-icon icon="cloud-arrow-down" class="me-1" :spin="checking" />
                {{ checking ? $t("checkingUpdates") : $t("checkImageUpdates") }}
            </button>
            <button class="btn btn-normal" :disabled="loading" @click="loadImages">
                <font-awesome-icon icon="arrows-rotate" class="me-1" />
                {{ $t("refresh") }}
            </button>
            <button class="btn btn-outline-danger" :disabled="loading || unusedCount === 0" @click="confirmPruneUnused">
                <font-awesome-icon icon="trash" class="me-1" />
                {{ $t("pruneUnusedImages") }} ({{ unusedCount }})
            </button>
            <button class="btn btn-outline-warning" :disabled="loading || danglingCount === 0" @click="confirmPruneDangling">
                <font-awesome-icon icon="trash" class="me-1" />
                {{ $t("pruneDanglingImages") }} ({{ danglingCount }})
            </button>
            <button
                v-if="selectedIds.length > 0"
                class="btn btn-danger"
                :disabled="loading"
                @click="confirmRemoveSelected"
            >
                <font-awesome-icon icon="trash" class="me-1" />
                {{ $t("deleteSelected") }} ({{ selectedIds.length }})
            </button>

            <span v-if="checkStatus.lastCheckAt" class="text-muted small ms-2">
                {{ $t("lastChecked") }}: {{ formatTime(checkStatus.lastCheckAt) }}
                <span v-if="checkStatus.imageUpdateCount > 0" class="badge bg-warning text-dark ms-1">
                    {{ checkStatus.imageUpdateCount }} {{ $t("updatesAvailable") }}
                </span>
            </span>
        </div>

        <div class="mb-3">
            <div class="search-wrapper d-inline-flex align-items-center">
                <input v-model="searchText" class="form-control search-input" :placeholder="$t('searchImages')" />
            </div>
            <div class="form-check form-check-inline ms-3">
                <input id="filterUnused" v-model="filterUnusedOnly" class="form-check-input" type="checkbox">
                <label class="form-check-label" for="filterUnused">{{ $t("unusedOnly") }}</label>
            </div>
            <div class="form-check form-check-inline">
                <input id="filterUpdate" v-model="filterUpdateOnly" class="form-check-input" type="checkbox">
                <label class="form-check-label" for="filterUpdate">{{ $t("updateAvailableOnly") }}</label>
            </div>
        </div>

        <div class="shadow-box image-list-box">
            <div v-if="loading && imageList.length === 0" class="p-4 text-center text-muted">
                {{ $t("loading") }}...
            </div>
            <div v-else-if="filteredList.length === 0" class="p-4 text-center text-muted">
                {{ $t("noImages") }}
            </div>
            <div v-else class="table-responsive">
                <table class="table table-hover align-middle mb-0 image-table">
                    <thead>
                        <tr>
                            <th style="width: 40px">
                                <input
                                    class="form-check-input"
                                    type="checkbox"
                                    :checked="allSelectableSelected"
                                    @change="toggleSelectAll"
                                >
                            </th>
                            <th>{{ $t("imageName") }}</th>
                            <th>{{ $t("tag") }}</th>
                            <th>{{ $t("imageId") }}</th>
                            <th>{{ $t("size") }}</th>
                            <th>{{ $t("created") }}</th>
                            <th>{{ $t("status") }}</th>
                            <th style="width: 100px">{{ $t("actions") }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="img in filteredList" :key="img.id + img.name + img.tag">
                            <td>
                                <input
                                    v-model="selectedMap[img.id]"
                                    class="form-check-input"
                                    type="checkbox"
                                    :disabled="img.inUsed"
                                    :title="img.inUsed ? $t('imageInUse') : ''"
                                >
                            </td>
                            <td>
                                <span class="fw-medium name-cell">{{ img.name }}</span>
                                <span v-if="img.needUpdate" class="badge bg-warning text-dark ms-2">{{ $t("update") }}</span>
                            </td>
                            <td><code class="mono-chip">{{ img.tag }}</code></td>
                            <td><code class="mono-chip small">{{ img.shortId }}</code></td>
                            <td>{{ img.sizeFormat }}</td>
                            <td class="small create-time">{{ img.createTime }}</td>
                            <td>
                                <span v-if="img.inUsed" class="badge bg-success">{{ $t("inUse") }}</span>
                                <span v-else-if="img.dangling" class="badge bg-secondary">{{ $t("dangling") }}</span>
                                <span v-else class="badge bg-secondary">{{ $t("unused") }}</span>
                            </td>
                            <td>
                                <button
                                    class="btn btn-sm btn-outline-danger"
                                    :disabled="img.inUsed || loading"
                                    :title="img.inUsed ? $t('imageInUse') : $t('deleteImage')"
                                    @click="confirmRemoveOne(img)"
                                >
                                    <font-awesome-icon icon="trash" />
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>
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
                    img.shortId.toLowerCase().includes(q)
                );
            }
            if (this.filterUnusedOnly) {
                list = list.filter((img) => !img.inUsed);
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
        someSelected() {
            return this.selectableIds.some((id) => this.selectedMap[id]);
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
        loadImages() {
            this.loading = true;
            this.$root.emitAgent("", "getImageList", (res) => {
                this.loading = false;
                if (res.ok) {
                    this.imageList = res.imageList || [];
                    this.checkStatus = res.checkStatus || {};
                    // Drop selections for gone images
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
            this.pendingAction = { type: "removeOne",
                id: img.id };
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

.image-list-box {
    overflow: hidden;
}

/* Base table: transparent so shadow-box theme shows through */
.image-table {
    font-size: 14px;
    --bs-table-bg: transparent;
    --bs-table-color: inherit;
    --bs-table-border-color: #dee2e6;
    --bs-table-striped-bg: transparent;
    --bs-table-hover-bg: #{$highlight-white};
    --bs-table-hover-color: inherit;
    color: inherit;
    background-color: transparent;

    th,
    td {
        white-space: nowrap;
        border-color: var(--bs-table-border-color);
        background-color: transparent !important;
        color: inherit;
        vertical-align: middle;
        box-shadow: none !important;
    }

    thead th {
        border-top: none;
        border-bottom-width: 1px;
        font-weight: 600;
        color: $dark-font-color3;
    }

    .mono-chip {
        font-size: 12px;
        padding: 2px 6px;
        border-radius: 4px;
        background-color: rgba(0, 0, 0, 0.04);
        color: inherit;
    }

    .create-time {
        color: $dark-font-color3;
    }
}

.search-input {
    max-width: 20em;
}

.gap-2 {
    gap: 0.5rem;
}
</style>

<!-- body.dark is outside component; unscoped overrides for Bootstrap table -->
<style lang="scss">
@import "../styles/vars.scss";

.dark .image-table {
    --bs-table-bg: transparent;
    --bs-table-color: #{$dark-font-color};
    --bs-table-border-color: #{$dark-border-color};
    --bs-table-hover-bg: #{$dark-bg2};
    --bs-table-hover-color: #{$dark-font-color};
    --bs-table-striped-bg: transparent;
    --bs-table-active-bg: #{$dark-bg2};
    color: $dark-font-color;
    background-color: transparent;

    thead th {
        color: $dark-font-color3;
        border-bottom-color: $dark-border-color;
        background-color: transparent !important;
    }

    th,
    td {
        border-color: $dark-border-color !important;
        color: $dark-font-color !important;
        background-color: transparent !important;
        box-shadow: none !important;
        --bs-table-bg-type: transparent;
        --bs-table-bg-state: transparent;
    }

    tbody tr:hover > * {
        --bs-table-accent-bg: #{$dark-bg2};
        --bs-table-bg-state: #{$dark-bg2};
        color: $dark-font-color !important;
        background-color: $dark-bg2 !important;
    }

    .mono-chip {
        background-color: $dark-bg2;
        color: $dark-font-color;
        border: 1px solid $dark-border-color;
    }

    .create-time {
        color: $dark-font-color3 !important;
    }

    .text-muted {
        color: $dark-font-color3 !important;
    }

    /* Unchecked boxes must stay visible on dark rows */
    .form-check-input {
        width: 1.15em;
        height: 1.15em;
        margin-top: 0.15em;
        background-color: #161b22;
        border: 1.5px solid #8b949e;
        cursor: pointer;

        &:focus {
            border-color: $primary;
            box-shadow: 0 0 0 0.15rem rgba(116, 194, 255, 0.25);
        }

        &:checked {
            background-color: $primary;
            border-color: $primary;
        }

        &:disabled {
            opacity: 0.4;
            cursor: not-allowed;
            background-color: #0d1117;
            border-color: #484f58;
        }
    }
}
</style>
