/**
 * 书签自动归类引擎。
 *
 * 设计原则：纯本地、零依赖、不联网。522 条书签毫秒级跑完，离线也能用。
 *
 * 判定用三类信号加权打分，取总分最高的分类：
 *
 *   1. 域名表      —— 最可靠。github.com 一定是开发，zhaopin.com 一定是求职。
 *   2. 原文件夹路径 —— 其次可靠，因为那是用户自己整理的。
 *                     越深的层级越具体，权重越高：
 *                     「书签栏 / Tools / VPS」里 VPS 比 Tools 更能说明问题。
 *   3. 标题/网址关键词 —— 兜底，权重最低，容易误伤。
 *
 * 总分低于阈值就丢进「未分类」，不硬猜。反正有预览步骤，用户能改。
 */

/* ------------------------------------------------------------------ 分类定义 */

export type CategoryKey =
  | 'dev'
  | 'ai'
  | 'design'
  | 'efficiency'
  | 'cloud'
  | 'career'
  | 'learn'
  | 'media'
  | 'social'
  | 'other'

export interface CategoryPreset {
  key: CategoryKey
  name: string
  icon: string
  color: string
}

/**
 * 目标分类。名字刻意和 seed.ts 里的默认分类保持一致
 * （开发 / 设计 / AI 工具 / 效率），这样整理时会复用已有分类而不是建重复的。
 *
 * 注意「常用」不在这里 —— 它表达的是使用频率而不是功能，
 * 自动归类没法判断，留给用户手动放和「最常访问」智能视图。
 */
export const CATEGORY_PRESETS: CategoryPreset[] = [
  { key: 'dev', name: '开发', icon: '💻', color: '#3b82f6' },
  { key: 'ai', name: 'AI 工具', icon: '🤖', color: '#10b981' },
  { key: 'design', name: '设计', icon: '🎨', color: '#ec4899' },
  { key: 'efficiency', name: '效率', icon: '⚡', color: '#f59e0b' },
  { key: 'cloud', name: '云服务运维', icon: '☁️', color: '#06b6d4' },
  { key: 'career', name: '求职考公', icon: '📋', color: '#ef4444' },
  { key: 'learn', name: '学习阅读', icon: '📚', color: '#8b5cf6' },
  { key: 'media', name: '影音娱乐', icon: '🎬', color: '#f43f5e' },
  { key: 'social', name: '资讯社区', icon: '💬', color: '#14b8a6' },
  { key: 'other', name: '未分类', icon: '📁', color: '' },
]

export const PRESET_BY_KEY: Record<CategoryKey, CategoryPreset> = CATEGORY_PRESETS.reduce(
  (acc, p) => {
    acc[p.key] = p
    return acc
  },
  {} as Record<CategoryKey, CategoryPreset>,
)

/* ------------------------------------------------------------------ 域名规则 */

/**
 * 域名 → 分类。键是「可注册域名」或更精确的主机后缀。
 * 匹配时从完整主机名逐级向上剥离，越精确的键优先命中，
 * 所以 `console.aliyun.com` 能被 `aliyun.com` 捕获，
 * 而 `mp.weixin.qq.com` 会先于 `qq.com` 命中自己那条。
 */
const DOMAIN_RULES: Record<string, CategoryKey> = {}

function addDomains(key: CategoryKey, domains: string): void {
  for (const d of domains.split(/\s+/)) {
    const clean = d.trim().toLowerCase()
    if (clean) DOMAIN_RULES[clean] = key
  }
}

