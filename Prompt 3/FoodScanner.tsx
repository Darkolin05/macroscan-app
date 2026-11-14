'use client'

import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import {
  AlertCircle,
  Beef,
  Camera,
  Check,
  Droplet,
  Flame,
  Loader2,
  RotateCcw,
  Sparkles,
  Wheat,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

const MAX_WIDTH = 800
const JPEG_QUALITY = 0.75
const BUCKET = 'meal-photos'

type Status = 'idle' | 'preview' | 'analyzing' | 'review' | 'saving'

interface Analysis {
  plato: string
  calorias: number
  proteinas_g: number
  carbos_g: number
  grasas_g: number
  descripcion: string
}

interface FormState {
  plato: string
  calorias: string
  proteinas_g: string
  carbos_g: string
  grasas_g: string
  descripcion: string
}

interface CompressedImage {
  blob: Blob
  base64: string
  previewUrl: string
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('No se pudo leer la imagen.'))
    }
    img.src = url
  })
}

async function compressImage(file: File): Promise<CompressedImage> {
  const img = await loadImage(file)
  const scale = Math.min(1, MAX_WIDTH / img.width)
  const width = Math.round(img.width * scale)
  const height = Math.round(img.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Tu navegador no soporta canvas.')
  ctx.drawImage(img, 0, 0, width, height)

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('No se pudo comprimir la imagen.'))),
      'image/jpeg',
      JPEG_QUALITY
    )
  })

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('No se pudo procesar la imagen.'))
    reader.readAsDataURL(blob)
  })

  return {
    blob,
    base64: dataUrl.split(',')[1],
    previewUrl: URL.createObjectURL(blob),
  }
}

function toFormState(a: Analysis): FormState {
  return {
    plato: a.plato,
    calorias: String(Math.round(a.calorias)),
    proteinas_g: String(Math.round(a.proteinas_g * 10) / 10),
    carbos_g: String(Math.round(a.carbos_g * 10) / 10),
    grasas_g: String(Math.round(a.grasas_g * 10) / 10),
    descripcion: a.descripcion,
  }
}

function MacroField({
  label,
  unit,
  icon: Icon,
  value,
  onChange,
}: {
  label: string
  unit: string
  icon: typeof Flame
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-neutral-800">
        <Icon className="h-4 w-4 text-teal-700" aria-hidden="true" />
        {label}
      </span>
      <div className="relative">
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-xl border border-neutral-300 bg-white py-3 pl-4 pr-10 text-base text-neutral-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/25"
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-neutral-500">
          {unit}
        </span>
      </div>
    </label>
  )
}

