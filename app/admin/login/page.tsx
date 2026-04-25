'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'  // ← cambiá esto

// createBrowserClient maneja las cookies correctamente
const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
export default function Login() {
  const [usuario, setUsuario] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function ingresar() {
    if (!usuario || !password) { 
      setError('Completá los campos')
      return 
    }
    
    setLoading(true)
    setError('')

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: usuario,
        password: password,
      })

      if (authError) {
        setError('Email o contraseña incorrectos')
        setLoading(false)
      } else {
        router.push('/admin')
        router.refresh()
      }
    } catch (err) {
      setError('Error de conexión')
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight:'100vh', background:'#1a1a2e', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'sans-serif' }}>
      <div style={{ background:'#fff', borderRadius:16, padding:40, width:'100%', maxWidth:380, boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
        
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ fontSize:40, marginBottom:12 }}>🍺</div>
          <h1 style={{ fontSize:22, fontWeight:600, color:'#1a1a2e', marginBottom:4 }}>Bar El Rincón</h1>
          <p style={{ fontSize:14, color:'#666' }}>Panel de administración</p>
        </div>

        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:12, color:'#666', marginBottom:4, fontWeight:500 }}>Email</div>
          <input 
            style={{ width:'100%', padding:'12px 14px', border:'1px solid #ddd', borderRadius:10, fontSize:14, boxSizing:'border-box', outline:'none' }}
            type="email"
            value={usuario} 
            onChange={e => setUsuario(e.target.value)} 
            placeholder="admin@email.com" 
            onKeyDown={e => e.key === 'Enter' && ingresar()}
          />
        </div>

        <div style={{ marginBottom:24 }}>
          <div style={{ fontSize:12, color:'#666', marginBottom:4, fontWeight:500 }}>Contraseña</div>
          <input 
            style={{ width:'100%', padding:'12px 14px', border:'1px solid #ddd', borderRadius:10, fontSize:14, boxSizing:'border-box', outline:'none' }}
            type="password" 
            value={password} 
            onChange={e => setPassword(e.target.value)} 
            placeholder="••••••••" 
            onKeyDown={e => e.key === 'Enter' && ingresar()}
          />
        </div>

        {error && (
          <div style={{ background:'#fee2e2', color:'#dc2626', padding:'10px 14px', borderRadius:8, fontSize:13, marginBottom:16 }}>
            {error}
          </div>
        )}

        <button 
          style={{ 
            width:'100%', 
            padding:'13px', 
            background:'#1a1a2e', 
            color:'#fff', 
            border:'none', 
            borderRadius:10, 
            fontSize:15, 
            fontWeight:500, 
            cursor: loading ? 'not-allowed' : 'pointer', 
            opacity: loading ? 0.7 : 1 
          }}
          onClick={ingresar} 
          disabled={loading}
        >
          {loading ? 'Ingresando...' : 'Ingresar'}
        </button>
      </div>
    </div>
  )
}