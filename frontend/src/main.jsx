import React from 'react'
import ReactDOM from 'react-dom/client'
import { Provider } from 'react-redux'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import App from './App'
import { store } from './store/store'
import { ThemeProvider } from './contexts/ThemeContext'
import './styles/index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Provider store={store}>
      <ThemeProvider>
      <BrowserRouter>
        <App />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: 'var(--bg-card-alt)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-strong)',
              borderRadius: '12px',
              padding: '14px 16px',
              fontSize: '14px',
              boxShadow: 'var(--shadow-elevated)',
            },
            success: { iconTheme: { primary: '#43E97B', secondary: '#fff' } },
            error:   { iconTheme: { primary: '#FF4757', secondary: '#fff' } },
          }}
        />
      </BrowserRouter>
      </ThemeProvider>
    </Provider>
  </React.StrictMode>,
)