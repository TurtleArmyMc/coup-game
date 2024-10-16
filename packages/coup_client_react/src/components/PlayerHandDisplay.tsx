import { Influence } from "coup_shared";

function PlayerHandDisplay({ name, credits, color, influences, influenceDiscarded }: {
    name: string,
    credits: number,
    color: string, 
    influences: [Influence | null, Influence | null],
    influenceDiscarded: [boolean, boolean],
}) {
    const eliminated = influenceDiscarded[0] && influenceDiscarded[1];

    return (
        <div className = "border-orange-500 border-2 flex flex-col items-center">
            <h1 className="text-lg font-bold"
            >
                {name}
            </h1>
            <p>{credits} credits</p>
            <div className="flex space-x-5">
                <p style={{ textDecoration: influenceDiscarded[0] ? "line-through" : "" }}>{influences[0]}</p>
                <p style={{ textDecoration: influenceDiscarded[1] ? "line-through" : "" }}>{influences[1]}</p>
            </div>
        </div>
    );
}

export default PlayerHandDisplay;
