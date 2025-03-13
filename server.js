const WebSocket = require('ws');
const http = require('http');
const https = require('https');
const fs = require('fs');
const express = require('express');
const path = require('path');
const url = require('url');

const app = express();
// 정적 파일 제공
app.use(express.static(path.join(__dirname, 'public')));

// SSL 인증서 로드 (Self-Signed)
const options = {
    key: fs.readFileSync('certs/server-key.pem'),
    cert: fs.readFileSync('certs/server-cert.pem')
};

const server = https.createServer(options, app);
const wss = new WebSocket.Server({ server });



// 룸 관리
const rooms = {};
const clients = {};

wss.on('connection', (ws) => {
  // 클라이언트 ID 생성
  const clientId = generateId();
  clients[clientId] = ws;
  
  console.log(`클라이언트 연결됨: ${clientId}`);
  
  // 클라이언트에 ID 전송
  ws.send(JSON.stringify({
    type: 'connect',
    clientId: clientId
  }));
  
  // 메시지 수신
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log(`메시지 수신: ${JSON.stringify(data).substr(0, 100)}...`);
      
      // 룸 ID 확인
      const roomId = data.roomId;
      
      if (!roomId) {
        console.error('roomId가 없습니다');
        return;
      }
      
      // 메시지 타입에 따라 처리
      switch (data.type) {
        case 'create':
          createRoom(roomId, clientId);
          break;
          
        case 'join':
          joinRoom(roomId, clientId);
          break;
          
        case 'ready':
          // 룸의 다른 참여자에게 준비 상태 전달
          broadcastToRoom(roomId, clientId, {
            type: 'ready'
          });
          break;
          
        case 'offer':
        case 'answer':
        case 'candidate':
        case 'chat':
          // 룸의 다른 참여자에게 메시지 전달
          broadcastToRoom(roomId, clientId, data);
          break;
        case 'bye':
          // 룸의 다른 참여자에게 메시지 전달
          broadcastToRoom(roomId, clientId, data);
          break;
          
        default:
          console.warn(`알 수 없는 메시지 타입: ${data.type}`);
      }
    } catch (error) {
      console.error('메시지 처리 오류:', error);
    }
  });
  
  // 연결 종료
  ws.on('close', () => {
    console.log(`클라이언트 연결 종료: ${clientId}`);
    
    // 참여 중인 룸에서 클라이언트 제거
    leaveRooms(clientId);
    
    // 클라이언트 목록에서 제거
    delete clients[clientId];
  });
  
  // 오류 처리
  ws.on('error', (error) => {
    console.error(`WebSocket 오류: ${error.message}`);
  });
});

// 룸 생성
function createRoom(roomId, clientId) {
  if (!rooms[roomId]) {
    rooms[roomId] = { creator: clientId, clients: [clientId] };
    console.log(`룸 생성됨: ${roomId}, 생성자: ${clientId}`);
  } else {
    console.log(`이미 존재하는 룸: ${roomId}`);
    joinRoom(roomId, clientId);
  }
}

// 룸 참여
function joinRoom(roomId, clientId) {
  if (!rooms[roomId]) {
    createRoom(roomId, clientId);
    return;
  }
  
  // 이미 참여 중인지 확인
  if (!rooms[roomId].clients.includes(clientId)) {
    rooms[roomId].clients.push(clientId);
  }
  
  console.log(`클라이언트 ${clientId}가 룸 ${roomId}에 참여함`);
}

// 모든 룸에서 클라이언트 제거
function leaveRooms(clientId) {
  for (const roomId in rooms) {
    const room = rooms[roomId];
    const index = room.clients.indexOf(clientId);
    
    if (index !== -1) {
      room.clients.splice(index, 1);
      console.log(`클라이언트 ${clientId}가 룸 ${roomId}에서 제거됨`);
      
      // 룸의 다른 참여자들에게 알림
      broadcastToRoom(roomId, clientId, {
        type: 'bye',
        roomId: roomId
      });
      
      // 룸이 비었으면 제거
      if (room.clients.length === 0) {
        delete rooms[roomId];
        console.log(`빈 룸 제거됨: ${roomId}`);
      }
    }
  }
}

// 룸의 다른 참여자들에게 메시지 전송
function broadcastToRoom(roomId, senderId, message) {
  if (!rooms[roomId]) {
    console.warn(`존재하지 않는 룸: ${roomId}`);
    return;
  }
  
  const room = rooms[roomId];
  
  room.clients.forEach(clientId => {
    if (clientId !== senderId) {
      const client = clients[clientId];
      if (client && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(message));
      }
    }
  });
}

// 고유 ID 생성
function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

// 서버 시작
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`시그널링 서버가 포트 ${PORT}에서 실행 중입니다`);
});