addDomains(
  'dev',
  `
  github.com gist.github.com raw.githubusercontent.com gitlab.com gitee.com bitbucket.org
  codeberg.org sourceforge.net git-scm.com
  stackoverflow.com stackexchange.com superuser.com serverfault.com askubuntu.com
  segmentfault.com juejin.cn csdn.net cnblogs.com oschina.net learnku.com
  npmjs.com yarnpkg.com pnpm.io pypi.org crates.io packagist.org rubygems.org
  mvnrepository.com search.maven.org nuget.org
  developer.mozilla.org w3schools.com caniuse.com web.dev html5rocks.com
  nodejs.org python.org go.dev golang.org rust-lang.org php.net ruby-lang.org
  oracle.com openjdk.org java.com kotlinlang.org scala-lang.org swift.org
  typescriptlang.org javascript.info es6.ruanyifeng.com
  vuejs.org cn.vuejs.org react.dev reactjs.org zh-hans.react.dev angular.io angular.dev
  svelte.dev solidjs.com nuxt.com nextjs.org remix.run astro.build
  vitejs.dev cn.vitejs.dev vite.dev webpack.js.org rollupjs.org esbuild.github.io
  babeljs.io eslint.org prettier.io vitest.dev jestjs.io playwright.dev cypress.io
  tailwindcss.com getbootstrap.com sass-lang.com lesscss.org
  element-plus.org element.eleme.cn antdv.com ant.design arco.design naiveui.com
  vant-ui.github.io uiverse.io echarts.apache.org d3js.org threejs.org
  pinia.vuejs.org vuex.vuejs.org router.vuejs.org axios-http.com
  spring.io springframework.org mybatis.org tomcat.apache.org maven.apache.org
  gradle.org apache.org kafka.apache.org hive.apache.org hadoop.apache.org
  spark.apache.org flink.apache.org zookeeper.apache.org hbase.apache.org
  clickhouse.com doris.apache.org starrocks.io presto.io trino.io
  mysql.com mariadb.org postgresql.org sqlite.org redis.io mongodb.com
  elastic.co neo4j.com influxdata.com
  docker.com hub.docker.com kubernetes.io k8s.io helm.sh
  leetcode.cn leetcode.com nowcoder.com codetop.cc hot100 runoob.com
  liaoxuefeng.com pdai.tech javaguide.cn xiaolincoding.com yuanjin.tech
  greasyfork.org tampermonkey.net violentmonkey.github.io chromewebstore.google.com
  developer.chrome.com extensionworkshop.com
  postman.com apifox.cn apipost.cn swagger.io openapis.org
  regex101.com regexr.com json.cn jsonformatter.org jsoncrack.com
  codepen.io jsfiddle.net codesandbox.io stackblitz.com replit.com
  readthedocs.io devdocs.io dev.to hashnode.com
  jenkins.io sonarqube.org nexus sonatype.com
  dataease.io metabase.com superset.apache.org grafana.com
  protobuf.dev grpc.io graphql.org
`,
)

addDomains(
  'ai',
  `
  openai.com chat.openai.com chatgpt.com platform.openai.com
  claude.ai anthropic.com console.anthropic.com
  gemini.google.com bard.google.com aistudio.google.com deepmind.google
  huggingface.co hf.co modelscope.cn
  civitai.com liblib.art tusiart.com
  midjourney.com stability.ai runwayml.com pika.art luma labs
  perplexity.ai poe.com character.ai you.com phind.com
  kimi.moonshot.cn moonshot.cn kimi.com
  tongyi.aliyun.com qianwen.aliyun.com bailian.console.aliyun.com
  yiyan.baidu.com chatglm.cn zhipuai.cn bigmodel.cn
  deepseek.com chat.deepseek.com doubao.com volcengine.com
  xinghuo.xfyun.cn hunyuan.tencent.com yuanbao.tencent.com
  siliconflow.cn openrouter.ai together.ai groq.com fireworks.ai
  ollama.com lmstudio.ai jan.ai
  comfy.org comfyui stable-diffusion-art.com
  replicate.com fal.ai
  cursor.com cursor.sh codeium.com tabnine.com sourcegraph.com
  v0.dev bolt.new lovable.dev windsurf.com trae.ai
  coze.cn coze.com dify.ai fastgpt.in n8n.io
  langchain.com llamaindex.ai
  notebooklm.google.com elevenlabs.io suno.com udio.com
  arena.ai
`,
)

