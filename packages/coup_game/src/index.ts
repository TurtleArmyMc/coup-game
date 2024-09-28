import { Action, INFLUENCE_LIST, Influence, PlayerId, AssassinateAction, CoupAction, RevealChallengeResultAction, challengableActionInfluence, ClientGameState, AwaitingTurn, AwaitingInfluenceExchange, AwaitingTargetCounteraction, AwaitingChallengeResultReveal, AwaitingDiscardInfluence, PlayerWon, ForeignAidAction, ChallengableAction, ChallengeAction, HandsState, ExchangeAction, TaxAction, CounterAction, StealAction, turnActionCounters, isCounterAction } from "coup_shared";
import { isDeepStrictEqual } from "util";
import assert from 'node:assert/strict';

export class CoupGame {
    readonly playerCount: number;
    readonly turnOrder: PlayerId[];

    private game: GameCoroutine | null;
    private clientStates: ClientGameState[];
    private clientHands: HandsState[];

    constructor(turnOrder: PlayerId[]) {
        this.playerCount = turnOrder.length;

        assert(3 <= this.playerCount && this.playerCount <= 6);
        assert(this.playerCount === new Set(turnOrder).size);

        this.turnOrder = turnOrder;

        this.game = runGame(turnOrder);
        const state = this.game.next().value as ServerGameState2;
        this.clientStates = state.clientStates;
        this.clientHands = state.clientHands;
    }

    // Returns if the action was valid
    makeAction(action: Action): boolean {
        if (this.game === null) {
            return false;
        }
        const next = this.game.next(action);
        if (next.done) {
            this.game = null;
        }
        const newStates = next.value;
        if (newStates === undefined) {
            return false;
        }
        this.clientStates = newStates.clientStates;
        this.clientHands = newStates.clientHands;
        return true;
    }

    gameWinner(): PlayerId | null {
        const clientState: ClientGameState = this.clientStates.entries().next().value![0];
        if (clientState.state !== "game_over") {
            return null;
        }
        return clientState.winning_player;
    }

    getHandsState(stateFor: PlayerId): HandsState {
        return this.clientHands[stateFor];
    }

    getGameState(stateFor: PlayerId): ClientGameState {
        return this.clientStates[stateFor];
    }
}

type ServerGameState2 = {
    clientStates: ClientGameState[],
    clientHands: HandsState[],
};

// Yields undefined for invalid game states, GameState while game is running, or winner id after game finishes
type GameCoroutine = Generator<ServerGameState2 | undefined, ServerGameState2, Action>;

