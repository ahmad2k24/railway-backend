import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { languages, changeLanguage } from '@/i18n';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Globe } from 'lucide-react';

export default function LanguageSelector({ variant = 'default' }) {
  const { i18n, t } = useTranslation();
  const [open, setOpen] = useState(false);
  
  // Safely get current language with fallback
  const currentLangCode = i18n?.language || 'en';
  const currentLang = languages.find(l => l.code === currentLangCode) || languages[0];
  
  const handleLanguageChange = (langCode) => {
    try {
      changeLanguage(langCode);
      setOpen(false);
    } catch (e) {
      console.error('Error changing language:', e);
      setOpen(false);
    }
  };
  
  // Safe translation helper
  const safeT = (key, fallback = '') => {
    try {
      return t(key) || fallback;
    } catch {
      return fallback;
    }
  };
  
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`
            border-zinc-400 bg-white text-zinc-700 hover:border-red-500 hover:text-red-500 
            font-mono text-[10px] sm:text-xs h-7 sm:h-8 px-1.5 sm:px-3
            ${variant === 'compact' ? 'w-8 sm:w-auto px-0 sm:px-2' : ''}
          `}
          title={safeT('common.selectLanguage', 'Select Language')}
        >
          <Globe className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          <span className="ml-1 hidden sm:inline">{currentLang?.flag || '🌐'}</span>
          <span className="ml-1 hidden lg:inline">{(currentLang?.name || 'English').split(' ')[0]}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        className="bg-zinc-900 border-zinc-800 min-w-[180px]"
        align="end"
      >
        <div className="px-2 py-1.5 text-xs font-mono text-zinc-500 uppercase tracking-wider border-b border-zinc-800">
          {safeT('common.selectLanguage', 'Select Language')}
        </div>
        {languages.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onSelect={(e) => {
              e.preventDefault();
              handleLanguageChange(lang.code);
            }}
            className={`
              cursor-pointer font-mono text-sm py-2.5
              ${currentLangCode === lang.code 
                ? 'bg-blue-500/20 text-blue-400' 
                : 'text-zinc-300 hover:bg-zinc-800'
              }
            `}
          >
            <span className="mr-3 text-lg">{lang.flag}</span>
            <span className={lang.dir === 'rtl' ? 'font-arabic' : ''}>
              {lang.name}
            </span>
            {currentLangCode === lang.code && (
              <span className="ml-auto text-blue-400">✓</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
