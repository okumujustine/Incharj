import React from 'react'

interface IncharjLogoProps {
  /** Size of the icon mark in px */
  size?: number
  /** Show the wordmark next to the icon */
  wordmark?: boolean
  className?: string
}

export function IncharjLogo({ size = 28, wordmark = true, className = '' }: IncharjLogoProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Container */}
        <rect width="32" height="32" rx="6" fill="#4f9cf9" fillOpacity="0.1" />
        <rect width="32" height="32" rx="6" stroke="#4f9cf9" strokeOpacity="0.3" strokeWidth="1" />

        {/*
          Creative "i" mark:
          - The dot is a solid filled circle with a faint ring around it
            (like a power/charge indicator — "in charge")
          - The stem is a rounded rectangle
        */}

        {/* Dot glow ring */}
        <circle cx="16" cy="9.5" r="4.5" fill="#4f9cf9" fillOpacity="0.2" />

        {/* Dot solid */}
        <circle cx="16" cy="9.5" r="3" fill="#4f9cf9" />

        {/* Stem */}
        <rect x="13" y="16" width="6" height="11" rx="3" fill="#4f9cf9" />
      </svg>

      {wordmark && (
        <span
          style={{ fontFamily: 'Inter, sans-serif', letterSpacing: '-0.02em' }}
          className="text-sm font-semibold text-text-primary"
        >
          Incharj
        </span>
      )}
    </div>
  )
}
