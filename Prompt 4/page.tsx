'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  Beef,
  Droplet,
  Loader2,
  LogOut,
  UtensilsCrossed,
  Wheat,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import AuthForm from '@/components/AuthForm'
import FoodScanner from '@/components/FoodScanner'

interface Profile {
  nombre: string | null
  meta_calorias: number
  meta_proteinas: number
  meta_carbos: number
  meta_grasas: number
}

interface MealLog {
  id: string | number
  plato: string
  calorias: number
  proteinas_g: number
  carbos_g: number
  grasas_g: number
  image_url: string | null
  created_at: string
}

const FALLBACK_GOALS: Profile = {
  nombre: null,
  meta_calorias: 2000,
  meta_proteinas: 150,
  meta_carbos: 200,
  meta_grasas: 65,
}

function todayRange() {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { start: start.toISOString(), end: end.toISOString() }
}

function CalorieRing({ consumed, goal }: { consumed: number; goal: number }) {
  const size = 176
  const stroke = 14
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const ratio = goal > 0 ? consumed / goal : 0
  const offset = circumference * (1 - Math.min(ratio, 1))
  const over = consumed > goal
  const diff = Math.round(Math.abs(goal - consumed))

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        role="img"
        aria-label={`${Math.round(consumed)} de ${Math.round(goal)} calorías consumidas`}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-neutral-100"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={`transition-[stroke-dashoffset] duration-700 ${
            over ? 'stroke-amber-500' : 'stroke-teal-700'
          }`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-4xl font-semibold tabular-nums tracking-tight text-neutral-900">
          {Math.round(consumed)}
        </span>
        <span className="text-xs text-neutral-500">
          de {Math.round(goal)} kcal
        </span>
        <span
          className={`mt-1 text-xs font-medium ${
            over ? 'text-amber-600' : 'text-teal-700'
          }`}
        >
          {over ? `${diff} de más` : `${diff} restantes`}
        </span>
      </div>
    </div>
  )
}

function MacroBar({
  label,
  icon: Icon,
  consumed,
  goal,
}: {
  label: string
  icon: typeof Beef
  consumed: number
  goal: number
}) {
  const pct = goal > 0 ? Math.min((consumed / goal) * 100, 100) : 0
  const over = consumed > goal

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 font-medium text-neutral-800">
          <Icon className="h-4 w-4 text-teal-700" aria-hidden="true" />
          {label}
        </span>
        <span className="tabular-nums text-neutral-500">
          {Math.round(consumed)} / {Math.round(goal)} g
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-neutral-100"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={Math.round(goal)}
        aria-valuenow={Math.round(consumed)}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-700 ${
            over ? 'bg-amber-500' : 'bg-teal-700'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export default function HomePage() {
  // undefined = comprobando sesión, null = sin sesión
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [meals, setMeals] = useState<MealLog[]>([])
  const [loadingData, setLoadingData] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const userId = session?.user.id

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  const loadData = useCallback(async () => {
    if (!userId) return
    setError(null)
    const { start, end } = todayRange()

    const [profileRes, mealsRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('nombre, meta_calorias, meta_proteinas, meta_carbos, meta_grasas')
        .eq('id', userId)
        .maybeSingle(),
      supabase
        .from('meal_logs')
        .select(
          'id, plato, calorias, proteinas_g, carbos_g, grasas_g, image_url, created_at'
        )
        .eq('user_id', userId)
        .gte('created_at', start)
        .lt('created_at', end)
        .order('created_at', { ascending: false }),
    ])

    if (profileRes.error || mealsRes.error) {
      setError('No se pudieron cargar tus datos. Recarga la página para reintentar.')
    }
    setProfile((profileRes.data as Profile | null) ?? null)
    setMeals((mealsRes.data as MealLog[] | null) ?? [])
  }, [userId])

  useEffect(() => {
    if (!userId) {
      setProfile(null)
      setMeals([])
      return
    }
    setLoadingData(true)
    loadData().finally(() => setLoadingData(false))
  }, [userId, loadData])

  const totals = useMemo(
    () =>
      meals.reduce(
        (acc, m) => ({
          calorias: acc.calorias + Number(m.calorias || 0),
          proteinas: acc.proteinas + Number(m.proteinas_g || 0),
          carbos: acc.carbos + Number(m.carbos_g || 0),
          grasas: acc.grasas + Number(m.grasas_g || 0),
        }),
        { calorias: 0, proteinas: 0, carbos: 0, grasas: 0 }
      ),
    [meals]
  )

  const goals = profile ?? FALLBACK_GOALS

  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  if (session === undefined) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-neutral-50">
        <Loader2 className="h-6 w-6 animate-spin text-teal-700" aria-label="Cargando" />
      </main>
    )
  }

  if (!session) {
    return (
      <div className="min-h-dvh bg-neutral-50">
        <AuthForm />
      </div>
    )
  }

  const firstName =
    profile?.nombre?.trim().split(' ')[0] ||
    (session.user.user_metadata?.nombre as string | undefined)?.split(' ')[0] ||
    null

  const dateLabel = new Date().toLocaleDateString('es', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  return (
    <main className="min-h-dvh bg-neutral-50 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[env(safe-area-inset-top)]">
      <div className="mx-auto w-full max-w-md space-y-4 px-4 pt-6">
        <header className="flex items-start justify-between">
          <div>
            <p className="text-sm capitalize text-neutral-500">{dateLabel}</p>
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
              {firstName ? `Hola, ${firstName}` : 'Hoy'}
            </h1>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            aria-label="Cerrar sesión"
            className="rounded-full border border-neutral-200 bg-white p-2.5 text-neutral-600 transition-colors hover:bg-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <section
          aria-label="Resumen de hoy"
          className="rounded-3xl border border-neutral-200/70 bg-white p-5 shadow-sm"
        >
          {loadingData && meals.length === 0 && !profile ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-teal-700" aria-label="Cargando" />
            </div>
          ) : (
            <>
              <CalorieRing consumed={totals.calorias} goal={goals.meta_calorias} />
              <div className="mt-6 space-y-4">
                <MacroBar
                  label="Proteínas"
                  icon={Beef}
                  consumed={totals.proteinas}
                  goal={goals.meta_proteinas}
                />
                <MacroBar
                  label="Carbohidratos"
                  icon={Wheat}
                  consumed={totals.carbos}
                  goal={goals.meta_carbos}
                />
                <MacroBar
                  label="Grasas"
                  icon={Droplet}
                  consumed={totals.grasas}
                  goal={goals.meta_grasas}
                />
              </div>
            </>
          )}
        </section>

        <section
          aria-label="Comidas de hoy"
          className="rounded-3xl border border-neutral-200/70 bg-white p-5 shadow-sm"
        >
          <h2 className="mb-3 text-base font-semibold text-neutral-900">
            Comidas de hoy
          </h2>

          {meals.length === 0 ? (
            <p className="py-4 text-center text-sm text-neutral-500">
              Aún no registras nada hoy. Toma una foto de tu próxima comida.
            </p>
          ) : (
            <ul className="space-y-3">
              {meals.map((meal) => (
                <li key={meal.id} className="flex items-center gap-3">
                  {meal.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={meal.image_url}
                      alt={meal.plato}
                      loading="lazy"
                      className="h-14 w-14 shrink-0 rounded-xl bg-neutral-100 object-cover"
                    />
                  ) : (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-neutral-400">
                      <UtensilsCrossed className="h-5 w-5" aria-hidden="true" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-neutral-900">
                      {meal.plato}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {new Date(meal.created_at).toLocaleTimeString('es', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-medium tabular-nums text-neutral-800">
                    {Math.round(Number(meal.calorias))} kcal
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          aria-label="Registrar comida"
          className="rounded-3xl border border-neutral-200/70 bg-white shadow-sm"
        >
          <FoodScanner
            onSaved={() => {
              loadData()
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
          />
        </section>
      </div>
    </main>
  )
}
