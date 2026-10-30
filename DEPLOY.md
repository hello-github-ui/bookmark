# 部署手册 · qiyue-bookmark.indevs.in

针对你的实际环境写的：域名在 [Stackryze](https://domain.stackryze.com/my-domains) 注册，部署到 Cloudflare Pages。

- Pages 项目名：`qiyue-bookmark` → 默认地址 `qiyue-bookmark.pages.dev`
- D1 数据库名：`qiyue-bookmark-db`
- 最终访问地址：`https://qiyue-bookmark.indevs.in`

---

## ⚠️ 先看这个：你的域名现在是坏的

部署前先知道这件事，否则后面会卡住摸不着头脑。我查了一下当前的 DNS 状态：

```
$ dig qiyue-bookmark.indevs.in A

;; status: SERVFAIL
;; EDE: Lame delegation at qiyue-bookmark.indevs.in
```

**Lame delegation（失效委派）** 的意思是：父域名 `indevs.in` 已经把 `qiyue-bookmark.indevs.in` 委派给了 `ns1/ns2/ns3.stackryze.com`，但这几台服务器在被问到这个子域名时**不给权威应答**。所以现在这个域名解析不出任何东西。

```
indevs.in              → ns1/ns2/ns3.stackryze.com   ✅ 正常
qiyue-bookmark.indevs.in → ns1/ns2/ns3.stackryze.com   ❌ 委派了但不应答
```

大概率是因为你还没在 Stackryze 的 **DNS Records** 里加过任何记录，它那边的子域名区还没真正建起来。

**好消息是**：下面的方案会把 NS 换成 Cloudflare 的，这个问题顺带就解决了。

---

## 方案：把域名托管到 Cloudflare（和你的 qqiyue.ccwu.cc 一模一样）

### 为什么是这个方案

我查了你 Cloudflare 账户里已有的 `qqiyue.ccwu.cc`：

```
ccwu.cc          → a.nic.dnshe.org / b.nic.dnshe.org     (父域名，不在 CF)
qqiyue.ccwu.cc   → gigi.ns.cloudflare.com / theo.ns...   (子域名，在 CF) ✅
qqiyue.ccwu.cc A → 104.21.8.102 / 172.67.157.72          (CF 代理 IP，正常工作)
```

**你已经成功做过一次了。** 同样的套路对 `qiyue-bookmark.indevs.in` 完全适用。

> 可能会有人跟你说「Cloudflare 免费版不支持子域名」——那个说法只对了一半。
> Cloudflare 官方文档里 Enterprise 才有的 **Subdomain setup**，指的是「父域名和子域名**都**在 Cloudflare」的场景。
> 你这种「父域名在别人家、只把子域名作为独立 zone 加进来」是普通 zone，免费版完全可以。

这个方案的好处：

- 顺手修好 lame delegation
- Pages 绑定自定义域名变成点一下的事，CNAME 由 Cloudflare 自动建，根域名的 CNAME 扁平化也自动处理
- 走 Cloudflare 代理（橙云），拿到 CDN、缓存、HTTPS、分析
- 不用去赌 Stackryze 的面板支不支持在根上加 CNAME（这在 RFC 层面是有冲突的，见文末）

---

## 步骤

### 1. 建 D1 数据库

```bash
npx wrangler login
npm run db:create          # wrangler d1 create qiyue-bookmark-db
```

把输出里的 `database_id` 填进 `wrangler.toml`，替换 `REPLACE_WITH_YOUR_D1_DATABASE_ID`：

```toml
[[d1_databases]]
binding = "DB"
database_name = "qiyue-bookmark-db"
database_id = "这里填你拿到的 id"
```

```bash
npm run db:init:remote     # 建表（可选，后端首次写入会自动建）
```

### 2. 部署 Pages

```bash
npm run cf:deploy          # = npm run build && wrangler pages deploy
```

部署完先用 `https://qiyue-bookmark.pages.dev` 验证站点正常，再去搞域名。

> 本项目用的就是这条命令行路径，对应 Cloudflare 的 **Direct Upload（直接上传）** 模式。
> 关于「能不能 push 自动部署」，见下面的「日常更新」一节 —— 答案是不能，而且这个选择不可逆。

### 3. 设置访问密码

```bash
npx wrangler pages secret put APP_PASSWORD   # 或 npm run secret:password
```

> ⚠️ **设完 secret 必须再部署一次。**
> Cloudflare Pages 的环境变量和 secret 是在部署那一刻注入进该次部署的，
> 之后新增的不会回头作用于已有部署。
>
> ```bash
> npm run cf:deploy    # 让新 secret 生效
> ```
>
> 没重新部署的话 `/api/auth/status` 会返回 `"hasPassword":false`，
> 站点能打开但同步是关着的。

| 变量 | 值 | 说明 |
| --- | --- | --- |
| `APP_PASSWORD` | 你自己定 | **必填**，解锁编辑与同步 |
| `PUBLIC_READ` | `1` / `0` | `1`（默认）别人能看不能改；`0` 不输密码啥也看不见 |
| `AUTH_SECRET` | 可选 | 不填就由密码派生 |

### 4. 把域名加进 Cloudflare

1. Cloudflare 后台 → **帐户主页** → **添加域** / Add a domain
2. 输入**完整的** `qiyue-bookmark.indevs.in`（不是 `indevs.in`）
3. 选 **Free** 方案
4. Cloudflare 会分配两个名称服务器，形如：

   ```
   xxxx.ns.cloudflare.com
   yyyy.ns.cloudflare.com
   ```

   **把这两个抄下来**，每个账户分配的不一样。

### 5. 在 Stackryze 改名称服务器

1. 打开 <https://domain.stackryze.com/my-domains>
2. 找到 `qiyue-bookmark.indevs.in`，点右边的 **Manage**
3. 把名称服务器从

   ```
   ns1.stackryze.com
   ns2.stackryze.com
   ns3.stackryze.com
   ```

   改成上一步 Cloudflare 给你的那两个，保存。

> 如果 Stackryze 要求必须填 3 个，就把 Cloudflare 的两个填进前两格，第三格留空或填重复的。
> 要是面板死活不让改自定义 NS，跳到文末的「备选方案」。

### 6. 等待激活

通常 5 分钟到几小时。自己验证：

```bash
# NS 应该变成 cloudflare.com
dig qiyue-bookmark.indevs.in NS +short

# 不想装 dig 的话用这个，浏览器打开就行
# https://dns.google/resolve?name=qiyue-bookmark.indevs.in&type=NS
```

看到 `*.ns.cloudflare.com` 就说明成了，Cloudflare 后台该 zone 的状态也会变成 **Active**。

### 7. 绑定到 Pages

1. Cloudflare 后台 → **Workers & Pages** → `qiyue-bookmark` → **Custom domains**
2. **Set up a custom domain** → 填 `qiyue-bookmark.indevs.in`
3. Cloudflare 会自动在 zone 里建好 CNAME 并签发证书

> ⚠️ 顺序别反：**一定要先在 Pages 里加自定义域名**，再让 DNS 记录生效。
> 自己手动去 DNS 里建一条指向 `pages.dev` 的 CNAME 而没走 Pages 的绑定流程，
> 会直接吃一个 **522 错误**，这是 Cloudflare 官方文档明确写过的坑。

### 8. 收尾

打开 `https://qiyue-bookmark.indevs.in` → 左下角状态条 → **设置 → 同步** → 输入第 3 步设的密码解锁。

之后所有改动 3 秒后自动推送到 D1，换设备打开自动拉取合并。

---

## 日常更新：改完代码怎么上线

```bash
git pull                 # 或改完自己的代码
npm run cf:deploy        # = npm run build && wrangler pages deploy
```

就这两步。构建在本地跑，产物直接传到 Cloudflare。

### ⚠️ push 到 GitHub 不会触发部署

这点必须记牢，否则改完代码会以为已经上线了：

`qiyue-bookmark` 是用 `wrangler pages deploy` 创建的，属于 **Direct Upload 模式**。
这种项目和 Git 仓库之间**没有任何连接** —— Cloudflare 根本不知道仓库存在。
合并 PR、push master，统统不会触发任何部署。

而且 **Direct Upload 项目无法转成 Git 集成**，这是 Cloudflare 的硬限制，
只能新建项目。所以别去后台找「连接仓库」的按钮了，没有。

真要自动部署只有两条路，代价都不小：

| 方案 | 做法 | 代价 |
| --- | --- | --- |
| GitHub Actions | 加 workflow，用 `wrangler-action` 推到现有项目 | 要配 `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` 两个 secret |
| 新建 Git 项目 | 后台 Create → Pages → Connect to Git | 自定义域名要迁移（有中断）、D1 绑定和密码全部重配、`pages.dev` 名字要换 |

目前的选择是**手动部署**，一条命令的事，不值得为它引入 CI 依赖。

### 改了环境变量之后

| 改了什么 | 要不要重新部署 |
| --- | --- |
| 代码 | 要 |
| `wrangler.toml` 的 `[vars]`（`PUBLIC_READ`、`CORS_ORIGINS`） | 要 |
| secret（`APP_PASSWORD`） | **要** —— 见上面第 3 步的说明 |

Cloudflare Pages 的变量是在部署那一刻注入到该次部署里的，改完不重新部署等于没改。

> 另外注意：仓库里存在 `wrangler.toml` 时，CLI 部署会以文件里的 `[vars]` 为准，
> **覆盖掉你在后台改的值**。所以非机密变量要改就改文件，别改后台。

### 每次部署后的健康检查

```bash
curl -s https://qiyue-bookmark.indevs.in/api/auth/status
```

```json
{"backend":"cloudflare-d1","configured":true,"hasDatabase":true,"hasPassword":true,
 "publicRead":false,"authenticated":false}
```

`configured:true` 说明 D1 和密码都正常；`publicRead:false` 说明不输密码看不到内容。

```bash
# 验证匿名访问确实被挡住了
curl -s 'https://qiyue-bookmark.indevs.in/api/sync?since=0'
# 期望：{"error":"UNAUTHORIZED"}
```


## 备选方案（Stackryze 不让改 NS 的话）

Cloudflare Pages 支持**外部 DNS**：域名不在 Cloudflare 也能绑，前提是它被判定为「子域名」而不是「根域名」。`qiyue-bookmark.indevs.in` 相对 `indevs.in` 确实是子域名，所以这条路理论上通。

做法：第 7 步照做（先在 Pages 里添加自定义域名），然后在 Stackryze 的 **DNS Records** 里加：

| Type | Name | Content |
| --- | --- | --- |
| CNAME | `@`（或留空 / 填完整域名） | `qiyue-bookmark.pages.dev` |

**但这条路有个真实的风险**，我不想瞒着你：

`qiyue-bookmark.indevs.in` 是一个**被委派出来的独立 DNS 区**（父域名里有它的 NS 记录，这也是现在 lame delegation 的来源）。按 RFC 规定，一个区的根上不能同时存在 CNAME 和 SOA/NS 记录——两者冲突。能不能用，取决于 Stackryze 有没有实现 **CNAME 扁平化 / ALIAS / ANAME**。

所以如果走这条路：

- 面板里能存下这条 CNAME → 大概率他们做了扁平化，用 `dig` 验证一下解析结果有没有 IP 出来
- 面板报错或存了但解析不出来 → 说明不支持，只能退到下面这个

**最后的退路**：用一级子域名，比如在 Stackryze 加 `app` 的 CNAME，然后访问 `app.qiyue-bookmark.indevs.in`。这个位置加 CNAME 百分百合法，必定能用，只是地址长一点。

---

## 排查速查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `SERVFAIL` / `Lame delegation` | NS 委派了但服务器不应答 | 就是现在的状态，改到 Cloudflare NS 即可 |
| **522** | 手动建了 CNAME 但没在 Pages 里添加自定义域名 | 回到第 7 步走正规流程 |
| **DNS_PROBE_FINISHED_NXDOMAIN** | NS 还没生效 | 等，或 `dig NS` 确认 |
| Cloudflare 一直 Pending | Stackryze 那边 NS 没改成功 | 回第 5 步核对拼写 |
| `hasPassword:false`（但密码确实设过了） | secret 是在设置**之后**的部署才生效的 | 再跑一次 `npm run cf:deploy` |
| `hasDatabase:false` | D1 绑定名不是 `DB` | 查 `wrangler.toml`，或后台 Settings → Bindings |
| 站点能开但左下角显示「本地模式」 | D1 没绑定或没设密码 | 查 Settings → Bindings 有没有 `DB`，以及 `APP_PASSWORD` |
| 显示「云端已就绪，待解锁」 | 正常，还没输密码 | 设置 → 同步 → 输密码 |

验证命令：

```bash
dig qiyue-bookmark.indevs.in NS +short     # 应为 *.ns.cloudflare.com
dig qiyue-bookmark.indevs.in A  +short     # 应为 104.21.x.x / 172.67.x.x 这类 CF 代理 IP
curl -s https://qiyue-bookmark.indevs.in/api/auth/status
# 期望：{"backend":"cloudflare-d1","configured":true,...}
```

最后那条 `configured:true` 是最关键的健康检查——它同时说明 D1 绑定和密码都配好了。

---

## 关于国内访问

绑上自定义域名后走的是 Cloudflare 的 anycast（和你 `qqiyue.ccwu.cc` 拿到的 `104.21.x` / `172.67.x` 是同一批 IP）。

说实话的版本：这比裸 `*.pages.dev` 要好一些——`pages.dev` 作为一个广为人知的整体域名，更容易被按域名粗暴拦截；自己的域名没这个问题。但底层还是 Cloudflare 的免费 anycast，速度在国内只能算「能用」，个别地区仍可能有波动。

真要追求稳定快速，那条路是备案 + 国内 CDN，属于完全另一个量级的折腾了。
