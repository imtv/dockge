/**
 * Image update checker (inspired by DockerCopilot).
 * Compares local image RepoDigests with remote registry manifests.
 * Kept in a dedicated file so upstream Dockge merges stay simple.
 */
import childProcessAsync from "promisify-child-process";
import { log } from "./log";

export interface LocalImageInfo {
    id: string;
    shortId: string;
    repoTags: string[];
    repoDigests: string[];
    imageName: string;
    imageTag: string;
    size: number;
    created: number;
    inUsed: boolean;
    containers: number;
}

export interface ImageListItem {
    id: string;
    shortId: string;
    name: string;
    tag: string;
    size: number;
    sizeFormat: string;
    created: number;
    createTime: string;
    inUsed: boolean;
    containers: number;
    needUpdate: boolean;
    dangling: boolean;
}

const DEFAULT_REGISTRY_DOMAIN = "docker.io";
const DEFAULT_REGISTRY_HOST = "registry-1.docker.io";

/** Optional public mirrors when docker.io is hard to reach */
const DOCKER_HUB_MIRRORS = [
    "docker.m.daocloud.io",
    "docker.1ms.run",
    "hub.rat.dev",
];

const CONTENT_DIGEST_HEADER = "docker-content-digest";
const CHECK_CONCURRENCY = 5;
const REQUEST_TIMEOUT_MS = 15000;

export class ImageUpdateChecker {
    /** full image id (sha256:...) -> needs update — never store short ids here (would double-count) */
    private imageNeedUpdate = new Map<string, boolean>();
    /** stack name (compose project) -> has update */
    private stackNeedUpdate = new Map<string, boolean>();
    /**
     * stack name -> image ids that needed update at last check.
     * Used when marking a stack updated: after pull the container image id changes,
     * so we must clear the *old* ids recorded here, not only current bindings.
     */
    private stackUpdateImages = new Map<string, Set<string>>();
    private lastCheckAt = 0;
    private checking = false;
    private lastError: string | null = null;
    /** In-flight check promise so callers can await and force re-run after */
    private checkPromise: Promise<void> | null = null;
    private pendingForceRecheck = false;

    get isChecking() {
        return this.checking;
    }

    get lastCheckedAt() {
        return this.lastCheckAt;
    }

    get lastCheckError() {
        return this.lastError;
    }

    stackHasUpdate(stackName: string): boolean {
        return this.stackNeedUpdate.get(stackName) === true;
    }

    imageHasUpdate(imageId: string): boolean {
        return mapSaysImageNeedsUpdate(this.imageNeedUpdate, imageId);
    }

    getStatus() {
        // Unique images needing update (dedupe short/full if both ever present)
        const seen = new Set<string>();
        for (const [ id, need ] of this.imageNeedUpdate) {
            if (!need) {
                continue;
            }
            seen.add(id.replace(/^sha256:/, "").slice(0, 12));
        }
        const stackUpdateCount = [ ...this.stackNeedUpdate.values() ].filter(Boolean).length;
        return {
            checking: this.checking,
            lastCheckAt: this.lastCheckAt,
            lastError: this.lastError,
            imageUpdateCount: seen.size,
            stackUpdateCount,
        };
    }

    /**
     * Full check: list images, query registries, map to stacks.
     * Concurrent callers share one run; force while running schedules a follow-up.
     */
    async checkAll(force = false): Promise<void> {
        if (this.checkPromise) {
            if (force) {
                this.pendingForceRecheck = true;
            }
            await this.checkPromise;
            if (this.pendingForceRecheck) {
                this.pendingForceRecheck = false;
                return this.checkAll(true);
            }
            return;
        }

        // Avoid hammering registries (unless forced)
        if (!force && this.lastCheckAt && Date.now() - this.lastCheckAt < 5 * 60 * 1000) {
            log.debug("image-update", "Skip check, last check was recent");
            return;
        }

        this.checkPromise = this.runCheckAll().finally(() => {
            this.checkPromise = null;
        });
        await this.checkPromise;

        if (this.pendingForceRecheck) {
            this.pendingForceRecheck = false;
            await this.checkAll(true);
        }
    }

