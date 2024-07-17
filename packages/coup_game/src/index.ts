import { Action, INFLUENCE_LIST, Influence, PlayerId, isTurnAction, AssassinateAction, CoupAction, RevealChallengeResultAction, challengableActionInfluence, isCounterAction, ClientGameState, AwaitingTurnAction, AwaitingInfluenceExchange, AwaitingForeignAidBlock, AwaitingTargetCounteraction, AwaitingActionChallenge, AwaitingChallengeResultReveal, AwaitingDiscardInfluence, PlayerWon, ForeignAidAction, ChallengableAction, ChallengeAction, HandsState, ActionType } from "coup_shared";
import { isDeepStrictEqual } from "util";
import assert from 'node:assert/strict';

export class CoupGame {
    private gameState: ServerGameState;

    private deck: Influence[];

    readonly playerCount: number;

    readonly turnOrder: PlayerId[];
    // An index in `turnOrder`
    private currentTurn: number;

    private playerInfluences: [HeldInfluence, HeldInfluence][];
    private playerCredits: number[];

    constructor(turn_order: PlayerId[]) {
        this.playerCount = turn_order.length;

        assert(3 <= this.playerCount && this.playerCount <= 6);
        assert(this.playerCount === new Set(turn_order).size);

        this.turnOrder = turn_order;
        this.currentTurn = 0;

        this.deck = [];
        for (const influence of INFLUENCE_LIST) {
            for (let i = 0; i < 3; i++) {
                this.deck.push(influence);
            }
        }
        // Shuffle
        for (let i = this.deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
        }

        this.playerInfluences = [];
        this.playerCredits = [];
        for (let i = 0; i < this.playerCount; i++) {
            this.playerInfluences.push([{ influence: this.deck.pop()!, discarded: false }, { influence: this.deck.pop()!, discarded: false }]);
            this.playerCredits.push(2);
        }

        this.gameState = {
            state: "player_turn",
            player: turn_order[this.currentTurn],
        }
    }

    // Returns if the action was valid
    makeAction(action: Action): boolean {
        if (!this.actionIsValid(action)) {
            return false;
        }
        this.receiveAction(action);
        return true;
    }

    gameWinner(): PlayerId | null {
        if (this.gameState.state === "game_over") {
            return this.gameState.winning_player;
        }
        let remainingPlayers = [];
        for (const playerId of this.turnOrder) {
            if (!this.playerEliminated(playerId)) {
                remainingPlayers.push(playerId);
            }
        }
        if (remainingPlayers.length === 1) return remainingPlayers[0];
        return null;
    }

    currentPlayer(): PlayerId {
        return this.gameWinner() ?? this.turnOrder[this.currentTurn];
    }

    getHandsState(stateFor: PlayerId): HandsState {
        return {
            influences_discarded: this.playerInfluences.map(([i1, i2]) => [i1.discarded ? i1.influence : null, i2.discarded ? i2.influence : null]),
            player_credits: this.playerCredits,
            this_player_id: stateFor,
            this_player_influences: this.playerInfluences[stateFor].map(i => i.influence) as [Influence, Influence],
        };
    }

    getGameState(stateFor: PlayerId): ClientGameState {
        switch (this.gameState.state) {
            case "player_turn":
            case "awaiting_action_target_counteraction":
            case "awaiting_discard_influence":
            case "game_over":
                return this.gameState;
            case "awaiting_influence_exchange":
                this.gameState.new_influences
                return {
                    state: "awaiting_influence_exchange",
                    exchanging_player: this.gameState.exchanging_player,
                    new_influences: (stateFor === this.gameState.exchanging_player) ? this.gameState.new_influences : null,
                };
            case "awaiting_foreign_aid_block":
                return {
                    state: "awaiting_foreign_aid_block",
                    foreign_aid_action: this.gameState.foreign_aid_action,
                    player_passed: this.gameState.passed_players.includes(stateFor),
                };
            case "awaiting_challenge":
                return {
                    state: "awaiting_challenge",
                    challengable_action: this.gameState.challengable_action,
                    player_passed: this.gameState.passed_players.includes(stateFor),
                };
            case "awaiting_challenge_reveal":
                return {
                    state: "awaiting_challenge_reveal",
                    challenge_action: this.gameState.challenge_action,
                };
        }
    }

