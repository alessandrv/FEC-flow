'use client'

import { useMemo, useState, useEffect } from 'react'

// Import translation files
import itTranslations from '../../locales/it.json'
import enTranslations from '../../locales/en.json'

type TranslationKey = string
type TranslationParams = Record<string, string | number>

const translations = {
  it: itTranslations,
  en: enTranslations,
}

// Simple locale detection and management
function getLocale(): string {
  if (typeof window === 'undefined') return 'it'
  
  // Check localStorage first
  const saved = localStorage.getItem('locale')
  if (saved && (saved === 'it' || saved === 'en')) {
    return saved
  }
  
  // Check browser language
  const browserLang = navigator.language.toLowerCase()
  if (browserLang.startsWith('it')) return 'it'
  if (browserLang.startsWith('en')) return 'en'
  
  return 'it' // Default to Italian
}

export function useTranslation() {
  const [locale, setLocale] = useState('it')
  
  useEffect(() => {
    setLocale(getLocale())
  }, [])
  
  const changeLocale = (newLocale: 'it' | 'en') => {
    setLocale(newLocale)
    if (typeof window !== 'undefined') {
      localStorage.setItem('locale', newLocale)
    }
  }
  
  const t = useMemo(() => {
    return (key: TranslationKey, params?: TranslationParams): string => {
      const keys = key.split('.')
      let value: any = translations[locale as keyof typeof translations]
      
      for (const k of keys) {
        if (value && typeof value === 'object' && k in value) {
          value = value[k]
        } else {
          // Fallback to Italian if key not found in current locale
          value = translations.it
          for (const fallbackK of keys) {
            if (value && typeof value === 'object' && fallbackK in value) {
              value = value[fallbackK]
            } else {
              return key // Return key if not found in fallback
            }
          }
          break
        }
      }
      
      if (typeof value !== 'string') {
        return key // Return key if final value is not a string
      }
      
      // Replace parameters in the string
      if (params) {
        return value.replace(/\{(\w+)\}/g, (match, paramKey) => {
          return params[paramKey]?.toString() || match
        })
      }
      
      return value
    }
  }, [locale])
  
  return {
    t,
    locale,
    changeLocale,
    isItalian: locale === 'it',
    isEnglish: locale === 'en',
  }
}

// Helper function for components that can't use hooks
export function getTranslation(locale: string, key: TranslationKey, params?: TranslationParams): string {
  const keys = key.split('.')
  let value: any = translations[locale as keyof typeof translations] || translations.it
  
  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k]
    } else {
      // Fallback to Italian
      value = translations.it
      for (const fallbackK of keys) {
        if (value && typeof value === 'object' && fallbackK in value) {
          value = value[fallbackK]
        } else {
          return key
        }
      }
      break
    }
  }
  
  if (typeof value !== 'string') {
    return key
  }
  
  if (params) {
    return value.replace(/\{(\w+)\}/g, (match, paramKey) => {
      return params[paramKey]?.toString() || match
    })
  }
  
  return value
}
