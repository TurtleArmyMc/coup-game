import { Influence } from "coup_shared";

function OtherPlayerInfo({ name, credits, color, revealedInfluences: revealedInfluence }: {
    name: string,
    credits: number,
    color: string,
    revealedInfluences: [Influence | null, Influence | null]
}) {
    const influenceCount = revealedInfluence.filter(i => i === null).length;

    return (
        <div style={{ border: "solid " + color }}>
            <h1 style={{ fontFamily: "cursive ", width: "165px" }}
            >
                {name}
            </h1>
            <p>{credits} credits</p>
            <p>{influenceCount} influences</p>
            <p>{revealedInfluence[0] ?? "Unrevealed"}</p>
            <p>{revealedInfluence[1] ?? "Unrevealed"}</p>
        </div>
    );
}

export default OtherPlayerInfo;
