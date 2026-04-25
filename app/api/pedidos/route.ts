import { supabase } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const body = await request.json()

  const {
    cliente_nombre,
    cliente_tel,
    direccion,
    referencia,
    nota,
    metodo_pago,
    vuelto,
    subtotal,
    envio,
    total,
    items
  } = body

  // ✅ FIX: número secuencial en vez de aleatorio
  const { count } = await supabase
    .from('pedidos')
    .select('*', { count: 'exact', head: true })

  const numero = '#' + String((count || 0) + 1)

  // Insertar pedido
  const { data: pedido, error: errorPedido } = await supabase
    .from('pedidos')
    .insert({
      numero,
      cliente_nombre,
      cliente_tel,
      direccion,
      referencia,
      nota,
      metodo_pago,
      vuelto,
      subtotal,
      envio,
      total,
      estado: 'pendiente'
    })
    .select()
    .single()

  if (errorPedido) {
    return NextResponse.json({ error: 'Error al guardar el pedido' }, { status: 500 })
  }

  // Insertar items del pedido
  const { error: errorItems } = await supabase
    .from('pedido_items')
    .insert(
      items.map((i: any) => ({
        pedido_id: pedido.id,
        producto_id: i.id,
        nombre: i.nombre,
        precio: i.precio,
        cantidad: i.qty
      }))
    )

  if (errorItems) {
    return NextResponse.json({ error: 'Error al guardar los items' }, { status: 500 })
  }

  return NextResponse.json({ pedido })
}