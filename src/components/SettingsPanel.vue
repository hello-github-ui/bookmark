<script setup lang="ts">
/** 设置面板：外观 / 同步 / 数据 三个分页 */
import { computed, onMounted, ref, watch } from 'vue'
import { formatBytes, requestPersistence, storageInfo, type StorageInfo } from '@/db/index'
import { exportHTML, exportJSON, importFile, wipeLocal } from '@/db/io'
import { emptyTrash, restoreBookmark, trashedBookmarks } from '@/db/repo'
import { clearIconCache } from '@/composables/useFavicon'
import { modals, notify } from '@/store/ui'
import { ACCENTS } from '@/utils/color'
import {
  applyTheme,
  resetSettings,
  settings,
  type BackgroundMode,
  type LayoutMode,
  type ThemeMode,
} from '@/store/settings'
import { signIn, signOut, sync, syncStore } from '@/store/sync'
import { resetSyncCursor } from '@/sync/engine'
import type { Bookmark } from '~shared/model'
import BaseIcon from './BaseIcon.vue'
import BaseModal from './BaseModal.vue'

type Tab = 'appearance' | 'sync' | 'data'
const tab = ref<Tab>('appearance')

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'appearance', label: '外观', icon: 'sparkles' },
  { id: 'sync', label: '同步', icon: 'cloud' },
  { id: 'data', label: '数据', icon: 'layers' },
]

const THEMES: { id: ThemeMode; label: string; icon: string }[] = [
  { id: 'auto', label: '跟随系统', icon: 'monitor' },
  { id: 'light', label: '浅色', icon: 'sun' },
  { id: 'dark', label: '深色', icon: 'moon' },
]

const LAYOUTS: { id: LayoutMode; label: string; icon: string }[] = [
  { id: 'card', label: '卡片', icon: 'grid' },
  { id: 'compact', label: '紧凑', icon: 'rows' },
  { id: 'list', label: '列表', icon: 'list' },
]

const BACKGROUNDS: { id: BackgroundMode; label: string }[] = [
  { id: 'aurora', label: '极光渐变' },
  { id: 'plain', label: '纯色' },
  { id: 'image', label: '自定义图片' },
]

/* ---------------------------------------------------------------- 同步 */

const password = ref('')
const signingIn = ref(false)

async function onSignIn(): Promise<void> {
  if (!password.value || signingIn.value) return
  signingIn.value = true
  try {
    await signIn(password.value)
    password.value = ''
    notify('已解锁，正在同步…', 'success')
  } catch (err) {
    notify(err instanceof Error ? err.message : '登录失败', 'error')
  } finally {
    signingIn.value = false
  }
}

async function onSignOut(): Promise<void> {
  await signOut()
  notify('已锁定，本地数据保留', 'info')
}

async function onSyncNow(): Promise<void> {
  await sync({ force: false })
  notify(syncStore.phase === 'ok' ? '同步完成' : `同步失败：${syncStore.lastMessage}`,
    syncStore.phase === 'ok' ? 'success' : 'error')
  info.value = await storageInfo()
}

async function onFullSync(): Promise<void> {
  await resetSyncCursor()
  await sync({ force: true })
  notify(syncStore.phase === 'ok' ? '全量同步完成' : '全量同步失败',
    syncStore.phase === 'ok' ? 'success' : 'error')
}

/* ---------------------------------------------------------------- 数据 */

const info = ref<StorageInfo | null>(null)
const importMode = ref<'merge' | 'replace'>('merge')
const fileInput = ref<HTMLInputElement | null>(null)
const trash = ref<Bookmark[]>([])
const busy = ref(false)

async function refresh(): Promise<void> {
  info.value = await storageInfo()
  trash.value = await trashedBookmarks()
}

watch(() => modals.settings, (open) => open && void refresh())
onMounted(() => void refresh())

async function onImport(e: Event): Promise<void> {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  busy.value = true
  try {
    const r = await importFile(file, { mode: importMode.value })
    notify(
      `导入完成：${r.bookmarks} 个书签、${r.categories} 个分类${r.skipped ? `，跳过 ${r.skipped} 个重复` : ''}`,
      'success',
    )
    await sync({ silent: true })
    await refresh()
  } catch (err) {
    notify(err instanceof Error ? err.message : '导入失败', 'error')
  } finally {
    busy.value = false
    ;(e.target as HTMLInputElement).value = ''
  }
}

