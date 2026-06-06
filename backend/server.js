const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const cors = require('cors')

const app = express()
const server = http.createServer(app)

// allow requests from our react frontend
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
})

app.use(cors())

// just a health check route
app.get('/', (req, res) => {
  res.send('P2P signaling server is running')
})

// all the socket stuff goes here
io.on('connection', (socket) => {
  console.log('someone connected:', socket.id)

  socket.on('disconnect', () => {
    console.log('someone left:', socket.id)
  })
})

const PORT = process.env.PORT || 3001
server.listen(PORT, () => {
  console.log(`signaling server running on port ${PORT}`)
})