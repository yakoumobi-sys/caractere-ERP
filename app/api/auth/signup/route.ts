import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { hashPassword } from '@/lib/actions/auth-actions';

export async function POST(req: NextRequest) {
  try {
    const { email, password, firstName, lastName } = await req.json();

    if (!email || !password || !firstName || !lastName) {
      return NextResponse.json(
        { error: 'Tous les champs sont requis' },
        { status: 400 }
      );
    }

    const supabase = createClient();

    // Check if employee already exists
    const { data: existing } = await supabase
      .from('employees')
      .select('id')
      .eq('email', email)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: 'Un compte avec cet email existe déjà' },
        { status: 400 }
      );
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create employee
    const { data, error } = await supabase
      .from('employees')
      .insert({
        first_name: firstName,
        last_name: lastName,
        email,
        password_hash: passwordHash,
        password_set_at: new Date().toISOString(),
        active: true,
        department: 'Général',
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'Erreur lors de la création du compte' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { message: 'Compte créé avec succès', employee: data },
      { status: 201 }
    );
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    );
  }
}
