const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const cors = require('cors')

const app = express()
const server = http.createServer(app)

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
})

app.use(cors())

app.get('/', (req, res) => {
  res.send('P2P signaling server is running')
})

// store active rooms here
const rooms = {}

io.on('connection', (socket) => {
  console.log('connected:', socket.id)

  // sender creates a room
  socket.on('create-room', (roomId) => {
    rooms[roomId] = { sender: socket.id, receiver: null }
    socket.join(roomId)
    console.log('room created:', roomId)
    socket.emit('room-created', roomId)
  })

  // receiver joins the room
  socket.on('join-room', (roomId) => {
    const room = rooms[roomId]

    // check if room exists
    if (!room) {
      socket.emit('room-not-found')
      return
    }

    // check if room is already full
    if (room.receiver) {
      socket.emit('room-full')
      return
    }

    room.receiver = socket.id
    socket.join(roomId)
    console.log('receiver joined room:', roomId)

    // tell sender that receiver joined
    socket.to(room.sender).emit('peer-joined')
    socket.emit('joined-room', roomId)
  })

  // pass webrtc offer from sender to receiver
  socket.on('offer', ({ roomId, offer }) => {
    console.log('offer sent in room:', roomId)
    socket.to(roomId).emit('offer', offer)
    
  })

  // pass webrtc answer from receiver to sender
  socket.on('answer', ({ roomId, answer }) => {
    console.log('answer sent in room:', roomId)
    socket.to(roomId).emit('answer', answer)
    
  })

  // pass ice candidates between peers
    socket.on('ice-candidate', ({ roomId, candidate }) => {
        console.log('ice candidate in room:', roomId)
        socket.to(roomId).emit('ice-candidate', candidate)
    })

  // handle disconnection
  socket.on('disconnect', () => {
    console.log('disconnected:', socket.id)

    // find which room this socket was in
    for (const roomId in rooms) {
      const room = rooms[roomId]
      if (room.sender === socket.id || room.receiver === socket.id) {
        // tell the other peer
        socket.to(roomId).emit('peer-disconnected')
        // clean up the room
        delete rooms[roomId]
        console.log('room deleted:', roomId)
        break
      }
    }
  })
})

const PORT = process.env.PORT || 3001
server.listen(PORT, () => {
  console.log(`signaling server running on port ${PORT}`)
})