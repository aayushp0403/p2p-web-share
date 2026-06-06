import { useState, useRef, useCallback } from 'react'
import socket from '../socket'

function Sender() {
  // store the selected file
  const [file, setFile] = useState(null)
  const [roomId, setRoomId] = useState('')
  const [shareLink, setShareLink] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('idle') // idle | waiting | connected
  const fileInputRef = useRef(null)

  // max 50mb
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

  // drag and drop handlers
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
    const dropped = e.dataTransfer.files[0]
    handleFile(dropped)
  }, [])

  // generate a random room id
  const generateRoomId = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase()
  }

  const createRoom = () => {
    if (!file) {
      setError('Please select a file first!')
      return
    }

    const newRoomId = generateRoomId()
    setRoomId(newRoomId)

    // tell backend to create the room
    socket.emit('create-room', newRoomId)

    socket.on('room-created', (id) => {
      const link = `${window.location.origin}/join/${id}`
      setShareLink(link)
      setStatus('waiting')
    })

    // receiver joined, ready to start transfer
    socket.on('peer-joined', () => {
      setStatus('connected')
    })
  }

  return (
    <div className="w-full max-w-lg mx-auto">
      <h2 className="text-2xl font-bold text-white mb-6 text-center">
        Send a File
      </h2>

      {/* drag and drop zone */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current.click()}
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all duration-200
          ${isDragging
            ? 'border-indigo-400 bg-indigo-900/20'
            : 'border-gray-600 hover:border-indigo-500 hover:bg-gray-800/50'
          }`}
      >
        <div className="text-4xl mb-3">📂</div>
        {file ? (
          <div>
            <p className="text-green-400 font-medium">{file.name}</p>
            <p className="text-gray-400 text-sm mt-1">
              {(file.size / (1024 * 1024)).toFixed(2)} MB
            </p>
          </div>
        ) : (
          <div>
            <p className="text-gray-300">Drag & drop a file here</p>
            <p className="text-gray-500 text-sm mt-1">or click to browse</p>
            <p className="text-gray-600 text-xs mt-2">Max 50MB</p>
          </div>
        )}
        {/* hidden file input fallback */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => handleFile(e.target.files[0])}
        />
      </div>

      {/* error message */}
      {error && (
        <p className="text-red-400 text-sm mt-3 text-center">{error}</p>
      )}

      {/* create room button */}
      {file && status === 'idle' && (
        <button
          onClick={createRoom}
          className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl transition-colors"
        >
          Generate Share Link
        </button>
      )}

      {/* share link box */}
      {shareLink && (
        <div className="mt-4 bg-gray-800 rounded-xl p-4">
          <p className="text-gray-400 text-sm mb-2">Share this link:</p>
          <div className="flex gap-2">
            <input
              readOnly
              value={shareLink}
              className="flex-1 bg-gray-700 text-white text-sm rounded-lg px-3 py-2 outline-none"
            />
            <button
              onClick={() => navigator.clipboard.writeText(shareLink)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
            >
              Copy
            </button>
          </div>
        </div>
      )}

      {/* connection status */}
      {status === 'waiting' && (
        <div className="mt-4 bg-yellow-900/30 border border-yellow-700 rounded-xl p-4 text-center">
          <p className="text-yellow-400">⏳ Waiting for receiver to join...</p>
        </div>
      )}

      {status === 'connected' && (
        <div className="mt-4 bg-green-900/30 border border-green-700 rounded-xl p-4 text-center">
          <p className="text-green-400">✅ Peer connected! Ready to transfer.</p>
        </div>
      )}
    </div>
  )
}

export default Sender