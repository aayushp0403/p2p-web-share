// receiver page - we'll build this out fully in the next step
function Receiver({ roomId }) {
  return (
    <div className="w-full max-w-lg mx-auto text-center">
      <h2 className="text-2xl font-bold text-white mb-4">Receive a File</h2>
      <div className="bg-gray-800 rounded-xl p-6">
        <p className="text-gray-400">Joining room:</p>
        <p className="text-indigo-400 font-mono text-lg mt-1">{roomId}</p>
        <p className="text-yellow-400 mt-4">⏳ Connecting to sender...</p>
      </div>
    </div>
  )
}

export default Receiver