addDomains(
  'design',
  `
  figma.com sketch.com adobe.com canva.com framer.com penpot.app
  dribbble.com behance.net pinterest.com awwwards.com siteinspire.com
  unsplash.com pexels.com pixabay.com burst.shopify.com
  iconfont.cn iconify.design icon-sets.iconify.design flaticon.com
  fontawesome.com feathericons.com lucide.dev heroicons.com tabler-icons.io
  remixicon.com phosphoricons.com iconpark.oceanengine.com
  undraw.co storyset.com illlustrations.co humaaans.com
  coolors.co colorhunt.co colordrop.io paletton.com uigradients.com
  webgradients.com cssgradient.io
  fonts.google.com dafont.com fontsquirrel.com 100font.com zitijia.com
  zcool.com.cn huaban.com uisdc.com ui.cn ui8.net
  lanhuapp.com modao.cc mockplus.cn axure.com pixso.cn jsdesign.com
  500px.com flickr.com
  shapefactory.co blobmaker.app haikei.app
  tinypng.com squoosh.app remove.bg
`,
)

addDomains(
  'efficiency',
  `
  notion.so notion.com notion.site obsidian.md logseq.com roamresearch.com
  evernote.com yinxiang.com flomoapp.com craft.do bear.app joplinapp.org
  yuque.com shimo.im docs.qq.com kdocs.cn wps.cn
  docs.google.com sheets.google.com slides.google.com drive.google.com
  office.com microsoft365.com onedrive.live.com sharepoint.com
  trello.com asana.com monday.com clickup.com linear.app jira.com atlassian.com
  todoist.com ticktick.com dida365.com things.app omnifocus
  teambition.com tower.im worktile.com ones.cn pingcode.com
  feishu.cn larksuite.com dingtalk.com work.weixin.qq.com
  slack.com zoom.us meeting.tencent.com voovmeeting.com webex.com
  excalidraw.com miro.com whimsical.com figjam processon.com
  draw.io diagrams.net app.diagrams.net
  xmind.cn xmind.app mubu.com zhimap.com gitmind.cn
  ilovepdf.com smallpdf.com pdf24.org cloudconvert.com convertio.co
  1password.com bitwarden.com lastpass.com keepass.info enpass.io
  rime.im flowus.cn wolai.com
  alfred ueli.app raycast.com utools.cn quicker.run
  snipaste.com sharex.com faststone
  everything voidtools.com listary.com
  ifttt.com zapier.com make.com
  calendly.com doodle.com
  wakatime.com toggl.com rescuetime.com
  grammarly.com deepl.com
`,
)

addDomains(
  'cloud',
  `
  cloudflare.com dash.cloudflare.com workers.dev pages.dev developers.cloudflare.com
  vercel.com netlify.com render.com railway.app fly.io heroku.com
  deno.com deno.dev val.town glitch.com
  aws.amazon.com amazonaws.com console.aws.amazon.com
  azure.microsoft.com portal.azure.com
  cloud.google.com console.cloud.google.com firebase.google.com console.firebase.google.com
  aliyun.com console.aliyun.com alibabacloud.com
  cloud.tencent.com qcloud.com console.cloud.tencent.com
  huaweicloud.com ucloud.cn qiniu.com upyun.com
  digitalocean.com linode.com vultr.com hetzner.com ovh.com contabo.com
  bandwagonhost.com bwh81.net racknerd.com hostdare.com virmach.com
  oracle.com/cloud cloud.oracle.com serv00.com euserv.com
  supabase.com planetscale.com neon.tech upstash.com turso.tech xata.io
  railway.com koyeb.com zeabur.com sealos.io claw.cloud
  namesilo.com namecheap.com godaddy.com porkbun.com dynadot.com
  spaceship.com sav.com cloudns.net desec.io
  west.cn aliyun.com/domain dnspod.cn dns.he.net freedns.afraid.org
  stackryze.com indevs.in nic.eu.org js.org
  1panel.cn bt.cn aapanel.com portainer.io caprover.com coolify.io dokploy.com
  nginx.org apache.org/httpd caddyserver.com traefik.io
  grafana.com prometheus.io zabbix.com netdata.cloud uptimerobot.com
  betterstack.com statuspage.io
  jumpserver.org frp github.com/fatedier/frp nps
  tailscale.com zerotier.com wireguard.com openwrt.org
  alist.nn.ci jellyfin.org emby.media plex.tv
  docker-compose portainer unraid.net truenas.com synology.com qnap.com
  letsencrypt.org certbot.eff.org acme.sh
  ipinfo.io ip.sb myip.la ping.pe itdog.cn boce.com
  statuspage status.cloud
`,
)

