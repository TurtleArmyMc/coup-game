import { useRef, useState } from 'react'
import './App.css'
import Game from './components/Game';
import { ClientGameState, ClientToServerPacket, HandsState, ServerToClientPacket } from 'coup_shared';

function App() {
  const ws = useRef<WebSocket | null>(null);
  type LobbyStateType = {
    state: "not_connected",
  } | {
    state: "waiting",
    usernames: string[],
    playerName: string,
    ready: boolean,
  } | {
    state: "playing",
    playerName: string,
    usernames: string[],
    gameState: ClientGameState,
    handsState: HandsState,
  };
  const [lobbyState, setLobbyState] = useState<LobbyStateType>({ state: "not_connected" });

  function joinLobby(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (lobbyState.state !== "not_connected") {
      return;
    }

    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    const playerName = formData.get("player_name") as string;

    // Update UI to be hide username input before getting a response from the server
    setLobbyState({
      state: "waiting",
      playerName,
      usernames: [],
      ready: false,
    });

    let path = window.location.href;
    if (path.charAt(path.length - 1) != '/') path = path + '/';
    path = path + `ws/lobby/${playerName!}`;
    const url = new URL(path);
    url.port = "3000";
    url.protocol = url.protocol.replace('http', 'ws');
    const socket = new WebSocket(url.href);
    socket.onmessage = (msg) => {
      // Receive usernames
      const usernames = JSON.parse(msg.data);
      console.log("GOT USERNAMES");
      console.log(usernames);
      setLobbyState({
        state: "waiting",
        playerName,
        usernames,
        ready: false,
      });
      // Setup socket to listen for game updates
      socket.onmessage = (msg) => {
        const packet: ServerToClientPacket = JSON.parse(msg.data);
        console.log("RECEIVING");
        console.log(packet);
        setLobbyState(
          {
            state: "playing",
            playerName,
            usernames,
            gameState: packet.game_state,
            handsState: packet.hands_state,
          }
        );
      }
    };
    ws.current = socket;
    return socket.close;
  }

  function readyUp() {
    if (lobbyState.state !== "waiting" || lobbyState.ready) {
      return;
    }
    const packet: ClientToServerPacket = {
      type: "change_ready_state",
      state: 'ready',
    };
    setLobbyState(
      {
        ...lobbyState,
        ready: true,
      }
    );
    ws.current?.send(JSON.stringify(packet));
  }

  if (lobbyState.state === "playing") {
    return (
      <><div className='flex flex-col items-center m-10'>
        <h1 className="font-bold"
        >COUP</h1>
      </div>
        {/* <p>{resp}</p> */}
        <Game
          gameState={lobbyState.gameState}
          handsState={lobbyState.handsState}
          usernames={lobbyState.usernames}
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
  } else if (lobbyState.state === "waiting") {
    if (lobbyState.ready) {
      return (
        <>
          <div className='flex flex-col items-center m-10'>
            <h1 className='font-bold'>COUP</h1>
            <p>Waiting for lobby to start...</p>
          </div>
        </>
      );
    } else {
      return (
        <button className='flex flex-col items-center m-10' onClick={readyUp}>
          Ready up
        </button>
      );
    }
  } else {
    return (
      <><div className='flex flex-col items-center m-10'>
        <h1 className='font-bold'>COUP</h1>
        <form className="border-zinc-950" onSubmit={joinLobby}>
          <input className='border' name="player_name"></input>
        </form>
      </div>
      </>
    );
  }
}

export default App
