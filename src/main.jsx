import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import LimiteDeError from './LimiteDeError.jsx'
import { Analytics } from '@vercel/analytics/react'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      {/* Último recurso: si falla toda la app, una pantalla de error en lugar de una página en blanco */}
      <LimiteDeError completa>
        <App />
      </LimiteDeError>
    </BrowserRouter>
    {/* Visitas anónimas con Vercel Web Analytics (sin cookies). En producción, script y envío en el mismo dominio
        (/_vercel/insights/…), permitidos por la CSP con 'self'; ver el aviso de privacidad. */}
    <Analytics />
  </React.StrictMode>,
)
