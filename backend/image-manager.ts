/**
 * Docker image management helpers (list / remove / prune unused).
 * Dedicated module to keep upstream Dockge merges simple.
 */
import childProcessAsync from "promisify-child-process";
import { log } from "./log";
import {
    formatImageList,
    imageUpdateChecker,
    listLocalImages,
    type ImageListItem,
} from "./image-update-checker";

export class ImageManager {
    async listImages(): Promise<ImageListItem[]> {
        // UI list: skip per-image inspect (slow on large hosts / agent hop).
        // Update flags still come from imageUpdateChecker memory (last checkAll).
        const images = await listLocalImages({ withInspect: false });
        return formatImageList(images, imageUpdateChecker);
    }

    /**
     * Remove a single image by id or name:tag.
     */
    async removeImage(imageId: string, force = false): Promise<void> {
        if (!imageId || typeof imageId !== "string") {
            throw new Error("Invalid image id");
        }

        // Spawn uses arg array (no shell); still reject spaces/metachars.
        if (!/^(sha256:)?[a-f0-9]{6,64}$/i.test(imageId) && !/^[\w./:@+-]+$/.test(imageId)) {
            throw new Error("Invalid image id format");
        }

        const args = [ "rmi" ];
        if (force) {
            args.push("-f");
        }
        args.push(imageId);

        const res = await childProcessAsync.spawn("docker", args, {
            encoding: "utf-8",
        });

        if (res.code && res.code !== 0) {
            const err = (res.stderr?.toString() || res.stdout?.toString() || "Failed to remove image").trim();
            throw new Error(err);
        }

        log.info("image-manager", `Removed image ${imageId}`);
    }

    /**
     * Remove all unused images (not used by any container).
     * force=false uses docker image prune (dangling only by default when danglingOnly).
     */
    async pruneImages(options: { danglingOnly?: boolean; forceUnused?: boolean } = {}): Promise<string> {
        const { danglingOnly = false, forceUnused = true } = options;

        // docker image prune -a removes all unused; without -a only dangling
        const args = [ "image", "prune", "-f" ];
        if (forceUnused && !danglingOnly) {
            args.push("-a");
        }

        const res = await childProcessAsync.spawn("docker", args, {
            encoding: "utf-8",
        });

        if (res.code && res.code !== 0) {
            const err = (res.stderr?.toString() || "Failed to prune images").trim();
            throw new Error(err);
        }

        const output = res.stdout?.toString() || "Prune completed";
        log.info("image-manager", "Pruned images: " + output.trim());
        return output.trim();
    }

    /**
     * Remove multiple unused images by id.
     */
    async removeImages(imageIds: string[], force = false): Promise<{ removed: string[]; failed: { id: string; error: string }[] }> {
        const removed: string[] = [];
        const failed: { id: string; error: string }[] = [];

        for (const id of imageIds) {
            try {
                await this.removeImage(id, force);
                removed.push(id);
            } catch (e) {
                failed.push({
                    id,
                    error: e instanceof Error ? e.message : String(e),
                });
            }
        }

        return { removed,
            failed };
    }
}

export const imageManager = new ImageManager();
