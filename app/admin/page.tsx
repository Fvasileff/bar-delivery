'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import './admin.css'

interface Categoria { id: number; nombre: string; orden: number; activo: boolean }
interface Producto {
  id: number; nombre: string; descripcion: string
  precio: number; emoji: string; categoria_id: number; activo: boolean
  imagen_url?: string
}
interface Configuracion {
  id: number; nombre_bar: string; costo_envio: number
  pedido_minimo: number; abierto: boolean
  horario_apertura: string; horario_cierre: string
}

function tiempoRelativo(fecha: string) {
  const diff = Math.floor((Date.now() - new Date(fecha).getTime()) / 1000)
  if (diff < 60) return 'hace unos segundos'
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} hs`
  return `hace ${Math.floor(diff / 86400)} día${Math.floor(diff / 86400) > 1 ? 's' : ''}`
}

export default function Admin() {
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [pedidos, setPedidos] = useState<any[]>([])
  const [tab, setTab] = useState<'productos'|'categorias'|'pedidos'|'ventas'|'config'>('productos')
  const [editando, setEditando] = useState<Producto|null>(null)
  const [editandoCat, setEditandoCat] = useState<Categoria|null>(null)
  const [form, setForm] = useState({ nombre:'', descripcion:'', precio:'', emoji:'🍽️', categoria_id:'' })
  const [formCat, setFormCat] = useState({ nombre:'', orden:'0' })
  const [imagenFile, setImagenFile] = useState<File|null>(null)
  const [imagenPreview, setImagenPreview] = useState<string>('')
  const [subiendoImagen, setSubiendoImagen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [periodo, setPeriodo] = useState<'hoy'|'mes'|'ano'>('hoy')
  const [ahora, setAhora] = useState(Date.now())

  // Búsqueda y filtrado de pedidos
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<'todos'|'pendiente'|'preparando'|'en camino'|'entregado'>('todos')

  // Impresión de tickets
  const [pedidoParaImprimir, setPedidoParaImprimir] = useState<any | null>(null)
  const [autoImprimir, setAutoImprimir] = useState(false)

  // Menú móvil
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [config, setConfig] = useState<Configuracion | null>(null)
  const [formConfig, setFormConfig] = useState({
    nombre_bar: '', costo_envio: '', pedido_minimo: '',
    horario_apertura: '', horario_cierre: ''
  })

  const [audioActivado, setAudioActivado] = useState(false)
  const [permisoNoti, setPermisoNoti] = useState<NotificationPermission>('default')

  useEffect(() => {
    if ('Notification' in window) {
      setPermisoNoti(Notification.permission)
      if (Notification.permission === 'default') {
        Notification.requestPermission().then(p => setPermisoNoti(p))
      }
    }
    // Cargar preferencia de auto-impresión
    const cachedAutoPrint = localStorage.getItem('autoImprimir') === 'true'
    setAutoImprimir(cachedAutoPrint)
  }, [])

  const activarSonido = () => {
    const audio = new Audio('/notificacion.mp3')
    audio.play().then(() => {
      audio.pause()
      audio.currentTime = 0
      setAudioActivado(true)
    }).catch(() => {
      alert('No se pudo activar el sonido. Intentá de nuevo.')
    })
  }

  const notificarPedido = () => {
    if (audioActivado) {
      const audio = new Audio('/notificacion.mp3')
      audio.play().catch(() => {})
    }
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('🛵 Nuevo pedido — Bar El Rincón', {
        body: 'Entrá al panel para verlo',
        icon: '/favicon.ico',
      })
    }
  }

  const cerrarSesion = async () => {
    try {
      const res = await fetch('/api/admin/logout', { method: 'POST' });
      if (res.ok) {
        window.location.replace('/admin/login'); 
      }
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
    }
  };

  function imprimirPedido(pedido: any) {
    setPedidoParaImprimir(pedido)
    setTimeout(() => {
      window.print()
    }, 250)
  }

  const handleToggleAutoImprimir = (val: boolean) => {
    setAutoImprimir(val)
    localStorage.setItem('autoImprimir', String(val))
  }
  
  useEffect(() => {
    cargarDatos()

    const canalPedidos = supabase
      .channel('cambios-pedidos')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pedidos' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            notificarPedido()
            // Auto-imprimir si está configurado
            cargarDatos().then((nuevosPeds) => {
              const isAuto = localStorage.getItem('autoImprimir') === 'true'
              if (isAuto && nuevosPeds) {
                const nuevo = nuevosPeds.find((p: any) => p.id === payload.new.id)
                if (nuevo) {
                  imprimirPedido(nuevo)
                }
              }
            })
          } else {
            cargarDatos() 
          }
        }
      )
      .subscribe()

    const intervaloReloj = setInterval(() => {
      setAhora(Date.now())
    }, 60000)

    return () => {
      supabase.removeChannel(canalPedidos)
      clearInterval(intervaloReloj)
    }
  }, [audioActivado])

  async function cargarDatos() {
    const [{ data: cats }, { data: prods }, { data: peds }, { data: conf }] = await Promise.all([
      supabase.from('categorias').select('*').order('orden'),
      supabase.from('productos').select('*').order('id'),
      supabase.from('pedidos').select('*, pedido_items(*)').order('created_at', { ascending: false }),
      supabase.from('configuracion').select('*').single()
    ])
    setCategorias(cats || [])
    setProductos(prods || [])
    setPedidos(peds || [])
    if (conf) {
      setConfig(conf)
      setFormConfig({
        nombre_bar: conf.nombre_bar,
        costo_envio: conf.costo_envio.toString(),
        pedido_minimo: conf.pedido_minimo.toString(),
        horario_apertura: conf.horario_apertura,
        horario_cierre: conf.horario_cierre,
      })
    }
    setLoading(false)
    return peds || []
  }

  function filtrarPorPeriodo(periodo: 'hoy'|'mes'|'ano') {
    const hoy = new Date()
    return pedidos.filter(p => {
      const f = new Date(p.created_at)
      if (periodo === 'hoy') return f.toDateString() === hoy.toDateString()
      if (periodo === 'mes') return f.getMonth() === hoy.getMonth() && f.getFullYear() === hoy.getFullYear()
      return f.getFullYear() === hoy.getFullYear()
    })
  }

  function sumarTotal(peds: any[]) {
    return peds.reduce((acc, p) => acc + (p.total || 0), 0)
  }

  function topProductos(peds: any[]) {
    const mapa: Record<string, { nombre: string; cantidad: number; total: number }> = {}
    peds.forEach(p => (p.pedido_items || []).forEach((item: any) => {
      if (!mapa[item.nombre]) mapa[item.nombre] = { nombre: item.nombre, cantidad: 0, total: 0 }
      mapa[item.nombre].cantidad += item.cantidad
      mapa[item.nombre].total += item.precio * item.cantidad
    }))
    return Object.values(mapa).sort((a, b) => b.cantidad - a.cantidad)
  }

  function grafico(peds: any[], porMes: boolean) {
    const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
    const mapa: Record<string, number> = {}
    peds.forEach(p => {
      const f = new Date(p.created_at)
      const key = porMes ? meses[f.getMonth()] : f.toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit' })
      mapa[key] = (mapa[key] || 0) + (p.total || 0)
    })
    return Object.entries(mapa)
  }

  function abrirNuevo() {
    setEditando(null)
    setForm({ nombre:'', descripcion:'', precio:'', emoji:'🍽️', categoria_id: categorias[0]?.id?.toString() || '' })
    setImagenFile(null)
    setImagenPreview('')
  }

  function abrirEditar(p: Producto) {
    setEditando(p)
    setForm({ nombre: p.nombre, descripcion: p.descripcion, precio: p.precio.toString(), emoji: p.emoji, categoria_id: p.categoria_id.toString() })
    setImagenFile(null)
    setImagenPreview(p.imagen_url || '')
  }

  function handleImagenChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      setImagenFile(file)
      setImagenPreview(URL.createObjectURL(file))
    }
  }

  function comprimirImagen(file: File, maxSize = 400, quality = 0.8): Promise<Blob> {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let w = img.width, h = img.height
        if (w > h) { if (w > maxSize) { h = Math.round(h * maxSize / w); w = maxSize } }
        else { if (h > maxSize) { w = Math.round(w * maxSize / h); h = maxSize } }
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0, w, h)
        canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', quality)
      }
      img.src = URL.createObjectURL(file)
    })
  }

  async function guardarProducto() {
    if (!form.nombre || !form.precio) { alert('Completá nombre y precio'); return }
    setSubiendoImagen(true)
    try {
      let imagen_url: string | undefined = undefined
      if (imagenFile) {
        const comprimida = await comprimirImagen(imagenFile)
        const fileName = `${Date.now()}.jpg`
        const { error: uploadError } = await supabase.storage
          .from('productos')
          .upload(fileName, comprimida, { upsert: true, contentType: 'image/jpeg' })
        if (uploadError) {
          alert(`Error subiendo imagen: ${uploadError.message}`)
          setSubiendoImagen(false)
          return
        }
        const { data: urlData } = supabase.storage.from('productos').getPublicUrl(fileName)
        imagen_url = urlData.publicUrl
      }
      const data: any = { nombre: form.nombre, descripcion: form.descripcion, precio: parseInt(form.precio), emoji: form.emoji, categoria_id: parseInt(form.categoria_id) }
      if (imagen_url) data.imagen_url = imagen_url
      if (editando) {
        const result = await supabase.from('productos').update(data).eq('id', editando.id)
        if (result.error) { alert(`Error: ${result.error.message}`); setSubiendoImagen(false); return }
      } else {
        const result = await supabase.from('productos').insert({ ...data, activo: true })
        if (result.error) { alert(`Error: ${result.error.message}`); setSubiendoImagen(false); return }
      }
      setEditando(null)
      setForm({ nombre:'', descripcion:'', precio:'', emoji:'🍽️', categoria_id:'' })
      setImagenFile(null)
      setImagenPreview('')
      cargarDatos()
    } finally {
      setSubiendoImagen(false)
    }
  }

  async function quitarImagen() {
    if (!editando) return
    await supabase.from('productos').update({ imagen_url: null }).eq('id', editando.id)
    setImagenPreview('')
    setEditando({ ...editando, imagen_url: undefined })
    cargarDatos()
  }

  async function toggleActivo(p: Producto) {
    await supabase.from('productos').update({ activo: !p.activo }).eq('id', p.id)
    cargarDatos()
  }

  function abrirNuevaCat() {
    setEditandoCat(null)
    setFormCat({ nombre:'', orden: String(categorias.length + 1) })
  }

  function abrirEditarCat(c: Categoria) {
    setEditandoCat(c)
    setFormCat({ nombre: c.nombre, orden: c.orden.toString() })
  }

  async function guardarCategoria() {
    if (!formCat.nombre) { alert('Completá el nombre'); return }
    const data = { nombre: formCat.nombre, orden: parseInt(formCat.orden) }
    let result
    if (editandoCat) {
      result = await supabase.from('categorias').update(data).eq('id', editandoCat.id)
    } else {
      result = await supabase.from('categorias').insert({ ...data, activo: true })
    }
    if (result.error) {
      console.error('Error al guardar categoría:', result.error)
      alert(`Error: ${result.error.message}`)
      return
    }
    setEditandoCat(null)
    setFormCat({ nombre:'', orden:'0' })
    cargarDatos()
  }

  async function toggleActivoCat(c: Categoria) {
    await supabase.from('categorias').update({ activo: !c.activo }).eq('id', c.id)
    cargarDatos()
  }

  async function cambiarEstado(id: number, estado: string) {
    await supabase.from('pedidos').update({ estado }).eq('id', id)
    cargarDatos()
  }

  async function guardarConfig() {
    await supabase.from('configuracion').update({
      nombre_bar: formConfig.nombre_bar,
      costo_envio: parseInt(formConfig.costo_envio),
      pedido_minimo: parseInt(formConfig.pedido_minimo),
      horario_apertura: formConfig.horario_apertura,
      horario_cierre: formConfig.horario_cierre,
    }).eq('id', 1)
    cargarDatos()
    alert('✅ Configuración guardada')
  }

  async function toggleAbierto() {
    await supabase.from('configuracion').update({ abierto: !config?.abierto }).eq('id', 1)
    cargarDatos()
  }

  if (loading) return <div className="admin-loading">Cargando datos...</div>

  // Filtrado de pedidos
  const pedidosFiltrados = pedidos.filter(p => {
    if (filtroEstado !== 'todos' && p.estado !== filtroEstado) return false
    if (busqueda.trim() !== '') {
      const q = busqueda.toLowerCase()
      const matchesNum = String(p.numero).toLowerCase().includes(q)
      const matchesClient = String(p.cliente_nombre).toLowerCase().includes(q)
      const matchesTel = String(p.cliente_tel).toLowerCase().includes(q)
      const matchesAddress = String(p.direccion).toLowerCase().includes(q)
      return matchesNum || matchesClient || matchesTel || matchesAddress
    }
    return true
  })

  const pedsHoy = filtrarPorPeriodo('hoy')
  const pedsMes = filtrarPorPeriodo('mes')
  const pedsAno = filtrarPorPeriodo('ano')
  const pedsFiltro = filtrarPorPeriodo(periodo)
  const top = topProductos(pedsFiltro)
  const barras = grafico(periodo === 'ano' ? pedsAno : pedsMes, periodo === 'ano')
  const maxBar = barras.length > 0 ? Math.max(...barras.map(b => b[1])) : 1

  return (
    <div className="admin-wrap">
      {/* Header */}
      <header className="admin-header">
        <div className="admin-header-container">
          <div className="admin-header-left">
            <h1 className="admin-title">Bar El Rincón</h1>
            <nav className="admin-tabs">
              <button className={`admin-tab ${tab==='productos' ? 'active' : ''}`} onClick={() => setTab('productos')}>Productos</button>
              <button className={`admin-tab ${tab==='categorias' ? 'active' : ''}`} onClick={() => setTab('categorias')}>Categorías</button>
              <button className={`admin-tab ${tab==='pedidos' ? 'active' : ''}`} onClick={() => setTab('pedidos')}>Pedidos ({pedidos.length})</button>
              <button className={`admin-tab ${tab==='ventas' ? 'active' : ''}`} onClick={() => setTab('ventas')}>Ventas</button>
              <button className={`admin-tab ${tab==='config' ? 'active' : ''}`} onClick={() => setTab('config')}>⚙️ Config</button>
            </nav>
          </div>

          <div className="admin-header-actions">
            {!audioActivado ? (
              <button onClick={activarSonido} className="admin-btn-sonido">
                🔔 Activar sonido
              </button>
            ) : (
              <span style={{fontSize:12, opacity:0.8}}>🔔 Sonido OK</span>
            )}
            {permisoNoti === 'granted' ? (
              <span style={{fontSize:12, opacity:0.8}}>💬 Notis ON</span>
            ) : permisoNoti === 'denied' ? (
              <span style={{fontSize:11, color:'#f87171'}}>⚠️ Notis OFF</span>
            ) : null}
            <button onClick={cerrarSesion} className="admin-btn-logout">
              Cerrar Sesión
            </button>
          </div>

          {/* Hamburguesa para móviles */}
          <button className="admin-hamburger-btn" onClick={() => setMenuAbierto(true)}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" style={{ width: 26, height: 26 }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
        </div>
      </header>

      {/* Drawer Móvil */}
      <div className={`admin-drawer-overlay ${menuAbierto ? 'open' : ''}`} onClick={() => setMenuAbierto(false)}></div>
      <div className={`admin-mobile-drawer ${menuAbierto ? 'open' : ''}`}>
        <div className="admin-drawer-header">
          <span className="admin-title" style={{ fontSize: 18 }}>Menú</span>
          <button className="admin-drawer-close" onClick={() => setMenuAbierto(false)}>✕</button>
        </div>

        <nav className="admin-drawer-tabs">
          <button className={`admin-drawer-tab ${tab==='productos' ? 'active' : ''}`} onClick={() => { setTab('productos'); setMenuAbierto(false); }}>Productos</button>
          <button className={`admin-drawer-tab ${tab==='categorias' ? 'active' : ''}`} onClick={() => { setTab('categorias'); setMenuAbierto(false); }}>Categorías</button>
          <button className={`admin-drawer-tab ${tab==='pedidos' ? 'active' : ''}`} onClick={() => { setTab('pedidos'); setMenuAbierto(false); }}>Pedidos ({pedidos.length})</button>
          <button className={`admin-drawer-tab ${tab==='ventas' ? 'active' : ''}`} onClick={() => { setTab('ventas'); setMenuAbierto(false); }}>Ventas</button>
          <button className={`admin-drawer-tab ${tab==='config' ? 'active' : ''}`} onClick={() => { setTab('config'); setMenuAbierto(false); }}>⚙️ Config</button>
        </nav>

        <div className="admin-drawer-actions">
          {!audioActivado ? (
            <button onClick={() => { activarSonido(); setMenuAbierto(false); }} className="admin-btn-sonido" style={{ width: '100%' }}>
              🔔 Activar sonido
            </button>
          ) : (
            <span style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center' }}>🔔 Sonido activado</span>
          )}
          {permisoNoti === 'granted' ? (
            <span style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>💬 Notificaciones ON</span>
          ) : permisoNoti === 'denied' ? (
            <span style={{ fontSize: 12, color: '#f87171', textAlign: 'center' }}>⚠️ Notificaciones bloqueadas</span>
          ) : null}
          <button onClick={() => { cerrarSesion(); setMenuAbierto(false); }} className="admin-btn-logout" style={{ width: '100%', marginTop: 8 }}>
            Cerrar Sesión
          </button>
        </div>
      </div>

      {/* Main Content */}
      <main className="admin-content">
        
        {/* TAB: PRODUCTOS */}
        {tab === 'productos' && (
          <div className="admin-dashboard-grid">
            {/* Editor de Producto */}
            <div className="admin-card">
              <h2 className="admin-card-title">{editando ? 'Editar producto' : 'Nuevo producto'}</h2>
              
              <div className="admin-label">Nombre</div>
              <input className="admin-input" value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} placeholder="Cerveza artesanal"/>

              <div className="admin-grid2">
                <div>
                  <div className="admin-label">Precio ($)</div>
                  <input className="admin-input" type="number" value={form.precio} onChange={e => setForm({...form, precio: e.target.value})} placeholder="950"/>
                </div>
                <div>
                  <div className="admin-label">Categoría</div>
                  <select className="admin-input" value={form.categoria_id} onChange={e => setForm({...form, categoria_id: e.target.value})}>
                    {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
              </div>

              <div className="admin-label">Descripción</div>
              <input className="admin-input" value={form.descripcion} onChange={e => setForm({...form, descripcion: e.target.value})} placeholder="500ml, lúpulo floral"/>

              <div className="admin-label">Emoji (fallback)</div>
              <input className="admin-input" value={form.emoji} onChange={e => setForm({...form, emoji: e.target.value})} placeholder="🍺"/>

              <div className="admin-label">Foto del producto</div>
              <div className="admin-upload-area">
                {imagenPreview && (
                  <div className="admin-upload-preview">
                    <img src={imagenPreview} alt="Preview" />
                    <button className="remove-btn" onClick={() => { setImagenFile(null); setImagenPreview(''); if (editando) quitarImagen(); }}>✕</button>
                  </div>
                )}
                <label className="admin-upload-label">
                  📷 {imagenPreview ? 'Cambiar foto' : 'Subir foto'}
                  <input type="file" accept="image/*" onChange={handleImagenChange} style={{display:'none'}} />
                </label>
              </div>

              <div style={{display:'flex', gap:8, marginTop:8}}>
                <button className="admin-btn-primary" style={{opacity: subiendoImagen ? 0.6 : 1}} onClick={guardarProducto} disabled={subiendoImagen}>
                  {subiendoImagen ? 'Subiendo...' : editando ? 'Guardar cambios' : 'Agregar producto'}
                </button>
                {editando && <button className="admin-btn-secondary" onClick={() => { setEditando(null); setImagenFile(null); setImagenPreview('') }}>Cancelar</button>}
              </div>
            </div>

            {/* Listado de Productos */}
            <div className="admin-card">
              <div className="admin-card-title">
                <span>Productos ({productos.length})</span>
                <button className="admin-btn-primary" onClick={abrirNuevo}>+ Nuevo</button>
              </div>
              <div style={{maxHeight:'70vh', overflowY:'auto'}}>
                {productos.map(p => (
                  <div key={p.id} className="admin-prod-row" style={{opacity: p.activo ? 1 : 0.5}}>
                    {p.imagen_url ? (
                      <img src={p.imagen_url} alt={p.nombre} className="prod-thumb" />
                    ) : (
                      <span className="prod-emoji">{p.emoji}</span>
                    )}
                    <div className="prod-details">
                      <div className="name">{p.nombre}</div>
                      <div className="meta">
                        {categorias.find(c=>c.id===p.categoria_id)?.nombre} · ${p.precio.toLocaleString('es-AR')}
                      </div>
                    </div>
                    <div className="admin-prod-actions">
                      <button className="admin-btn-small" onClick={() => abrirEditar(p)}>Editar</button>
                      <button className="admin-btn-small" style={{background: p.activo?'#fee2e2':'#dcfce7', color: p.activo?'#dc2626':'#16a34a'}} onClick={() => toggleActivo(p)}>
                        {p.activo ? 'Desactivar' : 'Activar'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB: CATEGORÍAS */}
        {tab === 'categorias' && (
          <div className="admin-dashboard-grid">
            {/* Editor de Categorías */}
            <div className="admin-card">
              <h2 className="admin-card-title">{editandoCat ? 'Editar categoría' : 'Nueva categoría'}</h2>
              <div className="admin-grid2">
                <div>
                  <div className="admin-label">Nombre</div>
                  <input className="admin-input" value={formCat.nombre} onChange={e => setFormCat({...formCat, nombre: e.target.value})} placeholder="Ej: Postres"/>
                </div>
                <div>
                  <div className="admin-label">Orden</div>
                  <input className="admin-input" type="number" value={formCat.orden} onChange={e => setFormCat({...formCat, orden: e.target.value})} placeholder="6"/>
                </div>
              </div>
              <div style={{display:'flex', gap:8, marginTop:8}}>
                <button className="admin-btn-primary" onClick={guardarCategoria}>
                  {editandoCat ? 'Guardar cambios' : 'Agregar categoría'}
                </button>
                {editandoCat && <button className="admin-btn-secondary" onClick={() => setEditandoCat(null)}>Cancelar</button>}
              </div>
            </div>

            {/* Listado de Categorías */}
            <div className="admin-card">
              <div className="admin-card-title">
                <span>Categorías ({categorias.length})</span>
                <button className="admin-btn-primary" onClick={abrirNuevaCat}>+ Nueva</button>
              </div>
              <div style={{maxHeight:'70vh', overflowY:'auto'}}>
                {categorias.map(c => (
                  <div key={c.id} className="admin-prod-row" style={{opacity: c.activo ? 1 : 0.5}}>
                    <div className="prod-details">
                      <div className="name">{c.nombre}</div>
                      <div className="meta">Orden: {c.orden} · {productos.filter(p=>p.categoria_id===c.id).length} productos</div>
                    </div>
                    <div className="admin-prod-actions">
                      <button className="admin-btn-small" onClick={() => abrirEditarCat(c)}>Editar</button>
                      <button className="admin-btn-small" style={{background: c.activo?'#fee2e2':'#dcfce7', color: c.activo?'#dc2626':'#16a34a'}} onClick={() => toggleActivoCat(c)}>
                        {c.activo ? 'Desactivar' : 'Activar'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB: PEDIDOS */}
        {tab === 'pedidos' && (
          <div>
            <div className="admin-realtime">
              <span className="admin-pulse-dot"></span>
              Conectado en tiempo real
            </div>

            {/* Buscador e indicadores */}
            <div className="admin-card" style={{marginBottom: 20}}>
              <div className="admin-search-bar">
                <input 
                  type="text" 
                  className="admin-input admin-search-input" 
                  placeholder="🔍 Buscar por cliente, teléfono, dirección o N° de pedido..." 
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                />
              </div>

              <div className="admin-filter-pills">
                {(['todos', 'pendiente', 'preparando', 'en camino', 'entregado'] as const).map(est => (
                  <button 
                    key={est} 
                    className={`admin-filter-pill ${filtroEstado === est ? 'active' : ''}`}
                    onClick={() => setFiltroEstado(est)}
                  >
                    {est === 'todos' ? 'Todos' : est.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {pedidosFiltrados.length === 0 ? (
              <div className="admin-card">
                <div className="admin-empty">No se encontraron pedidos en esta sección</div>
              </div>
            ) : (
              <div style={{display:'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(450px, 1fr))', gap:20}}>
                {pedidosFiltrados.map(p => (
                  <div 
                    key={p.id} 
                    className="admin-pedido-card" 
                    style={{
                      borderLeft: p.estado === 'pendiente' 
                        ? '6px solid #d97706' 
                        : p.estado === 'preparando' 
                        ? '6px solid #2563eb' 
                        : p.estado === 'en camino' 
                        ? '6px solid #7c3aed' 
                        : '6px solid #16a34a'
                    }}
                  >
                    <div className="admin-pedido-header">
                      <div className="admin-pedido-info">
                        <div className="admin-pedido-num-time">
                          <span className="admin-pedido-number">#{p.numero}</span>
                          <span className="admin-pedido-time">⏱ {tiempoRelativo(p.created_at)}</span>
                        </div>
                        <div className="admin-pedido-customer">{p.cliente_nombre} · {p.cliente_tel}</div>
                        <div className="admin-pedido-address">{p.direccion}</div>
                        {p.referencia && <div className="admin-pedido-address" style={{fontSize:12}}>Ref: {p.referencia}</div>}
                        {p.nota && <div className="admin-pedido-note">📝 Nota: {p.nota}</div>}
                      </div>
                      <span className={`admin-badge ${p.estado}`}>{p.estado}</span>
                    </div>

                    {p.pedido_items?.length > 0 && (
                      <div className="admin-pedido-items-box">
                        <div className="admin-pedido-items-title">Detalle del Pedido</div>
                        {p.pedido_items.map((item: any) => (
                          <div key={item.id} className="admin-pedido-item">
                            <span>
                              <span className="admin-pedido-qty">{item.cantidad}x</span>
                              {item.nombre}
                            </span>
                            <span>${(item.precio * item.cantidad).toLocaleString('es-AR')}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="admin-pedido-footer">
                      <div className="admin-pedido-payment">
                        Pago: <strong>{p.metodo_pago}</strong>
                        {p.vuelto ? ` (Vuelto de $${p.vuelto.toLocaleString('es-AR')})` : ''}
                      </div>
                      <div className="admin-pedido-total">
                        Total: ${p.total?.toLocaleString('es-AR')}
                      </div>
                    </div>

                    <div className="admin-pedido-footer" style={{ borderTop: 'none', paddingTop: 0 }}>
                      <div className="admin-pedido-estados">
                        {['pendiente','preparando','en camino','entregado'].map(e => (
                          <button 
                            key={e} 
                            className={`admin-btn-estado ${p.estado===e?'active':''}`} 
                            onClick={() => cambiarEstado(p.id, e)}
                          >
                            {e.toUpperCase()}
                          </button>
                        ))}
                      </div>
                      <button className="admin-btn-secondary" onClick={() => imprimirPedido(p)} style={{ padding: '8px 14px', fontSize: 13, gap: 4 }}>
                        🖨️ Imprimir
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB: VENTAS */}
        {tab === 'ventas' && (
          <div>
            <div className="admin-card" style={{marginBottom: 20}}>
              <div style={{display:'flex', gap:8}}>
                {(['hoy','mes','ano'] as const).map(p => (
                  <button key={p} onClick={() => setPeriodo(p)}
                    className="admin-btn-small"
                    style={{
                      background: periodo===p?'var(--admin-bg-header)':'#ffffff',
                      color: periodo===p?'#ffffff':'#334155',
                      border: '1px solid var(--admin-border)'
                    }}
                  >
                    {p === 'hoy' ? 'Hoy' : p === 'mes' ? 'Este mes' : 'Este año'}
                  </button>
                ))}
              </div>
            </div>

            {/* Stats Cards */}
            <div className="admin-stats-grid">
              {[
                { label:'Ventas Hoy', peds: pedsHoy },
                { label:'Ventas Mes', peds: pedsMes },
                { label:'Ventas Año', peds: pedsAno },
              ].map(({ label, peds }) => (
                <div key={label} className="admin-stat-card">
                  <div className="admin-stat-label">{label}</div>
                  <div className="admin-stat-value">${sumarTotal(peds).toLocaleString('es-AR')}</div>
                  <div className="admin-stat-sub">{peds.length} pedidos finalizados</div>
                </div>
              ))}
            </div>

            {/* Ventas Chart */}
            <div className="admin-card">
              <h2 className="admin-card-title">
                {periodo === 'ano' ? 'Ventas por mes' : 'Ventas por día (mes actual)'}
              </h2>
              {barras.length === 0 ? (
                <div className="admin-empty">Sin datos de ventas registrados para este período</div>
              ) : (
                <div className="admin-chart-container">
                  <div className="admin-chart-bar-group" style={{ minWidth: barras.length * 52 }}>
                    {barras.map(([label, valor]) => (
                      <div key={label} className="admin-chart-bar-wrapper">
                        <div className="admin-chart-value">
                          ${valor >= 1000 ? Math.round(valor/1000)+'k' : valor}
                        </div>
                        <div 
                          className="admin-chart-bar" 
                          style={{ height: `${Math.max(8, (valor/maxBar)*150)}px` }}
                        />
                        <div className="admin-chart-label">{label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Líder de ventas */}
            <div className="admin-card">
              <h2 className="admin-card-title">
                🏆 Productos Más Vendidos — {periodo === 'hoy' ? 'Hoy' : periodo === 'mes' ? 'Este Mes' : 'Este Año'}
              </h2>
              {top.length === 0 ? (
                <div className="admin-empty">Sin estadísticas disponibles</div>
              ) : (
                <div>
                  {top.map((p, i) => (
                    <div key={p.nombre} className="admin-prod-row">
                      <div style={{
                        width:28, height:28, borderRadius:'50%', 
                        background:'var(--admin-bg-header)', color:'#fff', 
                        fontSize:12, fontWeight:700, display:'flex', 
                        alignItems:'center', justifyContent:'center', 
                        marginRight:16, flexShrink:0
                      }}>
                        {i+1}
                      </div>
                      <div className="prod-details">
                        <div className="name">{p.nombre}</div>
                        <div className="meta">{p.cantidad} unidades vendidas</div>
                      </div>
                      <div style={{fontWeight:700, fontSize:15}}>${p.total.toLocaleString('es-AR')}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB: CONFIGURACIÓN */}
        {tab === 'config' && (
          <div className="admin-dashboard-grid">
            
            {/* Configuración General */}
            <div className="admin-card">
              <h2 className="admin-card-title">⚙️ Configuración general</h2>

              <div className="admin-label">Nombre del bar</div>
              <input className="admin-input" value={formConfig.nombre_bar}
                onChange={e => setFormConfig({...formConfig, nombre_bar: e.target.value})}
                placeholder="Bar El Rincón"/>

              <div className="admin-grid2">
                <div>
                  <div className="admin-label">Costo de envío ($)</div>
                  <input className="admin-input" type="number" value={formConfig.costo_envio}
                    onChange={e => setFormConfig({...formConfig, costo_envio: e.target.value})}
                    placeholder="500"/>
                </div>
                <div>
                  <div className="admin-label">Pedido mínimo ($)</div>
                  <input className="admin-input" type="number" value={formConfig.pedido_minimo}
                    onChange={e => setFormConfig({...formConfig, pedido_minimo: e.target.value})}
                    placeholder="1500"/>
                </div>
              </div>

              <div className="admin-grid2">
                <div>
                  <div className="admin-label">Horario apertura</div>
                  <input className="admin-input" type="time" value={formConfig.horario_apertura}
                    onChange={e => setFormConfig({...formConfig, horario_apertura: e.target.value})}/>
                </div>
                <div>
                  <div className="admin-label">Horario cierre</div>
                  <input className="admin-input" type="time" value={formConfig.horario_cierre}
                    onChange={e => setFormConfig({...formConfig, horario_cierre: e.target.value})}/>
                </div>
              </div>

              <button className="admin-btn-primary" onClick={guardarConfig}>Guardar configuración</button>
            </div>

            {/* Estado del Bar y Auto-Impresión */}
            <div>
              <div className="admin-card">
                <h2 className="admin-card-title">Estado del bar</h2>
                <div className="admin-config-estado">
                  <div>
                    <div style={{fontWeight:600}}>El bar está actualmente:</div>
                    <div style={{
                      fontSize:16, 
                      color: config?.abierto ? '#16a34a' : '#dc2626', 
                      fontWeight:700, 
                      marginTop:4
                    }}>
                      {config?.abierto ? '🟢 Abierto' : '🔴 Cerrado'}
                    </div>
                  </div>
                  <button
                    onClick={toggleAbierto}
                    className="admin-btn-primary" 
                    style={{
                      background: config?.abierto ? '#ef4444' : '#16a34a',
                      boxShadow: 'none'
                    }}
                  >
                    {config?.abierto ? 'Cerrar bar' : 'Abrir bar'}
                  </button>
                </div>
              </div>

              <div className="admin-card" style={{ marginTop: 20 }}>
                <h2 className="admin-card-title">🖨️ Impresión Automática</h2>
                <div className="admin-config-estado">
                  <div>
                    <div style={{fontWeight:600}}>Imprimir comandas automáticamente:</div>
                    <div style={{ fontSize: 13, color: 'var(--admin-text-muted)', marginTop: 4 }}>
                      Dispara la impresión al recibir un nuevo pedido.
                    </div>
                  </div>
                  <button 
                    onClick={() => handleToggleAutoImprimir(!autoImprimir)}
                    className="admin-btn-primary"
                    style={{
                      background: autoImprimir ? '#16a34a' : '#64748b',
                      boxShadow: 'none'
                    }}
                  >
                    {autoImprimir ? '🟢 HABILITADO' : '🔴 DESHABILITADO'}
                  </button>
                </div>
              </div>
            </div>

          </div>
        )}

      </main>

      {/* Contenedor de impresión oculto en pantalla pero visible para @media print */}
      <div id="ticket-impresion-container">
        {pedidoParaImprimir && (
          <div id="ticket-impresion">
            <div className="ticket-header">
              <div className="ticket-title">{config?.nombre_bar || 'Bar El Rincón'}</div>
              <div className="ticket-subtitle">COMANDA DE COCINA</div>
            </div>
            
            <div className="ticket-section" style={{ textAlign: 'center', fontSize: '18px', fontWeight: 'bold' }}>
              PEDIDO #{pedidoParaImprimir.numero}
            </div>

            <div className="ticket-section">
              <div className="ticket-meta-row"><strong>Fecha:</strong> {new Date(pedidoParaImprimir.created_at).toLocaleString('es-AR')}</div>
              <div className="ticket-meta-row"><strong>Cliente:</strong> {pedidoParaImprimir.cliente_nombre}</div>
              <div className="ticket-meta-row"><strong>Tel:</strong> {pedidoParaImprimir.cliente_tel}</div>
              <div className="ticket-meta-row"><strong>Dirección:</strong> {pedidoParaImprimir.direccion}</div>
              {pedidoParaImprimir.referencia && (
                <div className="ticket-meta-row"><strong>Ref:</strong> {pedidoParaImprimir.referencia}</div>
              )}
              {pedidoParaImprimir.nota && (
                <div className="ticket-meta-row" style={{ marginTop: 6, padding: '4px', border: '1px solid #000' }}>
                  <strong>NOTA: {pedidoParaImprimir.nota}</strong>
                </div>
              )}
            </div>

            <div className="ticket-section">
              <div className="ticket-items-header">
                <span>Cant</span>
                <span>Producto</span>
                <span style={{ textAlign: 'right' }}>Subt</span>
              </div>
              <div style={{ borderBottom: '1px solid #000', marginBottom: 4 }} />
              {pedidoParaImprimir.pedido_items?.map((item: any) => (
                <div key={item.id} className="ticket-item-row">
                  <span className="ticket-qty">{item.cantidad}x</span>
                  <span>{item.nombre}</span>
                  <span className="ticket-price">${(item.precio * item.cantidad).toLocaleString('es-AR')}</span>
                </div>
              ))}
            </div>

            <div className="ticket-total-box">
              TOTAL: ${pedidoParaImprimir.total?.toLocaleString('es-AR')}
            </div>

            <div className="ticket-section" style={{ borderTop: '1px dashed #000', marginTop: 10, paddingTop: 6 }}>
              <div className="ticket-meta-row"><strong>Pago:</strong> {pedidoParaImprimir.metodo_pago}</div>
              {pedidoParaImprimir.vuelto && (
                <div className="ticket-meta-row"><strong>Vuelto:</strong> ${pedidoParaImprimir.vuelto.toLocaleString('es-AR')}</div>
              )}
            </div>

            <div className="ticket-footer">
              *** FIN DE COMANDA ***
            </div>
          </div>
        )}
      </div>

    </div>
  )
}