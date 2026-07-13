/**
 * imtv: collect published / host-network ports per compose project for stack list UI.
 */
import childProcessAsync from "promisify-child-process";
import { log } from "./log";

export interface StackPortInfo {
    /** Display ports (host ports, or exposed ports when network_mode: host) */
    ports: string[];
    /** True if any container uses host network */
    hostNetwork: boolean;
}

let cache: Map<string, StackPortInfo> = new Map();
let cacheAt = 0;
const CACHE_MS = 8000;

/**
 * Map compose project name -> ports.
 * Bridge/published: host ports from NetworkSettings.Ports.
 * Host network: ExposedPorts from container (same as image EXPOSE).
 */
export async function getStackPortsMap(force = false): Promise<Map<string, StackPortInfo>> {
    if (!force && cacheAt && Date.now() - cacheAt < CACHE_MS) {
        return cache;
    }

    const result = new Map<string, StackPortInfo>();

    try {
        const idsRes = await childProcessAsync.spawn("docker", [ "ps", "-aq" ], { encoding: "utf-8" });
        const ids = (idsRes.stdout?.toString() || "").split("\n").map((s) => s.trim()).filter(Boolean);
        if (ids.length === 0) {
            cache = result;
            cacheAt = Date.now();
            return result;
        }

        // project \t NetworkMode \t published JSON \t exposed JSON
        const insp = await childProcessAsync.spawn("docker", [
            "inspect",
            ...ids,
            "--format",
            '{{index .Config.Labels "com.docker.compose.project"}}\t{{.HostConfig.NetworkMode}}\t{{json .NetworkSettings.Ports}}\t{{json .Config.ExposedPorts}}',
        ], { encoding: "utf-8" });

        if (!insp.stdout) {
            cache = result;
            cacheAt = Date.now();
            return result;
        }

        for (const line of insp.stdout.toString().split("\n")) {
            const trimmed = line.trim();
            if (!trimmed) {
                continue;
            }
            const parts = trimmed.split("\t");
            if (parts.length < 4) {
                continue;
            }
            const project = parts[0] || "";
            if (!project) {
                continue;
            }
            const networkMode = parts[1] || "";
            let published: Record<string, { HostIp: string; HostPort: string }[] | null> | null = null;
            let exposed: Record<string, unknown> | null = null;
            try {
                published = JSON.parse(parts[2] || "null");
            } catch {
                published = null;
            }
            try {
                exposed = JSON.parse(parts[3] || "null");
            } catch {
                exposed = null;
            }

            const isHost = networkMode === "host";
            let entry = result.get(project);
            if (!entry) {
                entry = {
                    ports: [],
                    hostNetwork: false,
                };
                result.set(project, entry);
            }
            if (isHost) {
                entry.hostNetwork = true;
            }

            const portSet = new Set(entry.ports);

            if (isHost) {
                // Host network: no published map — use EXPOSE from image/container config
                if (exposed && typeof exposed === "object") {
                    for (const key of Object.keys(exposed)) {
                        // "8080/tcp" -> "8080"
                        const port = key.split("/")[0];
                        if (port && /^\d+(-\d+)?$/.test(port)) {
                            portSet.add(port);
                        }
                    }
                }
            } else if (published && typeof published === "object") {
                for (const bindings of Object.values(published)) {
                    if (!bindings || !Array.isArray(bindings)) {
                        continue;
                    }
                    for (const b of bindings) {
                        if (b?.HostPort) {
                            // Prefer host port users connect to
                            portSet.add(String(b.HostPort));
                        }
                    }
                }
            }

            entry.ports = sortPorts([ ...portSet ]);
        }
    } catch (e) {
        log.error("stack-ports", e);
    }

    cache = result;
    cacheAt = Date.now();
    return result;
}

export function getCachedStackPorts(stackName: string): StackPortInfo {
    return cache.get(stackName) || {
        ports: [],
        hostNetwork: false,
    };
}

function sortPorts(ports: string[]): string[] {
    return ports.sort((a, b) => {
        const na = parseInt(a.split("-")[0], 10);
        const nb = parseInt(b.split("-")[0], 10);
        if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) {
            return na - nb;
        }
        return a.localeCompare(b);
    });
}