    private async runCheckAll(): Promise<void> {
        this.checking = true;
        this.lastError = null;

        try {
            log.info("image-update", "Starting image update check");
            const images = await listLocalImages();
            const tagged = images.filter((img) => img.imageTag && img.imageTag !== "<none>" && img.imageName && img.imageName !== "<none>");

            // One registry check per unique image id (multiple tags share one id)
            const uniqueById = new Map<string, LocalImageInfo>();
            for (const img of tagged) {
                if (!uniqueById.has(img.id)) {
                    uniqueById.set(img.id, img);
                }
            }

            const needUpdateMap = new Map<string, boolean>();

            await mapPool([ ...uniqueById.values() ], CHECK_CONCURRENCY, async (image) => {
                try {
                    const need = await checkRemoteDigest(image);
                    needUpdateMap.set(image.id, need);
                    if (need) {
                        log.info("image-update", `Update available: ${image.imageName}:${image.imageTag}`);
                    }
                } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    log.debug("image-update", `Check failed for ${image.imageName}:${image.imageTag}: ${msg}`);
                    needUpdateMap.set(image.id, false);
                }
            });

            this.imageNeedUpdate = needUpdateMap;

            // Map containers -> compose project (stack) + remember image ids per stack
            const {
                stackMap, stackImages,
            } = await mapStackImageUpdates(needUpdateMap);
            this.stackNeedUpdate = stackMap;
            this.stackUpdateImages = stackImages;

            this.lastCheckAt = Date.now();
            const imgCount = this.getStatus().imageUpdateCount;
            const stackCount = [ ...stackMap.values() ].filter(Boolean).length;
            log.info("image-update", `Check done. Images needing update: ${imgCount}, stacks: ${stackCount}`);
        } catch (e) {
            this.lastError = e instanceof Error ? e.message : String(e);
            log.error("image-update", this.lastError);
        } finally {
            this.checking = false;
        }
    }

    /**
     * After a stack was successfully updated (compose pull):
     * remove this stack + the image ids recorded at last check (old digests).
     * Does NOT hit registries again — full check only on startup / cron / manual.
     */
    async markStackUpdated(stackName: string): Promise<void> {
        // Wait for any in-flight full check so it cannot overwrite our clears
        if (this.checkPromise) {
            await this.checkPromise;
        }

        this.stackNeedUpdate.set(stackName, false);

        // Prefer ids from last check (before pull). After pull, container Image id is NEW
        // and would not match the flags we stored for the OLD image.
        const recorded = this.stackUpdateImages.get(stackName) || new Set<string>();
        this.stackUpdateImages.delete(stackName);

        for (const imageId of recorded) {
            this.deleteImageUpdateFlag(imageId);
        }

        // Fallback: also clear whatever containers currently report for this project
        try {
            const bindings = await listContainerImageBindings();
            for (const { imageId, project } of bindings) {
                if (project === stackName && imageId) {
                    this.deleteImageUpdateFlag(imageId);
                }
            }

            // Other stacks: drop badge if none of their recorded images still need update
            for (const [ otherStack, needs ] of this.stackNeedUpdate) {
                if (!needs || otherStack === stackName) {
                    continue;
                }
                const otherRecorded = this.stackUpdateImages.get(otherStack);
                if (otherRecorded && otherRecorded.size > 0) {
                    const still = [ ...otherRecorded ].some((id) => this.imageHasUpdate(id));
                    if (!still) {
                        this.stackNeedUpdate.set(otherStack, false);
                        this.stackUpdateImages.delete(otherStack);
                    }
                    continue;
                }
                const otherImages = bindings
                    .filter((b) => b.project === otherStack)
                    .map((b) => normalizeImageId(b.imageId));
                const stillNeeds = otherImages.some((id) => this.imageHasUpdate(id));
                if (!stillNeeds) {
                    this.stackNeedUpdate.set(otherStack, false);
                }
            }
        } catch (e) {
            log.error("image-update", "markStackUpdated bindings: " + e);
        }

        log.info("image-update", `Cleared update flags for stack ${stackName}, remaining images: ${this.getStatus().imageUpdateCount}`);
    }

    /** Remove one image id (and short/prefix aliases) from the need-update map */
    private deleteImageUpdateFlag(imageId: string) {
        const full = normalizeImageId(imageId);
        const short = shortImageId(full);
        const bare = full.replace(/^sha256:/, "");
        for (const id of [ ...this.imageNeedUpdate.keys() ]) {
            const idBare = id.replace(/^sha256:/, "");
            if (
                id === full ||
                idBare === bare ||
                idBare.startsWith(short) ||
                bare.startsWith(idBare.slice(0, 12))
            ) {
                this.imageNeedUpdate.delete(id);
            }
        }
        this.imageNeedUpdate.delete(full);
    }

    /** Clear update flag for a stack after successful update */
    clearStackUpdate(stackName: string) {
        this.stackNeedUpdate.set(stackName, false);
    }
}

