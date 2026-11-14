import { NextResponse } from 'next/server'
import { GoogleGenAI, Type } from '@google/genai'

export const runtime = 'nodejs'

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    plato: { type: Type.STRING },
    calorias: { type: Type.NUMBER },
    proteinas_g: { type: Type.NUMBER },
    carbos_g: { type: Type.NUMBER },
    grasas_g: { type: Type.NUMBER },
    descripcion: { type: Type.STRING },
  },
  required: [
    'plato',
    'calorias',
    'proteinas_g',
    'carbos_g',
    'grasas_g',
    'descripcion',
  ],
  propertyOrdering: [
    'plato',
    'calorias',
    'proteinas_g',
    'carbos_g',
    'grasas_g',
    'descripcion',
  ],
}

interface AnalyzeBody {
  imageBase64?: string
  mimeType?: string
  userNotes?: string
}

export async function POST(request: Request) {
  try {
    const { imageBase64, mimeType, userNotes }: AnalyzeBody = await request.json()

    if (!imageBase64 || typeof imageBase64 !== 'string' || !mimeType || typeof mimeType !== 'string') {
      return NextResponse.json(
        { error: 'Se requieren imageBase64 y mimeType.' },
        { status: 400 }
      )
    }

    // Por si el cliente envía un data URL completo ("data:image/jpeg;base64,...")
    const data = imageBase64.replace(/^data:[^;]+;base64,/, '')

    const prompt = `Analiza esta foto de comida. Estima las porciones y macros. Ten en cuenta esta nota del usuario: ${
      userNotes?.trim() || 'Sin notas.'
    }`

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [
        {
          role: 'user',
          parts: [{ inlineData: { mimeType, data } }, { text: prompt }],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema,
      },
    })

    const text = response.text
    if (!text) {
      throw new Error('Gemini devolvió una respuesta vacía.')
    }

    return NextResponse.json(JSON.parse(text))
  } catch (error) {
    console.error('[api/analyze]', error)
    return NextResponse.json(
      { error: 'No se pudo analizar la imagen.' },
      { status: 500 }
    )
  }
}
