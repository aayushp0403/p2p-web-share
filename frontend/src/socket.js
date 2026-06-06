import { io } from 'socket.io-client'

// connect to our backend signaling server
const socket = io('http://localhost:3001', {
  autoConnect: true,
  reconnection: true
})

export default socket