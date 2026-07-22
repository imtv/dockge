import { DockgeSocket } from "./util-server";
import { io, Socket as SocketClient } from "socket.io-client";
import { log } from "./log";
import { Agent } from "./models/agent";
import { isDev, LooseObject, sleep } from "../common/util-common";
import semver from "semver";
import { R } from "redbean-node";
import dayjs, { Dayjs } from "dayjs";

/**
 * Dockge Instance Manager
 * One AgentManager per Socket connection
 */
export class AgentManager {

    protected socket : DockgeSocket;
    protected agentSocketList : Record<string, SocketClient> = {};
    protected agentLoggedInList : Record<string, boolean> = {};
    protected _firstConnectTime : Dayjs = dayjs();

    constructor(socket: DockgeSocket) {
        this.socket = socket;
    }

    get firstConnectTime() : Dayjs {
        return this._firstConnectTime;
    }

    /**
     * Test login; returns agent display name from remote if advertised
     * (imtv-lite DOCKGE_AGENT_NAME / primaryHostname).
     */
    test(url : string, username : string, password : string) : Promise<{ agentName?: string }> {
        return new Promise((resolve, reject) => {
            let obj = new URL(url);
            let endpoint = obj.host;

            if (!endpoint) {
                reject(new Error("Invalid Dockge URL"));
            }

            if (this.agentSocketList[endpoint]) {
                reject(new Error("The Dockge URL already exists"));
            }

            let remoteInfo : LooseObject = {};

            let client = io(url, {
                reconnection: false,
                // engine.io: allow large image-list ACKs from agent (types omit this on client)
                ...({ maxHttpBufferSize: 50 * 1024 * 1024 } as object),
                extraHeaders: {
                    endpoint,
                }
            });

            client.on("info", (res : LooseObject) => {
                if (res && typeof res === "object") {
                    remoteInfo = res;
                }
            });

            client.on("connect", () => {
                client.emit("login", {
                    username: username,
                    password: password,
                }, (res : LooseObject) => {
                    if (res.ok) {
                        const agentName =
                            (typeof remoteInfo.agentName === "string" && remoteInfo.agentName) ||
                            (typeof remoteInfo.primaryHostname === "string" && remoteInfo.primaryHostname) ||
                            undefined;
                        resolve({
                            agentName,
                        });
                    } else {
                        reject(new Error(res.msg));
                    }
                    client.disconnect();
                });
            });

            client.on("connect_error", (err) => {
                if (err.message === "xhr poll error") {
                    reject(new Error("Unable to connect to the Dockge instance"));
                } else {
                    reject(err);
                }
                client.disconnect();
            });
        });
    }

    /**
     *
     * @param url
     * @param username
     * @param password
     * @param name
     */
    async add(url: string, username: string, password: string, name: string): Promise<Agent> {
        let bean = R.dispense("agent") as Agent;
        bean.url = url;
        bean.username = username;
        bean.password = password;
        bean.name = name || "";
        await R.store(bean);
        return bean;
    }

    /**
     * Display name always comes from the agent (DOCKGE_AGENT_NAME / primaryHostname).
     * Main host no longer uses a separate Friendly Name.
     * Empty remote name → clear so UI falls back to host:port.
     */
    async syncAgentNameFromRemote(endpoint: string, agentName: string) {
        if (!endpoint) {
            return;
        }
        const list = await Agent.getAgentList();
        const agent = list[endpoint];
        if (!agent) {
            return;
        }
        const next = (agentName || "").trim();
        if (String(agent.name || "").trim() === next) {
            return;
        }
        agent.name = next;
        await R.store(agent);
        log.info("agent-manager", `Synced agent display name from remote: ${endpoint} → ${next || "(endpoint)"}`);
        await this.sendAgentList();
    }

    /**
     *
     * @param url
     */
    async remove(url : string) {
        let bean = await R.findOne("agent", " url = ? ", [
            url,
        ]);

        if (bean) {
            await R.trash(bean);
            let endpoint = bean.endpoint;
            this.disconnect(endpoint);
            this.sendAgentList();
            delete this.agentSocketList[endpoint];
        } else {
            throw new Error("Agent not found");
        }
    }

    /**
     *
     * @param url
     * @param updatedName
     */
    async update(url: string, updatedName: string) {
        const agent = await R.findOne("agent", " url = ? ", [
            url,
        ]);
        if (agent) {
            agent.name = updatedName;
            await R.store(agent);
        } else {
            throw new Error("Agent not found");
        }
    }

