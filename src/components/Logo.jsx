// Logo de la marque. L'app utilise une version légère (logo-sm.webp, ~11 Ko) pour un affichage instantané ;
// les reçus/factures utilisent le grand logo (public/logo.png) ou celui des réglages s'il existe.
export const DEFAULT_LOGO = `${import.meta.env.BASE_URL}logo.png`
export const SMALL_LOGO = `${import.meta.env.BASE_URL}logo-sm.webp`
export const receiptLogo = (settings) => settings?.logo || DEFAULT_LOGO

export default function Logo({ size = 48, className = '' }) {
  return <img src={SMALL_LOGO} alt="THAM BEAUTY" width={size} height={size} className={'select-none rounded-full ' + className} draggable="false" decoding="async" />
}
