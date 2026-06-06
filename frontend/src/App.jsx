import Sender from './components/Sender'
import Receiver from './components/Receiver'

function App() {
  const path = window.location.pathname
  const joinMatch = path.match(/\/join\/([A-Z0-9]+)/)

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* top navbar */}
      <nav className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">⚡</span>
            <span className="text-xl font-bold text-indigo-400">P2P Web Share</span>
          </div>
          <span className="text-gray-500 text-sm hidden sm:block">
            No server. No storage. Just browsers.
          </span>
        </div>
      </nav>

      {/* main content */}
      <main className="max-w-4xl mx-auto px-4 py-12">
        {joinMatch ? (
          <Receiver roomId={joinMatch[1]} />
        ) : (
          <div>
            {/* hero text */}
            <div className="text-center mb-10">
              <h1 className="text-5xl font-bold text-white mb-3">
                Share files{' '}
                <span className="text-indigo-400">instantly</span>
              </h1>
              <p className="text-gray-400 text-lg max-w-md mx-auto">
                Drop a file. Share the link. Your file goes directly
                to the recipient — never through our servers.
              </p>
            </div>

            {/* how it works */}
            <div className="grid grid-cols-3 gap-4 mb-10">
              {[
                { icon: '📂', step: '1', label: 'Drop your file' },
                { icon: '🔗', step: '2', label: 'Share the link' },
                { icon: '⚡', step: '3', label: 'Instant transfer' },
              ].map(({ icon, step, label }) => (
                <div key={step} className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                  <div className="text-2xl mb-1">{icon}</div>
                  <div className="text-indigo-400 text-xs font-semibold mb-1">STEP {step}</div>
                  <div className="text-gray-300 text-sm">{label}</div>
                </div>
              ))}
            </div>

            <Sender />

            {/* privacy note */}
            <p className="text-center text-gray-600 text-xs mt-8">
              🔒 End-to-end encrypted · Files never stored · Max 50MB
            </p>
          </div>
        )}
      </main>
    </div>
  )
}

export default App