async function onPersist(): Promise<void> {
  const ok = await requestPersistence()
  notify(ok ? '已开启持久化存储' : '浏览器拒绝了持久化请求', ok ? 'success' : 'error')
  await refresh()
}

async function onClearIcons(): Promise<void> {
  await clearIconCache()
  notify('图标缓存已清空，刷新页面重新获取', 'success')
}

async function onRestore(id: string): Promise<void> {
  await restoreBookmark(id)
  await refresh()
  notify('已恢复', 'success')
}

async function onEmptyTrash(): Promise<void> {
  if (!confirm('彻底清空回收站？此操作不可撤销。')) return
  const n = await emptyTrash()
  await refresh()
  notify(`已清除 ${n} 条记录`, 'info')
}

async function onWipe(): Promise<void> {
  if (!confirm('确定要清空本机所有书签数据吗？\n\n云端数据不会被删除，下次同步会重新拉回来。')) return
  await wipeLocal()
  await resetSyncCursor()
  await refresh()
  notify('本地数据已清空', 'info')
}

const usagePercent = computed(() => {
  if (!info.value?.quota) return 0
  return Math.min(100, (info.value.usage / info.value.quota) * 100)
})
</script>

<template>
  <BaseModal :open="modals.settings" title="设置" :width="600" @close="modals.settings = false">
    <div class="tabs">
      <button
        v-for="t in TABS"
        :key="t.id"
        class="tabs__btn"
        :class="{ 'tabs__btn--on': tab === t.id }"
        @click="tab = t.id"
      >
        <BaseIcon :name="t.icon" :size="14" />
        {{ t.label }}
      </button>
    </div>

    <!-- ============================ 外观 ============================ -->
    <section v-if="tab === 'appearance'" class="panel">
      <div class="row">
        <div class="row__text">
          <h3>主题</h3>
          <p>深色为玻璃拟态风格，浅色为简约卡片风格</p>
        </div>
        <div class="seg">
          <button
            v-for="t in THEMES"
            :key="t.id"
            class="seg__btn"
            :class="{ 'seg__btn--on': settings.theme === t.id }"
            @click="settings.theme = t.id"
          >
            <BaseIcon :name="t.icon" :size="13" />
            {{ t.label }}
          </button>
        </div>
      </div>

      <div class="row">
        <div class="row__text">
          <h3>强调色</h3>
          <p>影响按钮、高亮和图标辉光</p>
        </div>
        <div class="accents">
          <button
            v-for="a in ACCENTS"
            :key="a.id"
            class="accent"
            :class="{ 'accent--on': settings.accentHue === a.hue }"
            :style="{ background: `hsl(${a.hue} 85% 62%)` }"
            :title="a.name"
            @click="settings.accentHue = a.hue; applyTheme()"
          >
            <BaseIcon v-if="settings.accentHue === a.hue" name="check" :size="12" />
          </button>
        </div>
      </div>

      <div class="row">
        <div class="row__text">
          <h3>卡片布局</h3>
          <p>卡片最直观，紧凑放得多，列表适合超多书签</p>
        </div>
        <div class="seg">
          <button
            v-for="l in LAYOUTS"
            :key="l.id"
            class="seg__btn"
            :class="{ 'seg__btn--on': settings.layout === l.id }"
            @click="settings.layout = l.id"
          >
            <BaseIcon :name="l.icon" :size="13" />
            {{ l.label }}
          </button>
        </div>
      </div>

      <div class="row">
        <div class="row__text">
          <h3>背景</h3>
          <p>动效较多时可切成纯色以省电</p>
        </div>
        <select v-model="settings.background" class="select select--auto">
          <option v-for="b in BACKGROUNDS" :key="b.id" :value="b.id">{{ b.label }}</option>
        </select>
      </div>

      <div v-if="settings.background === 'image'" class="field">
        <label class="field__label" for="bg-url">背景图地址</label>
        <input
          id="bg-url"
          v-model="settings.backgroundImage"
          class="input"
          type="url"
          placeholder="https://… （建议用 CDN 上的横图）"
        />
      </div>

      <div class="field">
        <label class="field__label" for="hero-title">首页问候语</label>
        <input
          id="hero-title"
          v-model="settings.heroTitle"
          class="input"
          type="text"
          placeholder="留空则按时间自动显示「早上好 / 下午好 / 晚上好」"
          maxlength="40"
        />
      </div>

      <div class="divider" />

      <label class="switch">
        <input v-model="settings.showHero" type="checkbox" />
        <span class="switch__track"><span class="switch__dot" /></span>
        <span class="switch__label">显示顶部问候区与时钟</span>
      </label>
      <label class="switch">
        <input v-model="settings.showDesc" type="checkbox" />
        <span class="switch__track"><span class="switch__dot" /></span>
        <span class="switch__label">卡片显示描述文字</span>
      </label>
      <label class="switch">
        <input v-model="settings.showTags" type="checkbox" />
        <span class="switch__track"><span class="switch__dot" /></span>
        <span class="switch__label">卡片显示标签</span>
      </label>
      <label class="switch">
        <input v-model="settings.openInNewTab" type="checkbox" />
        <span class="switch__track"><span class="switch__dot" /></span>
        <span class="switch__label">在新标签页打开书签</span>
      </label>
      <label class="switch">
        <input v-model="settings.reduceMotion" type="checkbox" />
        <span class="switch__track"><span class="switch__dot" /></span>
        <span class="switch__label">减少动画效果</span>
      </label>

      <div class="divider" />
      <button class="btn btn--ghost" @click="resetSettings(); applyTheme()">恢复默认外观</button>
    </section>

    <!-- ============================ 同步 ============================ -->
    <section v-else-if="tab === 'sync'" class="panel">
      <div class="status" :class="`status--${syncStore.available ? (syncStore.authenticated ? 'ok' : 'warn') : 'off'}`">
        <BaseIcon :name="syncStore.available ? (syncStore.authenticated ? 'cloud' : 'lock') : 'cloudOff'" :size="18" />
        <div>
          <strong v-if="!syncStore.probed">正在检测后端…</strong>
          <strong v-else-if="!syncStore.available">纯本地模式</strong>
          <strong v-else-if="!syncStore.authenticated">云端已就绪，待解锁</strong>
          <strong v-else>云端同步已开启</strong>
          <p v-if="!syncStore.available">
            数据只保存在这台设备的浏览器里。部署到 Cloudflare Pages 并绑定 D1 后，这里会自动变成多设备同步。
          </p>
          <p v-else-if="!syncStore.authenticated">输入访问密码即可解锁编辑与同步。</p>
          <p v-else>
            后端：{{ syncStore.backend }}
            <template v-if="syncStore.lastSyncedAt">
              · 上次同步 {{ new Date(syncStore.lastSyncedAt).toLocaleTimeString('zh-CN') }}
            </template>
          </p>
        </div>
      </div>

      <template v-if="syncStore.available && !syncStore.authenticated">
        <div class="field">
          <label class="field__label" for="pw">访问密码</label>
          <div class="inline">
            <input
              id="pw"
              v-model="password"
              class="input"
              type="password"
              placeholder="服务端 APP_PASSWORD 环境变量的值"
              autocomplete="current-password"
              @keydown.enter="onSignIn"
            />
            <button class="btn btn--primary" :disabled="!password || signingIn" @click="onSignIn">
              {{ signingIn ? '验证中…' : '解锁' }}
            </button>
          </div>
        </div>
      </template>

      <template v-if="syncStore.authenticated">
        <div class="inline">
          <button class="btn btn--ghost" :disabled="syncStore.phase === 'syncing'" @click="onSyncNow">
            <BaseIcon name="refresh" :size="14" :class="{ spinning: syncStore.phase === 'syncing' }" />
            立即同步
          </button>
          <button class="btn btn--ghost" @click="onFullSync">
            <BaseIcon name="cloud" :size="14" /> 强制全量同步
          </button>
          <button class="btn btn--danger" @click="onSignOut">
            <BaseIcon name="lock" :size="14" /> 锁定
          </button>
        </div>

        <label class="switch">
          <input v-model="settings.autoSync" type="checkbox" />
          <span class="switch__track"><span class="switch__dot" /></span>
          <span class="switch__label">自动同步（改动后 3 秒 / 每 5 分钟 / 切回页面时）</span>
        </label>
      </template>

      <p v-if="syncStore.lastMessage" class="note note--warn">{{ syncStore.lastMessage }}</p>

      <div class="divider" />

      <div class="row">
        <div class="row__text">
          <h3>图标获取方式</h3>
          <p>
            代理模式由后端挨个尝试多个图标源并缓存，国内更稳；直连模式由浏览器直接请求图标源。
          </p>
        </div>
        <div class="seg">
          <button
            class="seg__btn"
            :class="{ 'seg__btn--on': settings.iconSource === 'proxy' }"
            @click="settings.iconSource = 'proxy'"
          >
            代理
          </button>
          <button
            class="seg__btn"
            :class="{ 'seg__btn--on': settings.iconSource === 'direct' }"
            @click="settings.iconSource = 'direct'"
          >
            直连
          </button>
        </div>
      </div>
      <button class="btn btn--ghost" @click="onClearIcons">
        <BaseIcon name="refresh" :size="14" /> 清空图标缓存并重新获取
      </button>
    </section>

    <!-- ============================ 数据 ============================ -->
    <section v-else class="panel">
      <div v-if="info" class="stats">
        <div class="stat">
          <span class="stat__num">{{ info.bookmarks }}</span>
          <span class="stat__label">书签</span>
        </div>
        <div class="stat">
          <span class="stat__num">{{ info.categories }}</span>
          <span class="stat__label">分类</span>
        </div>
        <div class="stat">
          <span class="stat__num">{{ formatBytes(info.usage) }}</span>
          <span class="stat__label">已占用</span>
        </div>
        <div class="stat">
          <span class="stat__num">{{ info.persisted ? '是' : '否' }}</span>
          <span class="stat__label">持久化</span>
        </div>
      </div>

      <div v-if="info?.quota" class="meter" :title="`${formatBytes(info.usage)} / ${formatBytes(info.quota)}`">
        <span class="meter__fill" :style="{ width: `${Math.max(usagePercent, 0.6)}%` }" />
      </div>

      <p v-if="info && !info.persisted" class="note">
        浏览器在磁盘紧张时可能清理 IndexedDB。
        <button class="link" @click="onPersist">点这里申请持久化存储</button>
      </p>

      <div class="divider" />

      <div class="row">
        <div class="row__text">
          <h3>智能整理</h3>
          <p>按网站功能把导入的文件夹目录重新归类，原层级转成标签保留；执行前可逐条预览调整</p>
        </div>
        <button class="btn btn--ghost" @click="modals.organize = true">
          <BaseIcon name="sparkles" :size="14" /> 整理书签
        </button>
      </div>

      <div class="divider" />

      <div class="row">
        <div class="row__text">
          <h3>导出</h3>
          <p>JSON 保留全部字段用于备份；HTML 可直接导回浏览器书签栏</p>
        </div>
        <div class="inline">
          <button class="btn btn--ghost" @click="exportJSON()">
            <BaseIcon name="download" :size="14" /> JSON
          </button>
          <button class="btn btn--ghost" @click="exportHTML()">
            <BaseIcon name="download" :size="14" /> HTML
          </button>
        </div>
      </div>

      <div class="row">
        <div class="row__text">
          <h3>导入</h3>
          <p>支持本项目的 JSON 备份，以及 Chrome / Edge / Firefox 导出的书签 HTML</p>
        </div>
        <div class="inline">
          <select v-model="importMode" class="select select--auto">
            <option value="merge">合并（跳过重复）</option>
            <option value="replace">覆盖（清空现有）</option>
          </select>
          <button class="btn btn--ghost" :disabled="busy" @click="fileInput?.click()">
            <BaseIcon name="upload" :size="14" /> 选择文件
          </button>
          <input ref="fileInput" type="file" accept=".json,.html,.htm" hidden @change="onImport" />
        </div>
      </div>

      <div class="divider" />

      <div class="row">
        <div class="row__text">
          <h3>回收站</h3>
          <p>删除的书签会保留在这里，同步到其它设备后可彻底清除</p>
        </div>
        <button v-if="trash.length" class="btn btn--danger btn--sm" @click="onEmptyTrash">
          清空 {{ trash.length }} 条
        </button>
        <span v-else class="muted">空</span>
      </div>

      <ul v-if="trash.length" class="trash">
        <li v-for="b in trash.slice(0, 8)" :key="b.id">
          <span class="truncate">{{ b.title }}</span>
          <button class="link" @click="onRestore(b.id)">恢复</button>
        </li>
      </ul>

      <div class="divider" />

      <div class="row row--danger">
        <div class="row__text">
          <h3>清空本机数据</h3>
          <p>只清这台设备；若已开启云同步，下次同步会重新拉回来</p>
        </div>
        <button class="btn btn--danger" @click="onWipe">清空</button>
      </div>
    </section>
  </BaseModal>
