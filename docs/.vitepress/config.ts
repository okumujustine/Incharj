import { defineConfig } from 'vitepress'

const isProd = process.env.NODE_ENV === 'production'

export default defineConfig({
  title: 'Incharj',
  description: 'Multi-tenant document intelligence platform — developer documentation',
  cleanUrls: true,
  base: isProd ? '/docs/' : '/',

  head: [
    ['link', { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' }],
  ],

  themeConfig: {
    nav: [
      { text: 'Guide', link: '/overview' },
      { text: 'API Reference', link: '/api' },
      { text: 'Architecture Diagram', link: '/architecture-diagram.html', target: '_blank' },
    ],

    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'Overview', link: '/overview' },
          { text: 'Getting Started', link: '/getting-started' },
        ],
      },
      {
        text: 'System Design',
        items: [
          { text: 'Architecture', link: '/architecture' },
          { text: 'Database', link: '/database' },
          { text: 'Authentication', link: '/auth' },
        ],
      },
      {
        text: 'Backend',
        items: [
          { text: 'Backend Overview', link: '/backend' },
          { text: 'Connectors', link: '/connectors' },
          { text: 'Search', link: '/search' },
          { text: 'Workers', link: '/workers' },
        ],
      },
      {
        text: 'Frontend',
        items: [
          { text: 'Frontend Overview', link: '/frontend' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'API Reference', link: '/api' },
        ],
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/okumujustine/Incharj' },
    ],

    search: {
      provider: 'local',
    },

    editLink: {
      pattern: 'https://github.com/okumujustine/Incharj/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
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
