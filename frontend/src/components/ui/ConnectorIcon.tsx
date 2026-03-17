import { SiGoogledrive, SiNotion, SiSlack } from 'react-icons/si'

const ICONS: Record<string, { icon: React.ElementType; color: string }> = {
  google_drive: { icon: SiGoogledrive, color: '#4285F4' },
  notion:       { icon: SiNotion,      color: '#888888' },
  slack:        { icon: SiSlack,       color: '#E01E5A' },
}

interface ConnectorIconProps {
  kind: string
  size?: number
  className?: string
}

export function ConnectorIcon({ kind, size = 14, className = '' }: ConnectorIconProps) {
  const entry = ICONS[kind]
  if (!entry) return null
  const Icon = entry.icon
  return <Icon size={size} color={entry.color} className={className} />
}
