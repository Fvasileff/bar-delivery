'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Categoria { id: number; nombre: string; orden: number }
interface Producto { id: number; nombre: string; descripcion: string; precio: number; emoji: string; categoria_id: number; activo: boolean }
interface CartItem extends Producto { qty: number }

export default function Home() {
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [currentCat, setCurrentCat] = useState('Todo')
  const [cart, setCart] = useState<Record<number, CartItem>>({})
  const [step, setStep] = useState('menu')
  const [pagoSel, setPagoSel] = useState('efectivo')
  const [nota, setNota] = useState('')
  const [nombre, setNombre] = useState('')
  const [tel, setTel] = useState('')
  const [dir, setDir] = useState('')
  const [ref, setRef] = useState('')
  const [vuelto, setVuelto] = useState('')
  const [pedidoNum, setPedidoNum] = useState('')
  const [loading, setLoading] = useState(true)
  const [enviando, setEnviando] = useState(false) // ✅ CAMBIO 1: nuevo estado para bloquear doble click
  const [recordar, setRecordar] = useState(false) // ✅ NUEVO: checkbox "Recordar mis datos"

  // ✅ MODIFICACIÓN: localStorage en su propio useEffect separado
  // antes estaba mezclado con el de Supabase y fallaba inconsistentemente
  useEffect(() => {
    const guardado = localStorage.getItem('datosCliente')
    if (guardado) {
      const datos = JSON.parse(guardado)
      setNombre(datos.nombre || '')
      setTel(datos.tel || '')
      setDir(datos.dir || '')
      setRef(datos.ref || '')
      setRecordar(true)
    }
  }, [])

  useEffect(() => {
    const cargarDatos = async () => {
      const { data: cats } = await supabase.from('categorias').select('*').eq('activo', true).order('orden')
      const { data: prods } = await supabase.from('productos').select('*').eq('activo', true).order('id')
      setCategorias(cats || [])
      setProductos(prods || [])
      setLoading(false)
    }

    cargarDatos()

    const canalMenu = supabase
      .channel('menu-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'productos' },
        () => cargarDatos()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'categorias' },
        () => cargarDatos()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(canalMenu)
    }
  }, [])

  const cats = ['Todo', ...categorias.map(c => c.nombre)]
  const filtered = currentCat === 'Todo' ? productos : productos.filter(p => {
    const cat = categorias.find(c => c.nombre === currentCat)
    return cat && p.categoria_id === cat.id
  })

  const byCat: Record<string, Producto[]> = {}
  filtered.forEach(p => {
    const cat = categorias.find(c => c.id === p.categoria_id)
    const catNombre = cat?.nombre || 'Otros'
    if (!byCat[catNombre]) byCat[catNombre] = []
    byCat[catNombre].push(p)
  })

  const addToCart = (p: Producto) => {
    setCart(prev => ({
      ...prev,
      [p.id]: { ...p, qty: (prev[p.id]?.qty || 0) + 1 }
    }))
  }

  const changeQty = (id: number, delta: number) => {
    setCart(prev => {
      const item = prev[id]
      if (!item) return prev
      const newQty = item.qty + delta
      if (newQty <= 0) {
        const next = { ...prev }
        delete next[id]
        return next
      }
      return { ...prev, [id]: { ...item, qty: newQty } }
    })
  }

  const cartItems = Object.values(cart)
  const cartCount = cartItems.reduce((a, i) => a + i.qty, 0)
  const cartSubtotal = cartItems.reduce((a, i) => a + i.precio * i.qty, 0)
  const envio = 500
  const cartTotal = cartSubtotal + envio

  // ✅ CAMBIO 2: función confirmar protegida contra doble click
  const confirmar = async () => {
    if (!nombre || !tel || !dir) { alert('Completá nombre, teléfono y dirección'); return }
    if (enviando) return       // corta si ya se está enviando
    setEnviando(true)          // bloquea el botón
    try {
      // ✅ NUEVO: guardar o limpiar datos según el checkbox
      if (recordar) {
        localStorage.setItem('datosCliente', JSON.stringify({ nombre, tel, dir, ref }))
      } else {
        localStorage.removeItem('datosCliente')
      }
      const res = await fetch('/api/pedidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente_nombre: nombre, cliente_tel: tel, direccion: dir,
          referencia: ref, nota, metodo_pago: pagoSel,
          vuelto: vuelto ? parseInt(vuelto) : null,
          subtotal: cartSubtotal, envio, total: cartTotal,
          items: cartItems
        })
      })
      const data = await res.json()
      setPedidoNum(data.pedido.numero)
      setCart({})
      setStep('ok')
    } finally {
      setEnviando(false)       // reactiva si algo falla
    }
  }