addDomains(
  'career',
  `
  zhaopin.com 51job.com liepin.com lagou.com zhipin.com jobcn.com
  chinahr.com dajie.com maimai.cn linkedin.com indeed.com glassdoor.com
  shixiseng.com yingjiesheng.com haitou.cc gaoxiaojob.com
  nowcoder.com niuke.com
  chinagwy.org huatu.com offcn.com fenbi.com gkzenti.cn shiyebian.net
  gongkaoleida.com chinaexam.org cpta.com.cn scs.gov.cn
  ncss.cn chsi.com.cn
  job.icbc.com.cn campus.chinamobile.com
  51testing.com
  resume.io canva.com/resumes
  bosszhipin.com
`,
)

addDomains(
  'learn',
  `
  coursera.org edx.org udemy.com udacity.com khanacademy.org pluralsight.com
  icourse163.org xuetangx.com imooc.com study.163.com ke.qq.com
  ouchn.cn menhu.pt.ouchn.cn open.com.cn crtvup.com.cn
  cnki.net wanfangdata.com.cn cqvip.com arxiv.org scholar.google.com
  semanticscholar.org jstor.org springer.com sciencedirect.com ieee.org acm.org
  researchgate.net sci-hub.se
  book.douban.com weread.qq.com duokan.com zhangyue.com
  z-lib.org annas-archive.org libgen.is gutenberg.org manybooks.net
  sobooks.cc zhelper.net jiumodiary.com
  duolingo.com busuu.com memrise.com quizlet.com ankiweb.net
  youdao.com dict.youdao.com iciba.com eudic.net frdic.com linguee.com
  cambridge.org oxfordlearnersdictionaries.com merriam-webster.com
  bbc.co.uk/learningenglish ted.com
  wikipedia.org wikiwand.com baike.baidu.com
  zhihu.com/column
  mooc.org openculture.com
  51cto.com geekbang.org time.geekbang.org
  w3cschool.cn
`,
)

addDomains(
  'media',
  `
  bilibili.com b23.tv youtube.com youtu.be netflix.com disneyplus.com hbomax.com
  iqiyi.com v.qq.com youku.com mgtv.com le.com sohu.com/tv pptv.com
  bangumi.tv anilist.co myanimelist.net agefans.com
  douyin.com kuaishou.com tiktok.com twitch.tv huya.com douyu.com
  music.163.com y.qq.com kugou.com kuwo.cn qishui.douyin.com
  spotify.com music.apple.com soundcloud.com bandcamp.com last.fm
  ximalaya.com lizhi.fm qingting.fm xiaoyuzhoufm.com podcasts.apple.com
  pocketcasts.com overcast.fm
  steampowered.com steamcommunity.com steamdb.info epicgames.com gog.com
  itch.io humblebundle.com 4399.com 7k7k.com
  nintendo.com playstation.com xbox.com battle.net ea.com ubisoft.com
  igdb.com metacritic.com opencritic.com gamersky.com 3dmgame.com
  movie.douban.com imdb.com themoviedb.org rottentomatoes.com
  yts.mx rarbg nyaa.si
  pixiv.net danbooru konachan.net wallhaven.cc
  gifcities.org giphy.com
`,
)