</template>

<style scoped>
.tabs {
  display: flex;
  gap: 2px;
  padding: 3px;
  margin-bottom: 18px;
  background: var(--surface-hover);
  border-radius: 10px;
}

.tabs__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex: 1;
  padding: 7px;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-dim);
  border-radius: 8px;
  transition: all 0.16s var(--ease);
}

.tabs__btn:hover {
  color: var(--text);
}

.tabs__btn--on {
  background: var(--bg-elevated);
  color: var(--accent);
  box-shadow: var(--shadow-sm);
}

.panel {
  display: flex;
  flex-direction: column;
  gap: 15px;
  animation: fade-in 0.2s var(--ease);
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.row__text {
  flex: 1;
  min-width: 0;
}

.row__text h3 {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}

.row__text p {
  margin-top: 2px;
  font-size: 11.5px;
  line-height: 1.45;
  color: var(--text-dim);
}

.row--danger .row__text h3 {
  color: #f87171;
}

.seg {
  display: inline-flex;
  flex: none;
  padding: 2px;
  gap: 2px;
  background: var(--surface-hover);
  border-radius: 9px;
}

.seg__btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-dim);
  border-radius: 7px;
  transition: all 0.15s;
  white-space: nowrap;
}

.seg__btn:hover {
  color: var(--text);
}

