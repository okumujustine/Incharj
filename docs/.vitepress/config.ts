import { defineConfig } from 'vitepress'

const isProd = process.env.NODE_ENV === 'production'

export default defineConfig({
  title: 'Incharj',
  description: 'Core engine documentation — indexer, search, architecture, auth',
  cleanUrls: true,
  base: isProd ? '/Incharj/' : '/',

  head: [
    ['link', { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' }],
  ],

  themeConfig: {
    nav: [
      { text: 'Architecture', link: '/architecture' },
      { text: 'Diagram', link: '/architecture-diagram.html', target: '_blank' },
    ],

    sidebar: [
      {
        items: [
          { text: 'Getting Started', link: '/getting-started' },
          { text: 'Architecture', link: '/architecture' },
          { text: 'Indexer', link: '/indexer' },
          { text: 'Search', link: '/search' },
          { text: 'Authentication', link: '/auth' },
        ],
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/okumujustine/Incharj' },
    ],

    search: {
      provider: 'local',
    },

    footer: {
      message: 'Incharj internal developer documentation',
    },
  },

  markdown: {
    theme: {
      light: 'github-light',
      dark: 'github-dark',
    },
  },
})
