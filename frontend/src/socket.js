import { io } from 'socket.io-client'

// use live backend in production, local in dev
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'

const socket = io(BACKEND_URL, {
  autoConnect: true,
  reconnection: true
})

export default socket