// Yields null on invalid input
function* runGame(turnOrder: PlayerId[]): GameCoroutine {
    const deck: Influence[] = [];
    for (const influence of INFLUENCE_LIST) {
        for (let i = 0; i < 3; i++) {
            deck.push(influence);
        }
    }
    // Shuffle
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    const playerInfluences: [HeldInfluence, HeldInfluence][] = [];
    const playerCredits: number[] = [];
    for (const pid of turnOrder) {
        playerInfluences.push([{ influence: deck.pop()!, discarded: false }, { influence: deck.pop()!, discarded: false }]);
        playerCredits.push(2);
    }

    // The current player index gets incremented at the start of each turn, so
    // it needs to start before the bounds when it first gets incremented
    let currentPlayerIndex = -1;
    let turnNumber = 0;
    let winner = getWinner(playerInfluences);
    while (winner === null) {
        turnNumber++;
        do {
            currentPlayerIndex = (currentPlayerIndex + 1) % turnOrder.length;
        } while (playerEliminated(turnOrder[currentPlayerIndex], playerInfluences));
        const turnPlayer = turnOrder[currentPlayerIndex];

        const awaitingTurnInputState: AwaitingTurn = {
            state: "player_turn",
            player: turnPlayer,
            turn_number: turnNumber
        };
        let state: ServerGameState2 | undefined = {
            clientHands: generateClientHands(playerInfluences, playerCredits),
            clientStates: turnOrder.map((_) => awaitingTurnInputState),
        };
        getTurnInput: while (winner === null) {
            const input = yield state;
            state = undefined;

            if (playerCredits[turnPlayer] >= 10) {
                if (input.action_type !== "Coup" && input.action_type !== "forfeit") {
                    continue getTurnInput;
                }
            }
            if (input.action_type !== "forfeit" && input.acting_player !== turnPlayer) {
                continue getTurnInput;
            }

            switch (input.action_type) {
                case "forfeit": {
                    if (playerEliminated(input.acting_player, playerInfluences)) {
                        continue getTurnInput;
                    }

                    const [i0, i1] = playerInfluences[input.acting_player];
                    i0.discarded = true;
                    i1.discarded = true;

                    winner = getWinner(playerInfluences);
                    if (winner !== null || input.acting_player === turnPlayer) {
                        break getTurnInput;
                    }

                    state = {
                        clientHands: generateClientHands(playerInfluences, playerCredits),
                        clientStates: turnOrder.map((_) => awaitingTurnInputState),
                    };

                    continue getTurnInput;
                }
                case "Income": {
                    playerCredits[turnPlayer]++;

                    break getTurnInput;
                }
                case "Foreign Aid": {
                    const foreignAidAction: ForeignAidAction = {
                        action_type: "Foreign Aid",
                        acting_player: turnPlayer,
                        on_turn: awaitingTurnInputState,
                    };

                    let doForeignAid = true;
                    let awaitingBlockFromPlayers = new Set(
                        playerInfluences.map((_, pid) => pid)
                            .filter(pid => pid !== turnPlayer && !playerEliminated(pid, playerInfluences))
                    );
                    getForeignAidBlock: while (awaitingBlockFromPlayers.size !== 0) {
                        const blockForeignAidAction = yield* awaitForeignAidBlock(foreignAidAction, awaitingBlockFromPlayers, playerInfluences, playerCredits);
                        winner = getWinner(playerInfluences);
                        if (winner !== null || playerEliminated(turnPlayer, playerInfluences)) {
                            doForeignAid = false;
                            break getForeignAidBlock;
                        }
                        if (blockForeignAidAction === null) {
                            break getForeignAidBlock;
                        }

                        const blockSuccessful = yield* handleActionChallenges(blockForeignAidAction, deck, playerInfluences, playerCredits);
                        if (blockSuccessful) {
                            doForeignAid = false;
                            break getForeignAidBlock;
                        }

                        winner = getWinner(playerInfluences);
                        if (winner !== null || playerEliminated(turnPlayer, playerInfluences)) {
                            doForeignAid = false;
                            break getForeignAidBlock;
                        }

                        awaitingBlockFromPlayers = awaitingBlockFromPlayers.difference(new Set(
                            playerInfluences.map((_, pid) => pid).filter(pid => playerEliminated(pid, playerInfluences))
                        ));
                    }

                    if (doForeignAid) {
                        playerCredits[turnPlayer] += 2;
                    }

                    break getTurnInput;
                }
                case "Tax": {
                    const taxAction: TaxAction = {
                        action_type: "Tax",
                        acting_player: turnPlayer,
                        on_turn: awaitingTurnInputState,
                    };
                    const doAction = yield* handleActionChallenges(taxAction, deck, playerInfluences, playerCredits);
                    if (doAction) {
                        playerCredits[turnPlayer] += 3;
                    }
                    break getTurnInput;
                }
                case "Exchange": {
                    const exchangeAction: ExchangeAction = {
                        action_type: "Exchange",
                        acting_player: turnPlayer,
                        on_turn: awaitingTurnInputState,
                    }
                    const doAction = yield* handleActionChallenges(exchangeAction, deck, playerInfluences, playerCredits);
                    if (doAction) {
                        yield* awaitExchangeCards(exchangeAction, deck, playerInfluences, playerCredits);
                    }
                    break getTurnInput;
                }
                case "Coup": {
                    if (playerEliminated(input.target_player, playerInfluences)) {
                        continue getTurnInput;
                    }
                    if (input.target_player === turnPlayer) {
                        continue getTurnInput;
                    }
                    if (playerCredits[turnPlayer] < 7) {
                        continue getTurnInput;
                    }

                    playerCredits[turnPlayer] -= 7;
                    const coupAction: CoupAction = {
                        action_type: "Coup",
                        acting_player: turnPlayer,
                        target_player: input.target_player,
                        on_turn: awaitingTurnInputState,
                    };
                    yield* awaitDiscard(coupAction, playerInfluences, playerCredits);
                    break getTurnInput;
                }
                case "Assassinate": {
                    if (playerEliminated(input.target_player, playerInfluences)) {
                        continue getTurnInput;
                    }
                    if (input.target_player === turnPlayer) {
                        continue getTurnInput;
                    }
                    if (playerCredits[turnPlayer] < 3) {
                        continue getTurnInput;
                    }

                    playerCredits[turnPlayer] -= 3;
                    const assassinateAction: AssassinateAction = {
                        action_type: "Assassinate",
                        acting_player: turnPlayer,
                        target_player: input.target_player,
                        on_turn: awaitingTurnInputState,
                    };

                    const assassinateUnchallenged = yield* handleActionChallenges(assassinateAction, deck, playerInfluences, playerCredits);

                    if (!assassinateUnchallenged) {
                        break getTurnInput;
                    }
                    winner = getWinner(playerInfluences);
                    if (winner !== null) {
                        break getTurnInput;
                    }
                    if (playerEliminated(input.target_player, playerInfluences)) {
                        break getTurnInput;
                    }

                    const assassinateUnblocked = yield* awaitTargetBlocked(assassinateAction, deck, playerInfluences, playerCredits);

                    if (!assassinateUnblocked) {
                        break getTurnInput;
                    }
                    winner = getWinner(playerInfluences);
                    if (winner !== null) {
                        break getTurnInput;
                    }
                    if (playerEliminated(input.target_player, playerInfluences)) {
                        break getTurnInput;
                    }

                    yield* awaitDiscard(assassinateAction, playerInfluences, playerCredits);

                    break getTurnInput;
                }
                case "Steal": {
                    if (playerEliminated(input.target_player, playerInfluences)) {
                        continue getTurnInput;
                    }
                    if (input.target_player === turnPlayer) {
                        continue getTurnInput;
                    }
                    if (playerCredits[input.target_player] <= 0) {
                        continue getTurnInput;
                    }

                    const stealAction: StealAction = {
                        action_type: "Steal",
                        acting_player: turnPlayer,
                        target_player: input.target_player,
                        on_turn: awaitingTurnInputState,
                    };

                    const stealUnchallenged = yield* handleActionChallenges(stealAction, deck, playerInfluences, playerCredits);

                    if (!stealUnchallenged) {
                        break getTurnInput;
                    }
                    winner = getWinner(playerInfluences);
                    if (winner !== null) {
                        break getTurnInput;
                    }

                    const stealUnblocked = yield* awaitTargetBlocked(stealAction, deck, playerInfluences, playerCredits);

                    if (!stealUnblocked) {
                        break getTurnInput;
                    }
                    winner = getWinner(playerInfluences);
                    if (winner !== null) {
                        break getTurnInput;
                    }

                    const stolen = Math.min(2, playerCredits[input.target_player]);
                    playerCredits[input.target_player] -= stolen;
                    playerCredits[turnPlayer] += stolen;

                    break getTurnInput;
                }
                default: {
                    continue getTurnInput;
                }
            }
        }

        winner = getWinner(playerInfluences);
    }

    const gameOverState: PlayerWon = {
        state: "game_over",
        winning_player: winner,
    }
    return {
        clientHands: generateClientHands(playerInfluences, playerCredits),
        clientStates: turnOrder.map((_) => gameOverState),
    };
}

