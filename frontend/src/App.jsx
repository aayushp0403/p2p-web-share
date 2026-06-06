import Sender from './components/Sender'
import Receiver from './components/Receiver'

function App() {
  // check if we're on a join link like /join/ABC123
  const path = window.location.pathname
  const joinMatch = path.match(/\/join\/([A-Z0-9]+)/)

  if (joinMatch) {
    // receiver view
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <Receiver roomId={joinMatch[1]} />
      </div>
    )
  }

  // sender view (default)
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-indigo-400">P2P Web Share</h1>
          <p className="text-gray-400 mt-2">Direct browser-to-browser file transfer</p>
        </div>
        <Sender />
      </div>
    </div>
  )
}

export default App