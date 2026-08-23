import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { hashPassword } from '@/lib/actions/auth-actions';

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();

    // Check if admin exists
    const { data: existing } = await supabase
      .from('employees')
      .select('id')
      .eq('email', 'admin@caractere.dz')
      .single();

    if (existing) {
      return NextResponse.json({ message: 'Admin already exists' }, { status: 200 });
    }

    // Create admin employee
    const passwordHash = await hashPassword('Admin123!');

    const { data, error } = await supabase
      .from('employees')
      .insert({
        first_name: 'Admin',
        last_name: 'Caractère',
        email: 'admin@caractere.dz',
        password_hash: passwordHash,
        password_set_at: new Date().toISOString(),
        active: true,
        department: 'Admin',
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      message: 'Admin created successfully',
      email: 'admin@caractere.dz',
      password: 'Admin123!'
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
