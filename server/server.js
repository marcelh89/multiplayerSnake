const server = require('http').createServer();
const { createGameState, gameLoop, getUpdatedVelocity, initGame } = require('./game');
const { makeid } = require('./utils');
const { FRAME_RATE } = require('./constants')

// global state (room state...)
const state = {};
const clientRooms = {};

const io = require("socket.io")(server, {
    transports: ['websocket', 'polling'],
    cors: {
        origin: "http://localhost:8080",
        methods: ["GET", "POST"],
        allowedHeaders: ["my-custom-header"],
        credentials: true
    },
    allowEIO3: true
});


io.on('connection', client => {

    client.on('keydown', handleKeyDown);
    client.on('newGame', handleNewGame);
    client.on('joinGame', handleJoinGame);

    function handleJoinGame(roomName) {
        const room = io.sockets.adapter.rooms[roomName];

        let allUsers;
        if (room) {
            allUsers = room.sockets;
        }

        let numClients = 0;
        if (allUsers) {
            numClients = Object.keys(allUsers).length;
        }

        if (numClients === 0) {
            client.emit('unknownGame');
            return;
        } else if (numClients > 1) {
            client.emit('tooManyPlayers');
            return;
        }

        // exact one player
        clientRooms[client.id] = roomName;
        client.join(roomName);
        client.number = 2;
        client.emit('init', 2);

        startGameInterval(roomName);

    }

    function handleNewGame() {
        let roomName = makeid(5);
        clientRooms[client.id] = roomName;
        client.emit('gameCode', roomName);

        // game state
        state[roomName] = initGame();

        client.join(roomName);
        client.number = 1;
        client.emit('init', 1);

    }

    // use inline function to have access to client
    function handleKeyDown(keyCode) {
        const roomName = clientRooms[client.id];

        if (!roomName) {
            return;
        }

        try {
            keyCode = parseInt(keyCode);
        } catch (e) {
            console.error(e);
            return;
        }

        const vel = getUpdatedVelocity(keyCode);

        if (vel) {
            state[roomName].players[client.number - 1].vel = vel;
        }

    }

});

function startGameInterval(roomName) {
    const intervalId = setInterval(() => {
        const winner = gameLoop(state[roomName]);

        if (!winner) {
            emitGameState(roomName, state[roomName]);
        } else {
            emitGameOver(roomName, winner);
            state[roomName] = null;
            clearInterval(intervalId);
        }
    }, 1000 / FRAME_RATE)
}

function emitGameState(roomName, state) {
    io.sockets.in(roomName)
        .emit('gameState', JSON.stringify(state));
}

function emitGameOver(roomName, winner) {
    io.sockets.in(roomName)
        .emit('gameOver', JSON.stringify({ winner }))
}

io.listen(3000);