export const imageUpdateChecker = new ImageUpdateChecker();

/**
 * List local Docker images with usage info.
 */
/** Large hosts can dump multi‑MB `docker images` JSON; Node default maxBuffer is 1MB. */
const DOCKER_SPAWN_MAX_BUFFER = 64 * 1024 * 1024;

/**
 * @param options.withInspect - per-image inspect for digests/size (slow). Default true for update checks.
 *   UI list can pass false so huge agent hosts still return a full list quickly.
 */
export async function listLocalImages(options: { withInspect?: boolean } = {}): Promise<LocalImageInfo[]> {
    const withInspect = options.withInspect !== false;

    const res = await childProcessAsync.spawn("docker", [
        "images",
        // Include intermediate/untagged layers so list matches `docker images -a` expectations
        "-a",
        "--format",
        "{{json .}}",
        "--no-trunc",
    ], {
        encoding: "utf-8",
        maxBuffer: DOCKER_SPAWN_MAX_BUFFER,
    });

    if (res.code && res.code !== 0) {
        const err = (res.stderr?.toString() || res.stdout?.toString() || "docker images failed").trim();
        log.error("image-update", "docker images failed: " + err);
        throw new Error(err);
    }

    if (!res.stdout) {
        return [];
    }

    const lines = res.stdout.toString().split("\n").filter((l) => l.trim());
    const images: LocalImageInfo[] = [];
    const seen = new Set<string>();
    let parseErrors = 0;

    for (const line of lines) {
        try {
            const row = JSON.parse(line) as {
                ID: string;
                Repository: string;
                Tag: string;
                Size: string;
                CreatedAt?: string;
                Containers?: string;
            };

            const id = normalizeImageId(row.ID);
            const key = `${id}|${row.Repository}|${row.Tag}`;
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);

            const containers = parseContainersCount(row.Containers);

            images.push({
                id,
                shortId: shortImageId(id),
                repoTags: row.Repository && row.Tag && row.Repository !== "<none>"
                    ? [ `${row.Repository}:${row.Tag}` ]
                    : [],
                repoDigests: [],
                imageName: row.Repository || "<none>",
                imageTag: row.Tag || "<none>",
                size: parseDockerSize(row.Size),
                created: row.CreatedAt ? Date.parse(row.CreatedAt) / 1000 : 0,
                inUsed: containers > 0,
                containers,
            });
        } catch {
            // skip bad lines
            parseErrors++;
        }
    }

    if (parseErrors > 0) {
        log.warn("image-update", `listLocalImages: skipped ${parseErrors} unparseable line(s), kept ${images.length}`);
    }
    log.debug("image-update", `listLocalImages: ${images.length} image row(s) from docker images -a`);

    // Containers using each image (more reliable than docker images Containers field)
    const usedImageIds = await getUsedImageIds();

    for (const img of images) {
        img.inUsed = usedImageIds.has(img.id) || usedImageIds.has(img.shortId) || [ ...usedImageIds ].some(
            (uid) => uid.startsWith(img.id) || img.id.startsWith(uid) || uid.includes(img.shortId)
        );
        if (img.inUsed && img.containers === 0) {
            img.containers = 1;
        }
    }

    // Optional inspect: digests for registry compare + dangling name recovery
    if (withInspect) {
        const uniqueIds = [ ...new Set(images.map((i) => i.id)) ];
        const digestById = new Map<string, string[]>();
        const createdById = new Map<string, number>();
        const sizeById = new Map<string, number>();

        await mapPool(uniqueIds, 8, async (id) => {
            try {
                const inspect = await childProcessAsync.spawn("docker", [
                    "image", "inspect", id,
                    "--format",
                    "{{json .RepoDigests}}|{{.Created}}|{{.Size}}",
                ], {
                    encoding: "utf-8",
                    maxBuffer: DOCKER_SPAWN_MAX_BUFFER,
                });

                if (!inspect.stdout) {
                    return;
                }
                const raw = inspect.stdout.toString().trim();
                const [ digestsJson, createdIso, sizeStr ] = raw.split("|");
                const digests = JSON.parse(digestsJson) as string[];
                digestById.set(id, digests || []);
                if (createdIso) {
                    createdById.set(id, Date.parse(createdIso) / 1000);
                }
                if (sizeStr) {
                    sizeById.set(id, parseInt(sizeStr, 10) || 0);
                }
            } catch {
                digestById.set(id, []);
            }
        });

        for (const img of images) {
            img.repoDigests = digestById.get(img.id) || [];
            if (createdById.has(img.id)) {
                img.created = createdById.get(img.id)!;
            }
            if (sizeById.has(img.id)) {
                img.size = sizeById.get(img.id)!;
            }
        }
    }

    return images;
}

