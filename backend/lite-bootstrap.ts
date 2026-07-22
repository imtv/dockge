/**
 * imtv-lite: bootstrap agent from environment variables.
 * Used when DOCKGE_LITE=1 so remote hosts need no web setup.
 */
import { R } from "redbean-node";
import { log } from "./log";
import { generatePasswordHash, verifyPassword } from "./password-hash";
import { Settings } from "./settings";

export interface LiteBootstrapConfig {
    lite: boolean;
    username?: string;
    password?: string;
    /** Display / primary hostname for this agent (not listen bind address) */
    agentName?: string;
}

export function readLiteEnv(): LiteBootstrapConfig {
    const lite =
        process.env.DOCKGE_LITE === "1" ||
        process.env.DOCKGE_LITE === "true" ||
        process.env.DOCKGE_LITE === "yes";

    const username = (process.env.DOCKGE_USERNAME || process.env.DOCKGE_USER || "").trim() || undefined;
    const password = process.env.DOCKGE_PASSWORD || process.env.DOCKGE_PASS || undefined;
    // Agent display name — do NOT reuse DOCKGE_HOSTNAME (that is HTTP listen bind)
    const agentName =
        (process.env.DOCKGE_AGENT_NAME || process.env.DOCKGE_NAME || "").trim() || undefined;

    return {
        lite,
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

    if (!cfg.lite) {
        // Non-lite: optional env bootstrap only when DB is empty
        if (userCount === 0 && cfg.username && cfg.password) {
            await createUser(cfg.username, cfg.password);
            log.info("lite", `Created admin user from env: ${cfg.username}`);
            return false;
        }
        return userCount === 0;
    }

    // --- Lite mode ---
    if (!cfg.username || !cfg.password) {
        if (userCount === 0) {
            log.error(
                "lite",
                "DOCKGE_LITE=1 requires DOCKGE_USERNAME and DOCKGE_PASSWORD in the environment (compose).",
            );
            // Still need setup if someone opens the API, but agent cannot login until set
            return true;
        }
        log.warn("lite", "DOCKGE_USERNAME/DOCKGE_PASSWORD not set; using existing database user.");
        return false;
    }

    if (cfg.password.length < 6) {
        log.error("lite", "DOCKGE_PASSWORD must be at least 6 characters.");
        process.exit(1);
    }

    if (userCount === 0) {
        await createUser(cfg.username, cfg.password);
        log.info("lite", `Lite agent user created: ${cfg.username}`);
    } else {
        // Keep password in sync with compose so operators can rotate via env
        let user = await R.findOne("user", " username = ? ", [ cfg.username ]);
        if (!user) {
            // Rename/take over the first user when username changed in env
            user = await R.findOne("user", " 1=1 ORDER BY id ASC LIMIT 1 ");
            if (user) {
                log.info("lite", `Updating existing user to username: ${cfg.username}`);
                user.username = cfg.username;
            }
        }
        if (user) {
            const same = verifyPassword(cfg.password, user.password);
            if (!same || user.username !== cfg.username) {
                user.username = cfg.username;
                user.password = generatePasswordHash(cfg.password);
                await R.store(user);
                log.info("lite", `Synced credentials for user: ${cfg.username}`);
            } else {
                log.info("lite", `Lite agent user ready: ${cfg.username}`);
            }
        } else {
            await createUser(cfg.username, cfg.password);
            log.info("lite", `Lite agent user created: ${cfg.username}`);
        }
    }

    if (cfg.agentName) {
        await Settings.set("primaryHostname", cfg.agentName);
        log.info("lite", `Agent name / primaryHostname: ${cfg.agentName}`);
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