/** @returns whether the action should be performed */
function* handleActionChallenges(challengableAction: ChallengableAction, deck: Influence[], playerInfluences: [HeldInfluence, HeldInfluence][], playerCredits: number[]): Generator<ServerGameState2 | undefined, boolean, Action> {
    const attemptingToActPlayer = challengableAction.acting_player;

    const awaitingChallengesFromPlayers = new Set(
        playerInfluences.map((_, pid) => pid)
            .filter(pid => pid !== attemptingToActPlayer && !playerEliminated(pid, playerInfluences))
    );

    let state: ServerGameState2 | undefined = {
        clientHands: generateClientHands(playerInfluences, playerCredits),
        clientStates: playerInfluences.map((_, pid) => ({
            state: "awaiting_challenge",
            challengable_action: challengableAction,
            player_passed: !awaitingChallengesFromPlayers.has(pid)
        })),
    };

    let challengeAction: ChallengeAction | null = null;
    getPlayerChallenge: while (challengeAction === null && awaitingChallengesFromPlayers.size !== 0) {
        const input = yield state;
        state = undefined;

        s: switch (input.action_type) {
            case "forfeit": {
                if (playerEliminated(input.acting_player, playerInfluences)) {
                    continue getPlayerChallenge;
                }

                const [i0, i1] = playerInfluences[input.acting_player];
                i0.discarded = true;
                i1.discarded = true;

                const winner = getWinner(playerInfluences);
                if (winner !== null || input.acting_player === attemptingToActPlayer) {
                    return false;
                }

                awaitingChallengesFromPlayers.delete(input.acting_player);

                break s;
            }
            case "Pass": {
                const removed = awaitingChallengesFromPlayers.delete(input.acting_player);
                if (!removed) {
                    continue getPlayerChallenge;
                }
                break s;
            }
            case "Challenge": {
                if (!awaitingChallengesFromPlayers.has(input.acting_player)) {
                    continue getPlayerChallenge;
                }
                if (!isDeepStrictEqual(input.challenged_action, challengableAction)) {
                    continue getPlayerChallenge;
                }
                challengeAction = input;
                break getPlayerChallenge;
            }
            default: {
                continue getPlayerChallenge;
            }
        }

        state = {
            clientHands: generateClientHands(playerInfluences, playerCredits),
            clientStates: playerInfluences.map((_, pid) => ({
                state: "awaiting_challenge",
                challengable_action: challengableAction,
                player_passed: !awaitingChallengesFromPlayers.has(pid)
            })),
        }
    }
    if (challengeAction === null) {
        return true;
    }

    const challengingPlayer = challengeAction.acting_player;
    const awaitingChallengeRevealState: AwaitingChallengeResultReveal = {
        state: "awaiting_challenge_reveal",
        challenge_action: challengeAction,
    };
    state = {
        clientHands: generateClientHands(playerInfluences, playerCredits),
        clientStates: playerInfluences.map(_ => awaitingChallengeRevealState),
    };
    let revealedInfluenceAction: RevealChallengeResultAction | null = null;
    getRevealedInfluence: while (revealedInfluenceAction === null) {
        const input = yield state;
        state = undefined;

        switch (input.action_type) {
            case "forfeit": {
                if (playerEliminated(input.acting_player, playerInfluences)) {
                    continue getRevealedInfluence;
                }

                const [i0, i1] = playerInfluences[input.acting_player];
                i0.discarded = true;
                i1.discarded = true;

                const winner = getWinner(playerInfluences);
                if (winner !== null || input.acting_player === attemptingToActPlayer) {
                    return false;
                }

                state = {
                    clientHands: generateClientHands(playerInfluences, playerCredits),
                    clientStates: playerInfluences.map(_ => awaitingChallengeRevealState),
                };
                continue getRevealedInfluence;
            }
            case "Reveal Challenge Result": {
                if (input.acting_player !== attemptingToActPlayer) {
                    continue getRevealedInfluence;
                }
                if (!isDeepStrictEqual(input.challenge_action, challengeAction)) {
                    continue getRevealedInfluence;
                }
                if (playerInfluences[attemptingToActPlayer][input.revealed_influence_index].discarded) {
                    continue getRevealedInfluence;
                }

                revealedInfluenceAction = input;
                break getRevealedInfluence;
            }
            default: {
                continue getRevealedInfluence;
            }
        }
    }

    const correctActionInfluence = challengableActionInfluence(challengableAction.action_type);
    const revealedInfluenceType = playerInfluences[attemptingToActPlayer][revealedInfluenceAction.revealed_influence_index].influence;
    if (correctActionInfluence !== revealedInfluenceType) {
        playerInfluences[attemptingToActPlayer][revealedInfluenceAction.revealed_influence_index].discarded = true;
        return false;
    }

    // Challenge failed
    deck.splice(0, 0, revealedInfluenceType);
    playerInfluences[attemptingToActPlayer][revealedInfluenceAction.revealed_influence_index].influence = deck.pop()!;

    yield* awaitDiscard(revealedInfluenceAction, playerInfluences, playerCredits);

    return !playerEliminated(attemptingToActPlayer, playerInfluences);
}