addDomains(
  'social',
  `
  weibo.com twitter.com x.com facebook.com instagram.com threads.net
  reddit.com news.ycombinator.com lobste.rs
  v2ex.com tieba.baidu.com zhihu.com douban.com xiaohongshu.com
  jianshu.com medium.com substack.com ghost.org
  telegram.org t.me discord.com discord.gg
  mp.weixin.qq.com weixin.qq.com
  36kr.com huxiu.com ifanr.com sspai.com geekpark.net leiphone.com
  solidot.org cnbeta.com.tw ithome.com oschina.net/news
  thepaper.cn news.sina.com.cn news.163.com people.com.cn xinhuanet.com
  bbc.com cnn.com nytimes.com theguardian.com reuters.com bloomberg.com
  techcrunch.com theverge.com arstechnica.com wired.com engadget.com
  producthunt.com indiehackers.com
  rsshub.app feedly.com inoreader.com tinytinyrss.org
  mastodon.social bsky.app
`,
)

/**
 * 主机名前缀规则。
 *
 * 国企/事业单位极少单独注册招聘域名，通常挂在主域名的子域下：
 *   zhaopin.chnenergy.com.cn、job.icbc.com.cn、hr.xxx.com、campus.xxx.cn
 * 这类主域名永远列不完，但前缀是高度规律的，按前缀命中更划算。
 */
const HOST_PREFIX_RULES: [CategoryKey, string[]][] = [
  [
    'career',
    ['zhaopin', 'job', 'jobs', 'hr', 'recruit', 'recruitment', 'campus', 'rencai', 'zp', 'joinus', 'careers'],
  ],
]
const WEIGHT_HOST_PREFIX = 70

/* ------------------------------------------------------- 文件夹 / 关键词规则 */

