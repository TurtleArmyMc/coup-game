import { Influence } from "coup_shared";

function PlayerHandDisplay({ name, credits, influences, influenceDiscarded }: {
    name: string,
    credits: number,
    influences: [Influence | null, Influence | null],
    influenceDiscarded: [boolean, boolean],
}) {
    const eliminated = influenceDiscarded[0] && influenceDiscarded[1];

    return (
        <div style={{ border: "solid black" }}>
            <h1>{name}</h1>
            <p>{credits} credits</p>
            <div style={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "center" }}>
                <p style={{ textDecoration: influenceDiscarded[0] ? "line-through" : "" }}>{influences[0]}</p>
                <p style={{ textDecoration: influenceDiscarded[1] ? "line-through" : "" }}>{influences[1]}</p>
            </div>
        </div>
    );
}

export default PlayerHandDisplay;