    // Checks if a player is able to attempt to take an action.
    // This does not require a player to have to required influences, just that
    // the player is not eliminated, the game state is the correct one for the
    // action, and the targets (if any) are valid.
    // By the time the action is executed, the action may no longer be valid.
    // For example, an assassination will no longer be valid if the target was
    // someone with one influence who challenged the assassination, and no longer
    // has any influences once the assassination is attempted to be executed.
    private actionIsValid(action: Action): boolean {
        // TODO: Add bounds checks to indices?
        if (this.gameState.state === "game_over") {
            return false;
        }
        if (action.action_type === "forfeit") {
            return !this.playerEliminated(action.acting_player);
        }
        if (this.playerEliminated(action.acting_player)) {
            return false;
        }
        if (this.playerCredits[action.acting_player] >= 10) {
            return action.action_type === "Coup"
                && this.gameState.state === "player_turn"
                && action.acting_player === this.gameState.player
                && action.acting_player !== action.target_player
                && !this.playerEliminated(action.target_player);
        }
        if (isTurnAction(action.action_type)) {
            if (this.gameState.state !== "player_turn") {
                return false;
            }
            if (action.acting_player !== this.gameState.player) {
                return false;
            }
        }
        switch (action.action_type) {
            case "Income":
            case "Foreign Aid":
            case "Tax":
            case "Exchange":
                return true;
            case "Coup":
                return action.acting_player !== action.target_player
                    && !this.playerEliminated(action.target_player)
                    && this.playerCredits[action.acting_player] >= 7;
            case "Assassinate":
                return action.acting_player !== action.target_player
                    && !this.playerEliminated(action.target_player)
                    && this.playerCredits[action.acting_player] >= 3;
            case "Steal":
                return action.acting_player !== action.target_player
                    && !this.playerEliminated(action.target_player)
                    && this.playerCredits[action.target_player] > 0;
            case "Choose Exchanged Influences":
                return this.gameState.state === "awaiting_influence_exchange"
                    && action.acting_player === this.gameState.exchanging_player
                    && (
                        (action.swap_influence_with[0] ?? action.swap_influence_with[1] === null)
                        || action.swap_influence_with[0] !== action.swap_influence_with[1]
                    )
                    && (
                        action.swap_influence_with[0] === null
                        || !this.playerInfluences[action.acting_player][action.swap_influence_with[0]].discarded
                    )
                    && (
                        action.swap_influence_with[1] === null
                        || !this.playerInfluences[action.acting_player][action.swap_influence_with[1]].discarded
                    );
            case "Block Foreign Aid":
                return this.gameState.state === "awaiting_foreign_aid_block"
                    && action.acting_player === this.gameState.foreign_aid_action.acting_player
                    && !this.gameState.passed_players.includes(action.acting_player)
                    && isDeepStrictEqual(action.blocked_action, this.gameState.foreign_aid_action);
            case "Block Stealing with Captain": {
                return this.gameState.state === "awaiting_action_target_counteraction"
                    && this.gameState.targeted_action.action_type === "Steal"
                    && action.acting_player === this.gameState.targeted_action.target_player
                    && isDeepStrictEqual(action.blocked_action, this.gameState.targeted_action);
            }
            case "Block Stealing with Ambassador": {
                return this.gameState.state === "awaiting_action_target_counteraction"
                    && this.gameState.targeted_action.action_type === "Steal"
                    && action.acting_player === this.gameState.targeted_action.target_player
                    && isDeepStrictEqual(action.blocked_action, this.gameState.targeted_action);
            }
            case "Block Assassination": {
                return this.gameState.state === "awaiting_action_target_counteraction"
                    && this.gameState.targeted_action.action_type === "Assassinate"
                    && action.acting_player === this.gameState.targeted_action.target_player
                    && isDeepStrictEqual(action.blocked_action, this.gameState.targeted_action);
            }
            case "Challenge":
                return this.gameState.state === "awaiting_challenge"
                    && isDeepStrictEqual(action.challenged_action, this.gameState.challengable_action);
            case "Reveal Challenge Result":
                return this.gameState.state === "awaiting_challenge_reveal"
                    && action.acting_player === this.gameState.challenge_action.acting_player
                    && !this.playerInfluences[action.acting_player][action.revealed_influence_index].discarded
                    && isDeepStrictEqual(action.challenge_action, this.gameState.challenge_action);
            case "Discard Influence":
                return this.gameState.state === "awaiting_discard_influence"
                    && !this.playerInfluences[action.acting_player][action.influence_index].discarded
                    && action.acting_player === this.gameState.causing_action.target_player
                    && isDeepStrictEqual(action.causing_action, this.gameState.causing_action);
            case "Pass": {
                switch (this.gameState.state) {
                    case "awaiting_challenge":
                        return action.acting_player !== this.gameState.challengable_action.acting_player
                            && !this.gameState.passed_players.includes(action.acting_player)
                            && isDeepStrictEqual(action.pass_on_action, this.gameState.challengable_action);
                    case "awaiting_foreign_aid_block":
                        return action.acting_player !== this.gameState.foreign_aid_action.acting_player
                            && !this.gameState.passed_players.includes(action.acting_player)
                            && isDeepStrictEqual(action.pass_on_action, this.gameState.foreign_aid_action);
                    case "awaiting_action_target_counteraction":
                        return action.acting_player === this.gameState.targeted_action.target_player
                            && isDeepStrictEqual(action.pass_on_action, this.gameState.targeted_action);
                }
                return false;
            }
            default:
                const _exhaustive_check: never = action;
                throw new Error(_exhaustive_check);
        }
    }