/** 关键词 → 分类。全部小写比较，中英文混排。 */
const KEYWORD_RULES: [CategoryKey, string[]][] = [
  [
    'dev',
    [
      'technology', 'tech', '技术', '开发', 'dev', 'develop', 'code', '代码', 'coding',
      'program', '编程', 'java', 'python', 'nodejs', 'node.js', 'golang', 'rust', 'php',
      'typescript', 'javascript', '前端', '后端', 'frontend', 'backend', 'fullstack',
      'bigdata', '大数据', 'kafka', 'hive', 'hadoop', 'spark', 'flink', 'hbase', 'zookeeper',
      '数据库', 'database', 'sql', 'mysql', 'redis', 'mongodb', 'postgres', 'clickhouse',
      'docker', 'k8s', 'kubernetes', 'git', 'github', 'gitlab', 'linux', 'shell', 'bash',
      '插件', '油猴', 'greasyfork', 'userscript', '扩展', 'extension',
      '爬虫', 'spider', 'crawler', 'api', '接口', '算法', 'algorithm', 'leetcode', '刷题',
      '源码', 'sdk', 'framework', '框架', '组件库', 'vue', 'react', 'angular', 'svelte',
      'webpack', 'vite', 'maven', 'gradle', 'spring', 'mybatis', '微服务', 'microservice',
      '正则', 'regex', 'json', 'yaml', '调试', 'debug', '编译', 'compile',
    ],
  ],
  [
    'ai',
    [
      'ai', '人工智能', 'gpt', 'chatgpt', 'llm', '大模型', '模型', 'model',
      '机器学习', 'machine learning', 'ml', 'deep learning', '深度学习', '神经网络',
      'prompt', '提示词', 'agent', '智能体', 'rag', '微调', 'finetune',
      'stable diffusion', 'sd', 'midjourney', 'comfyui', 'lora', 'aigc',
      '绘画', '文生图', 'text2img', 'claude', 'gemini', 'llama', 'qwen', '通义',
      '文心', '讯飞', '智谱', 'deepseek', 'kimi', '豆包',
    ],
  ],
  [
    'design',
    [
      'design', '设计', 'ui', 'ux', '交互', '视觉', '配色', 'color', 'palette',
      'icon', '图标', '字体', 'font', 'typeface', '素材', '插画', 'illustration',
      'psd', 'figma', 'sketch', 'xd', '原型', 'prototype', '摹客', '蓝湖',
      '壁纸', 'wallpaper', '背景图', 'mockup', '样机', 'banner', '海报', 'logo',
      '灵感', 'inspiration', '作品集', 'portfolio', '免抠', '矢量', 'svg', 'vector',
    ],
  ],
  [
    'efficiency',
    [
      'tool', '工具', 'tools', '效率', 'productivity', '笔记', 'note', 'notes',
      '待办', 'todo', 'task', '任务', '文档', 'doc', 'docs', 'office', '办公',
      '表格', 'excel', 'sheet', 'pdf', '转换', 'convert', 'converter',
      'markdown', 'md', '清单', 'checklist', '模板', 'template',
      '思维导图', 'mindmap', '流程图', 'flowchart', '白板', 'whiteboard',
      '密码', 'password', '备份', 'backup', '同步', 'sync', '剪贴板', 'clipboard',
      '截图', 'screenshot', '录屏', '压缩', 'compress', '翻译', 'translate',
      '日历', 'calendar', '提醒', 'reminder', '协作', 'collaborate', '写作', 'write', 'writing',
    ],
  ],
  [
    'cloud',
    [
      'vps', '服务器', 'server', '云', 'cloud', '运维', 'ops', 'devops', 'sre',
      '域名', 'domain', 'dns', '建站', '部署', 'deploy', 'deployment', 'hosting', 'host',
      '主机', '机场', '梯子', '代理', 'proxy', 'clash', 'v2ray', 'trojan', 'ss', 'ssr',
      '面板', 'panel', '宝塔', 'nas', '群晖', 'synology', 'openwrt', '软路由',
      '科学上网', '翻墙', '节点', 'cdn', '加速', '证书', 'ssl', 'https', 'cert',
      'serverless', 'edge', 'worker', 'cloudflare', 'vercel', 'netlify',
      '监控', 'monitor', '日志', 'log', '容器', 'container', '虚拟机', 'vm',
      '白嫖', '免费空间', 'free domain', 'freedomain',
    ],
  ],
  [
    'career',
    [
      '求职', '招聘', '简历', 'resume', 'cv', 'job', 'jobs', 'career', 'hire', 'hiring',
      'recruit', '面试', 'interview', '笔试', '内推', 'referral', 'offer',
      '考公', '公考', '省考', '国考', '联考', '选调', '事业单位', '事业编', '编制',
      '公务员', '国企', '央企', '校招', '社招', '春招', '秋招', '应届',
      '人社', '人事', '人才', 'hr', '薪资', 'salary', '职业', '职场',
      'fire up', '上岸', '报名', '公告', '岗位', '职位',
    ],
  ],
  [
    'learn',
    [
      '学习', 'study', 'learn', 'learning', '课程', 'course', '教程', 'tutorial',
      '教学', '培训', 'training', '书', 'book', 'books', 'ebook', '电子书',
      '阅读', 'read', 'reading', '读书', '文献', '论文', 'paper', 'thesis',
      '考试', 'exam', 'test', '题库', '真题', '复习', '笔记整理',
      '英语', 'english', 'eng', '单词', 'vocabulary', '词典', 'dictionary',
      '语法', 'grammar', '口语', '听力', '雅思', 'ielts', '托福', 'toefl',
      '知识', 'knowledge', '科普', '百科', 'wiki', '大学', 'university', '学校',
      'mooc', '公开课', '文档教程', '入门', '进阶', '实战',
    ],
  ],
  [
    'media',
    [
      '影视', '电影', 'movie', 'film', 'video', '视频', '剧', '追剧', '电视剧',
      '音乐', 'music', 'song', 'fm', '电台', 'radio', '播客', 'podcast',
      '游戏', 'game', 'games', 'gaming', 'steam', '娱乐', 'entertainment', 'fun',
      '动漫', 'anime', '漫画', 'manga', 'comic', '番剧', '二次元',
      '图片', 'photo', 'image', 'picture', '相册', 'gallery', '摄影', 'photography',
      '直播', 'live', 'stream', '短视频', '网盘', '资源', '下载', 'download',
      '字幕', 'subtitle', '磁力', 'magnet', 'torrent', 'bt', '影院',
    ],
  ],
  [
    'social',
    [
      '社区', 'community', '论坛', 'forum', 'bbs', '资讯', 'news', '新闻',
      '博客', 'blog', 'blogs', '文章', 'article', 'articles', '微博', 'weibo',
      '社交', 'social', '订阅', 'rss', 'feed', '推特', 'twitter', '知乎', 'zhihu',
      '贴吧', '豆瓣', '小红书', '公众号', '专栏', '周刊', 'newsletter', 'digest',
      '热搜', '热榜', 'trending', '科技媒体', '财经', '行业',
    ],
  ],
]

