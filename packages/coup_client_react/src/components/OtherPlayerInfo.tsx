import { Influence } from "coup_shared";

function OtherPlayerInfo({ name, credits, revealedInfluences: revealedInfluence }: {
    name: string,
    credits: number,
    revealedInfluences: [Influence | null, Influence | null]
}) {
    const influenceCount = revealedInfluence.filter(i => i === null).length;

    return (
        <div style={{border: "solid black"}}>
            <h1>{name}</h1>
            <p>{credits} credits</p>
            <p>{influenceCount} influences</p>
            <p>{revealedInfluence[0] ?? "Unrevealed"}</p>
            <p>{revealedInfluence[1] ?? "Unrevealed"}</p>
        </div>
    );
}

export default OtherPlayerInfo;