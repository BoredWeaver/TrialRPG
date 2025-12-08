import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { BattleProvider } from './state/BattleContext.jsx'

createRoot(document.getElementById('root')).render(
    <BattleProvider>
    <App />
    </BattleProvider>
)