export default function FoodScanner({ onSaved }: { onSaved?: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [image, setImage] = useState<CompressedImage | null>(null)
  const [notes, setNotes] = useState('')
  const [form, setForm] = useState<FormState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Libera la URL de la vista previa al cambiar de imagen o desmontar
  useEffect(() => {
    return () => {
      if (image) URL.revokeObjectURL(image.previewUrl)
    }
  }, [image])

  function reset() {
    setImage(null)
    setNotes('')
    setForm(null)
    setError(null)
    setStatus('idle')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setSaved(false)
    setForm(null)

    try {
      const compressed = await compressImage(file)
      setImage(compressed)
      setStatus('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo procesar la foto.')
      setStatus('idle')
    } finally {
      e.target.value = ''
    }
  }

  async function handleAnalyze() {
    if (!image) return
    setStatus('analyzing')
    setError(null)

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: image.base64,
          mimeType: 'image/jpeg',
          userNotes: notes.trim(),
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? 'No se pudo analizar la imagen.')
      }
      const data: Analysis = await res.json()
      setForm(toFormState(data))
      setStatus('review')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo analizar la imagen.')
      setStatus('preview')
    }
  }

  function updateField(key: keyof FormState, value: string) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  async function handleConfirm() {
    if (!image || !form) return

    const calorias = Number(form.calorias)
    const proteinas_g = Number(form.proteinas_g)
    const carbos_g = Number(form.carbos_g)
    const grasas_g = Number(form.grasas_g)

    if (!form.plato.trim()) {
      setError('Escribe el nombre del plato.')
      return
    }
    if (
      [calorias, proteinas_g, carbos_g, grasas_g].some(
        (n) => !Number.isFinite(n) || n < 0
      )
    ) {
      setError('Revisa que los valores nutricionales sean números válidos.')
      return
    }

    setStatus('saving')
    setError(null)
    let uploadedPath: string | null = null

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()
      if (userError || !user) throw new Error('Debes iniciar sesión para guardar.')

      const path = `${user.id}/${Date.now()}.jpg`
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, image.blob, { contentType: 'image/jpeg' })
      if (uploadError) throw uploadError
      uploadedPath = path

      const {
        data: { publicUrl },
      } = supabase.storage.from(BUCKET).getPublicUrl(path)

      const { error: insertError } = await supabase.from('meal_logs').insert({
        user_id: user.id,
        plato: form.plato.trim(),
        calorias,
        proteinas_g,
        carbos_g,
        grasas_g,
        descripcion: form.descripcion.trim(),
        image_url: publicUrl,
      })
      if (insertError) throw insertError

      reset()
      setSaved(true)
      onSaved?.()
    } catch (err) {
      // Evita dejar fotos huérfanas si falló el registro
      if (uploadedPath) {
        await supabase.storage.from(BUCKET).remove([uploadedPath])
      }
      setError(err instanceof Error ? err.message : 'No se pudo guardar la comida.')
      setStatus('review')
    }
  }

  const busy = status === 'analyzing' || status === 'saving'

  const primaryButton =
    'flex w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-3.5 text-base font-medium text-white transition-colors hover:bg-teal-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60'
  const secondaryButton =
    'flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-300 bg-white px-4 py-3 text-base font-medium text-neutral-800 transition-colors hover:bg-neutral-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60'

  return (
    <section className="mx-auto w-full max-w-sm space-y-5 px-6 py-8">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFile}
        className="hidden"
      />

      {status === 'idle' && (
        <div className="space-y-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-neutral-900">
              Registra tu comida
            </h2>
            <p className="mt-1 text-sm text-neutral-600">
              Toma una foto del plato y estimamos las calorías y los macros.
            </p>
          </div>

          {saved && (
            <p
              role="status"
              className="flex items-center gap-2 rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-800"
            >
              <Check className="h-4 w-4" aria-hidden="true" />
              Comida guardada.
            </p>
          )}

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={primaryButton}
          >
            <Camera className="h-5 w-5" aria-hidden="true" />
            Tomar foto
          </button>
        </div>
      )}

      {image && status !== 'idle' && (
        <div className="overflow-hidden rounded-2xl bg-neutral-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image.previewUrl}
            alt="Vista previa de tu comida"
            className="aspect-[4/3] w-full object-cover"
          />
        </div>
      )}

      {(status === 'preview' || status === 'analyzing') && (
        <div className="space-y-4">
          <div>
            <label
              htmlFor="notes"
              className="mb-1.5 block text-sm font-medium text-neutral-800"
            >
              Notas (opcional)
            </label>
            <textarea
              id="notes"
              rows={3}
              value={notes}
              disabled={busy}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej. tiene mucho queso"
              className="w-full resize-none rounded-xl border border-neutral-300 bg-white px-4 py-3 text-base text-neutral-900 placeholder:text-neutral-400 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/25 disabled:opacity-60"
            />
          </div>

          <button
            type="button"
            onClick={handleAnalyze}
            disabled={busy}
            className={primaryButton}
          >
            {status === 'analyzing' ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                Analizando…
              </>
            ) : (
              <>
                <Sparkles className="h-5 w-5" aria-hidden="true" />
                Analizar comida
              </>
            )}
          </button>

          <button
            type="button"
            onClick={reset}
            disabled={busy}
            className={secondaryButton}
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Tomar otra foto
          </button>
        </div>
      )}

      {(status === 'review' || status === 'saving') && form && (
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-neutral-900">
              Revisa los valores
            </h2>
            <p className="mt-1 text-sm text-neutral-600">
              Son estimaciones. Corrige lo que no coincida antes de guardar.
            </p>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-neutral-800">
              Plato
            </span>
            <input
              type="text"
              value={form.plato}
              disabled={busy}
              onChange={(e) => updateField('plato', e.target.value)}
              className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-base text-neutral-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/25 disabled:opacity-60"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <MacroField
              label="Calorías"
              unit="kcal"
              icon={Flame}
              value={form.calorias}
              onChange={(v) => updateField('calorias', v)}
            />
            <MacroField
              label="Proteínas"
              unit="g"
              icon={Beef}
              value={form.proteinas_g}
              onChange={(v) => updateField('proteinas_g', v)}
            />
            <MacroField
              label="Carbohidratos"
              unit="g"
              icon={Wheat}
              value={form.carbos_g}
              onChange={(v) => updateField('carbos_g', v)}
            />
            <MacroField
              label="Grasas"
              unit="g"
              icon={Droplet}
              value={form.grasas_g}
              onChange={(v) => updateField('grasas_g', v)}
            />
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-neutral-800">
              Descripción
            </span>
            <textarea
              rows={3}
              value={form.descripcion}
              disabled={busy}
              onChange={(e) => updateField('descripcion', e.target.value)}
              className="w-full resize-none rounded-xl border border-neutral-300 bg-white px-4 py-3 text-base text-neutral-900 focus:border-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-700/25 disabled:opacity-60"
            />
          </label>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy}
            className={primaryButton}
          >
            {status === 'saving' ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                Guardando…
              </>
            ) : (
              <>
                <Check className="h-5 w-5" aria-hidden="true" />
                Confirmar y guardar
              </>
            )}
          </button>

          <button
            type="button"
            onClick={reset}
            disabled={busy}
            className={secondaryButton}
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Descartar
          </button>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </section>
  )
}