export function formatImageList(images: LocalImageInfo[], checker: ImageUpdateChecker): ImageListItem[] {
    const items = images.map((img) => {
        const dangling = img.imageName === "<none>" || img.imageTag === "<none>";
        // Untagged (dangling) images still keep RepoDigests like repo@sha256:… —
        // recover the original repository name so old pulls remain recognizable.
        let name = img.imageName;
        let tag = img.imageTag;
        if (dangling) {
            const fromDigest = nameFromRepoDigest(img.repoDigests);
            if (fromDigest) {
                name = fromDigest;
            }
            // Keep a clear tag marker (UI also badges as dangling)
            tag = "<none>";
        }
        return {
            id: img.id,
            shortId: img.shortId,
            name,
            tag,
            size: img.size,
            sizeFormat: formatBytes(img.size),
            created: img.created,
            createTime: img.created
                ? new Date(img.created * 1000).toISOString().replace("T", " ").slice(0, 19)
                : "",
            inUsed: img.inUsed,
            containers: img.containers,
            needUpdate: checker.imageHasUpdate(img.id),
            dangling,
        };
    });

    // Cleanup-friendly order: dangling first, then unused, then in-use; newer first within group
    items.sort((a, b) => {
        const rank = (x: ImageListItem) => (x.dangling ? 0 : x.inUsed ? 2 : 1);
        const d = rank(a) - rank(b);
        if (d !== 0) {
            return d;
        }
        return (b.created || 0) - (a.created || 0);
    });

    return items;
}

/** Parse "registry/path/name@sha256:…" → repository path */
function nameFromRepoDigest(digests: string[] | undefined): string | null {
    if (!digests || digests.length === 0) {
        return null;
    }
    for (const d of digests) {
        if (!d || d === "<none>") {
            continue;
        }
        const at = d.lastIndexOf("@");
        const ref = at === -1 ? d : d.slice(0, at);
        if (ref && ref !== "<none>") {
            return ref;
        }
    }
    return null;
}

/**
 * List containers with image id + compose project (via docker inspect).
 * Docker ps template does not expose ImageID on all engine versions.
 */