.seg__btn--on {
  background: var(--bg-elevated);
  color: var(--accent);
  box-shadow: var(--shadow-sm);
}

.accents {
  display: flex;
  gap: 6px;
  flex: none;
}

.accent {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  color: #fff;
  transition: transform 0.15s;
}

.accent:hover {
  transform: scale(1.12);
}

.accent--on {
  box-shadow: 0 0 0 2px var(--bg-elevated), 0 0 0 4px currentColor;
}

.select--auto {
  width: auto;
  min-width: 128px;
  flex: none;
}

.inline {
  display: flex;
  gap: 7px;
  align-items: center;
  flex-wrap: wrap;
}

.inline .input {
  flex: 1;
  min-width: 150px;
}

/* 开关 */
.switch {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  user-select: none;
}

.switch input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.switch__track {
  position: relative;
  flex: none;
  width: 34px;
  height: 19px;
  border-radius: 99px;
  background: var(--border-strong);
  transition: background 0.2s var(--ease);
}

.switch__dot {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.3);
  transition: transform 0.2s var(--ease);
}

.switch input:checked + .switch__track {
  background: var(--accent);
}

.switch input:checked + .switch__track .switch__dot {
  transform: translateX(15px);
}

.switch input:focus-visible + .switch__track {
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.switch__label {
  font-size: 12.5px;
  color: var(--text-muted);
}

/* 状态卡 */
.status {
  display: flex;
  gap: 11px;
  padding: 13px;
  border-radius: var(--radius);
  background: var(--surface-hover);
  border: 1px solid var(--border);
}

.status strong {
  display: block;
  font-size: 13px;
  color: var(--text);
}

.status p {
  margin-top: 3px;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--text-dim);
}

