import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// removed StrictMode - it causes double socket connections in dev
createRoot(document.getElementById('root')).render(
  <App />
)