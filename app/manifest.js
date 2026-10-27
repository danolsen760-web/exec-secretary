export default function manifest() {
  return {
    name: 'Cienega Exec Secretary',
    short_name: 'Exec Sec',
    description: 'Agendas, interviews, and reminders for the ward executive secretary',
    start_url: '/',
    display: 'standalone',
    background_color: '#f3f5f8',
    theme_color: '#1f4e79',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  };
}