async function listContainerImageBindings(): Promise<{ imageId: string; project: string }[]> {
    const result: { imageId: string; project: string }[] = [];

    try {
        const idsRes = await childProcessAsync.spawn("docker", [ "ps", "-aq" ], {
            encoding: "utf-8",
            maxBuffer: DOCKER_SPAWN_MAX_BUFFER,
        });
        const ids = (idsRes.stdout?.toString() || "").split("\n").map((s) => s.trim()).filter(Boolean);
        if (ids.length === 0) {
            return result;
        }

        // Batch inspect: Image digest id + compose project label
        const insp = await childProcessAsync.spawn("docker", [
            "inspect",
            ...ids,
            "--format",
            "{{.Image}}\t{{index .Config.Labels \"com.docker.compose.project\"}}",
        ], {
            encoding: "utf-8",
            maxBuffer: DOCKER_SPAWN_MAX_BUFFER,
        });

        if (!insp.stdout) {
            return result;
        }

        for (const line of insp.stdout.toString().split("\n")) {
            const trimmed = line.trim();
            if (!trimmed) {
                continue;
            }
            const tab = trimmed.indexOf("\t");
            const imageId = normalizeImageId(tab === -1 ? trimmed : trimmed.slice(0, tab));
            const project = tab === -1 ? "" : trimmed.slice(tab + 1).trim();
            if (imageId) {
                result.push({ imageId,
                    project });
            }
        }
    } catch (e) {
        log.error("image-update", "Failed to list container image bindings: " + e);
    }

    return result;
}

async function getUsedImageIds(): Promise<Set<string>> {
    const used = new Set<string>();
    const bindings = await listContainerImageBindings();
    for (const b of bindings) {
        used.add(b.imageId);
        used.add(shortImageId(b.imageId));
    }
    return used;
}

/**
 * Whether map marks this image id as needing update (full or short id).
 */
function mapSaysImageNeedsUpdate(imageNeedUpdate: Map<string, boolean>, imageId: string): boolean {
    if (!imageId) {
        return false;
    }
    const full = normalizeImageId(imageId);
    if (imageNeedUpdate.get(full) === true) {
        return true;
    }
    // Map keys are full ids only; match short / prefix
    const short = shortImageId(full);
    const bare = full.replace(/^sha256:/, "");
    for (const [ id, need ] of imageNeedUpdate) {
        if (!need) {
            continue;
        }
        const idBare = id.replace(/^sha256:/, "");
        if (id === full || idBare === bare || idBare.startsWith(short) || bare.startsWith(idBare.slice(0, 12))) {
            return true;
        }
    }
    return false;
}

/**
 * Map which compose stacks use images that need updates,
 * and record which image ids belong to each stack (for clear-after-update).
 */
async function mapStackImageUpdates(imageNeedUpdate: Map<string, boolean>): Promise<{
    stackMap: Map<string, boolean>;
    stackImages: Map<string, Set<string>>;
}> {
    const stackMap = new Map<string, boolean>();
    const stackImages = new Map<string, Set<string>>();

    try {
        const bindings = await listContainerImageBindings();

        for (const { imageId, project } of bindings) {
            if (!project) {
                continue;
            }
            const full = normalizeImageId(imageId);
            const needs = mapSaysImageNeedsUpdate(imageNeedUpdate, full);

            if (needs) {
                stackMap.set(project, true);
                if (!stackImages.has(project)) {
                    stackImages.set(project, new Set());
                }
                stackImages.get(project)!.add(full);
            } else if (!stackMap.has(project)) {
                stackMap.set(project, false);
            }
        }
    } catch (e) {
        log.error("image-update", "Failed to map stack updates: " + e);
    }

    return {
        stackMap,
        stackImages,
    };
}

async function checkRemoteDigest(image: LocalImageInfo): Promise<boolean> {
    if (!image.repoDigests || image.repoDigests.length === 0) {
        // No local digest — cannot compare reliably
        return false;
    }

    const ref = `${image.imageName}:${image.imageTag}`;
    const parsed = parseImageRef(image.imageName, image.imageTag);
    if (!parsed) {
        return false;
    }

    const token = await getRegistryToken(parsed);
    const remoteDigest = await getRemoteManifestDigest(parsed, token);

    if (!remoteDigest) {
        return false;
    }

    for (const localRepoDigest of image.repoDigests) {
        const localDigest = localRepoDigest.includes("@")
            ? localRepoDigest.split("@")[1]
            : localRepoDigest;
        if (!localDigest) {
            continue;
        }
        if (localDigest === remoteDigest) {
            return false;
        }
    }

    // Local digests present but none match remote
    log.debug("image-update", `${ref} remote=${remoteDigest} local=${image.repoDigests.join(",")}`);
    return true;
}