    // Receives a (valid) action from a client.
    // If it is not blockable or challengable, it is handled immediately.
    // Otherwise, the game state changes to wait for a block/challenge instead,
    // and the action may or may not be handled in the future.
    private receiveAction(action: Action) {
        switch (action.action_type) {
            case "Income":
            case "Coup":
            case "Challenge":
            case "Pass":
            case "Reveal Challenge Result":
            case "forfeit":
            case "Choose Exchanged Influences":
            case "Discard Influence":
                // Unblockable/unchallengable
                this.handleAction(action);
                break;
            case "Foreign Aid":
                // Blockable by everyone
                this.gameState = {
                    state: "awaiting_foreign_aid_block",
                    foreign_aid_action: action,
                    passed_players: [],
                };
                break;
            case "Assassinate":
            case "Steal":
                // Blockable by target
                this.gameState = {
                    state: "awaiting_action_target_counteraction",
                    targeted_action: action,
                };
                break;
            case "Exchange":
            case "Tax":
            case "Block Stealing with Captain":
            case "Block Stealing with Ambassador":
            case "Block Assassination":
                // Challengable
                this.gameState = {
                    state: "awaiting_challenge",
                    challengable_action: action,
                    passed_players: [],
                    foreign_aid_passes: [],
                };
                break;
            case "Block Foreign Aid":
                assert(this.gameState.state === "awaiting_foreign_aid_block");
                this.gameState = {
                    state: "awaiting_challenge",
                    challengable_action: action,
                    passed_players: [],
                    foreign_aid_passes: this.gameState.passed_players,
                };
                break;
            default:
                const _exhaustive_check: never = action;
        }
    }