function* awaitDiscard(causingAction: CoupAction | AssassinateAction | RevealChallengeResultAction, playerInfluences: [HeldInfluence, HeldInfluence][], playerCredits: number[]): Generator<ServerGameState2 | undefined, undefined, Action> {
    const discardingPlayer = causingAction.action_type === "Reveal Challenge Result" ? causingAction.challenge_action.acting_player : causingAction.target_player;

    if (playerInfluences[discardingPlayer][0].discarded || playerInfluences[discardingPlayer][1].discarded) {
        playerInfluences[discardingPlayer][0].discarded = true;
        playerInfluences[discardingPlayer][1].discarded = true;
        return;
    }

    const awaitingDiscardInfluenceState: AwaitingDiscardInfluence = {
        state: "awaiting_discard_influence",
        causing_action: causingAction,
    };

    let state: ServerGameState2 | undefined = {
        clientHands: generateClientHands(playerInfluences, playerCredits),
        clientStates: playerInfluences.map(_ => awaitingDiscardInfluenceState),
    };
    getDiscardedInfluence: while (!playerEliminated(discardingPlayer, playerInfluences)) {
        const input = yield state;
        state = undefined;

        switch (input.action_type) {
            case "forfeit": {
                if (playerEliminated(input.acting_player, playerInfluences)) {
                    continue getDiscardedInfluence;
                }

                const [i0, i1] = playerInfluences[input.acting_player];
                i0.discarded = true;
                i1.discarded = true;

                const winner = getWinner(playerInfluences);
                if (winner !== null || input.acting_player === discardingPlayer) {
                    return;
                }

                state = {
                    clientHands: generateClientHands(playerInfluences, playerCredits),
                    clientStates: playerInfluences.map(_ => awaitingDiscardInfluenceState),
                };
                continue getDiscardedInfluence;
            }
            case "Discard Influence": {
                if (input.acting_player !== discardingPlayer) {
                    continue getDiscardedInfluence;
                }
                if (!isDeepStrictEqual(input.causing_action, causingAction)) {
                    continue getDiscardedInfluence;
                }
                if (playerInfluences[discardingPlayer][input.influence_index].discarded) {
                    continue getDiscardedInfluence;
                }

                playerInfluences[discardingPlayer][input.influence_index].discarded = true;

                return;
            }
            default: {
                continue getDiscardedInfluence;
            }
        }
    }
}

