'use client'

import { mnemonicToEntropy, validateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english.js'

const WORD_SET = new Set(wordlist)

export function isBip39Word(word: string): boolean {
  return WORD_SET.has(word.trim().toLowerCase())
}

export function bip39Suggestions(prefix: string, max = 6): string[] {
  const p = prefix.trim().toLowerCase()
  if (!p) return []
  const out: string[] = []
  for (const w of wordlist) {
    if (w.startsWith(p)) {
      out.push(w)
      if (out.length >= max) break
    }
  }
  return out
}

/** Validate full phrase (length + words + checksum). */
export function validatePhrase(words: string[]): boolean {
  if (words.length !== 12) return false
  if (!words.every(isBip39Word)) return false
  return validateMnemonic(words.join(' ').toLowerCase(), wordlist)
}

/** Parse a hestia://auth?w=... QR payload into a word array. Throws on bad shape. */
export function parseQrPayload(payload: string): string[] {
  const prefix = 'hestia://auth?w='
  if (!payload.startsWith(prefix)) throw new Error('not a Hestia auth QR')
  const words = payload.slice(prefix.length).split('+').map((w) => w.toLowerCase())
  if (words.length !== 12) throw new Error(`expected 12 words, got ${words.length}`)
  return words
}

export function wordsToQrPayload(words: string[]): string {
  return 'hestia://auth?w=' + words.map((w) => w.toLowerCase()).join('+')
}

export { wordlist, mnemonicToEntropy }