/** 文件夹路径里要忽略的通用段，它们不提供任何分类信息 */
const IGNORED_SEGMENTS = new Set([
  '书签栏', '书签工具栏', '书签菜单', 'bookmarks bar', 'bookmarks', 'bookmark',
  'other bookmarks', '其他书签', '未分类', '未命名', 'untitled', 'new folder',
  'favorites', '收藏', '收藏夹', 'misc', '其它', '其他', 'temp', '临时',
])

/* ------------------------------------------------------------------ 打分 */

const WEIGHT_DOMAIN_EXACT = 100
const WEIGHT_DOMAIN_SUFFIX = 85
/** 文件夹路径按层级给权重，越靠后（越具体）越高 */
const FOLDER_WEIGHTS = [38, 52, 66, 72]
const WEIGHT_TITLE = 26
const WEIGHT_URL = 14
const WEIGHT_TAG = 20
/** 低于这个分就不猜了，丢进未分类 */
const SCORE_THRESHOLD = 25

export interface ClassifyInput {
  title?: string
  url?: string
  desc?: string
  tags?: string[]
  /** 原分类名，形如「书签栏 / Technology / BigData / hive」 */
  folderPath?: string
}

export interface Classification {
  key: CategoryKey
  score: number
  /** 命中了哪些规则，用来在预览界面解释「为什么分到这」 */
  reasons: string[]
}

/** 从 URL 里取出小写主机名；拿不到就返回空串 */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** 把主机名逐级向上剥离：a.b.example.com → [a.b.example.com, b.example.com, example.com, com] */
function hostCandidates(host: string): string[] {
  const parts = host.split('.')
  const out: string[] = []
  for (let i = 0; i < parts.length - 1; i++) out.push(parts.slice(i).join('.'))
  return out
}

