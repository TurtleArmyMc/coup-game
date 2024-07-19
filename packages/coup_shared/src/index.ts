export type PlayerId = number;

export type CoupClientView = {
    player_count: number,
    player_revealed_influences: Influence[],
    player_credit_counts: number,
    player_hand: {
        remaining_influences: Influence[],
    },
};

export type ClientToServerPacket = {
    action: Action
};

export type ServerToClientPacket = {
    game_state: ClientGameState,
    hands_state: HandsState,
}

export type ClientGameState =
    AwaitingTurn
    | AwaitingInfluenceExchange
    | AwaitingForeignAidBlock
    | AwaitingTargetCounteraction
    | AwaitingActionChallenge
    | AwaitingChallengeResultReveal
    | AwaitingDiscardInfluence
    | PlayerWon;

export type HandsState = {
    influences_discarded: [Influence | null, Influence | null][],
    player_credits: number[],
    this_player_id: PlayerId,
    this_player_influences: [Influence, Influence],
};

export type AwaitingTurn = {
    state: "player_turn",
    player: PlayerId,
    turn_number: number,
};

export type AwaitingInfluenceExchange = {
    state: "awaiting_influence_exchange",
    exchange_action: ExchangeAction,
    new_influences: [Influence, Influence] | null,
}

export type AwaitingForeignAidBlock = {
    state: "awaiting_foreign_aid_block",
    foreign_aid_action: ForeignAidAction,
    player_passed: boolean,
};

export type AwaitingTargetCounteraction = {
    state: "awaiting_action_target_counteraction",
    targeted_action: AssassinateAction | StealAction,
};

export type AwaitingActionChallenge = {
    state: "awaiting_challenge",
    challengable_action: ChallengableAction,
    player_passed: boolean,
};

export type AwaitingChallengeResultReveal = {
    state: "awaiting_challenge_reveal",
    challenge_action: ChallengeAction,
};

export type AwaitingDiscardInfluence = {
    state: "awaiting_discard_influence",
    causing_action: CoupAction | AssassinateAction | RevealChallengeResultAction,
}

export type PlayerWon = {
    state: "game_over",
    winning_player: PlayerId,
};

export type Action =
    TurnAction
    | ChooseExchangedInfluencesAction
    | CounterAction
    | ChallengeAction
    | PassAction
    | DiscardInfluenceAction
    | RevealChallengeResultAction
    | ForfeitAction;

export type TurnAction =
    IncomeAction
    | ForeignAidAction
    | TaxAction
    | ExchangeAction
    | CoupAction
    | AssassinateAction
    | StealAction;

export type ChallengableAction =
    CounterAction
    | TaxAction
    | ExchangeAction
    | AssassinateAction
    | StealAction;

export type IncomeAction = {
    action_type: "Income",
    acting_player: PlayerId,
    on_turn: AwaitingTurn,
}

export type ForeignAidAction = {
    action_type: "Foreign Aid",
    acting_player: PlayerId,
    on_turn: AwaitingTurn,
}

export type TaxAction = {
    action_type: "Tax",
    acting_player: PlayerId,
    on_turn: AwaitingTurn,
}

export type ExchangeAction = {
    action_type: "Exchange",
    acting_player: PlayerId,
    on_turn: AwaitingTurn,
}

// TODO: Let client choose the order to return influences to deck in?
export type ChooseExchangedInfluencesAction = {
    action_type: "Choose Exchanged Influences",
    acting_player: PlayerId,
    exchange_action: ExchangeAction,
    swap_influence_with: [0 | 1 | null, 0 | 1 | null],
};

export type CoupAction = {
    action_type: "Coup",
    acting_player: PlayerId,
    target_player: PlayerId,
    on_turn: AwaitingTurn,
}

export type AssassinateAction = {
    action_type: "Assassinate",
    acting_player: PlayerId,
    target_player: PlayerId,
    on_turn: AwaitingTurn,
}

export type StealAction = {
    action_type: "Steal",
    acting_player: PlayerId,
    target_player: PlayerId,
    on_turn: AwaitingTurn,
};

export type CounterAction =
    {
        action_type: "Block Foreign Aid",
        acting_player: PlayerId,
        blocked_action: ForeignAidAction,
    }
    | {
        action_type: "Block Stealing with Captain",
        acting_player: PlayerId,
        blocked_action: StealAction,
    }
    | {
        action_type: "Block Stealing with Ambassador",
        acting_player: PlayerId,
        blocked_action: StealAction,
    }
    | {
        action_type: "Block Assassination",
        acting_player: PlayerId,
        blocked_action: AssassinateAction,
    };

export type ChallengeAction = {
    action_type: "Challenge",
    acting_player: PlayerId,
    challenged_action: ChallengableAction,
};

export type DiscardInfluenceAction = {
    action_type: "Discard Influence",
    acting_player: PlayerId,
    influence_index: 0 | 1,
    causing_action: CoupAction | AssassinateAction | RevealChallengeResultAction,
}

export type PassAction = {
    action_type: "Pass",
    acting_player: PlayerId,
    pass_on_action: ChallengableAction | ForeignAidAction | AssassinateAction | StealAction,
}

export type RevealChallengeResultAction = {
    action_type: "Reveal Challenge Result",
    acting_player: PlayerId,
    revealed_influence_index: 0 | 1,
    challenge_action: ChallengeAction,
};

export type ForfeitAction = {
    action_type: "forfeit",
    acting_player: PlayerId,
};

