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
      {status === 'connected' && (
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
            <span>{progress}%</span><span>{speed} MB/s</span>
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