    // Handles a turn action. A turn action can be invalid (for example, if an
    // assassination is being handled immediately after handling a failed
    // challenge that eliminated the target).
    // Game end checks should take place after an influence can be eliminated.
    // The next turn should be set everyplace a turn action's effects are
    // applied (or fail to apply) if the game isn't won yet.
    // Handling counterable and challengable actions should put the game in the
    // right state to handle counters/challenges, and the effects should be
    // applied.
    private handleAction(action: Action) {
        if (this.gameState.state === "game_over") {
            return;
        }
        switch (action.action_type) {
            case "Income": {
                assert(
                    this.gameState.state === "player_turn"
                    && action.acting_player === this.gameState.player
                    && !this.playerEliminated(action.acting_player)
                );
                this.playerCredits[action.acting_player] += 1;
                this.setNextTurn();
                return;
            }
            case "Foreign Aid": {
                assert(
                    this.gameState.state === "player_turn"
                    && action.acting_player === this.gameState.player
                    && !this.playerEliminated(action.acting_player)
                );
                this.playerCredits[action.acting_player] += 2;
                this.setNextTurn();
                return;
            }
            case "Tax": {
                assert(
                    this.gameState.state === "player_turn"
                    && action.acting_player === this.gameState.player
                    && !this.playerEliminated(action.acting_player)
                );
                this.playerCredits[action.acting_player] += 3;
                this.setNextTurn();
                return;
            }
            case "Exchange": {
                assert(
                    this.gameState.state === "player_turn"
                    && action.acting_player === this.gameState.player
                    && !this.playerEliminated(action.acting_player)
                );
                this.gameState = {
                    state: "awaiting_influence_exchange",
                    exchanging_player: action.acting_player,
                    new_influences: [this.deck.pop()!, this.deck.pop()!],
                };
                return;
            }
            case "Choose Exchanged Influences": {
                assert(
                    this.gameState.state === "awaiting_influence_exchange"
                    && action.acting_player === this.gameState.exchanging_player
                    && !this.playerEliminated(action.acting_player)
                );
                const p = action.acting_player;
                if (action.swap_influence_with[0] !== null) {
                    const i = action.swap_influence_with[0];
                    [this.playerInfluences[p][i].influence, this.gameState.new_influences[0]] = [this.gameState.new_influences[0], this.playerInfluences[p][i].influence];
                }
                if (action.swap_influence_with[1] !== null) {
                    const i = action.swap_influence_with[1];
                    [this.playerInfluences[p][i].influence, this.gameState.new_influences[1]] = [this.gameState.new_influences[1], this.playerInfluences[p][i].influence];
                }

                // Shuffle influences back in
                this.deck.splice(0, 0, this.gameState.new_influences[0]);
                this.deck.splice(0, 0, this.gameState.new_influences[1]);

                this.setNextTurn();
                return;
            }
            case "Coup": {
                if (
                    this.gameState.state !== "player_turn"
                    || action.acting_player !== this.gameState.player
                    || this.playerCredits[action.acting_player] < 7
                ) {
                    return;
                }
                this.playerCredits[action.acting_player] -= 7;
                const stateChanged = this.handleLoseInfluence(action.target_player, action);
                if (!stateChanged) {
                    this.setNextTurn();
                }
                return;
            }
            case "Assassinate": {
                if (
                    this.gameState.state !== "player_turn"
                    || action.acting_player !== this.gameState.player
                    || this.playerCredits[action.acting_player] < 3
                ) {
                    return;
                }
                this.playerCredits[action.acting_player] -= 3;
                const stateChanged = this.handleLoseInfluence(action.target_player, action);
                if (!stateChanged) {
                    this.setNextTurn();
                }
                return;
            }
            case "Steal": {
                if (
                    this.gameState.state !== "player_turn"
                    || action.acting_player !== this.gameState.player
                ) {
                    return;
                }
                // When a steal is attempted by the client, the target can not
                // be eliminated. The target is allowed to be eliminated as a
                // result of a failed challenge by the time the steal is handled
                // though.
                const credits = Math.min(this.playerCredits[action.target_player], 2)
                this.playerCredits[action.target_player] += credits;
                this.playerCredits[action.acting_player] += credits;
                return;
            }
            case "Block Foreign Aid": {
                assert(
                    this.gameState.state === "awaiting_foreign_aid_block"
                    && !this.playerEliminated(action.acting_player)
                );
                this.setNextTurn();
                return;
            }
            case "Block Stealing with Captain":
            case "Block Stealing with Ambassador": {
                assert(
                    this.gameState.state === "awaiting_action_target_counteraction"
                    && this.gameState.targeted_action.action_type === "Steal"
                    && !this.playerEliminated(action.acting_player)
                );
                this.setNextTurn();
                return;
            }
            case "Block Assassination": {
                assert(
                    this.gameState.state === "awaiting_action_target_counteraction"
                    && this.gameState.targeted_action.action_type === "Assassinate"
                    && !this.playerEliminated(action.acting_player)
                );
                this.setNextTurn();
                return;
            }
            case "Challenge": {
                assert(
                    this.gameState.state === "awaiting_challenge"
                    && action.acting_player !== this.gameState.challengable_action.acting_player
                );
                this.gameState = {
                    state: "awaiting_challenge_reveal",
                    challenge_action: action,
                    foreign_aid_passes: this.gameState.foreign_aid_passes,
                }
                return;
            }
            case "Reveal Challenge Result": {
                assert(
                    this.gameState.state === "awaiting_challenge_reveal"
                    && action.acting_player === this.gameState.challenge_action.challenged_action.acting_player
                );
                const challengedAction = action.challenge_action.challenged_action;
                const revealedInfluence = this.playerInfluences[action.acting_player][action.revealed_influence_index].influence;
                const correctInfluence = challengableActionInfluence(challengedAction.action_type) === revealedInfluence;
                if (correctInfluence) {
                    const stateChanged = this.handleLoseInfluence(action.challenge_action.acting_player, action);
                    if (stateChanged) {
                        return;
                    }

                    // Swap revealed influence for a new one
                    this.deck.splice(0, 0, revealedInfluence);
                    this.playerInfluences[action.acting_player][action.revealed_influence_index].influence = this.deck.pop()!;

                    assert(this.gameState.state === "awaiting_challenge_reveal");
                    this.handleAction(this.gameState.challenge_action.challenged_action);
                } else {
                    this.playerInfluences[action.acting_player][action.revealed_influence_index].discarded = true;
                    const winner = this.gameWinner();
                    if (winner !== null) {
                        this.gameState = {
                            state: "game_over",
                            winning_player: winner,
                        };
                        return
                    }
                    if (isCounterAction(challengedAction.action_type)) {
                        if (challengedAction.action_type === "Block Foreign Aid") {
                            const foreignAidBlockPasses = [...this.gameState.foreign_aid_passes, action.challenge_action.acting_player];
                            if (!this.allVotedOnForeignAidBlock(challengedAction.acting_player, foreignAidBlockPasses)) {
                                this.gameState = {
                                    state: "awaiting_foreign_aid_block",
                                    foreign_aid_action: challengedAction.blocked_action,
                                    passed_players: foreignAidBlockPasses,
                                };
                                return;
                            }
                        }
                        // TODO: Can this compile without this assertion?
                        const a = challengedAction.action_type;
                        assert(a === "Block Assassination" || a === "Block Foreign Aid" || a === "Block Stealing with Ambassador" || a === "Block Stealing with Captain");
                        this.handleAction(challengedAction.blocked_action);
                    } else {
                        this.setNextTurn();
                    }
                }
                return;
            }
            case "Discard Influence":
                assert(this.gameState.state === "awaiting_discard_influence");
                assert(!this.playerInfluences[action.acting_player][action.influence_index].discarded);
                this.playerInfluences[action.acting_player][action.influence_index].discarded = true;
                this.setNextTurn();
                return;
            case "forfeit": {
                throw "todo";
                break;
            }
            case "Pass": {
                if (this.gameState.state === "awaiting_action_target_counteraction") {
                    assert(action.acting_player === this.gameState.targeted_action.target_player);
                    this.handleAction(this.gameState.targeted_action);
                } else if (this.gameState.state === "awaiting_foreign_aid_block") {
                    assert(action.acting_player === this.gameState.foreign_aid_action.acting_player);
                    assert(!this.gameState.passed_players.includes(action.acting_player));
                    this.gameState.passed_players.push(action.acting_player);
                    if (!this.allVotedOnForeignAidBlock(action.pass_on_action.acting_player, this.gameState.passed_players)) {
                        return;
                    }
                    this.handleAction(this.gameState.foreign_aid_action);
                }
                return;
            }
            default:
                const _exhaustive_check: never = action;
                throw new Error(_exhaustive_check);
        }
    }

