import { useEffect } from 'react'

const ICON_URL = '/Hire_Flow_icon-removebg.png?v=3'
const ICON_TYPE = 'image/png'

/**
 * Imperatively writes/replaces ALL favicon <link> tags in <head>.
 * Runs once at app boot. This overrides any stale favicon Chrome cached
 * from old deploys where favicon.png / apple-touch-icon.png returned 404.
 *
 * Must be called inside a component that is always mounted (e.g. App.jsx).
 */
export function useFavicon() {
  useEffect(() => {
    // Remove every existing icon link the browser may have cached
    document
      .querySelectorAll("link[rel~='icon'], link[rel='shortcut icon'], link[rel='apple-touch-icon']")
      .forEach(el => el.remove())

    const sizes = [
      { rel: 'icon',             sizes: '16x16'  },
      { rel: 'icon',             sizes: '32x32'  },
      { rel: 'icon',             sizes: '48x48'  },
      { rel: 'icon',             sizes: '192x192'},
      { rel: 'shortcut icon',    sizes: null      },
      { rel: 'apple-touch-icon', sizes: '180x180'},
    ]

    sizes.forEach(({ rel, sizes: sz }) => {
      const link = document.createElement('link')
      link.rel   = rel
      link.type  = ICON_TYPE
      link.href  = ICON_URL
      if (sz) link.setAttribute('sizes', sz)
      document.head.appendChild(link)
    })
  }, [])
}
