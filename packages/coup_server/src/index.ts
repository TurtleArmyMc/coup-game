import { ClientToServerPacket, PlayerId, ServerMemberId, ServerToClientPacket } from "coup_shared";
import { CoupGame } from "coup_game";
import express from 'express';
import expressWs from 'express-ws';
import type { WebSocket } from "ws";
import cors from 'cors';
import assert from "assert";

type User = {
    name: string,
    id: ServerMemberId,
    ws: WebSocket | null
};

class Lobby {
    readonly name: string;
    users: User[];
    lobbyState: {
        state: "waiting",
        ready: ServerMemberId[],
    } | {
        state: "playing",
        game: CoupGame,
        userIdToGameId: Map<ServerMemberId, PlayerId>,
    };

    constructor(name: string) {
        this.name = name;
        this.users = [];
        this.lobbyState = {
            state: "waiting",
            ready: [],
        };
    }

    addUser(name: string, ws: WebSocket): ServerMemberId {
        console.log(`Added ${name}`);
        const uid = this.users.length;
        const user: User = { name, id: uid, ws };
        this.users.push(user);
        ws.onmessage = msg => {
            assert(typeof msg.data === "string");
            this.receivePacket(uid, JSON.parse(msg.data) as ClientToServerPacket);
        }
        ws.onclose = () => this.removeUser(uid);
        return uid;
    }

    removeUser(uid: ServerMemberId) {
        const user = this.users.find(u => u.id === uid)!;
        user.ws = null;
        switch (this.lobbyState.state) {
            case "waiting": {
                this.lobbyState.ready = this.lobbyState.ready.filter(readyUid => readyUid !== uid);
                break;
            }
            case "playing": {
                const pid = this.lobbyState.userIdToGameId.get(uid);
                if (pid !== undefined) {
                    this.receivePacket(
                        uid,
                        {
                            type: "game_action",
                            action: {
                                action_type: "forfeit",
                                acting_player: pid,
                            }
                        }
                    );
                }
                break;
            }
            default:
                const _exhaustive_check: never = this.lobbyState;
                throw _exhaustive_check;
        }
    }

    startGame() {
        if (this.lobbyState.state === "playing") {
            throw new Error("game already started");
        }
        console.log("STARTING GAME");
        const playingUsers = this.users.filter(u => u.ws !== null);
        const userIdToGameId = new Map();
        const turnOrder = [];
        for (let playerId = 0; playerId < playingUsers.length; playerId++) {
            userIdToGameId.set(playingUsers[playerId].id, playerId);
            turnOrder.push(playerId);
        }
        this.lobbyState = {
            state: "playing",
            game: new CoupGame(turnOrder),
            userIdToGameId,
        };
        for (const user of playingUsers) {
            const pid = userIdToGameId.get(user.id);
            user.ws!.send(JSON.stringify(playingUsers.map(u => u.name)));
            const initial_packet: ServerToClientPacket = {
                game_state: this.lobbyState.game.getGameState(pid),
                hands_state: this.lobbyState.game.getHandsState(pid),
            };
            user.ws!.send(JSON.stringify(initial_packet));
        }
    }

    private restartGame() {
        console.log("RESTARTING GAME");
        const playingUsers = this.users.filter(u => u.ws !== null);
        const userIdToGameId = new Map();
        const turnOrder = [];
        for (let playerId = 0; playerId < playingUsers.length; playerId++) {
            userIdToGameId.set(playingUsers[playerId].id, playerId);
            turnOrder.push(playerId);
        }
        // TODO: If not enough players are still online, go back to the lobby
        this.lobbyState = {
            state: "playing",
            game: new CoupGame(turnOrder),
            userIdToGameId,
        };
        for (const user of playingUsers) {
            const pid = userIdToGameId.get(user.id);
            const initial_packet: ServerToClientPacket = {
                game_state: this.lobbyState.game.getGameState(pid),
                hands_state: this.lobbyState.game.getHandsState(pid),
            };
            user.ws!.send(JSON.stringify(initial_packet));
        }
    }

    private receivePacket(sender: ServerMemberId, packet: ClientToServerPacket) {
        console.log("Received");
        console.log(packet);
        switch (packet.type) {
            case "change_ready_state":
                if (this.lobbyState.state !== "waiting") {
                    return;
                }
                if (this.lobbyState.ready.includes(sender)) {
                    return;
                }
                this.lobbyState.ready.push(sender);
                if (this.lobbyState.ready.length >= 3 && this.lobbyState.ready.length === this.users.length) {
                    this.startGame();
                }
                return;
            case "game_action": {
                if (this.lobbyState.state !== "playing") {
                    return;
                }
                const { game, userIdToGameId } = this.lobbyState;
                const playerId: PlayerId = userIdToGameId.get(sender)!;
                if (playerId != packet.action.acting_player) {
                    return;
                }
                const stateBefore = game.getGameState(playerId);
                if (game.makeAction(packet.action)) {
                    const stateAfter = game.getGameState(playerId);
                    if (
                        (
                            stateBefore.state === "awaiting_challenge"
                            || stateBefore.state === "awaiting_foreign_aid_block"
                        )
                        && stateBefore === stateAfter
                    ) {
                        // If someone passed and there's still other people we're
                        // waiting on a response from, only notify the person who
                        // passed that anything changed
                        this.broadcastState(sender);
                    } else {
                        this.broadcastStateToAll();
                        if (stateAfter.state === "game_over") {
                            setTimeout(() => this.restartGame(), 5000);
                        }
                    }
                } else {
                    console.log("Received action invalid");
                }
                return;
            }
            default:
                const _exhaustive_check: never = packet;
                throw _exhaustive_check;
        }
    }

    private broadcastStateToAll() {
        for (const user of this.users) {
            this.broadcastState(user.id);
        }
    }

    private broadcastState(broadcastTo: ServerMemberId) {
        const ws = this.users.find(u => u.id === broadcastTo)?.ws;
        if (ws && this.lobbyState.state === "playing") {
            const game = this.lobbyState.game;
            const packet: ServerToClientPacket = {
                game_state: game.getGameState(broadcastTo),
                hands_state: game.getHandsState(broadcastTo),
            };
            ws.send(JSON.stringify(packet));
        }
    }
}

const GLOBAL_LOBBY: Lobby = new Lobby("Coup");

const app = expressWs(express()).app;
const port = 3000;

app.use(cors())

app.get('/', (req, res) => {
    console.log("Hello world!");
    res.send("Hello world!");
});

app.ws('/ws/:lobby/:username', (ws, req) => {
    console.log("A");

    // TODO: Multiple lobbies
    const { lobby, username } = req.params;

    // TODO: Add spectators late
    if (GLOBAL_LOBBY.lobbyState.state === "playing") {
        ws.close();
        return;
    }
    GLOBAL_LOBBY.addUser(username, ws);
});

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
});
