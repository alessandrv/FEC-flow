'use client'

import { Button, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem } from "@heroui/react"
import { Globe } from "lucide-react"
import { useTranslation } from "../hooks/useTranslation"

export default function LanguageSwitcher() {
  const { locale, changeLocale, t } = useTranslation()
  
  const languages = [
    { key: 'it', label: 'Italiano', flag: '🇮🇹' },
    { key: 'en', label: 'English', flag: '🇺🇸' },
  ]
  
  const currentLanguage = languages.find(lang => lang.key === locale) || languages[0]
  
  return (
    <Dropdown>
      <DropdownTrigger>
        <Button 
          variant="light" 
          size="sm"
          startContent={<Globe className="w-4 h-4" />}
          className="min-w-0 px-2"
        >
          <span className="hidden sm:inline">{currentLanguage.flag}</span>
          <span className="hidden md:inline ml-1">{currentLanguage.label}</span>
        </Button>
      </DropdownTrigger>
      <DropdownMenu
        aria-label="Language selection"
        onAction={(key) => changeLocale(key as 'it' | 'en')}
        selectedKeys={[locale]}
        selectionMode="single"
      >
        {languages.map((language) => (
          <DropdownItem 
            key={language.key}
            startContent={<span className="text-lg">{language.flag}</span>}
          >
            {language.label}
          </DropdownItem>
        ))}
      </DropdownMenu>
    </Dropdown>
  )
}