function* awaitForeignAidBlock(foreignAidAction: ForeignAidAction, awaitingBlockFromPlayers: Set<PlayerId>, playerInfluences: [HeldInfluence, HeldInfluence][], playerCredits: number[]): Generator<ServerGameState2 | undefined, CounterAction | null, Action> {
    const attemptingToForeignAid: PlayerId = foreignAidAction.acting_player;

    let state: ServerGameState2 | undefined = {
        clientHands: generateClientHands(playerInfluences, playerCredits),
        clientStates: playerInfluences.map((_, pid) => ({
            state: "awaiting_foreign_aid_block",
            foreign_aid_action: foreignAidAction,
            player_passed: !awaitingBlockFromPlayers.has(pid)
        })),
    };

    getBlock: while (awaitingBlockFromPlayers.size !== 0) {
        const input = yield state;
        state = undefined;

        s: switch (input.action_type) {
            case "forfeit": {
                if (playerEliminated(input.acting_player, playerInfluences)) {
                    continue getBlock;
                }

                const [i0, i1] = playerInfluences[input.acting_player];
                i0.discarded = true;
                i1.discarded = true;

                const winner = getWinner(playerInfluences);
                if (winner !== null || input.acting_player === attemptingToForeignAid) {
                    return null;
                }

                awaitingBlockFromPlayers.delete(input.acting_player);
                break s;
            }
            case "Pass": {
                const removed = awaitingBlockFromPlayers.delete(input.acting_player);
                if (!removed) {
                    continue getBlock;
                }
                break s;
            }
            case "Block Foreign Aid": {
                if (!awaitingBlockFromPlayers.has(input.acting_player)) {
                    continue getBlock;
                }
                if (!isDeepStrictEqual(input.blocked_action, foreignAidAction)) {
                    continue getBlock;
                }
                awaitingBlockFromPlayers.delete(input.acting_player);
                return input;
            }
            default: {
                continue getBlock;
            }
        }

        state = {
            clientHands: generateClientHands(playerInfluences, playerCredits),
            clientStates: playerInfluences.map((_, pid) => ({
                state: "awaiting_foreign_aid_block",
                foreign_aid_action: foreignAidAction,
                player_passed: !awaitingBlockFromPlayers.has(pid)
            })),
        };
    }
    return null;
}