const nuevoPedido = () => {
  const guardado = localStorage.getItem('datosCliente')
  if (guardado) {
    const datos = JSON.parse(guardado)
    setNombre(datos.nombre || '')
    setTel(datos.tel || '')
    setDir(datos.dir || '')
    setRef(datos.ref || '')
    setRecordar(true)
  } else {
    setNombre(''); setTel(''); setDir(''); setRef('')
    setRecordar(false)
  }
  setNota(''); setVuelto('')
  setStep('menu')
}
  if (loading) return <div className="loading">Cargando menú...</div>

  return (
    <div className="phone-frame">

      {/* STEP MENU */}
      {step === 'menu' && (
        <>
          <div className="header">
            <div className="header-top">
              <div>
                <div className="bar-name">Bar El Rincón</div>
                <div className="bar-sub">Delivery · Pedidos online</div>
              </div>
              <span className="open-badge">Abierto</span>
            </div>
            <div className="delivery-info">
              <div className="dinfo">Entrega: <span>30–45 min</span></div>
              <div className="dinfo">Envío: <span>$500</span></div>
              <div className="dinfo">Min: <span>$1.500</span></div>
            </div>
          </div>

          <div className="cats-scroll">
            {cats.map(c => (
              <button key={c} className={`cat-pill${c === currentCat ? ' active' : ''}`} onClick={() => setCurrentCat(c)}>{c}</button>
            ))}
          </div>

          <div>
            {Object.entries(byCat).map(([cat, prods]) => (
              <div key={cat}>
                {currentCat === 'Todo' && <div className="section-label">{cat}</div>}
                {prods.map(p => (
                  <div key={p.id} className="product-card" onClick={() => addToCart(p)}>
                    <div className="prod-img"><span>{p.emoji}</span></div>
                    <div className="prod-info">
                      <div className="prod-name">{p.nombre}</div>
                      <div className="prod-desc">{p.descripcion}</div>
                      <div className="prod-price">${p.precio.toLocaleString('es-AR')}</div>
                    </div>
                    {cart[p.id] && <span style={{fontSize:13,fontWeight:500,color:'#1a1a2e',marginRight:4}}>{cart[p.id].qty}</span>}
                    <button className="add-btn" onClick={e => { e.stopPropagation(); addToCart(p) }}>+</button>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {cartCount > 0 && (
            <div style={{position:'sticky',bottom:0}}>
              <div className="cart-bar" onClick={() => setStep('cart')}>
                <span className="cart-count">{cartCount}</span>
                <span className="cart-label">Ver pedido</span>
                <span className="cart-total">${cartSubtotal.toLocaleString('es-AR')}</span>
              </div>
            </div>
          )}
        </>
      )}

      {/* STEP CART */}
      {step === 'cart' && (
        <>
          <div className="back-btn" onClick={() => setStep('menu')}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Volver al menú
          </div>
          <div className="section-label">Tu pedido</div>
          {cartItems.map(i => (
            <div key={i.id} className="cart-item">
              <span style={{fontSize:20,marginRight:4}}>{i.emoji}</span>
              <span className="ci-name">{i.nombre}</span>
              <span className="ci-price">${(i.precio*i.qty).toLocaleString('es-AR')}</span>
              <div className="qty-ctrl">
                <button className="qbtn" onClick={() => changeQty(i.id,-1)}>−</button>
                <span className="qty-num">{i.qty}</span>
                <button className="qbtn" onClick={() => changeQty(i.id,1)}>+</button>
              </div>
            </div>
          ))}
          <div style={{padding:'0 16px',marginTop:8}}>
            <div className="subtotal-row"><span>Subtotal</span><span>${cartSubtotal.toLocaleString('es-AR')}</span></div>
            <div className="subtotal-row"><span>Envío</span><span>${envio.toLocaleString('es-AR')}</span></div>
            <div className="subtotal-row total"><span>Total</span><span>${cartTotal.toLocaleString('es-AR')}</span></div>
          </div>
          <div style={{padding:'0 16px 16px',marginTop:8}}>
            <div className="form-label">Nota para cocina (opcional)</div>
            <textarea className="nota-input" value={nota} onChange={e => setNota(e.target.value)} placeholder="Ej: sin cebolla, extra salsa..."/>
            <button className="confirm-btn" onClick={() => setStep('datos')}>Continuar con mis datos</button>
          </div>
        </>
      )}

      {/* STEP DATOS */}
      {step === 'datos' && (
        <>
          <div className="back-btn" onClick={() => setStep('cart')}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Volver al pedido
          </div>
          <div className="form-section">
            <div className="section-label" style={{padding:'0 0 12px'}}>Tus datos</div>
            <div className="form-label">Nombre y apellido</div>
            <input className="form-input" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Juan Pérez"/>
            <div className="form-label">Teléfono</div>
            <input className="form-input" value={tel} onChange={e => setTel(e.target.value)} placeholder="381 555-1234"/>
            <div className="form-label">Dirección de entrega</div>
            <input className="form-input" value={dir} onChange={e => setDir(e.target.value)} placeholder="Av. Independencia 1234"/>
            <div className="form-label">Referencia (opcional)</div>
            <input className="form-input" value={ref} onChange={e => setRef(e.target.value)} placeholder="Portón negro, timbre B"/>
            <div className="form-label" style={{marginBottom:8}}>Método de pago</div>
            <div className="radio-group">
              {['efectivo','transferencia','tarjeta'].map(p => (
                <div key={p} className={`radio-opt${pagoSel===p?' sel':''}`} onClick={() => setPagoSel(p)}>{p.charAt(0).toUpperCase()+p.slice(1)}</div>
              ))}
            </div>
            {pagoSel === 'efectivo' && (
              <>
                <div className="form-label">Con cuánto va a pagar (vuelto)</div>
                <input className="form-input" value={vuelto} onChange={e => setVuelto(e.target.value)} type="number" placeholder="Ej: 5000"/>
              </>
            )}
            {/* ✅ NUEVO: checkbox para recordar datos */}
            <div style={{display:'flex', alignItems:'center', gap:8, margin:'4px 0 16px'}}>
              <input
                type="checkbox"
                id="recordar"
                checked={recordar}
                onChange={e => setRecordar(e.target.checked)}
                style={{width:16, height:16, cursor:'pointer', accentColor:'#1a1a2e'}}
              />
              <label htmlFor="recordar" style={{fontSize:13, color:'#555', cursor:'pointer'}}>
                Recordar mis datos para la próxima vez
              </label>
            </div>
            {/* ✅ CAMBIO 3: botón deshabilitado mientras se envía */}
            <button
              className="confirm-btn"
              onClick={confirmar}
              disabled={enviando}
              style={{ opacity: enviando ? 0.6 : 1, cursor: enviando ? 'not-allowed' : 'pointer' }}
            >
              {enviando ? 'Enviando...' : 'Confirmar pedido'}
            </button>
          </div>
        </>
      )}

      {/* STEP OK */}
      {step === 'ok' && (
        <div className="success-screen">
          <div className="success-icon">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M5 14l7 7L23 7" stroke="#27500A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <div className="success-title">Pedido recibido</div>
          <div className="success-sub">Ya le avisamos a cocina. Te llegará en 30–45 minutos.</div>
          <div className="order-num">
            <div className="order-num-label">Número de pedido</div>
            <div className="order-num-val">{pedidoNum}</div>
          </div>
          <div style={{textAlign:'left',marginBottom:24}}>
            <div className="track-step"><div className="track-dot done"></div>Pedido confirmado</div>
            <div className="track-step"><div className="track-dot active"></div>En preparación</div>
            <div className="track-step"><div className="track-dot"></div>En camino</div>
            <div className="track-step"><div className="track-dot"></div>Entregado</div>
          </div>
          <button className="confirm-btn" onClick={nuevoPedido}>Hacer otro pedido</button>
        </div>
      )}

    </div>
  )
}