export type ActionType = TurnActionType | CounterActionType | "Choose Exchanged Influences" | "Challenge" | "Discard Influence" | "Pass" | "Reveal Challenge Result" | "forfeit";

export const TURN_ACTION_LIST = ["Income", "Foreign Aid", "Coup", "Tax", "Assassinate", "Exchange", "Steal"] as const;

export type TurnActionType = typeof TURN_ACTION_LIST[number]

export const COUNTER_ACTION_LIST = ["Block Foreign Aid", "Block Stealing with Captain", "Block Stealing with Ambassador", "Block Assassination"] as const;

export type CounterActionType = typeof COUNTER_ACTION_LIST[number];

export type ChallengableActionType = "Tax" | "Block Foreign Aid" | "Exchange" | "Assassinate" | "Steal" | "Block Stealing with Captain" | "Block Stealing with Ambassador" | "Block Assassination";

export const INFLUENCE_LIST = ["Duke", "Assassin", "Ambassador", "Captain", "Contessa"] as const;

export type Influence = typeof INFLUENCE_LIST[number];

export function isTurnAction(action: ActionType): action is TurnActionType {
    return (TURN_ACTION_LIST as readonly ActionType[]).includes(action);
}

export function isCounterAction(action: ActionType): action is CounterActionType {
    return (COUNTER_ACTION_LIST as readonly ActionType[]).includes(action);
}

export function turnActionCounters(action: TurnActionType): CounterActionType[] {
    switch (action) {
        case "Income": return [];
        case "Foreign Aid": return ["Block Foreign Aid"];
        case "Coup": return [];
        case "Tax": return [];
        case "Assassinate": return ["Block Assassination"];
        case "Exchange": return [];
        case "Steal": return ["Block Stealing with Ambassador", "Block Stealing with Captain"];
    }
}

export function couterActionInfluence(action: CounterActionType): Influence {
    switch (action) {
        case "Block Foreign Aid": return "Duke";
        case "Block Stealing with Captain": return "Captain";
        case "Block Stealing with Ambassador": return "Ambassador";
        case "Block Assassination": return "Contessa";
    }
}

export function challengableActionInfluence(action: ChallengableActionType): Influence {
    switch (action) {
        case "Tax":
        case "Block Foreign Aid":
            return "Duke";
        case "Exchange":
            return "Ambassador";
        case "Assassinate":
            return "Assassin";
        case "Steal":
            return "Captain";
        case "Block Stealing with Captain":
            return "Captain";
        case "Block Stealing with Ambassador":
            return "Ambassador";
        case "Block Assassination":
            return "Contessa";
    }
}

export function clientValidActionTypes({ game_state, hands_state }: ServerToClientPacket): ActionType[] {
    if (game_state.state === "game_over") {
        return [];
    }
    const pid = hands_state.this_player_id;
    if (hands_state.influences_discarded[pid].findIndex(i => i === null) === -1) {
        return [];
    }
    if (
        game_state.state === "player_turn"
        && game_state.player === pid
        && hands_state.player_credits[pid] >= 10
    ) {
        return ["forfeit", "Coup"];
    }
    const actions: ActionType[] = ["forfeit"];
    switch (game_state.state) {
        case "player_turn":
            if (game_state.player !== pid) {
                return actions;
            }
            if (hands_state.player_credits[pid] >= 3) {
                actions.push("Assassinate");
            }
            if (hands_state.player_credits[pid] >= 7) {
                actions.push("Coup");
            }
            return ["Income", "Foreign Aid", "Tax", "Steal", "Exchange", ...actions]
        case "awaiting_challenge_reveal":
            if (game_state.challenge_action.challenged_action.acting_player === pid) {
                actions.push("Reveal Challenge Result");
            }
            return actions;
        case "awaiting_influence_exchange":
            if (game_state.exchange_action.acting_player === pid) {
                return [...actions, "Choose Exchanged Influences"];
            }
            return actions;
        case "awaiting_foreign_aid_block":
            if (game_state.foreign_aid_action.acting_player === pid) {
                return actions;
            }
            if (game_state.player_passed) {
                return actions;
            }
            return [...actions, "Pass", "Block Foreign Aid"];
        case "awaiting_action_target_counteraction":
            if (game_state.targeted_action.target_player !== pid) {
                return actions;
            }
            actions.push("Pass");
            switch (game_state.targeted_action.action_type) {
                case "Assassinate":
                    return [...actions, "Block Assassination"];
                case "Steal":
                    return [...actions, "Block Stealing with Captain", "Block Stealing with Ambassador"];
            }
        case "awaiting_challenge":
            if (game_state.challengable_action.acting_player === pid) {
                return actions;
            }
            if (game_state.player_passed) {
                return actions;
            }
            return [...actions, "Pass", "Challenge"];
        case "awaiting_discard_influence":
            switch (game_state.causing_action.action_type) {
                case "Coup":
                case "Assassinate": {
                    if (game_state.causing_action.target_player === pid)
                        actions.push("Discard Influence");
                    break;
                }
                case "Reveal Challenge Result": {
                    if (game_state.causing_action.challenge_action.acting_player === pid) {
                        actions.push("Discard Influence");
                    }
                    break;
                }
                default:
                    const _exhaustive_check: never = game_state.causing_action;
                    throw new Error(_exhaustive_check);
            }
            return actions;
        default:
            const _exhaustive_check: never = game_state;
            throw new Error(_exhaustive_check);
    }
}