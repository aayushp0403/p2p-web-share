import { useEffect, useRef, useState } from 'react'
import socket from '../socket'

function Receiver({ roomId }) {
  const [status, setStatus] = useState('joining')
  const [progress, setProgress] = useState(0)
  const [speed, setSpeed] = useState(0)
  const [fileName, setFileName] = useState('')
  const [fileSize, setFileSize] = useState(0)
  const [error, setError] = useState('')

  const pcRef = useRef(null)
  const chunksRef = useRef([])
  const pendingHashRef = useRef(null)
  const receivedRef = useRef(0)
  const startTimeRef = useRef(null)
  const fileMetaRef = useRef(null)

  const iceConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  }

  useEffect(() => {
    socket.emit('join-room', roomId)

    socket.on('room-not-found', () => {
      setError('Room not found. Link may be invalid or expired.')
      setStatus('error')
    })

    socket.on('room-full', () => {
      setError('Room is full. Someone is already receiving this file.')
      setStatus('error')
    })

    socket.on('joined-room', () => {
      setStatus('waiting-for-offer')
      console.log('joined room, waiting for offer...')
    })

    socket.on('offer', async (offer) => {
      console.log('got offer from sender')
      setStatus('connecting')

      const pc = new RTCPeerConnection(iceConfig)
      pcRef.current = pc

      // when sender opens data channel, we receive files here
      pc.ondatachannel = (e) => {
        const dataChannel = e.channel
        dataChannel.binaryType = 'arraybuffer'

        dataChannel.onopen = () => {
          console.log('data channel open on receiver!')
          setStatus('connected')
          startTimeRef.current = Date.now()
        }

        dataChannel.onmessage = (e) => handleIncomingData(e.data)
        dataChannel.onerror = (e) => console.error('data channel error:', e)
      }

      // send ice candidates to sender
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          socket.emit('ice-candidate', { roomId, candidate: e.candidate })
        }
      }

      pc.onconnectionstatechange = () => {
        console.log('connection state:', pc.connectionState)
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
          setStatus('disconnected')
        }
      }

      // set remote offer and create answer
      await pc.setRemoteDescription(new RTCSessionDescription(offer))
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      console.log('sending answer...')
      socket.emit('answer', { roomId, answer })
    })

    socket.on('ice-candidate', async (candidate) => {
      if (pcRef.current) {
        try {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate))
        } catch (e) {
          console.error('ice error:', e)
        }
      }
    })

    socket.on('peer-disconnected', () => {
      setStatus('disconnected')
      if (pcRef.current) pcRef.current.close()
    })

    return () => {
      socket.off('room-not-found')
      socket.off('room-full')
      socket.off('joined-room')
      socket.off('offer')
      socket.off('ice-candidate')
      socket.off('peer-disconnected')
    }
  }, [roomId])

  const handleIncomingData = async (data) => {
    // check if it's a text message
    if (typeof data === 'string') {
      try {
        const msg = JSON.parse(data)
        if (msg.type === 'file-meta') {
          fileMetaRef.current = { name: msg.name, size: msg.size, fileType: msg.fileType }
          setFileName(msg.name)
          setFileSize(msg.size)
          return
        }
        if (msg.type === 'chunk-hash') {
          pendingHashRef.current = msg.hash
          return
        }
        if (msg.type === 'file-done') {
          assembleAndDownload()
          return
        }
      } catch (e) {
        console.error('parse error:', e)
      }
      return
    }

    // it's a binary chunk
    await handleChunk(data)
  }

  const handleChunk = async (chunkData) => {
    const buffer = chunkData instanceof ArrayBuffer ? chunkData : chunkData.buffer

    // verify hash
    if (pendingHashRef.current) {
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
      if (hash !== pendingHashRef.current) {
        console.error('chunk hash mismatch!')
      }
      pendingHashRef.current = null
    }

    chunksRef.current.push(buffer)
    receivedRef.current += buffer.byteLength

    if (fileMetaRef.current) {
      const pct = Math.round((receivedRef.current / fileMetaRef.current.size) * 100)
      setProgress(pct)
      const elapsed = (Date.now() - startTimeRef.current) / 1000
      setSpeed(((receivedRef.current / (1024 * 1024)) / elapsed).toFixed(2))
    }
  }

  const assembleAndDownload = () => {
    const blob = new Blob(chunksRef.current, {
      type: fileMetaRef.current?.fileType || 'application/octet-stream'
    })
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
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">Receiving a File</h1>
        <p className="text-gray-400">Direct transfer from sender's browser</p>
      </div>

      {/* room id card */}
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 mb-4">
        <p className="text-gray-400 text-sm text-center mb-1">Room ID</p>
        <p className="text-indigo-400 font-mono text-center text-xl font-bold tracking-widest">
          {roomId}
        </p>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-800/50 rounded-2xl p-5 text-center">
          <p className="text-red-400 font-medium">⚠️ {error}</p>
          <p className="text-gray-500 text-sm mt-1">Ask the sender for a new link</p>
        </div>
      )}

      {status === 'joining' && (
        <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" />
            <p className="text-gray-300">Joining room...</p>
          </div>
        </div>
      )}

      {(status === 'waiting-for-offer' || status === 'connecting') && (
        <div className="bg-blue-900/20 border border-blue-800/50 rounded-2xl p-5">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
            <p className="text-blue-300 font-medium">Connecting to sender...</p>
          </div>
          <p className="text-gray-500 text-xs mt-2 ml-5">
            Establishing direct P2P connection
          </p>
        </div>
      )}

      {status === 'connected' && (
        <div className="bg-indigo-900/20 border border-indigo-800/50 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-indigo-400 rounded-full animate-pulse" />
              <p className="text-indigo-300 font-medium">📥 {fileName}</p>
            </div>
            <span className="text-gray-400 text-sm">{speed} MB/s</span>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-2.5">
            <div className="bg-indigo-500 h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }} />
          </div>
          <div className="flex justify-between mt-2">
            <span className="text-gray-400 text-sm">{progress}% received</span>
            <span className="text-gray-400 text-sm">
              {(fileSize / (1024 * 1024)).toFixed(2)} MB
            </span>
          </div>
        </div>
      )}

      {status === 'done' && (
        <div className="bg-green-900/20 border border-green-800/50 rounded-2xl p-6 text-center">
          <div className="text-4xl mb-3">✅</div>
          <p className="text-green-400 text-xl font-bold">Download complete!</p>
          <p className="text-gray-300 mt-2">{fileName}</p>
          <p className="text-gray-500 text-sm mt-1">
            {(fileSize / (1024 * 1024)).toFixed(2)} MB received successfully
          </p>
        </div>
      )}

      {status === 'disconnected' && (
        <div className="bg-red-900/20 border border-red-800/50 rounded-2xl p-5 text-center">
          <p className="text-red-400 font-medium">❌ Sender disconnected</p>
          <p className="text-gray-500 text-sm mt-1">The transfer was interrupted</p>
        </div>
      )}
    </div>
  )
}

export default Receiver