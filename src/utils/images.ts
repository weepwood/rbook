export type PreparedImage = {
  file: File
  width: number | null
  height: number | null
  originalName: string
}

const MAX_EDGE = 2400
const WEBP_QUALITY = 0.84

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith('image/')) throw new Error(`${file.name} 不是支持的图片文件。`)

  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) throw new Error('无法初始化图片处理画布。')
    context.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()

    const blob = await canvasToBlob(canvas, 'image/webp', WEBP_QUALITY)
    if (!blob) throw new Error('浏览器无法压缩该图片。')
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'image'
    const compressed = new File([blob], `${baseName}.webp`, {
      type: 'image/webp',
      lastModified: file.lastModified,
    })

    return {
      file: compressed.size < file.size ? compressed : file,
      width,
      height,
      originalName: file.name,
    }
  } catch {
    return { file, width: null, height: null, originalName: file.name }
  }
}