function* awaitExchangeCards(exchangeAction: ExchangeAction, deck: Influence[], playerInfluences: [HeldInfluence, HeldInfluence][], playerCredits: number[]): Generator<ServerGameState2 | undefined, undefined, Action> {
    const exchangingPlayer = exchangeAction.acting_player;

    let drawnInf: [Influence, Influence];
    {
        const newInf0 = deck.pop()!;
        const newInf1 = deck.pop()!;
        drawnInf = [newInf0, newInf1];
    }

    let state: ServerGameState2 | undefined = {
        clientHands: generateClientHands(playerInfluences, playerCredits),
        clientStates: playerInfluences.map((_, pid) => ({
            state: "awaiting_influence_exchange",
            exchange_action: exchangeAction,
            new_influences: pid === exchangingPlayer ? drawnInf : null,
        })),
    };

    doExchange: while (true) {
        const input: Action = yield state;
        state = undefined;

        switch (input.action_type) {
            case "forfeit": {
                if (playerEliminated(input.acting_player, playerInfluences)) {
                    continue doExchange;
                }

                const [i0, i1] = playerInfluences[input.acting_player];
                i0.discarded = true;
                i1.discarded = true;

                const winner = getWinner(playerInfluences);
                if (winner !== null || input.acting_player === exchangingPlayer) {
                    break doExchange;
                }

                state = {
                    clientHands: generateClientHands(playerInfluences, playerCredits),
                    clientStates: playerInfluences.map((_, pid): AwaitingInfluenceExchange => ({
                        state: "awaiting_influence_exchange",
                        exchange_action: exchangeAction,
                        new_influences: pid === exchangingPlayer ? drawnInf : null,
                    })),
                };
                continue doExchange;
            }
            case "Choose Exchanged Influences": {
                if (input.acting_player !== exchangingPlayer) {
                    continue doExchange;
                }
                const [swap0, swap1] = input.swap_influence_with;
                if (swap0 !== null && playerInfluences[exchangingPlayer][swap0].discarded) {
                    continue doExchange;
                }
                if (swap1 !== null && playerInfluences[exchangingPlayer][swap1].discarded) {
                    continue doExchange;
                }
                if (swap0 !== null && swap1 !== null && swap0 === swap1) {
                    continue doExchange;
                }
                if (!isDeepStrictEqual(input.exchange_action, exchangeAction)) {
                    continue;
                }

                if (swap0 !== null) {
                    [drawnInf[0], playerInfluences[exchangingPlayer][swap0].influence] = [playerInfluences[exchangingPlayer][swap0].influence, drawnInf[0]];
                }
                if (swap1 !== null) {
                    [drawnInf[1], playerInfluences[exchangingPlayer][swap1].influence] = [playerInfluences[exchangingPlayer][swap1].influence, drawnInf[1]];
                }

                break doExchange;
            }
        }
    }

    deck.splice(0, 0, ...drawnInf);
}

