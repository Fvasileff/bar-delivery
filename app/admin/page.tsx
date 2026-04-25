'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Categoria { id: number; nombre: string; orden: number; activo: boolean }
interface Producto {
  id: number; nombre: string; descripcion: string
  precio: number; emoji: string; categoria_id: number; activo: boolean
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
  const [tab, setTab] = useState<'productos'|'categorias'|'pedidos'|'ventas'>('productos')
  const [editando, setEditando] = useState<Producto|null>(null)
  const [editandoCat, setEditandoCat] = useState<Categoria|null>(null)
  const [form, setForm] = useState({ nombre:'', descripcion:'', precio:'', emoji:'🍽️', categoria_id:'' })
  const [formCat, setFormCat] = useState({ nombre:'', orden:'0' })
  const [loading, setLoading] = useState(true)
  const [periodo, setPeriodo] = useState<'hoy'|'mes'|'ano'>('hoy')
  const [ahora, setAhora] = useState(Date.now())

  // ✅ NUEVO: estados para sonido y notificaciones
  const [audioActivado, setAudioActivado] = useState(false)
  const [permisoNoti, setPermisoNoti] = useState<NotificationPermission>('default')
  

  // ✅ NUEVO: al cargar, pedir permiso de notificaciones y ver el estado actual
  useEffect(() => {
    if ('Notification' in window) {
      setPermisoNoti(Notification.permission)
      if (Notification.permission === 'default') {
        Notification.requestPermission().then(p => setPermisoNoti(p))
      }
    }
  }, [])

  // ✅ NUEVO: función para activar sonido (requiere click del usuario)
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

  // ✅ NUEVO: función que dispara sonido + notificación
  const notificarPedido = () => {
    // Sonido
    if (audioActivado) {
      const audio = new Audio('/notificacion.mp3')
      audio.play().catch(() => {})
    }
    // Notificación del sistema
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
  
  useEffect(() => {
    cargarDatos()

    const canalPedidos = supabase
      .channel('cambios-pedidos')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pedidos' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            notificarPedido() // ✅ MODIFICADO: reemplaza el audio directo por la función combinada
          }
          cargarDatos() 
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
  }, [audioActivado]) // ✅ MODIFICADO: depende de audioActivado para usar el valor actualizado

