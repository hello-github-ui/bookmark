/** 首次打开时灌一批示例书签，避免看到空白页；用户删光后不会再灌第二次。 */

import type { Bookmark, Category } from '~shared/model'
import { db, getSetting, setSetting } from './index'
import { SORT_STEP, uid } from '@/utils/id'
import { guessTitleFromUrl } from '@/utils/url'

const SEEDED_KEY = 'seeded.v1'

interface SeedGroup {
  name: string
  icon: string
  color: string
  items: [title: string, url: string, desc: string][]
}

const SEED: SeedGroup[] = [
  {
    name: '常用',
    icon: '⭐',
    color: '#8b5cf6',
    items: [
      ['GitHub', 'https://github.com', '全球最大的代码托管与协作平台'],
      ['哔哩哔哩', 'https://www.bilibili.com', '国内领先的年轻人文化社区'],
      ['知乎', 'https://www.zhihu.com', '有问题，就会有答案'],
      ['豆瓣', 'https://www.douban.com', '书影音记录与同好社区'],
    ],
  },
  {
    name: '开发',
    icon: '💻',
    color: '#3b82f6',
    items: [
      ['MDN Web Docs', 'https://developer.mozilla.org/zh-CN/', '最权威的 Web 技术参考文档'],
      ['Vue.js', 'https://cn.vuejs.org', '渐进式 JavaScript 框架官方中文站'],
      ['Vite', 'https://cn.vitejs.dev', '下一代前端构建工具'],
      ['Can I use', 'https://caniuse.com', '查浏览器特性兼容性'],
      ['Stack Overflow', 'https://stackoverflow.com', '程序员问答社区'],
      ['npm', 'https://www.npmjs.com', 'JavaScript 包管理中心'],
    ],
  },
  {
    name: '设计',
    icon: '🎨',
    color: '#ec4899',
    items: [
      ['Dribbble', 'https://dribbble.com', '设计师作品展示社区'],
      ['Figma', 'https://www.figma.com', '在线协作设计工具'],
      ['unDraw', 'https://undraw.co/illustrations', '免费可商用的扁平插画'],
      ['Coolors', 'https://coolors.co', '快速生成配色方案'],
      ['iconify', 'https://icon-sets.iconify.design', '聚合 20 万+ 开源图标'],
    ],
  },
  {
    name: 'AI 工具',
    icon: '🤖',
    color: '#10b981',
    items: [
      ['Hugging Face', 'https://huggingface.co', '开源模型与数据集社区'],
      ['Kimi', 'https://kimi.moonshot.cn', '长文本对话助手'],
      ['通义千问', 'https://tongyi.aliyun.com', '阿里云大模型助手'],
      ['Civitai', 'https://civitai.com', 'AI 绘画模型分享'],
    ],
  },
  {
    name: '效率',
    icon: '⚡',
    color: '#f59e0b',
    items: [
      ['Notion', 'https://www.notion.so', '笔记、文档与数据库一体'],
      ['Excalidraw', 'https://excalidraw.com', '手绘风白板与流程图'],
      ['TinyPNG', 'https://tinypng.com', '在线压缩 PNG / JPEG'],
      ['JSON Crack', 'https://jsoncrack.com', 'JSON 可视化查看器'],
    ],
  },
]

export async function seedIfEmpty(): Promise<boolean> {
  if (await getSetting(SEEDED_KEY, false)) return false
  const count = await db.categories.count()
  if (count > 0) {
    await setSetting(SEEDED_KEY, true)
    return false
  }

  const ts = Date.now()
  const categories: Category[] = []
  const bookmarks: Bookmark[] = []

  SEED.forEach((group, gi) => {
    const categoryId = uid('cat')
    categories.push({
      id: categoryId,
      name: group.name,
      icon: group.icon,
      color: group.color,
      sort: (gi + 1) * SORT_STEP,
      createdAt: ts,
      updatedAt: ts,
      deletedAt: 0,
    })
    group.items.forEach(([title, url, desc], bi) => {
      bookmarks.push({
        id: uid('bm'),
        categoryId,
        title: title || guessTitleFromUrl(url),
        url,
        desc,
        tags: [],
        icon: '',
        iconMode: 'auto',
        pinned: gi === 0 && bi < 2 ? 1 : 0,
        visits: 0,
        lastVisitAt: 0,
        sort: (bi + 1) * SORT_STEP,
        createdAt: ts,
        updatedAt: ts,
        deletedAt: 0,
      })
    })
  })

  await db.transaction('rw', db.categories, db.bookmarks, db.settings, async () => {
    await db.categories.bulkAdd(categories)
    await db.bookmarks.bulkAdd(bookmarks)
    await db.settings.put({ key: SEEDED_KEY, value: true })
  })
  return true
}
