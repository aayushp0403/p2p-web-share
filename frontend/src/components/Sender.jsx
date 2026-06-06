import { useState, useRef, useCallback, useEffect } from 'react'
import SimplePeer from 'simple-peer'
import socket from '../socket'

function Sender() {
  const [file, setFile] = useState(null)
  const [roomId, setRoomId] = useState('')
  const [shareLink, setShareLink] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('idle')
  const [progress, setProgress] = useState(0)
  const [speed, setSpeed] = useState(0)

  // store peer instance here
  const peerRef = useRef(null)
  const fileInputRef = useRef(null)

  const MAX_SIZE = 50 * 1024 * 1024

  const handleFile = (selectedFile) => {
    setError('')
    if (!selectedFile) return
    if (selectedFile.size > MAX_SIZE) {
      setError('File too large! Max size is 50MB.')
      return
    }
    setFile(selectedFile)
  }

  const onDragOver = useCallback((e) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const onDragLeave = useCallback(() => {
    setIsDragging(false)
  }, [])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setIsDragging(false)
    handleFile(e.dataTransfer.files[0])
  }, [])

  const generateRoomId = () => Math.random().toString(36).substring(2, 8).toUpperCase()

  const createRoom = () => {
    if (!file) {
      setError('Please select a file first!')
      return
    }
    const newRoomId = generateRoomId()
    setRoomId(newRoomId)
    socket.emit('create-room', newRoomId)
  }

  useEffect(() => {
    // room was created on backend
    socket.on('room-created', (id) => {
      setShareLink(`${window.location.origin}/join/${id}`)
      setStatus('waiting')
    })

    // receiver joined, now create webrtc offer
    socket.on('peer-joined', () => {
      setStatus('connecting')

      // sender is the initiator
      const peer = new SimplePeer({ initiator: true, trickle: false })
      peerRef.current = peer

      // send offer to receiver via signaling server
      peer.on('signal', (offer) => {
        socket.emit('offer', { roomId, offer })
      })

      // webrtc connection is live!
      peer.on('connect', () => {
        setStatus('connected')
        sendFile(peer)
      })

      peer.on('error', (err) => {
        console.error('peer error:', err)
        setStatus('error')
      })
    })

    // got answer back from receiver
    socket.on('answer', (answer) => {
      if (peerRef.current) {
        peerRef.current.signal(answer)
      }
    })

    // got ice candidate from receiver
    socket.on('ice-candidate', (candidate) => {
      if (peerRef.current) {
        peerRef.current.signal(candidate)
      }
    })

    // receiver disconnected
    socket.on('peer-disconnected', () => {
      setStatus('disconnected')
      if (peerRef.current) {
        peerRef.current.destroy()
      }
    })

    return () => {
      socket.off('room-created')
      socket.off('peer-joined')
      socket.off('answer')
      socket.off('ice-candidate')
      socket.off('peer-disconnected')
    }
  }, [roomId, file])

  // send file in chunks over the data channel
  const sendFile = async (peer) => {
    const CHUNK_SIZE = 64 * 1024 // 64kb chunks
    const reader = new FileReader()
    let offset = 0
    const startTime = Date.now()

    // send file metadata first so receiver knows what's coming
    peer.send(JSON.stringify({
      type: 'file-meta',
      name: file.name,
      size: file.size,
      fileType: file.type
    }))

    // send chunks one by one
    const sendChunk = () => {
      if (offset >= file.size) {
        // all done
        peer.send(JSON.stringify({ type: 'file-done' }))
        setStatus('done')
        return
      }

      const slice = file.slice(offset, offset + CHUNK_SIZE)
      reader.readAsArrayBuffer(slice)
    }

    reader.onload = async (e) => {
      const chunkData = e.target.result

      // generate hash for this chunk
      const hashBuffer = await crypto.subtle.digest('SHA-256', chunkData)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

      // send hash first, then the raw chunk
      peer.send(JSON.stringify({ type: 'chunk-hash', hash }))
      peer.send(chunkData)

      offset += chunkData.byteLength

      // update progress
      const pct = Math.round((offset / file.size) * 100)
      setProgress(pct)

      // calculate speed
      const elapsed = (Date.now() - startTime) / 1000
      const mbSent = offset / (1024 * 1024)
      setSpeed((mbSent / elapsed).toFixed(2))

      // send next chunk
      sendChunk()
    }

    sendChunk()
  }

  return (
    <div className="w-full max-w-lg mx-auto">
      <h2 className="text-2xl font-bold text-white mb-6 text-center">Send a File</h2>

      {/* drag and drop zone */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
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
        <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => handleFile(e.target.files[0])} />
      </div>

      {error && <p className="text-red-400 text-sm mt-3 text-center">{error}</p>}

      {/* create room button */}
      {file && status === 'idle' && (
        <button onClick={createRoom}
          className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl transition-colors">
          Generate Share Link
        </button>
      )}

      {/* share link */}
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

      {/* status cards */}
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
            <span>{progress}%</span>
            <span>{speed} MB/s</span>
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