  async function cargarDatos() {
    const [{ data: cats }, { data: prods }, { data: peds }] = await Promise.all([
      supabase.from('categorias').select('*').order('orden'),
      supabase.from('productos').select('*').order('id'),
      supabase.from('pedidos').select('*, pedido_items(*)').order('created_at', { ascending: false })
    ])
    setCategorias(cats || [])
    setProductos(prods || [])
    setPedidos(peds || [])
    setLoading(false)
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
  }
  function abrirEditar(p: Producto) {
    setEditando(p)
    setForm({ nombre: p.nombre, descripcion: p.descripcion, precio: p.precio.toString(), emoji: p.emoji, categoria_id: p.categoria_id.toString() })
  }
  async function guardarProducto() {
    if (!form.nombre || !form.precio) { alert('Completá nombre y precio'); return }
    const data = { nombre: form.nombre, descripcion: form.descripcion, precio: parseInt(form.precio), emoji: form.emoji, categoria_id: parseInt(form.categoria_id) }
    if (editando) await supabase.from('productos').update(data).eq('id', editando.id)
    else await supabase.from('productos').insert({ ...data, activo: true })
    setEditando(null)
    setForm({ nombre:'', descripcion:'', precio:'', emoji:'🍽️', categoria_id:'' })
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
    if (editandoCat) await supabase.from('categorias').update(data).eq('id', editandoCat.id)
    else await supabase.from('categorias').insert({ ...data, activo: true })
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

  if (loading) return <div style={s.loading}>Cargando...</div>

  const pedsHoy = filtrarPorPeriodo('hoy')
  const pedsMes = filtrarPorPeriodo('mes')
  const pedsAno = filtrarPorPeriodo('ano')
  const pedsFiltro = filtrarPorPeriodo(periodo)
  const top = topProductos(pedsFiltro)
  const barras = grafico(periodo === 'ano' ? pedsAno : pedsMes, periodo === 'ano')
  const maxBar = barras.length > 0 ? Math.max(...barras.map(b => b[1])) : 1

  return (
    <div style={s.wrap}>
      <div style={{...s.header, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
        <div>
          <h1 style={s.title}>Panel Admin — Bar El Rincón</h1>
          <div style={s.tabs}>
            <button style={tab==='productos'?s.tabActive:s.tab} onClick={() => setTab('productos')}>Productos</button>
            <button style={tab==='categorias'?s.tabActive:s.tab} onClick={() => setTab('categorias')}>Categorías</button>
            <button style={tab==='pedidos'?s.tabActive:s.tab} onClick={() => setTab('pedidos')}>Pedidos ({pedidos.length})</button>
            <button style={tab==='ventas'?s.tabActive:s.tab} onClick={() => setTab('ventas')}>Ventas</button>
          </div>
        </div>

        <div style={{display:'flex', flexDirection:'column', gap:8, alignItems:'flex-end'}}>
          {/* ✅ NUEVO: botón activar sonido — desaparece una vez activado */}
          {!audioActivado && (
            <button onClick={activarSonido} style={s.btnSonido}>
              🔔 Activar sonido
            </button>
          )}
          {audioActivado && (
            <span style={{fontSize:12, color:'rgba(255,255,255,0.6)'}}>🔔 Sonido activado</span>
          )}
          {/* ✅ NUEVO: estado del permiso de notificaciones */}
          {permisoNoti === 'denied' && (
            <span style={{fontSize:11, color:'#fca5a5'}}>⚠️ Notificaciones bloqueadas</span>
          )}
          {permisoNoti === 'granted' && (
            <span style={{fontSize:12, color:'rgba(255,255,255,0.6)'}}>🔔 Notificaciones ON</span>
          )}
          <button onClick={cerrarSesion} style={s.btnLogout}>
            Cerrar Sesión
          </button>
        </div>
      </div>

      {tab === 'productos' && (
        <div style={s.content}>
          <div style={s.card}>
            <h2 style={s.cardTitle}>{editando ? 'Editar producto' : 'Nuevo producto'}</h2>
            <div style={s.grid2}>
              <div>
                <div style={s.label}>Nombre</div>
                <input style={s.input} value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} placeholder="Cerveza artesanal"/>
              </div>
              <div>
                <div style={s.label}>Precio ($)</div>
                <input style={s.input} type="number" value={form.precio} onChange={e => setForm({...form, precio: e.target.value})} placeholder="950"/>
              </div>
            </div>
            <div style={s.label}>Descripción</div>
            <input style={s.input} value={form.descripcion} onChange={e => setForm({...form, descripcion: e.target.value})} placeholder="500ml, lúpulo floral"/>
            <div style={s.grid2}>
              <div>
                <div style={s.label}>Emoji</div>
                <input style={s.input} value={form.emoji} onChange={e => setForm({...form, emoji: e.target.value})} placeholder="🍺"/>
              </div>
              <div>
                <div style={s.label}>Categoría</div>
                <select style={s.input} value={form.categoria_id} onChange={e => setForm({...form, categoria_id: e.target.value})}>
                  {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
            </div>
            <div style={{display:'flex', gap:8, marginTop:8}}>
              <button style={s.btnPrimary} onClick={guardarProducto}>{editando ? 'Guardar cambios' : 'Agregar producto'}</button>
              {editando && <button style={s.btnSecondary} onClick={() => setEditando(null)}>Cancelar</button>}
            </div>
          </div>
          <div style={s.card}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16}}>
              <h2 style={s.cardTitle}>Productos ({productos.length})</h2>
              <button style={s.btnPrimary} onClick={abrirNuevo}>+ Nuevo</button>
            </div>
            {productos.map(p => (
              <div key={p.id} style={{...s.prodRow, opacity: p.activo ? 1 : 0.5}}>
                <span style={{fontSize:24, marginRight:12}}>{p.emoji}</span>
                <div style={{flex:1}}>
                  <div style={{fontWeight:500, fontSize:14}}>{p.nombre}</div>
                  <div style={{fontSize:12, color:'#666'}}>{categorias.find(c=>c.id===p.categoria_id)?.nombre} · ${p.precio.toLocaleString('es-AR')}</div>
                </div>
                <div style={{display:'flex', gap:8}}>
                  <button style={s.btnSmall} onClick={() => abrirEditar(p)}>Editar</button>
                  <button style={{...s.btnSmall, background: p.activo?'#fee2e2':'#dcfce7', color: p.activo?'#dc2626':'#16a34a'}} onClick={() => toggleActivo(p)}>
                    {p.activo ? 'Desactivar' : 'Activar'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'categorias' && (
        <div style={s.content}>
          <div style={s.card}>
            <h2 style={s.cardTitle}>{editandoCat ? 'Editar categoría' : 'Nueva categoría'}</h2>
            <div style={s.grid2}>
              <div>
                <div style={s.label}>Nombre</div>
                <input style={s.input} value={formCat.nombre} onChange={e => setFormCat({...formCat, nombre: e.target.value})} placeholder="Ej: Postres"/>
              </div>
              <div>
                <div style={s.label}>Orden</div>
                <input style={s.input} type="number" value={formCat.orden} onChange={e => setFormCat({...formCat, orden: e.target.value})} placeholder="6"/>
              </div>
            </div>
            <div style={{display:'flex', gap:8, marginTop:8}}>
              <button style={s.btnPrimary} onClick={guardarCategoria}>{editandoCat ? 'Guardar cambios' : 'Agregar categoría'}</button>
              {editandoCat && <button style={s.btnSecondary} onClick={() => setEditandoCat(null)}>Cancelar</button>}
            </div>
          </div>
          <div style={s.card}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16}}>
              <h2 style={s.cardTitle}>Categorías ({categorias.length})</h2>
              <button style={s.btnPrimary} onClick={abrirNuevaCat}>+ Nueva</button>
            </div>
            {categorias.map(c => (
              <div key={c.id} style={{...s.prodRow, opacity: c.activo ? 1 : 0.5}}>
                <div style={{flex:1}}>
                  <div style={{fontWeight:500, fontSize:14}}>{c.nombre}</div>
                  <div style={{fontSize:12, color:'#666'}}>Orden: {c.orden} · {productos.filter(p=>p.categoria_id===c.id).length} productos</div>
                </div>
                <div style={{display:'flex', gap:8}}>
                  <button style={s.btnSmall} onClick={() => abrirEditarCat(c)}>Editar</button>
                  <button style={{...s.btnSmall, background: c.activo?'#fee2e2':'#dcfce7', color: c.activo?'#dc2626':'#16a34a'}} onClick={() => toggleActivoCat(c)}>
                    {c.activo ? 'Desactivar' : 'Activar'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'pedidos' && (
        <div style={s.content}>
        <div style={{fontSize:11, color:'#22c55e', textAlign:'right' as const, marginBottom:8, fontWeight: 600}}>
          ● Conectado en tiempo real
        </div>
          {pedidos.length === 0 && <div style={s.empty}>No hay pedidos todavía</div>}
          {pedidos.map(p => (
            <div key={p.id} style={{...s.card, borderLeft: p.estado === 'pendiente' ? '4px solid #d97706' : p.estado === 'preparando' ? '4px solid #2563eb' : '4px solid #e5e7eb'}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12}}>
                <div style={{flex:1}}>
                  <div style={{display:'flex', alignItems:'center', gap:8}}>
                    <div style={{fontWeight:600, fontSize:18, color:'#1a1a2e'}}>{p.numero}</div>
                    <div style={{fontSize:12, color:'#999'}}>⏱ {tiempoRelativo(p.created_at)}</div>
                  </div>
                  <div style={{fontSize:13, color:'#666', marginTop:2}}>{p.cliente_nombre} · {p.cliente_tel}</div>
                  <div style={{fontSize:13, color:'#666'}}>{p.direccion}</div>
                  {p.referencia && <div style={{fontSize:13, color:'#666'}}>Ref: {p.referencia}</div>}
                  {p.nota && <div style={{fontSize:13, color:'#e67e22', fontStyle:'italic'}}>📝 Nota: {p.nota}</div>}
                  {p.pedido_items?.length > 0 && (
                    <div style={{margin:'10px 0 6px', padding:'10px 12px', background:'#f8f9fa', borderRadius:8, borderLeft:'3px solid #1a1a2e'}}>
                      <div style={{fontSize:11, fontWeight:600, color:'#999', marginBottom:6, textTransform:'uppercase' as const, letterSpacing:'0.5px'}}>Pedido</div>
                      {p.pedido_items.map((item: any) => (
                        <div key={item.id} style={{display:'flex', justifyContent:'space-between', fontSize:14, padding:'3px 0'}}>
                          <span><span style={{fontWeight:700, color:'#1a1a2e', marginRight:6}}>{item.cantidad}x</span>{item.nombre}</span>
                          <span style={{color:'#666', fontSize:13}}>${(item.precio * item.cantidad).toLocaleString('es-AR')}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{fontSize:13, color:'#666'}}>
                    Pago: {p.metodo_pago}{p.vuelto ? ` · Vuelto de $${p.vuelto.toLocaleString('es-AR')}` : ''}{' · '}
                    <span style={{fontWeight:600, color:'#1a1a2e'}}>Total: ${p.total?.toLocaleString('es-AR')}</span>
                  </div>
                </div>
                <span style={{...s.badge, ...getBadgeStyle(p.estado), marginLeft:12}}>{p.estado}</span>
              </div>
              <div style={{display:'flex', gap:8, flexWrap:'wrap' as const}}>
                {['pendiente','preparando','en camino','entregado'].map(e => (
                  <button key={e} style={{...s.btnSmall, background: p.estado===e?'#1a1a2e':'#f5f5f5', color: p.estado===e?'#fff':'#333'}} onClick={() => cambiarEstado(p.id, e)}>{e}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'ventas' && (
        <div style={s.content}>
          <div style={{display:'flex', gap:8, marginBottom:20}}>
            {(['hoy','mes','ano'] as const).map(p => (
              <button key={p} onClick={() => setPeriodo(p)}
                style={{...s.btnSmall, background: periodo===p?'#1a1a2e':'#fff', color: periodo===p?'#fff':'#333', border:'1px solid #ddd', fontWeight: periodo===p?600:400}}>
                {p === 'hoy' ? 'Hoy' : p === 'mes' ? 'Este mes' : 'Este año'}
              </button>
            ))}
          </div>

          <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:16}}>
            {[
              { label:'HOY', peds: pedsHoy },
              { label:'MES', peds: pedsMes },
              { label:'AÑO', peds: pedsAno },
            ].map(({ label, peds }) => (
              <div key={label} style={{...s.card, marginBottom:0, textAlign:'center' as const}}>
                <div style={{fontSize:11, color:'#999', marginBottom:4}}>{label}</div>
                <div style={{fontSize:20, fontWeight:700, color:'#1a1a2e'}}>${sumarTotal(peds).toLocaleString('es-AR')}</div>
                <div style={{fontSize:12, color:'#666', marginTop:2}}>{peds.length} pedidos</div>
              </div>
            ))}
          </div>

          <div style={s.card}>
            <h2 style={s.cardTitle}>{periodo === 'ano' ? 'Ventas por mes' : 'Ventas por día (mes actual)'}</h2>
            {barras.length === 0
              ? <div style={s.empty}>Sin datos aún</div>
              : <div style={{overflowX:'auto'}}>
                  <div style={{display:'flex', alignItems:'flex-end', gap:4, height:190, paddingBottom:28, minWidth: barras.length * 44}}>
                    {barras.map(([label, valor]) => (
                      <div key={label} style={{display:'flex', flexDirection:'column' as const, alignItems:'center', width:36}}>
                        <div style={{fontSize:11, color:'#030a06', marginBottom:3, fontWeight:500}}>
                          ${valor >= 1000 ? Math.round(valor/1000)+'k' : valor}
                        </div>
                        <div style={{
                          width:28,
                          background:'linear-gradient(180deg, #23b843 0%, #1a1a2e 100%)',
                          borderRadius:'4px 4px 0 0',
                          height:`${Math.max(6, (valor/maxBar)*110)}px`,
                          transition:'height 0.4s ease',
                          boxShadow:'0 2px 6px rgba(4,5,10,0.3)'
                        }}/>
                        <div style={{fontSize:10, color:'#000', marginTop:5, whiteSpace:'nowrap' as const}}>{label}</div>
                      </div>
                    ))}
                  </div>
                </div>
            }
          </div>

          <div style={s.card}>
            <h2 style={s.cardTitle}>🏆 Más vendidos — {periodo === 'hoy' ? 'hoy' : periodo === 'mes' ? 'este mes' : 'este año'}</h2>
            {top.length === 0
              ? <div style={s.empty}>Sin datos aún</div>
              : top.map((p, i) => (
                <div key={p.nombre} style={s.prodRow}>
                  <div style={{width:24, height:24, borderRadius:'50%', background:'#1a1a2e', color:'#fff', fontSize:12, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', marginRight:12, flexShrink:0}}>{i+1}</div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:500, fontSize:14}}>{p.nombre}</div>
                    <div style={{fontSize:12, color:'#666'}}>{p.cantidad} unidades</div>
                  </div>
                  <div style={{fontWeight:600, fontSize:14}}>${p.total.toLocaleString('es-AR')}</div>
                </div>
              ))
            }
          </div>
        </div>
      )}
    </div>
  )
}

function getBadgeStyle(estado: string) {
  const map: Record<string, React.CSSProperties> = {
    pendiente: { background:'#fef3c7', color:'#d97706' },
    preparando: { background:'#dbeafe', color:'#2563eb' },
    'en camino': { background:'#ede9fe', color:'#7c3aed' },
    entregado: { background:'#dcfce7', color:'#16a34a' },
  }
  return map[estado] || { background:'#f5f5f5', color:'#333' }
}

const s: Record<string, React.CSSProperties> = {
  wrap: { minHeight:'100vh', background:'#f5f5f5', fontFamily:'-apple-system, sans-serif' },
  header: { background:'#1a1a2e', padding:'20px 24px', color:'#fff' },
  title: { fontSize:20, fontWeight:600, marginBottom:16 },
  tabs: { display:'flex', gap:8, flexWrap:'wrap' },
  tab: { padding:'8px 16px', borderRadius:8, border:'none', background:'rgba(255,255,255,0.1)', color:'#fff', cursor:'pointer', fontSize:14 },
  tabActive: { padding:'8px 16px', borderRadius:8, border:'none', background:'#fff', color:'#1a1a2e', cursor:'pointer', fontSize:14, fontWeight:500 },
  content: { padding:24, maxWidth:800, margin:'0 auto' },
  card: { background:'#fff', borderRadius:12, padding:20, marginBottom:16, boxShadow:'0 1px 3px rgba(0,0,0,0.08)' },
  cardTitle: { fontSize:16, fontWeight:600, marginBottom:16, color:'#1a1a2e' },
  label: { fontSize:12, color:'#666', marginBottom:4, fontWeight:500 },
  input: { width:'100%', padding:'10px 12px', border:'1px solid #ddd', borderRadius:8, fontSize:14, marginBottom:12, boxSizing:'border-box' },
  grid2: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 },
  btnPrimary: { padding:'10px 16px', background:'#1a1a2e', color:'#fff', border:'none', borderRadius:8, fontSize:14, cursor:'pointer', fontWeight:500 },
  btnSecondary: { padding:'10px 16px', background:'#f5f5f5', color:'#333', border:'none', borderRadius:8, fontSize:14, cursor:'pointer' },
  btnSmall: { padding:'6px 12px', background:'#f5f5f5', color:'#333', border:'none', borderRadius:6, fontSize:13, cursor:'pointer' },
  prodRow: { display:'flex', alignItems:'center', padding:'12px 0', borderBottom:'1px solid #f0f0f0' },
  badge: { padding:'4px 10px', borderRadius:20, fontSize:12, fontWeight:500, whiteSpace:'nowrap' as const },
  empty: { textAlign:'center', color:'#666', padding:40 },
  loading: { display:'flex', justifyContent:'center', padding:40, color:'#666' },
  btnLogout: {
    padding: '8px 14px',
    background: '#dc2626',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '13px',
    cursor: 'pointer',
    fontWeight: 500,
  },
  // ✅ NUEVO: estilo botón activar sonido
  btnSonido: {
    padding: '8px 14px',
    background: '#d97706',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '13px',
    cursor: 'pointer',
    fontWeight: 500,
  }
}