    connect(url : string, username : string, password : string) {
        let obj = new URL(url);
        let endpoint = obj.host;

        this.socket.emit("agentStatus", {
            endpoint: endpoint,
            status: "connecting",
        });

        if (!endpoint) {
            log.error("agent-manager", "Invalid endpoint: " + endpoint + " URL: " + url);
            return;
        }

        if (this.agentSocketList[endpoint]) {
            log.debug("agent-manager", "Already connected to the socket server: " + endpoint);
            return;
        }

        log.info("agent-manager", "Connecting to the socket server: " + endpoint);
        let client = io(url, {
            // engine.io: allow large image-list ACKs from agent (types omit this on client)
            ...({ maxHttpBufferSize: 50 * 1024 * 1024 } as object),
            extraHeaders: {
                endpoint,
            }
        });

        client.on("connect", () => {
            log.info("agent-manager", "Connected to the socket server: " + endpoint);

            client.emit("login", {
                username: username,
                password: password,
            }, (res : LooseObject) => {
                if (res.ok) {
                    log.info("agent-manager", "Logged in to the socket server: " + endpoint);
                    this.agentLoggedInList[endpoint] = true;
                    this.socket.emit("agentStatus", {
                        endpoint: endpoint,
                        status: "online",
                    });
                } else {
                    log.error("agent-manager", "Failed to login to the socket server: " + endpoint);
                    this.agentLoggedInList[endpoint] = false;
                    this.socket.emit("agentStatus", {
                        endpoint: endpoint,
                        status: "offline",
                    });
                }
            });
        });

        client.on("connect_error", (err) => {
            log.error("agent-manager", "Error from the socket server: " + endpoint);
            this.socket.emit("agentStatus", {
                endpoint: endpoint,
                status: "offline",
            });
        });

        client.on("disconnect", () => {
            log.info("agent-manager", "Disconnected from the socket server: " + endpoint);
            this.socket.emit("agentStatus", {
                endpoint: endpoint,
                status: "offline",
            });
        });

        client.on("agent", (...args : unknown[]) => {
            this.socket.emit("agent", ...args);
        });

        client.on("info", (res) => {
            log.debug("agent-manager", res);

            // Disconnect if the version is lower than 1.4.0
            if (res?.version && !isDev && semver.satisfies(res.version, "< 1.4.0")) {
                this.socket.emit("agentStatus", {
                    endpoint: endpoint,
                    status: "offline",
                    msg: `${endpoint}: Unsupported version: ` + res.version,
                });
                client.disconnect();
                return;
            }

            // imtv: display name only from agent side (DOCKGE_AGENT_NAME / primaryHostname)
            const remoteName =
                (typeof res?.agentName === "string" && res.agentName.trim()) ||
                (typeof res?.primaryHostname === "string" && res.primaryHostname.trim()) ||
                "";
            this.syncAgentNameFromRemote(endpoint, remoteName).catch((e) => {
                log.warn("agent-manager", "syncAgentNameFromRemote: " + e);
            });
        });

        this.agentSocketList[endpoint] = client;
    }

    disconnect(endpoint : string) {
        let client = this.agentSocketList[endpoint];
        client?.disconnect();
    }

    async connectAll() {
        this._firstConnectTime = dayjs();

        if (this.socket.endpoint) {
            log.info("agent-manager", "This connection is connected as an agent, skip connectAll()");
            return;
        }

        let list : Record<string, Agent> = await Agent.getAgentList();

        if (Object.keys(list).length !== 0) {
            log.info("agent-manager", "Connecting to all instance socket server(s)...");
        }

        for (let endpoint in list) {
            let agent = list[endpoint];
            this.connect(agent.url, agent.username, agent.password);
        }
    }

    disconnectAll() {
        for (let endpoint in this.agentSocketList) {
            this.disconnect(endpoint);
        }
    }

    async emitToEndpoint(endpoint: string, eventName: string, ...args : unknown[]) {
        log.debug("agent-manager", "Emitting event to endpoint: " + endpoint);
        let client = this.agentSocketList[endpoint];

        if (!client) {
            log.error("agent-manager", "Socket client not found for endpoint: " + endpoint);
            throw new Error("Socket client not found for endpoint: " + endpoint);
        }

        if (!client.connected || !this.agentLoggedInList[endpoint]) {
            // Maybe the request is too quick, the socket is not connected yet, check firstConnectTime
            // If it is within 10 seconds, we should apply retry logic here
            let diff = dayjs().diff(this.firstConnectTime, "second");
            log.debug("agent-manager", endpoint + ": diff: " + diff);
            let ok = false;
            while (diff < 10) {
                if (client.connected && this.agentLoggedInList[endpoint]) {
                    log.debug("agent-manager", `${endpoint}: Connected & Logged in`);
                    ok = true;
                    break;
                }
                log.debug("agent-manager", endpoint + ": not ready yet, retrying in 1 second...");
                await sleep(1000);
                diff = dayjs().diff(this.firstConnectTime, "second");
            }

            if (!ok) {
                log.error("agent-manager", `${endpoint}: Socket client not connected`);
                throw new Error("Socket client not connected for endpoint: " + endpoint);
            }
        }

        client.emit("agent", endpoint, eventName, ...args);
    }

    emitToAllEndpoints(eventName: string, ...args : unknown[]) {
        log.debug("agent-manager", "Emitting event to all endpoints");
        for (let endpoint in this.agentSocketList) {
            this.emitToEndpoint(endpoint, eventName, ...args).catch((e) => {
                log.warn("agent-manager", e.message);
            });
        }
    }

    async sendAgentList() {
        let list = await Agent.getAgentList();
        let result : Record<string, LooseObject> = {};

        // Myself
        result[""] = {
            url: "",
            username: "",
            endpoint: "",
            name: "",
            updatedName: "",
        };

        for (let endpoint in list) {
            let agent = list[endpoint];
            result[endpoint] = agent.toJSON();
        }

        this.socket.emit("agentList", {
            ok: true,
            agentList: result,
        });
    }
}
