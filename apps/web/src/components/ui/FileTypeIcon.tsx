import {
  FileText,
  FileSpreadsheet,
  FileImage,
  FileCode,
  FileJson,
  File,
  Presentation,
} from 'lucide-react'

interface FileTypeIconProps {
  ext?: string | null
  kind?: string | null
  size?: number
  className?: string
}

function resolveIcon(ext?: string | null, kind?: string | null): {
  icon: React.ElementType
  color: string
} {
  const e = ext?.toLowerCase()
  const k = kind?.toLowerCase()

  if (e === 'pdf')                                return { icon: FileText,        color: '#EF4444' }
  if (e === 'gdoc' || k === 'document')           return { icon: FileText,        color: '#4285F4' }
  if (e === 'gsheet' || k === 'spreadsheet' || e === 'csv' || e === 'xlsx' || e === 'xls')
                                                  return { icon: FileSpreadsheet,  color: '#34A853' }
  if (e === 'gslides' || k === 'presentation' || e === 'pptx' || e === 'ppt')
                                                  return { icon: Presentation,     color: '#FBBC05' }
  if (e === 'md' || e === 'html' || e === 'htm' || e === 'css' || e === 'js' || e === 'ts')
                                                  return { icon: FileCode,         color: '#8B5CF6' }
  if (e === 'json')                               return { icon: FileJson,         color: '#F59E0B' }
  if (e === 'png' || e === 'jpg' || e === 'jpeg' || e === 'gif' || e === 'svg' || e === 'webp')
                                                  return { icon: FileImage,        color: '#EC4899' }
  if (k === 'message')                            return { icon: FileText,         color: '#06B6D4' }
  if (k === 'page')                               return { icon: FileText,         color: '#6366F1' }
  return { icon: File, color: '#9CA3AF' }
}

export function FileTypeIcon({ ext, kind, size = 14, className = '' }: FileTypeIconProps) {
  const { icon: Icon, color } = resolveIcon(ext, kind)
  return <Icon size={size} color={color} className={className} />
}