interface ParsedImageRef {
    registryHost: string;
    repository: string; // path without host, e.g. library/nginx or louislam/dockge
    tag: string;
    originalName: string;
}

function parseImageRef(imageName: string, tag: string): ParsedImageRef | null {
    if (!imageName || imageName === "<none>" || !tag || tag === "<none>") {
        return null;
    }

    let registryHost = DEFAULT_REGISTRY_HOST;
    let repository = imageName;

    // registry/repo or registry:port/repo
    const parts = imageName.split("/");
    if (parts.length === 1) {
        // official image: nginx
        registryHost = DEFAULT_REGISTRY_HOST;
        repository = `library/${parts[0]}`;
    } else if (parts[0].includes(".") || parts[0].includes(":") || parts[0] === "localhost") {
        // custom registry
        registryHost = parts[0];
        repository = parts.slice(1).join("/");
        if (registryHost === DEFAULT_REGISTRY_DOMAIN || registryHost === "index.docker.io") {
            registryHost = DEFAULT_REGISTRY_HOST;
        }
    } else {
        // docker hub user/image
        registryHost = DEFAULT_REGISTRY_HOST;
        repository = imageName;
    }

    return {
        registryHost,
        repository,
        tag,
        originalName: imageName,
    };
}

async function getRegistryToken(parsed: ParsedImageRef): Promise<string> {
    const hosts = registryHostsToTry(parsed.registryHost);

    for (const host of hosts) {
        try {
            const challengeUrl = `https://${host}/v2/`;
            const res = await fetchWithTimeout(challengeUrl, { method: "GET" }, REQUEST_TIMEOUT_MS);
            const wwwAuth = res.headers.get("www-authenticate") || res.headers.get("WWW-Authenticate") || "";

            if (!wwwAuth) {
                // Some registries allow anonymous without challenge
                return "";
            }

            const lower = wwwAuth.toLowerCase();
            if (lower.startsWith("basic")) {
                return "";
            }

            if (lower.startsWith("bearer")) {
                const authUrl = buildAuthUrl(wwwAuth, parsed.repository);
                if (!authUrl) {
                    return "";
                }
                const tokenRes = await fetchWithTimeout(authUrl, { method: "GET" }, REQUEST_TIMEOUT_MS);
                if (!tokenRes.ok) {
                    continue;
                }
                const body = await tokenRes.json() as { token?: string; access_token?: string };
                const token = body.token || body.access_token || "";
                if (token) {
                    // Remember working host
                    parsed.registryHost = host;
                    return `Bearer ${token}`;
                }
            }
        } catch (e) {
            log.debug("image-update", `Token failed for ${host}: ${e}`);
        }
    }
    return "";
}

