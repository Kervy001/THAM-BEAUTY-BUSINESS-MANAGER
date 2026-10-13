// Logo de la marque (fichier public/logo.png). Les reçus utilisent le logo des réglages s'il existe.
export const DEFAULT_LOGO = `${import.meta.env.BASE_URL}logo.png`
export const receiptLogo = (settings) => settings?.logo || DEFAULT_LOGO

export default function Logo({ size = 48, className = '' }) {
  return <img src={DEFAULT_LOGO} alt="THAM BEAUTY" width={size} height={size} className={'select-none rounded-full ' + className} draggable="false" />
}
