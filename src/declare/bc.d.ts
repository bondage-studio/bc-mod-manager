let TranslationLanguage: string
let Player: any
let CurrentModule: string
let CurrentScreen: string
function ServerIsLoggedIn(): boolean

declare const LZString: {
  compressToBase64(input: string): string
  decompressFromBase64(input: string): string | null
}