    // Returns whether the game state changed while handling the lost influence
    private handleLoseInfluence(target: PlayerId, causing_action: CoupAction | AssassinateAction | RevealChallengeResultAction): boolean {
        if (causing_action.action_type === "Reveal Challenge Result") {
            const discardInx = causing_action.revealed_influence_index;
            assert(!this.playerInfluences[target][discardInx].discarded);
            this.playerInfluences[target][discardInx].discarded = true;
        } else {
            if (!this.playerInfluences[target][0].discarded && !this.playerInfluences[target][1].discarded) {
                this.gameState = {
                    state: "awaiting_discard_influence",
                    causing_action: causing_action,
                };
                return true;
            }
            if (this.playerEliminated(target)) {
                return false;
            }
            if (this.playerInfluences[target][0].discarded) {
                this.playerInfluences[target][1].discarded = true;
            } else {
                this.playerInfluences[target][0].discarded = true;
            }
        }
        const winner = this.gameWinner();
        if (winner !== null) {
            this.gameState = {
                state: "game_over",
                winning_player: winner,
            };
            return true;
        }
        return false;
    }

    private setNextTurn() {
        const winner = this.gameWinner();
        if (winner !== null) {
            this.gameState = {
                state: "game_over",
                winning_player: winner,
            };
            return;
        }
        do {
            this.currentTurn = (this.currentTurn + 1) % this.playerCount;
        } while (this.playerEliminated(this.currentPlayer()));
        this.gameState = {
            state: "player_turn",
            player: this.currentPlayer()
        };
    }

