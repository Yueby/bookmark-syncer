import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from '@bookmark-syncer/app'
import '@bookmark-syncer/app/src/styles/index.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
