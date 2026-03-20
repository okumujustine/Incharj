import { defineConfig } from 'vitepress'

const isProd = process.env.NODE_ENV === 'production'

export default defineConfig({
  title: 'Incharj',
  description: 'Core engine documentation — architecture, orchestration, connectors, normalization, chunking, indexing, permissions, search, auth',
  cleanUrls: true,
  ignoreDeadLinks: true,
  base: isProd ? '/Incharj/' : '/',

  head: [
    ['link', { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' }],
  ],

  themeConfig: {
    nav: [
      { text: 'Architecture', link: '/architecture' },
      { text: 'Feature Ideas', link: '/feature-ideas' },
      { text: 'Diagram', link: '/architecture-diagram.html', target: '_blank' },
    ],

    sidebar: [
      {
        items: [
          { text: 'Getting Started', link: '/getting-started' },
          { text: 'Architecture', link: '/architecture' },
          { text: 'Core Overview', link: '/indexer' },
          { text: 'Core: Orchestration', link: '/core-orchestration' },
          { text: 'Core: Connectors', link: '/core-connectors' },
          { text: 'Core: Normalization', link: '/core-normalization' },
          { text: 'Core: Chunking', link: '/core-chunking' },
          { text: 'Core: Indexing', link: '/core-indexing' },
          { text: 'Core: Permissions', link: '/core-permissions' },
          { text: 'Search', link: '/search' },
          { text: 'Feature Ideas', link: '/feature-ideas' },
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
