/**
 * imtv-lite agent bootstrap.
 * Agent mode is determined by the image itself (marker file /.imtv-agent),
 * not by a user-facing DOCKGE_LITE env switch.
 */
import fs from "node:fs";
import path from "node:path";
import { R } from "redbean-node";
import { log } from "./log";
import { generatePasswordHash, verifyPassword } from "./password-hash";
import { Settings } from "./settings";

/** Present only in Dockerfile target "lite" */
export const AGENT_MARKER_PATH = path.join(process.cwd(), ".imtv-agent");

export interface LiteBootstrapConfig {
    /** True when running the agent image (or legacy DOCKGE_LITE for local dev) */
    isAgent: boolean;
    username?: string;
    password?: string;
    /** Display / primary hostname for this agent (not listen bind address) */
    agentName?: string;
}

/** Whether this process is the agent-only image */
export function isAgentImage(): boolean {
    if (fs.existsSync(AGENT_MARKER_PATH)) {
        return true;
    }
    // Optional local/dev override only — not required in compose for the lite image
    const v = (process.env.DOCKGE_LITE || "").toLowerCase();
    return v === "1" || v === "true" || v === "yes";
}

export function readLiteEnv(): LiteBootstrapConfig {
    const username = (process.env.DOCKGE_USERNAME || process.env.DOCKGE_USER || "").trim() || undefined;
    const password = process.env.DOCKGE_PASSWORD || process.env.DOCKGE_PASS || undefined;
    // Agent display name — do NOT reuse DOCKGE_HOSTNAME (that is HTTP listen bind)
    const agentName =
        (process.env.DOCKGE_AGENT_NAME || process.env.DOCKGE_NAME || "").trim() || undefined;

    return {
        isAgent: isAgentImage(),
        username,
        password,
        agentName,
    };
}

/**
 * Ensure a login user exists from env. Returns true if setup is still required.
 */
export async function bootstrapLiteAuth(cfg: LiteBootstrapConfig): Promise<boolean> {
    const userCountRow = await R.knex("user").count("id as count").first();
    const userCount = Number(userCountRow?.count ?? 0);

    if (!cfg.isAgent) {
        // Full image: optional env bootstrap only when DB is empty
        if (userCount === 0 && cfg.username && cfg.password) {
            await createUser(cfg.username, cfg.password);
            log.info("agent", `Created admin user from env: ${cfg.username}`);
            return false;
        }
        return userCount === 0;
    }

    // --- Agent image (imtv-lite) ---
    if (!cfg.username || !cfg.password) {
        if (userCount === 0) {
            log.error(
                "agent",
                "Agent image requires DOCKGE_USERNAME and DOCKGE_PASSWORD in compose environment.",
            );
            return true;
        }
        log.warn("agent", "DOCKGE_USERNAME/DOCKGE_PASSWORD not set; using existing database user.");
        return false;
    }

    if (cfg.password.length < 6) {
        log.error("agent", "DOCKGE_PASSWORD must be at least 6 characters.");
        process.exit(1);
    }

    if (userCount === 0) {
        await createUser(cfg.username, cfg.password);
        log.info("agent", `Agent user created: ${cfg.username}`);
    } else {
        // Keep password in sync with compose so operators can rotate via env
        let user = await R.findOne("user", " username = ? ", [ cfg.username ]);
        if (!user) {
            user = await R.findOne("user", " 1=1 ORDER BY id ASC LIMIT 1 ");
            if (user) {
                log.info("agent", `Updating existing user to username: ${cfg.username}`);
                user.username = cfg.username;
            }
        }
        if (user) {
            const same = verifyPassword(cfg.password, user.password);
            if (!same || user.username !== cfg.username) {
                user.username = cfg.username;
                user.password = generatePasswordHash(cfg.password);
                await R.store(user);
                log.info("agent", `Synced credentials for user: ${cfg.username}`);
            } else {
                log.info("agent", `Agent user ready: ${cfg.username}`);
            }
        } else {
            await createUser(cfg.username, cfg.password);
            log.info("agent", `Agent user created: ${cfg.username}`);
        }
    }

    if (cfg.agentName) {
        await Settings.set("primaryHostname", cfg.agentName);
        log.info("agent", `Agent name / primaryHostname: ${cfg.agentName}`);
    }

    return false;
}

async function createUser(username: string, password: string) {
    const user = R.dispense("user");
    user.username = username;
    user.password = generatePasswordHash(password);
    user.active = 1;
    await R.store(user);
}
