import { AssassinateAction, AwaitingActionChallenge, AwaitingChallengeResultReveal, AwaitingDiscardInfluence, AwaitingForeignAidBlock, AwaitingInfluenceExchange, AwaitingTargetCounteraction, AwaitingTurn, ClientGameState, ClientToServerPacket, HandsState, Influence, PlayerId, StealAction, clientValidActionTypes } from "coup_shared";
import OtherPlayerInfo from "./OtherPlayerInfo";
import PlayerHandDisplay from "./PlayerHandDisplay";

function Game({ usernames, handsState, gameState, sendPacket }:
    {
        usernames: string[],
        handsState: HandsState,
        gameState: ClientGameState,
        sendPacket: (packet: ClientToServerPacket) => void,
    }) {
    const mypid = handsState.this_player_id;
    const playerInfluencesDiscarded = handsState.influences_discarded[mypid].map(i => i !== null) as [boolean, boolean];

    const actions: {
        label: string,
        packet: ClientToServerPacket
    }[] = [];
    console.log("ACTION TYPES");
    console.log(clientValidActionTypes({ game_state: gameState, hands_state: handsState }));
    for (const actionType of clientValidActionTypes({ game_state: gameState, hands_state: handsState })) {
        switch (actionType) {
            case "Income":
                actions.push({
                    label: "Income",
                    packet: {
                        action: {
                            action_type: "Income",
                            acting_player: mypid,
                            on_turn: (gameState as AwaitingTurn),
                        }
                    }
                });
                break;
            case "Foreign Aid":
                actions.push({
                    label: "Foreign Aid",
                    packet: {
                        action: {
                            action_type: "Foreign Aid",
                            acting_player: mypid,
                            on_turn: (gameState as AwaitingTurn),
                        }
                    }
                });
                break;
            case "Tax":
                actions.push({
                    label: "Tax",
                    packet: {
                        action: {
                            action_type: "Tax",
                            acting_player: mypid,
                            on_turn: (gameState as AwaitingTurn),
                        }
                    }
                });
                break;
            case "Exchange":
                actions.push({
                    label: "Exchange Influences",
                    packet: {
                        action: {
                            action_type: "Exchange",
                            acting_player: mypid,
                            on_turn: (gameState as AwaitingTurn),
                        }
                    }
                });
                break;
            case "Block Foreign Aid": {
                const gs = (gameState as AwaitingForeignAidBlock);
                actions.push({
                    label: `Block ${usernames[gs.foreign_aid_action.acting_player]}'s foreign aid`,
                    packet: {
                        action: {
                            action_type: "Block Foreign Aid",
                            acting_player: mypid,
                            blocked_action: gs.foreign_aid_action
                        }
                    }
                });
                break;
            }
            case "Block Stealing with Captain": {
                const gs = (gameState as AwaitingTargetCounteraction);
                actions.push({
                    label: `Block ${usernames[gs.targeted_action.acting_player]}'s stealing with Captain`,
                    packet: {
                        action: {
                            action_type: "Block Stealing with Captain",
                            acting_player: mypid,
                            blocked_action: gs.targeted_action as StealAction
                        }
                    }
                });
                break;
            }
            case "Block Stealing with Ambassador": {
                const gs = (gameState as AwaitingTargetCounteraction);
                actions.push({
                    label: `Block ${usernames[gs.targeted_action.acting_player]}'s stealing with Ambassador`,
                    packet: {
                        action: {
                            action_type: "Block Stealing with Ambassador",
                            acting_player: mypid,
                            blocked_action: gs.targeted_action as StealAction
                        }
                    }
                });
                break;
            }
            case "Block Assassination": {
                const gs = gameState as AwaitingTargetCounteraction;
                actions.push({
                    label: `Block ${usernames[gs.targeted_action.acting_player]}'s Assassination`,
                    packet: {
                        action: {
                            action_type: "Block Assassination",
                            acting_player: mypid,
                            blocked_action: gs.targeted_action as AssassinateAction
                        }
                    }
                });
                break;
            }
            case "Discard Influence":
                for (const i of [0, 1] as (0 | 1)[]) {
                    if (!playerInfluencesDiscarded[i]) {
                        actions.push(
                            {
                                label: `Discard ${handsState.this_player_influences[i]}`,
                                packet: {
                                    action: {
                                        action_type: "Discard Influence",
                                        acting_player: mypid,
                                        causing_action: (gameState as AwaitingDiscardInfluence).causing_action,
                                        influence_index: i,
                                    }
                                }
                            }
                        );
                    }
                }
                break;
            case "Reveal Challenge Result":
                for (const i of [0, 1] as (0 | 1)[]) {
                    if (!playerInfluencesDiscarded[i]) {
                        actions.push(
                            {
                                label: `Reveal ${handsState.this_player_influences[i]}`,
                                packet: {
                                    action: {
                                        action_type: "Reveal Challenge Result",
                                        acting_player: mypid,
                                        revealed_influence_index: i,
                                        challenge_action: (gameState as AwaitingChallengeResultReveal).challenge_action,
                                    }
                                }
                            }
                        );
                    }
                }
                break;
            case "Coup":
                for (let target = 0; target < handsState.influences_discarded.length; target++) {
                    if (target === mypid) {
                        continue;
                    }
                    if (handsState.influences_discarded[target][0] !== null && handsState.influences_discarded[target][1] !== null) {
                        continue;
                    }
                    actions.push({
                        label: `Coup ${usernames[target]}`,
                        packet: {
                            action: {
                                action_type: "Coup",
                                acting_player: mypid,
                                target_player: target,
                                on_turn: (gameState as AwaitingTurn),
                            }
                        }
                    });
                }
                break;
            case "Assassinate":
                for (let target = 0; target < handsState.influences_discarded.length; target++) {
                    if (target === mypid) {
                        continue;
                    }
                    if (handsState.influences_discarded[target][0] !== null && handsState.influences_discarded[target][1] !== null) {
                        continue;
                    }
                    actions.push({
                        label: `Assassinate ${usernames[target]}`,
                        packet: {
                            action: {
                                action_type: "Assassinate",
                                acting_player: mypid,
                                target_player: target,
                                on_turn: (gameState as AwaitingTurn),
                            }
                        }
                    });
                }
                break;
            case "Steal":
                for (let target = 0; target < handsState.influences_discarded.length; target++) {
                    if (target === mypid) {
                        continue;
                    }
                    if (handsState.influences_discarded[target][0] !== null && handsState.influences_discarded[target][1] !== null) {
                        continue;
                    }
                    if (handsState.player_credits[target] == 0) {
                        continue;
                    }
                    actions.push({
                        label: `Steal from ${usernames[target]}`,
                        packet: {
                            action: {
                                action_type: "Steal",
                                acting_player: mypid,
                                target_player: target,
                                on_turn: (gameState as AwaitingTurn),
                            }
                        }
                    });
                }
                break;
            case "Choose Exchanged Influences": {
                const [oldL, oldR] = handsState.this_player_influences;
                const gs = gameState as AwaitingInfluenceExchange;
                const [newL, newR] = gs.new_influences!;
                if (playerInfluencesDiscarded[0] || playerInfluencesDiscarded[1]) {
                    const oldInfInx = playerInfluencesDiscarded[0] ? 1 : 0;
                    const oldInf = handsState.this_player_influences[oldInfInx];
                    actions.push({
                        label: `Keep ${oldInf}`,
                        packet: {
                            action: {
                                action_type: "Choose Exchanged Influences",
                                acting_player: mypid,
                                swap_influence_with: [null, null],
                                exchange_action: gs.exchange_action,
                            }
                        }
                    });
                    actions.push({
                        label: `Keep ${newL}`,
                        packet: {
                            action: {
                                action_type: "Choose Exchanged Influences",
                                acting_player: mypid,
                                swap_influence_with: [oldInfInx, null],
                                exchange_action: gs.exchange_action,
                            }
                        }
                    });
                    actions.push({
                        label: `Keep ${newR}`,
                        packet: {
                            action: {
                                action_type: "Choose Exchanged Influences",
                                acting_player: mypid,
                                swap_influence_with: [null, oldInfInx],
                                exchange_action: gs.exchange_action,
                            }
                        }
                    });
                } else {
                    // XX
                    actions.push({
                        label: `Keep ${oldL} and ${oldR}`,
                        packet: {
                            action: {
                                action_type: "Choose Exchanged Influences",
                                acting_player: mypid,
                                swap_influence_with: [null, null],
                                exchange_action: gs.exchange_action,
                            }
                        }
                    });
                    // XL
                    actions.push({
                        label: `Keep ${oldL} and ${newL}`,
                        packet: {
                            action: {
                                action_type: "Choose Exchanged Influences",
                                acting_player: mypid,
                                swap_influence_with: [1, null],
                                exchange_action: gs.exchange_action,
                            }
                        }
                    });
                    // XR
                    actions.push({
                        label: `Keep ${oldL} and ${newR}`,
                        packet: {
                            action: {
                                action_type: "Choose Exchanged Influences",
                                acting_player: mypid,
                                swap_influence_with: [null, 1],
                                exchange_action: gs.exchange_action,
                            }
                        }
                    });
                    // LX
                    actions.push({
                        label: `Keep ${newL} and ${oldR}`,
                        packet: {
                            action: {
                                action_type: "Choose Exchanged Influences",
                                acting_player: mypid,
                                swap_influence_with: [0, null],
                                exchange_action: gs.exchange_action,
                            }
                        }
                    });
                    // RX
                    actions.push({
                        label: `Keep ${newR} and ${oldR}`,
                        packet: {
                            action: {
                                action_type: "Choose Exchanged Influences",
                                acting_player: mypid,
                                swap_influence_with: [null, 0],
                                exchange_action: gs.exchange_action,
                            }
                        }
                    });
                    // LR
                    actions.push({
                        label: `Keep ${newL} and ${newR}`,
                        packet: {
                            action: {
                                action_type: "Choose Exchanged Influences",
                                acting_player: mypid,
                                swap_influence_with: [0, 1],
                                exchange_action: gs.exchange_action,
                            }
                        }
                    });
                }
                break;
            }
            case "Challenge": {
                const gs = gameState as AwaitingActionChallenge;
                let label: string;
                const challengable = usernames[gs.challengable_action.acting_player];
                switch (gs.challengable_action.action_type) {
                    case "Block Foreign Aid": {
                        const target = gs.challengable_action.blocked_action.acting_player === mypid ? "your" : `${usernames[gs.challengable_action.blocked_action.acting_player]}'s`;
                        label = `Challenge ${challengable} blocking ${target} foreign aid with a Duke`;
                        break;
                    }
                    case "Block Stealing with Captain": {
                        const target = gs.challengable_action.blocked_action.acting_player === mypid ? "you" : usernames[gs.challengable_action.blocked_action.acting_player];
                        label = `Challenge ${challengable} blocking ${target} from stealing with a Captain`;
                        break;
                    }
                    case "Block Stealing with Ambassador": {
                        const target = gs.challengable_action.blocked_action.acting_player === mypid ? "you" : usernames[gs.challengable_action.blocked_action.acting_player];
                        label = `Challenge ${challengable} blocking ${target} from stealing with an Ambassador`;
                        break;
                    }
                    case "Block Assassination": {
                        const target = gs.challengable_action.blocked_action.acting_player === mypid ? "you" : usernames[gs.challengable_action.blocked_action.acting_player];
                        label = `Challenge ${challengable} blocking ${target} from assassinating with a Contessa`;
                        break;
                    }
                    case "Assassinate": {
                        const target = gs.challengable_action.target_player === mypid ? "you" : usernames[gs.challengable_action.target_player];
                        label = `Challenge ${challengable} assassinating ${target} with an Assassin`;
                        break;
                    }
                    case "Steal": {
                        const target = gs.challengable_action.target_player === mypid ? "you" : usernames[gs.challengable_action.target_player];
                        label = `Challenge ${challengable} stealing from ${target} with a Captain`;
                        break;
                    }
                    case "Exchange":
                        label = `Challenge ${challengable} exchanging with an Ambassador`;
                        break;
                    case "Tax":
                        label = `Challenge ${challengable} taxing with a Duke`;
                        break;
                    default: {
                        const _exhaustive_check: never = gs.challengable_action;
                        throw new Error(_exhaustive_check);
                    }
                }
                actions.push({
                    label,
                    packet: {
                        action: {
                            action_type: "Challenge",
                            acting_player: mypid,
                            challenged_action: gs.challengable_action,
                        }
                    }
                });
                break;
            }
            case "Pass": {
                const gs = gameState as (AwaitingActionChallenge | AwaitingTargetCounteraction | AwaitingForeignAidBlock);
                actions.push({
                    label: "Pass",
                    packet: {
                        action: {
                            action_type: "Pass",
                            acting_player: mypid,
                            pass_on_action: gs.state === "awaiting_challenge" ? gs.challengable_action : (gs.state === "awaiting_foreign_aid_block" ? gs.foreign_aid_action : gs.targeted_action),
                        }
                    }
                });
                break;
            }
            case "forfeit":
                // TODO: Add forfeit button?
                break;
        }
    }
    
    const actionButtons = actions.map(({ label, packet }) => {
        // TODO: Set keys?
        return <button className="border bg-gray-200 p-2 mt-1 min-w-24 min-h-24" onClick={() => sendPacket(packet)} key={Math.random()}><p>{label}</p></button>;
    });
    const colors = ["blue","green","orange","black","red","pink","gray"];
    //List of other player's hands info
    const playersInfo = handsState.influences_discarded
        .map<[[Influence | null, Influence | null], PlayerId]>((influences, id) => [influences, id])
        .filter(e => e[1] !== mypid)
        .map(([revealed_influences, id]) => {
            return (
                <OtherPlayerInfo
                    name={usernames[id]}
                    credits={handsState.player_credits[id]}
                    revealedInfluences={revealed_influences}
                    color = {colors[id]}
                    key={id}
                ></OtherPlayerInfo>
            );
        });

    return (
        <>
            <div style={{ display: "flex", gap: "20%", flexDirection: "row", alignItems: "center", justifyContent: "center" }}>
                {playersInfo}
            </div >

            {/* My hand */}
            <PlayerHandDisplay
                credits={handsState.player_credits[mypid]}
                influenceDiscarded={playerInfluencesDiscarded}
                influences={handsState.this_player_influences}
                name={usernames[mypid]}
                color = {colors[mypid]}
            >

            </PlayerHandDisplay>
            <div className="flex flex-col md:flex-row space-x-4 justify-center items-center">
                {actionButtons}
            </div>
        </>
    );
}

export default Game;