    private playerEliminated(player: PlayerId): boolean {
        return this.playerInfluences[player][0].discarded && this.playerInfluences[player][1].discarded;
    }

    private allVotedOnForeignAidBlock(foreignAidActor: PlayerId, passes: PlayerId[]) {
        for (let p = 0; p < this.playerCount; p++) {
            if (
                !this.playerEliminated(p)
                && p !== foreignAidActor
                && !passes.includes(p)
            ) {
                return false;
            }
        }
        return true;
    }
}

type ServerGameState =
    AwaitingTurnAction
    | ServerAwaitingInfluenceExchange
    | ServerAwaitingForeignAidBlock
    | AwaitingTargetCounteraction
    | ServerAwaitingActionChallenge
    | ServerAwaitingChallengeResultReveal
    | AwaitingDiscardInfluence
    | PlayerWon;

type ServerAwaitingInfluenceExchange = {
    state: "awaiting_influence_exchange",
    exchanging_player: PlayerId,
    new_influences: [Influence, Influence];
}

type ServerAwaitingForeignAidBlock = {
    state: "awaiting_foreign_aid_block",
    foreign_aid_action: ForeignAidAction,
    passed_players: PlayerId[],
}

// TODO: Factor out waiting for a challenge against blocking foreign aid?
type ServerAwaitingActionChallenge = {
    state: "awaiting_challenge",
    challengable_action: ChallengableAction,
    passed_players: PlayerId[],
    foreign_aid_passes: PlayerId[],
};

// TODO: Factor out waiting for a challenge against blocking foreign aid?
type ServerAwaitingChallengeResultReveal = {
    state: "awaiting_challenge_reveal",
    challenge_action: ChallengeAction,
    foreign_aid_passes: PlayerId[],
};

type HeldInfluence = {
    influence: Influence,
    discarded: boolean,
}
