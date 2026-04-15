import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

export default withMermaid(
  defineConfig({
    title: 'Incharj Docs',
    description: 'Internal engineering documentation for the Incharj platform',
    cleanUrls: true,
    mermaid: {},
    themeConfig: {
      nav: [
        { text: 'Home', link: '/' },
        { text: 'Architecture', link: '/architecture/conversation-flow' },
      ],
      sidebar: [
        {
          text: 'Architecture',
          items: [
            { text: 'Conversation Flow', link: '/architecture/conversation-flow' },
            { text: 'Indexing Flow', link: '/architecture/indexing-flow' },
          ],
        },
      ],
      socialLinks: [],
      footer: {
        message: 'Incharj internal documentation',
      },
    },
  })
)
