'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Mode = 'login' | 'signup'

const DEFAULT_GOALS = {
  meta_calorias: 2000,
  meta_proteinas: 150,
  meta_carbos: 200,
  meta_grasas: 65,
}

async function ensureProfile(userId: string, nombre: string) {
  // ignoreDuplicates evita sobrescribir metas si el perfil ya existe
  return supabase
    .from('profiles')
    .upsert(
      { id: userId, nombre, ...DEFAULT_GOALS },
      { onConflict: 'id', ignoreDuplicates: true }
    )
}

export default function AuthForm({ redirectTo = '/' }: { redirectTo?: string }) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('login')
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const isSignup = mode === 'signup'

  function switchMode() {
    setMode(isSignup ? 'login' : 'signup')
    setError(null)
    setNotice(null)
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setNotice(null)

    try {
      if (isSignup) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { nombre } },
        })
        if (error) throw error

        // Con sesión activa (confirmación de correo desactivada) creamos el perfil ya.
        if (data.user && data.session) {
          const { error: profileError } = await ensureProfile(
            data.user.id,
            nombre.trim()
          )
          if (profileError) throw profileError
          router.replace(redirectTo)
          router.refresh()
          return
        }

        // Si se requiere confirmar el correo, el perfil se crea en el primer inicio de sesión.
        setNotice('Te enviamos un correo para confirmar tu cuenta. Después, inicia sesión.')
        setMode('login')
        return
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) throw error

      if (data.user) {
        const fallbackName =
          (data.user.user_metadata?.nombre as string | undefined) ?? ''
        const { error: profileError } = await ensureProfile(
          data.user.id,
          fallbackName
        )
        if (profileError) throw profileError
      }

      router.replace(redirectTo)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Algo salió mal. Inténtalo de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  const inputClass =
    'w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-base text-neutral-900 placeholder:text-neutral-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/25'

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight text-neutral-900">
        {isSignup ? 'Crea tu cuenta' : 'Bienvenido de nuevo'}
      </h1>
      <p className="mt-2 text-sm text-neutral-600">
        {isSignup
          ? 'Define tus metas diarias y empieza a registrar tus comidas.'
          : 'Inicia sesión para ver tu registro de hoy.'}
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        {isSignup && (
          <div>
            <label htmlFor="nombre" className="mb-1.5 block text-sm font-medium text-neutral-800">
              Nombre
            </label>
            <input
              id="nombre"
              type="text"
              autoComplete="name"
              required
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Tu nombre"
              className={inputClass}
            />
          </div>
        )}

        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-neutral-800">
            Correo electrónico
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tucorreo@ejemplo.com"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-neutral-800">
            Contraseña
          </label>
          <input
            id="password"
            type="password"
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mínimo 6 caracteres"
            className={inputClass}
          />
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-800">
            {notice}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-teal-700 px-4 py-3.5 text-base font-medium text-white transition-colors hover:bg-teal-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? 'Procesando…' : isSignup ? 'Crear cuenta' : 'Iniciar sesión'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-neutral-600">
        {isSignup ? '¿Ya tienes cuenta?' : '¿Aún no tienes cuenta?'}{' '}
        <button
          type="button"
          onClick={switchMode}
          className="font-medium text-teal-700 underline-offset-4 hover:underline focus:outline-none focus-visible:underline"
        >
          {isSignup ? 'Inicia sesión' : 'Regístrate'}
        </button>
      </p>
    </main>
  )
}