async function getRemoteManifestDigest(parsed: ParsedImageRef, authHeader: string): Promise<string> {
    const hosts = registryHostsToTry(parsed.registryHost);

    for (const host of hosts) {
        try {
            const url = `https://${host}/v2/${parsed.repository}/manifests/${encodeURIComponent(parsed.tag)}`;
            const headers: Record<string, string> = {
                Accept: [
                    "application/vnd.docker.distribution.manifest.v2+json",
                    "application/vnd.docker.distribution.manifest.list.v2+json",
                    "application/vnd.oci.image.index.v1+json",
                    "application/vnd.oci.image.manifest.v1+json",
                    "application/vnd.docker.distribution.manifest.v1+json",
                ].join(", "),
            };
            if (authHeader) {
                headers.Authorization = authHeader;
            }

            const res = await fetchWithTimeout(url, { method: "HEAD",
                headers }, REQUEST_TIMEOUT_MS);

            if (res.status === 401 || res.status === 404) {
                // retry GET (some registries dislike HEAD)
            }

            let digest = res.headers.get(CONTENT_DIGEST_HEADER) || res.headers.get("Docker-Content-Digest") || "";

            if (!digest || !res.ok) {
                const getRes = await fetchWithTimeout(url, { method: "GET",
                    headers }, REQUEST_TIMEOUT_MS);
                digest = getRes.headers.get(CONTENT_DIGEST_HEADER) || getRes.headers.get("Docker-Content-Digest") || "";
                if (!getRes.ok && !digest) {
                    continue;
                }
            }

            if (digest) {
                return digest;
            }
        } catch (e) {
            log.debug("image-update", `Manifest failed for ${host}/${parsed.repository}: ${e}`);
        }
    }
    return "";
}

function registryHostsToTry(primary: string): string[] {
    if (primary === DEFAULT_REGISTRY_HOST || primary === DEFAULT_REGISTRY_DOMAIN || primary === "index.docker.io") {
        return [ DEFAULT_REGISTRY_HOST, ...DOCKER_HUB_MIRRORS ];
    }
    return [ primary ];
}

function buildAuthUrl(challenge: string, repository: string): string | null {
    // Bearer realm="...",service="...",scope="..."
    const raw = challenge.replace(/^Bearer\s+/i, "");
    const values: Record<string, string> = {};
    for (const part of raw.split(",")) {
        const trimmed = part.trim();
        const eq = trimmed.indexOf("=");
        if (eq === -1) {
            continue;
        }
        const key = trimmed.slice(0, eq).trim().toLowerCase();
        let val = trimmed.slice(eq + 1).trim();
        if (val.startsWith("\"") && val.endsWith("\"")) {
            val = val.slice(1, -1);
        }
        values[key] = val;
    }

    if (!values.realm || !values.service) {
        return null;
    }

    const url = new URL(values.realm);
    url.searchParams.set("service", values.service);
    url.searchParams.set("scope", `repository:${repository}:pull`);
    return url.toString();
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, {
            ...init,
            signal: controller.signal,
            redirect: "follow",
        });
    } finally {
        clearTimeout(timer);
    }
}

function normalizeImageId(id: string): string {
    if (!id) {
        return "";
    }
    return id.startsWith("sha256:") ? id : (id.length >= 64 ? `sha256:${id}` : id);
}

function shortImageId(id: string): string {
    const bare = id.replace(/^sha256:/, "");
    return bare.slice(0, 12);
}

function parseContainersCount(v?: string): number {
    if (!v || v === "N/A") {
        return 0;
    }
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : 0;
}

function parseDockerSize(size: string): number {
    // e.g. "258MB", "2.17GB"
    if (!size) {
        return 0;
    }
    const m = size.trim().match(/^([\d.]+)\s*([KMGT]?B)$/i);
    if (!m) {
        return 0;
    }
    const n = parseFloat(m[1]);
    const unit = m[2].toUpperCase();
    const mult: Record<string, number> = {
        B: 1,
        KB: 1024,
        MB: 1024 ** 2,
        GB: 1024 ** 3,
        TB: 1024 ** 4,
    };
    return Math.round(n * (mult[unit] || 1));
}

export function formatBytes(bytes: number): string {
    if (!bytes || bytes < 0) {
        return "0 B";
    }
    if (bytes >= 1024 ** 3) {
        return `${(bytes / (1024 ** 3)).toFixed(2)} GB`;
    }
    if (bytes >= 1024 ** 2) {
        return `${(bytes / (1024 ** 2)).toFixed(0)} MB`;
    }
    if (bytes >= 1024) {
        return `${(bytes / 1024).toFixed(0)} KB`;
    }
    return `${bytes} B`;
}

/** Run async tasks with concurrency limit */
async function mapPool<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
    let index = 0;
    const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
        while (index < items.length) {
            const current = items[index++];
            await fn(current);
        }
    });
    await Promise.all(workers);
}
