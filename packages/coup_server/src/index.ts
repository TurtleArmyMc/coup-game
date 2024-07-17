import { ClientToServerPacket, PlayerId, ServerToClientPacket, clientValidActionTypes } from "coup_shared";
import { CoupGame } from "coup_game";
import express from 'express';
import expressWs from 'express-ws';
import type { WebSocket } from "ws";
import cors from 'cors';
import assert from "assert";

type UserId = number;

type User = {
    name: string,
    id: UserId,
    ws: WebSocket | null
};

class Lobby {
    readonly name: string;
    users: User[];
    gameInfo: null | {
        game: CoupGame,
        userIdToGameId: Map<UserId, PlayerId>,
    };

    constructor(name: string) {
        this.name = name;
        this.users = [];
        this.gameInfo = null;
    }

    addUser(name: string, ws: WebSocket): UserId {
        console.log(`Added ${name}`);
        const id = this.users.length;
        const user: User = { name, id, ws };
        this.users.push(user);
        ws.on("close", () => user.ws = null);
        return id;
    }

    startGame() {
        if (this.gameInfo !== null) {
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
        this.gameInfo = {
            game: new CoupGame(turnOrder),
            userIdToGameId,
        };
        for (const user of playingUsers) {
            const pid = userIdToGameId.get(user.id);
            user.ws!.onmessage = msg => {
                assert(typeof msg.data === "string");
                this.receivePacket(user.id, JSON.parse(msg.data) as ClientToServerPacket);
            }
            user.ws!.send(JSON.stringify(playingUsers.map(u => u.name)));
            const initial_packet: ServerToClientPacket = {
                game_state: this.gameInfo.game.getGameState(pid),
                hands_state: this.gameInfo.game.getHandsState(pid),
            };
            user.ws!.send(JSON.stringify(initial_packet));
            user.ws!.on(
                "close",
                () => this.receivePacket(
                    user.id,
                    {
                        action: {
                            action_type: "forfeit",
                            acting_player: pid,
                        }
                    }
                )
            );
        }
    }

    private receivePacket(sender: UserId, packet: ClientToServerPacket) {
        console.log("Received");
        console.log(packet);
        if (this.gameInfo) {
            const { game, userIdToGameId } = this.gameInfo;
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
                }
            }
        }
    }

    private broadcastStateToAll() {
        for (const user of this.users) {
            this.broadcastState(user.id);
        }
    }

    private broadcastState(broadcastTo: UserId) {
        const ws = this.users.find(u => u.id === broadcastTo)?.ws;
        const game = this.gameInfo?.game;
        if (ws && game) {
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

app.ws('/ping', (ws: WebSocket, req) => {
    console.log("B");
    ws.send("ping");

    ws.on('message', msg => {
        ws.send(msg);
    });

    ws.on('close', () => {
        console.log('WebSocket was closed');
    });
});

app.ws('/ws/:lobby/:username', (ws, req) => {
    console.log("A");

    const { lobby, username } = req.params;

    // TODO: Multiple lobbies
    if (GLOBAL_LOBBY.gameInfo) {
        ws.close();
        return;
    }
    GLOBAL_LOBBY.addUser(username, ws);
    if (GLOBAL_LOBBY.users.filter(u => u.ws).length === 3 && GLOBAL_LOBBY.gameInfo === null) {
        GLOBAL_LOBBY.startGame();
    }
});

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
});
