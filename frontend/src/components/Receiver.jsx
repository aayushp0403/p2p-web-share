import { useEffect, useRef, useState } from 'react'
import SimplePeer from 'simple-peer'
import socket from '../socket'

function Receiver({ roomId }) {
  const [status, setStatus] = useState('joining')
  const [progress, setProgress] = useState(0)
  const [speed, setSpeed] = useState(0)
  const [fileName, setFileName] = useState('')
  const [fileSize, setFileSize] = useState(0)
  const [error, setError] = useState('')

  const peerRef = useRef(null)
  // store incoming chunks here
  const chunksRef = useRef([])
  const pendingHashRef = useRef(null)
  const receivedRef = useRef(0)
  const startTimeRef = useRef(null)
  const fileMetaRef = useRef(null)

  useEffect(() => {
    // join the room
    socket.emit('join-room', roomId)

    socket.on('room-not-found', () => {
      setError('Room not found. The link may be invalid or expired.')
      setStatus('error')
    })

    socket.on('room-full', () => {
      setError('Room is full. Someone is already receiving this file.')
      setStatus('error')
    })

    socket.on('joined-room', () => {
      setStatus('waiting-for-offer')
    })

    // got offer from sender, send back answer
    socket.on('offer', (offer) => {
      setStatus('connecting')

      // receiver is NOT the initiator
      const peer = new SimplePeer({ initiator: false, trickle: false })
      peerRef.current = peer

      peer.signal(offer)

      peer.on('signal', (answer) => {
        socket.emit('answer', { roomId, answer })
      })

      peer.on('connect', () => {
        setStatus('connected')
        startTimeRef.current = Date.now()
      })

      // handle incoming data
      peer.on('data', (data) => {
        handleIncomingData(data)
      })

      peer.on('error', (err) => {
        console.error('peer error:', err)
        setStatus('error')
      })
    })

    socket.on('peer-disconnected', () => {
      setStatus('disconnected')
      if (peerRef.current) peerRef.current.destroy()
    })

    return () => {
      socket.off('room-not-found')
      socket.off('room-full')
      socket.off('joined-room')
      socket.off('offer')
      socket.off('peer-disconnected')
    }
  }, [roomId])

  const handleIncomingData = async (data) => {
    // check if it's a text message or binary chunk
    if (typeof data === 'string' || data instanceof Uint8Array && isJsonLike(data)) {
      try {
        const text = typeof data === 'string' ? data : new TextDecoder().decode(data)
        const msg = JSON.parse(text)

        if (msg.type === 'file-meta') {
          // store file info
          fileMetaRef.current = { name: msg.name, size: msg.size, fileType: msg.fileType }
          setFileName(msg.name)
          setFileSize(msg.size)
        }

        if (msg.type === 'chunk-hash') {
          // save hash, next message will be the chunk
          pendingHashRef.current = msg.hash
        }

        if (msg.type === 'file-done') {
          // reassemble and download
          assembleAndDownload()
        }
      } catch {
        // not json, treat as binary chunk
        await handleChunk(data)
      }
    } else {
      await handleChunk(data)
    }
  }

  const isJsonLike = (data) => {
    try {
      const text = new TextDecoder().decode(data)
      return text.trim().startsWith('{')
    } catch {
      return false
    }
  }

  const handleChunk = async (chunkData) => {
    const buffer = chunkData instanceof ArrayBuffer ? chunkData : chunkData.buffer

    // verify chunk hash
    if (pendingHashRef.current) {
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

      if (hash !== pendingHashRef.current) {
        console.error('chunk hash mismatch! chunk may be corrupted')
        // still store it but log the error
      }
      pendingHashRef.current = null
    }

    chunksRef.current.push(buffer)
    receivedRef.current += buffer.byteLength

    if (fileMetaRef.current) {
      const pct = Math.round((receivedRef.current / fileMetaRef.current.size) * 100)
      setProgress(pct)

      // calculate speed
      const elapsed = (Date.now() - startTimeRef.current) / 1000
      const mbReceived = receivedRef.current / (1024 * 1024)
      setSpeed((mbReceived / elapsed).toFixed(2))
    }
  }

  const assembleAndDownload = () => {
    // put all chunks together
    const blob = new Blob(chunksRef.current, {
      type: fileMetaRef.current?.fileType || 'application/octet-stream'
    })

    // auto trigger download
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileMetaRef.current?.name || 'downloaded-file'
    a.click()
    URL.revokeObjectURL(url)

    setStatus('done')
  }

  return (
    <div className="w-full max-w-lg mx-auto">
      <h2 className="text-2xl font-bold text-white mb-6 text-center">Receive a File</h2>

      <div className="bg-gray-800 rounded-xl p-6">
        <p className="text-gray-400 text-sm text-center mb-1">Room ID</p>
        <p className="text-indigo-400 font-mono text-center text-lg font-bold">{roomId}</p>
      </div>

      {error && (
        <div className="mt-4 bg-red-900/30 border border-red-700 rounded-xl p-4 text-center">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {status === 'joining' && (
        <div className="mt-4 bg-gray-800 rounded-xl p-4 text-center">
          <p className="text-gray-400">🔌 Joining room...</p>
        </div>
      )}

      {(status === 'waiting-for-offer' || status === 'connecting') && (
        <div className="mt-4 bg-blue-900/30 border border-blue-700 rounded-xl p-4 text-center">
          <p className="text-blue-400">🔗 Connecting to sender...</p>
        </div>
      )}

      {(status === 'connected') && (
        <div className="mt-4 bg-indigo-900/30 border border-indigo-700 rounded-xl p-4">
          <p className="text-indigo-400 text-center mb-1">📥 Receiving: {fileName}</p>
          <p className="text-gray-400 text-sm text-center mb-3">
            {(fileSize / (1024 * 1024)).toFixed(2)} MB
          </p>
          <div className="w-full bg-gray-700 rounded-full h-3">
            <div className="bg-indigo-500 h-3 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }} />
          </div>
          <div className="flex justify-between mt-2 text-sm text-gray-400">
            <span>{progress}%</span>
            <span>{speed} MB/s</span>
          </div>
        </div>
      )}

      {status === 'done' && (
        <div className="mt-4 bg-green-900/30 border border-green-700 rounded-xl p-4 text-center">
          <p className="text-green-400 text-lg font-semibold">✅ File downloaded!</p>
          <p className="text-gray-400 text-sm mt-1">{fileName}</p>
        </div>
      )}

      {status === 'disconnected' && (
        <div className="mt-4 bg-red-900/30 border border-red-700 rounded-xl p-4 text-center">
          <p className="text-red-400">❌ Sender disconnected</p>
        </div>
      )}
    </div>
  )
}

export default Receiver