import { supabase } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export async function GET() {
  const { data: categorias, error: errorCats } = await supabase
    .from('categorias')
    .select('*')
    .eq('activo', true)
    .order('orden')

  const { data: productos, error: errorProds } = await supabase
    .from('productos')
    .select('*')
    .eq('activo', true)
    .order('orden')

  if (errorCats || errorProds) {
    return NextResponse.json({ error: 'Error al obtener el menú' }, { status: 500 })
  }

  return NextResponse.json({ categorias, productos })
}