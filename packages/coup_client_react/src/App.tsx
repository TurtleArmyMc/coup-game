import { useEffect, useRef, useState } from 'react'
import './App.css'
import Game from './components/Game';
import { ClientGameState, ClientToServerPacket, HandsState, ServerToClientPacket } from 'coup_shared';
// import { ClientToServerPacket } from 'coup_shared'

function App() {
  const [playerName, setPlayerName] = useState<string | null>(null);
  const [submittedUsername, setSubmittedUsername] = useState<boolean>(false);
  const ws = useRef<WebSocket | null>(null);
  // const [usernames, setUsernames] = useState<string[]>([]);
  const [usernames, setUsernames] = useState<string[]>(["A", "B", "C"]);
  const [gameState, setGameState] = useState<ClientGameState | null>(null);
  // const [gameState, setGameState] = useState<ClientGameState | null>({
  //   state: "player_turn",
  //   player: 0,
  // });
  const [handsState, setHandsState] = useState<HandsState | null>(null);
  // const [handsState, setHandsState] = useState<HandsState | null>({
  //   influences_discarded: [[null, null], [null, null], [null, null]],
  //   player_credits: [1, 3, 2],
  //   this_player_id: 0,
  //   this_player_influences: ["Captain", "Ambassador"]
  // });

  useEffect(
    () => {
      console.log("A");
      if (playerName === null) {
        return;
      }
      console.log("B");
      let path = window.location.href;
      if (path.charAt(path.length - 1) != '/') path = path + '/';
      path = path + `ws/lobby/${playerName!}`;
      const url = new URL(path);
      url.port = "3000";
      url.protocol = url.protocol.replace('http', 'ws');
      const socket = new WebSocket(url.href);
      console.log("C");
      socket.onopen = (ev) => console.log(ev);
      socket.onmessage = (msg) => {
        console.log("GOT USERNAMES");
        // Receive usernames
        const names = JSON.parse(msg.data);
        // Setup socket to listen for game updates
        socket.onmessage = (msg) => {
          const packet: ServerToClientPacket = JSON.parse(msg.data);
          console.log("RECEIVING");
          console.log(packet);
          setGameState(packet.game_state);
          setHandsState(packet.hands_state);
        }
        setUsernames(names);
      };
      ws.current = socket;
      return socket.close;
    },
    [submittedUsername],
  );

  if (gameState && handsState) {
    return (
      <><div className='flex flex-col items-center m-10'>
        <h1 className="font-bold"
        >COUP</h1>
      </div>
        {/* <p>{resp}</p> */}
        <Game
          gameState={gameState}
          handsState={handsState}
          usernames={usernames}
          makeAction={(action) => {
            const packet: ClientToServerPacket = {
              type: "game_action",
              action,
            };
            console.log("ACTING");
            console.log(action);
            ws.current?.send(JSON.stringify(packet));
          }}
        >
        </Game>
      </>
    );
  } else if (submittedUsername) {
    return (
      <><div className='flex flex-col items-center m-10'>
        <h1 className='font-bold'>COUP</h1>
        <p>Waiting for lobby to start...</p>
      </div>
      </>
    );
  } else {
    return (
      <><div className='flex flex-col items-center m-10'>
        <h1 className='font-bold'>COUP</h1>
        <form className="border-zinc-950" onSubmit={() => setSubmittedUsername(true)}>
          <input className='border'
            onChange={(e) => setPlayerName(e.target.value)}></input>
        </form>
      </div>
      </>
    );
  }
}

export default App