/** @returns whether the action should be performed */
function* awaitTargetBlocked(counterableAction: AssassinateAction | StealAction, deck: Influence[], playerInfluences: [HeldInfluence, HeldInfluence][], playerCredits: number[]): Generator<ServerGameState2 | undefined, boolean, Action> {
    const targetPlayer = counterableAction.target_player;
    const awaitingTargetCounteractionState: AwaitingTargetCounteraction = {
        state: "awaiting_action_target_counteraction",
        targeted_action: counterableAction,
    };
    const validCounteractions = turnActionCounters(counterableAction.action_type);

    let state: ServerGameState2 | undefined = {
        clientHands: generateClientHands(playerInfluences, playerCredits),
        clientStates: playerInfluences.map(_ => awaitingTargetCounteractionState),
    };
    getCounteraction: while (true) {
        const input = yield state;
        state = undefined;

        switch (input.action_type) {
            case "forfeit": {
                if (playerEliminated(input.acting_player, playerInfluences)) {
                    continue getCounteraction;
                }

                const [i0, i1] = playerInfluences[input.acting_player];
                i0.discarded = true;
                i1.discarded = true;

                const winner = getWinner(playerInfluences);
                if (winner !== null || input.acting_player === targetPlayer) {
                    return false;
                }

                state = {
                    clientHands: generateClientHands(playerInfluences, playerCredits),
                    clientStates: playerInfluences.map(_ => awaitingTargetCounteractionState),
                };
                continue getCounteraction;
            }
            case "Pass": {
                if (input.acting_player !== targetPlayer) {
                    continue getCounteraction;
                }
                if (!isDeepStrictEqual(input.pass_on_action, counterableAction)) {
                    continue getCounteraction;
                }
                return true;
            }
            default: {
                if (input.acting_player !== targetPlayer) {
                    continue getCounteraction;
                }
                if (!isCounterAction(input)) {
                    continue getCounteraction;
                }
                if (!validCounteractions.includes(input.action_type)) {
                    continue getCounteraction;
                }
                if (!isDeepStrictEqual(input.blocked_action, counterableAction)) {
                    continue getCounteraction;
                }
                const counteraction: CounterAction = input;
                const doCounteraction = yield* handleActionChallenges(counteraction, deck, playerInfluences, playerCredits);
                const winner = getWinner(playerInfluences);
                return winner === null && !doCounteraction;
            }
        }
    }
}

function generateClientHands(playerInfluences: [HeldInfluence, HeldInfluence][], playerCredits: number[]): HandsState[] {
    const hands: HandsState[] = [];
    const influences_discarded = playerInfluences.map(([i0, i1]) => [(i0.discarded ? i0.influence : null), (i1.discarded ? i1.influence : null)] as [Influence | null, Influence | null]);
    for (let pid = 0; pid < playerInfluences.length; pid++) {
        const [i0, i1] = playerInfluences[pid];
        hands.push({
            influences_discarded,
            player_credits: playerCredits,
            this_player_id: pid,
            this_player_influences: [i0.influence, i1.influence],
        });
    }
    return hands;
}

function getWinner(playerInfluences: [HeldInfluence, HeldInfluence][]): PlayerId | null {
    let winner: number | null = null;
    for (let pid = 0; pid < playerInfluences.length; pid++) {
        const [i0, i1] = playerInfluences[pid];
        if (!i0.discarded || !i1.discarded) {
            if (winner !== null) {
                return null;
            }
            winner = pid;
        }
    }
    return winner;
}

// Returns true for invalid player ids
function playerEliminated(pid: PlayerId, playerInfluences: [HeldInfluence, HeldInfluence][]): boolean {
    const hand = playerInfluences[pid];
    return hand === undefined || (hand[0].discarded && hand[1].discarded);
}

type HeldInfluence = {
    influence: Influence,
    discarded: boolean,
}