function matchKeywords(text: string): Map<CategoryKey, string[]> {
  const hits = new Map<CategoryKey, string[]>()
  if (!text) return hits
  for (const [key, words] of KEYWORD_RULES) {
    for (const w of words) {
      if (!text.includes(w)) continue
      // 英文短词要求词边界，避免 "ai" 命中 "email"、"ml" 命中 "html"
      if (w.length <= 3 && /^[a-z0-9.+#]+$/.test(w)) {
        const re = new RegExp(`(^|[^a-z0-9])${w.replace(/[.+*?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`)
        if (!re.test(text)) continue
      }
      const list = hits.get(key) ?? []
      if (!list.includes(w)) list.push(w)
      hits.set(key, list)
    }
  }
  return hits
}

export function classify(input: ClassifyInput): Classification {
  const scores = new Map<CategoryKey, number>()
  const reasons = new Map<CategoryKey, string[]>()

  const bump = (key: CategoryKey, amount: number, why: string): void => {
    scores.set(key, (scores.get(key) ?? 0) + amount)
    const list = reasons.get(key) ?? []
    list.push(why)
    reasons.set(key, list)
  }

  /* 1. 域名 —— 最强信号 */
  const host = hostOf(input.url ?? '')
  if (host) {
    const candidates = hostCandidates(host)
    for (let i = 0; i < candidates.length; i++) {
      const key = DOMAIN_RULES[candidates[i]]
      if (!key) continue
      bump(key, i === 0 ? WEIGHT_DOMAIN_EXACT : WEIGHT_DOMAIN_SUFFIX, `域名 ${candidates[i]}`)
      break // 只取最精确的一条，不叠加
    }

    // 子域名前缀：zhaopin.chnenergy.com.cn 这种，主域名列不完但前缀有规律
    const firstLabel = host.split('.')[0]
    for (const [key, prefixes] of HOST_PREFIX_RULES) {
      if (prefixes.includes(firstLabel)) {
        bump(key, WEIGHT_HOST_PREFIX, `子域名 ${firstLabel}.`)
        break
      }
    }
  }

  /* 2. 原文件夹路径 —— 用户自己整理的，很可靠；越深越具体 */
  const segments = (input.folderPath ?? '')
    .split('/')
    .map((s) => s.trim())
    .filter((s) => s && !IGNORED_SEGMENTS.has(s.toLowerCase()))

  segments.forEach((seg, idx) => {
    // 最后一段权重最高；路径短时也要能吃到高权重，所以从尾部倒着取
    const fromEnd = segments.length - 1 - idx
    const weight = FOLDER_WEIGHTS[Math.max(0, FOLDER_WEIGHTS.length - 1 - fromEnd)]
    const hits = matchKeywords(seg.toLowerCase())
    for (const [key, words] of hits) bump(key, weight, `目录「${seg}」含 ${words[0]}`)
  })

  /* 3. 标题 / 描述 / 网址路径 —— 兜底 */
  const title = `${input.title ?? ''} ${input.desc ?? ''}`.toLowerCase()
  for (const [key, words] of matchKeywords(title)) {
    bump(key, WEIGHT_TITLE, `标题含「${words[0]}」`)
  }

  let path = ''
  try {
    const u = new URL(input.url ?? '')
    path = `${u.pathname} ${u.search}`.toLowerCase()
  } catch {
    /* 非法 URL，忽略 */
  }
  for (const [key, words] of matchKeywords(path)) {
    bump(key, WEIGHT_URL, `网址含「${words[0]}」`)
  }

  for (const tag of input.tags ?? []) {
    for (const [key, words] of matchKeywords(tag.toLowerCase())) {
      bump(key, WEIGHT_TAG, `标签「${words[0]}」`)
    }
  }

  /* 取最高分 */
  let best: CategoryKey = 'other'
  let bestScore = 0
  for (const [key, score] of scores) {
    if (score > bestScore) {
      best = key
      bestScore = score
    }
  }

  if (bestScore < SCORE_THRESHOLD) return { key: 'other', score: bestScore, reasons: [] }
  return { key: best, score: bestScore, reasons: (reasons.get(best) ?? []).slice(0, 3) }
}

/* --------------------------------------------------------- 文件夹转标签 */

/**
 * 把「书签栏 / Fire UP / 省考 / 2025」拆成标签 ['Fire UP','省考','2025']。
 * 丢掉「书签栏」这类无意义的根段，这样归类之后原来的层级信息不会丢，
 * 还能继续用标签筛选。
 */
export function folderToTags(folderPath: string): string[] {
  return folderPath
    .split('/')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= 24 && !IGNORED_SEGMENTS.has(s.toLowerCase()))
}

/**
 * 判断一个分类是不是「导入进来的目录」。
 * 这类分类才是整理的对象；用户自己建的（常用、开发…）默认不动。
 */
export function isImportedCategory(name: string): boolean {
  const n = name.trim()
  if (!n) return false
  if (n.includes('/')) return true
  if (n === '未分类') return true
  if (n.startsWith('书签栏')) return true
  return false
}
