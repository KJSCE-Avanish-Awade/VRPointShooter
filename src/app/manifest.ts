import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'VR Point Shooter',
    short_name: 'VR Shooter',
    description: 'Simple VR shooter web game',
    start_url: '/',
    display: 'standalone', // Makes it feel more like a native app
    orientation: 'landscape', // Suggest landscape for VR
    background_color: '#222222',
    theme_color: '#222222',
    // Define icons if you have them (recommended)
    // icons: [
    //   {
    //     src: '/icon-192x192.png',
    //     sizes: '192x192',
    //     type: 'image/png',
    //   },
    //   {
    //     src: '/icon-512x512.png',
    //     sizes: '512x512',
    //     type: 'image/png',
    //   },
    // ],
  }
}
