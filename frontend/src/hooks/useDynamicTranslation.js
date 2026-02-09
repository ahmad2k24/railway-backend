import { useState, useCallback, useRef, useEffect } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';

const API = process.env.REACT_APP_BACKEND_URL || '';

// In-memory cache for translations
const translationCache = {};

/**
 * Hook for translating dynamic database content
 * Automatically translates text when language changes
 */
export function useDynamicTranslation() {
  const { i18n } = useTranslation();
  const [isTranslating, setIsTranslating] = useState(false);
  const pendingTranslations = useRef(new Map());
  
  const currentLanguage = i18n.language;
  
  /**
   * Get cached translation or original text
   */
  const getCached = useCallback((text, targetLang = currentLanguage) => {
    if (!text || targetLang === 'en') return text;
    const cacheKey = `${targetLang}:${text}`;
    return translationCache[cacheKey] || text;
  }, [currentLanguage]);
  
  /**
   * Translate a single text
   */
  const translateText = useCallback(async (text, targetLang = currentLanguage) => {
    if (!text || targetLang === 'en') return text;
    
    const cacheKey = `${targetLang}:${text}`;
    if (translationCache[cacheKey]) {
      return translationCache[cacheKey];
    }
    
    try {
      const response = await axios.post(`${API}/api/translate`, {
        texts: [text],
        target_language: targetLang
      });
      
      const translated = response.data.translations[0];
      translationCache[cacheKey] = translated;
      return translated;
    } catch (error) {
      console.error('Translation error:', error);
      return text;
    }
  }, [currentLanguage]);
  
  /**
   * Translate multiple texts at once (more efficient)
   */
  const translateBatch = useCallback(async (texts, targetLang = currentLanguage) => {
    if (!texts || texts.length === 0 || targetLang === 'en') {
      return texts;
    }
    
    // Filter out already cached and empty texts
    const toTranslate = [];
    const indices = [];
    const results = [...texts];
    
    texts.forEach((text, index) => {
      if (!text) {
        results[index] = text;
        return;
      }
      const cacheKey = `${targetLang}:${text}`;
      if (translationCache[cacheKey]) {
        results[index] = translationCache[cacheKey];
      } else {
        toTranslate.push(text);
        indices.push(index);
      }
    });
    
    if (toTranslate.length === 0) {
      return results;
    }
    
    try {
      setIsTranslating(true);
      const response = await axios.post(`${API}/api/translate`, {
        texts: toTranslate,
        target_language: targetLang
      });
      
      const translations = response.data.translations;
      translations.forEach((translated, i) => {
        const originalText = toTranslate[i];
        const originalIndex = indices[i];
        const cacheKey = `${targetLang}:${originalText}`;
        translationCache[cacheKey] = translated;
        results[originalIndex] = translated;
      });
      
      return results;
    } catch (error) {
      console.error('Batch translation error:', error);
      return texts;
    } finally {
      setIsTranslating(false);
    }
  }, [currentLanguage]);
  
  /**
   * Translate an object's specified fields
   */
  const translateObject = useCallback(async (obj, fields, targetLang = currentLanguage) => {
    if (!obj || targetLang === 'en') return obj;
    
    const textsToTranslate = fields.map(field => obj[field] || '').filter(Boolean);
    if (textsToTranslate.length === 0) return obj;
    
    const translations = await translateBatch(textsToTranslate, targetLang);
    
    const result = { ...obj };
    let translationIndex = 0;
    fields.forEach(field => {
      if (obj[field]) {
        result[`${field}_translated`] = translations[translationIndex];
        translationIndex++;
      }
    });
    
    return result;
  }, [translateBatch, currentLanguage]);
  
  /**
   * Translate array of objects
   */
  const translateArray = useCallback(async (items, fields, targetLang = currentLanguage) => {
    if (!items || items.length === 0 || targetLang === 'en') {
      return items;
    }
    
    // Collect all texts to translate
    const allTexts = [];
    const textMap = []; // Track which text belongs to which item/field
    
    items.forEach((item, itemIndex) => {
      fields.forEach(field => {
        const text = item[field];
        if (text) {
          allTexts.push(text);
          textMap.push({ itemIndex, field });
        }
      });
    });
    
    if (allTexts.length === 0) return items;
    
    const translations = await translateBatch(allTexts, targetLang);
    
    // Map translations back to items
    const results = items.map(item => ({ ...item }));
    textMap.forEach((mapping, index) => {
      const { itemIndex, field } = mapping;
      results[itemIndex][`${field}_translated`] = translations[index];
    });
    
    return results;
  }, [translateBatch, currentLanguage]);
  
  /**
   * Clear translation cache
   */
  const clearCache = useCallback(() => {
    Object.keys(translationCache).forEach(key => delete translationCache[key]);
  }, []);
  
  return {
    currentLanguage,
    isTranslating,
    translateText,
    translateBatch,
    translateObject,
    translateArray,
    getCached,
    clearCache
  };
}

/**
 * Component wrapper for translating text content
 */
export function TranslatedText({ text, fallback = '' }) {
  const [translated, setTranslated] = useState(text);
  const { translateText, currentLanguage } = useDynamicTranslation();
  
  useEffect(() => {
    if (text && currentLanguage !== 'en') {
      translateText(text).then(setTranslated);
    } else {
      setTranslated(text || fallback);
    }
  }, [text, currentLanguage, translateText, fallback]);
  
  return translated || fallback;
}

export default useDynamicTranslation;
