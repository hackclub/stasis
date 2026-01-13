import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"

const CDN_API_URL = "https://cdn.hackclub.com/api/v3/new"
const CDN_TOKEN = process.env.HACKCLUB_CDN_TOKEN

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!CDN_TOKEN) {
    return NextResponse.json({ error: "CDN not configured" }, { status: 500 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    const allowedTypes = [
      "image/jpeg", "image/png", "image/gif", "image/webp",
      "video/mp4", "video/webm", "video/quicktime"
    ]
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: "Invalid file type. Use JPEG, PNG, GIF, WebP, MP4, WebM, or MOV" }, { status: 400 })
    }

    const maxSize = 50 * 1024 * 1024 // 50MB
    if (file.size > maxSize) {
      return NextResponse.json({ error: "File too large. Max 50MB" }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString("base64")
    const dataUrl = `data:${file.type};base64,${base64}`

    const cdnResponse = await fetch(CDN_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${CDN_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([dataUrl]),
    })

    if (!cdnResponse.ok) {
      const errorText = await cdnResponse.text()
      console.error("CDN upload failed:", errorText)
      return NextResponse.json({ error: "Failed to upload to CDN" }, { status: 500 })
    }

    const cdnData = await cdnResponse.json()
    const uploadedFile = cdnData.files?.[0]

    if (!uploadedFile?.deployedUrl) {
      return NextResponse.json({ error: "CDN returned invalid response" }, { status: 500 })
    }

    return NextResponse.json({ url: uploadedFile.deployedUrl })
  } catch (error) {
    console.error("Upload error:", error)
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}
