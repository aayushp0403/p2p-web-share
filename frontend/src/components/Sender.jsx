import { useState, useRef, useCallback, useEffect } from 'react'
import socket from '../socket'

function Sender() {
  const [file, setFile] = useState(null)
  const [shareLink, setShareLink] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('idle')
  const [progress, setProgress] = useState(0)
  const [speed, setSpeed] = useState(0)

  const pcRef = useRef(null)
  const fileInputRef = useRef(null)
  const roomIdRef = useRef('')
  const fileRef = useRef(null)

  const MAX_SIZE = 50 * 1024 * 1024

  // stun servers so webrtc can find public IPs
  const iceConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  }

  const handleFile = (selectedFile) => {
    setError('')
    if (!selectedFile) return
    if (selectedFile.size > MAX_SIZE) {
      setError('File too large! Max size is 50MB.')
      return
    }
    setFile(selectedFile)
    fileRef.current = selectedFile
  }

  const onDragOver = useCallback((e) => { e.preventDefault(); setIsDragging(true) }, [])
  const onDragLeave = useCallback(() => setIsDragging(false), [])
  const onDrop = useCallback((e) => {
    e.preventDefault()
    setIsDragging(false)
    handleFile(e.dataTransfer.files[0])
  }, [])

  const generateRoomId = () => Math.random().toString(36).substring(2, 8).toUpperCase()

  const createRoom = () => {
    if (!fileRef.current) { setError('Please select a file first!'); return }
    const newRoomId = generateRoomId()
    roomIdRef.current = newRoomId
    socket.emit('create-room', newRoomId)
  }

  const sendFile = async (dataChannel) => {
    const CHUNK_SIZE = 64 * 1024
    const currentFile = fileRef.current
    let offset = 0
    const startTime = Date.now()

    // tell receiver what's coming
    dataChannel.send(JSON.stringify({
      type: 'file-meta',
      name: currentFile.name,
      size: currentFile.size,
      fileType: currentFile.type
    }))

    const sendNextChunk = () => {
      if (offset >= currentFile.size) {
        dataChannel.send(JSON.stringify({ type: 'file-done' }))
        setStatus('done')
        return
      }

      const slice = currentFile.slice(offset, offset + CHUNK_SIZE)
      const reader = new FileReader()

      reader.onload = async (e) => {
        const chunkData = e.target.result

        // hash the chunk for integrity
        const hashBuffer = await crypto.subtle.digest('SHA-256', chunkData)
        const hashArray = Array.from(new Uint8Array(hashBuffer))
        const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

        dataChannel.send(JSON.stringify({ type: 'chunk-hash', hash }))
        dataChannel.send(chunkData)

        offset += chunkData.byteLength
        setProgress(Math.round((offset / currentFile.size) * 100))

        const elapsed = (Date.now() - startTime) / 1000
        setSpeed(((offset / (1024 * 1024)) / elapsed).toFixed(2))

        // wait for buffer to clear before sending next chunk
        if (dataChannel.bufferedAmount > 1024 * 1024) {
          setTimeout(sendNextChunk, 100)
        } else {
          sendNextChunk()
        }
      }
      reader.readAsArrayBuffer(slice)
    }

    sendNextChunk()
  }

  useEffect(() => {
    socket.on('room-created', (id) => {
      setShareLink(`${window.location.origin}/join/${id}`)
      setStatus('waiting')
    })

    socket.on('peer-joined', async () => {
      console.log('peer joined room:', roomIdRef.current)
      setStatus('connecting')

      // create peer connection
      const pc = new RTCPeerConnection(iceConfig)
      pcRef.current = pc

      // create data channel for file transfer
      const dataChannel = pc.createDataChannel('fileTransfer')
      dataChannel.binaryType = 'arraybuffer'

      dataChannel.onopen = () => {
        console.log('data channel open!')
        setStatus('connected')
        sendFile(dataChannel)
      }

      dataChannel.onerror = (e) => console.error('data channel error:', e)

      // send ice candidates to receiver via signaling server
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          socket.emit('ice-candidate', { roomId: roomIdRef.current, candidate: e.candidate })
        }
      }

      pc.onconnectionstatechange = () => {
        console.log('connection state:', pc.connectionState)
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
          setStatus('disconnected')
        }
      }

      // create and send offer
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      console.log('sending offer for room:', roomIdRef.current)
      socket.emit('offer', { roomId: roomIdRef.current, offer })
    })

    socket.on('answer', async (answer) => {
      console.log('got answer from receiver')
      if (pcRef.current) {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer))
      }
    })

    socket.on('ice-candidate', async (candidate) => {
      if (pcRef.current) {
        try {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate))
        } catch (e) {
          console.error('ice candidate error:', e)
        }
      }
    })

    socket.on('peer-disconnected', () => {
      setStatus('disconnected')
      if (pcRef.current) pcRef.current.close()
    })

    return () => {
      socket.off('room-created')
      socket.off('peer-joined')
      socket.off('answer')
      socket.off('ice-candidate')
      socket.off('peer-disconnected')
    }
  }, [])

  return (
    <div className="w-full max-w-lg mx-auto">
      <h2 className="text-2xl font-bold text-white mb-6 text-center">Send a File</h2>

      <div
        onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
        onClick={() => status === 'idle' && fileInputRef.current.click()}
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all duration-200
          ${isDragging ? 'border-indigo-400 bg-indigo-900/20' : 'border-gray-600 hover:border-indigo-500 hover:bg-gray-800/50'}`}
      >
        <div className="text-4xl mb-3">📂</div>
        {file ? (
          <div>
            <p className="text-green-400 font-medium">{file.name}</p>
            <p className="text-gray-400 text-sm mt-1">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
          </div>
        ) : (
          <div>
            <p className="text-gray-300">Drag & drop a file here</p>
            <p className="text-gray-500 text-sm mt-1">or click to browse</p>
            <p className="text-gray-600 text-xs mt-2">Max 50MB</p>
          </div>
        )}
        <input ref={fileInputRef} type="file" className="hidden"
          onChange={(e) => handleFile(e.target.files[0])} />
      </div>

      {error && <p className="text-red-400 text-sm mt-3 text-center">{error}</p>}

      {file && status === 'idle' && (
        <button onClick={createRoom}
          className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl transition-colors">
          Generate Share Link
        </button>
      )}

      {shareLink && (
        <div className="mt-4 bg-gray-800 rounded-xl p-4">
          <p className="text-gray-400 text-sm mb-2">Share this link:</p>
          <div className="flex gap-2">
            <input readOnly value={shareLink}
              className="flex-1 bg-gray-700 text-white text-sm rounded-lg px-3 py-2 outline-none" />
            <button onClick={() => navigator.clipboard.writeText(shareLink)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm transition-colors">
              Copy
            </button>
          </div>
        </div>
      )}

      {status === 'waiting' && (
        <div className="mt-4 bg-yellow-900/30 border border-yellow-700 rounded-xl p-4 text-center">
          <p className="text-yellow-400">⏳ Waiting for receiver to join...</p>
        </div>
      )}
      {status === 'connecting' && (
        <div className="mt-4 bg-blue-900/30 border border-blue-700 rounded-xl p-4 text-center">
          <p className="text-blue-400">🔗 Establishing P2P connection...</p>
        </div>
      )}
      {status === 'connected' && (
        <div className="mt-4 bg-indigo-900/30 border border-indigo-700 rounded-xl p-4">
          <p className="text-indigo-400 text-center mb-3">📡 Transferring...</p>
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
          <p className="text-green-400">✅ Transfer complete!</p>
        </div>
      )}
      {status === 'disconnected' && (
        <div className="mt-4 bg-red-900/30 border border-red-700 rounded-xl p-4 text-center">
          <p className="text-red-400">❌ Peer disconnected</p>
        </div>
      )}
    </div>
  )
}

export default Sender