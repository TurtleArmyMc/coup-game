import { Influence } from "coup_shared";

function OtherPlayerInfo({ name, credits, color, revealedInfluences: revealedInfluence }: {
    name: string,
    credits: number,
    color: string,
    revealedInfluences: [Influence | null, Influence | null]
}) {
    const influenceCount = revealedInfluence.filter(i => i === null).length;

    return (
        <div className ="md:p-10 flex flex-col mb-5 items-center" style={{ border: "solid " + color }}>
            <h1 className ="text-lg font-bold" style={{ fontFamily: "cursive "}}
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
