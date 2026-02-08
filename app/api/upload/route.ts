import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"

const s3Client = new S3Client({
  region: "auto",
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
  },
})

const S3_BUCKET = process.env.S3_BUCKET_NAME

const ALLOWED_EXTENSIONS: Record<string, { mime: string; folder: "images" | "videos" }> = {
  jpg: { mime: "image/jpeg", folder: "images" },
  jpeg: { mime: "image/jpeg", folder: "images" },
  png: { mime: "image/png", folder: "images" },
  gif: { mime: "image/gif", folder: "images" },
  webp: { mime: "image/webp", folder: "images" },
  mp4: { mime: "video/mp4", folder: "videos" },
  webm: { mime: "video/webm", folder: "videos" },
  mov: { mime: "video/quicktime", folder: "videos" },
  mkv: { mime: "video/x-matroska", folder: "videos" },
}

function getExtensionFromMime(mimeType: string): string | null {
  for (const [ext, config] of Object.entries(ALLOWED_EXTENSIONS)) {
    if (config.mime === mimeType) return ext
  }
  return null
}

async function uploadToS3(buffer: Buffer, ext: string, mime: string, folder: "images" | "videos"): Promise<string> {
  const key = `${folder}/${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`
  
  await s3Client.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mime,
    })
  )
  
  const publicBaseUrl = process.env.S3_PUBLIC_URL
  if (!publicBaseUrl) {
    throw new Error("S3_PUBLIC_URL not configured")
  }
  
  return `${publicBaseUrl.replace(/\/$/, "")}/${key}`
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    const rawExt = file.name.split(".").pop()?.toLowerCase() || ""
    let ext = rawExt
    let config = ALLOWED_EXTENSIONS[ext]

    if (!config) {
      const extFromMime = getExtensionFromMime(file.type)
      if (extFromMime) {
        ext = extFromMime
        config = ALLOWED_EXTENSIONS[ext]
      }
    }

    if (!config) {
      return NextResponse.json(
        { error: "Invalid file type. Allowed: JPEG, PNG, GIF, WebP, MP4, WebM, MOV, MKV" },
        { status: 400 }
      )
    }

    const maxSize = 100 * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json({ error: "File too large. Max 100MB" }, { status: 400 })
    }

    if (!S3_BUCKET || !process.env.S3_ACCESS_KEY_ID) {
      return NextResponse.json({ error: "S3 not configured" }, { status: 500 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const url = await uploadToS3(buffer, ext, config.mime, config.folder)

    return NextResponse.json({ url })
  } catch (error) {
    console.error("Upload error:", error)
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}