.status--ok {
  border-color: rgb(52 211 153 / 0.35);
  background: rgb(52 211 153 / 0.08);
  color: #34d399;
}

.status--warn {
  border-color: rgb(251 191 36 / 0.35);
  background: rgb(251 191 36 / 0.08);
  color: #fbbf24;
}

.status--off {
  color: var(--text-dim);
}

/* 统计 */
.stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 12px 6px;
  border-radius: var(--radius);
  background: var(--surface-hover);
}

.stat__num {
  font-size: 17px;
  font-weight: 650;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.stat__label {
  font-size: 10.5px;
  color: var(--text-dim);
}

.meter {
  height: 5px;
  border-radius: 99px;
  background: var(--surface-hover);
  overflow: hidden;
}

.meter__fill {
  display: block;
  height: 100%;
  border-radius: 99px;
  background: linear-gradient(90deg, var(--accent), hsl(calc(var(--accent-h) + 40) 85% 62%));
  transition: width 0.4s var(--ease);
}

.note {
  font-size: 11.5px;
  line-height: 1.55;
  color: var(--text-dim);
}

.note--warn {
  color: #fbbf24;
}

.link {
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 2px;
  font-size: inherit;
}

.muted {
  font-size: 12px;
  color: var(--text-dim);
}

.trash {
  display: flex;
  flex-direction: column;
  gap: 3px;
  max-height: 160px;
  overflow-y: auto;
}

.trash li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 9px;
  font-size: 12.5px;
  color: var(--text-muted);
  background: var(--surface-hover);
  border-radius: 7px;
}

.spinning {
  animation: spin 1s linear infinite;
}

@media (max-width: 560px) {
  .row {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .stats {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
