# 组员上手指南 · Codex 版

> **给谁看**：三位组员。会用电脑就行，不用懂编程、不用敲命令。
> **要做的事**：把「高考志愿填报查询平台」复制一份到你自己的 GitHub 账号 → 用 Codex 改代码 → 申请合并回主项目。
> **要花多久**：第一次约 30 分钟（大部分时间在装软件），之后每次改东西大约 5 分钟。

**先看三个网址**

- 在线试玩（手机也能开，先感受一下）：https://niannian01-dol.github.io/gaokao-volunteer/
- 主项目（正版代码，只有项目主人能改）：https://github.com/niannian01-dol/gaokao-volunteer
- 一键 Fork（第 2 步要用）：https://github.com/niannian01-dol/gaokao-volunteer/fork

---

## 0. 先用两分钟搞清三个「地方」

| 名字 | 是什么 | 谁能改 |
| --- | --- | --- |
| 主项目（上游）<br>`niannian01-dol/gaokao-volunteer` | 正版代码，线上网站就是它发布的 | 只有项目主人 |
| 你的 Fork<br>`你的用户名/gaokao-volunteer` | 主项目的完整副本，在你自己的账号下面 | 只有你能改 |
| 你的电脑<br>`D:\gaokao-你的名字` | 从你的 Fork 下载下来的文件夹，Codex 改的就是它 | 只有你能改 |

一句话记住：**你没有正版的钥匙，所以先复制一份（Fork）→ 改自己那份 → 改好申请合并回正版。**

整个流程长这样：

```
装软件 → Fork → 下载到电脑 → 建自己的分支 → 用 Codex 改 → 提交 → 上传 → 发合并请求 → 主人合并 → 线上自动更新
```

---

## 第 1 步 · 装三个软件（一次就够）

**1）GitHub 账号**（没有才需要注册）

- 注册地址：https://github.com/signup
- 记下你的用户名，第 2 步你的 Fork 地址里就有它。

**2）GitHub Desktop**（负责下载代码、上传改动，全程图形界面）

- 下载安装：https://desktop.github.com/download/
- 装完打开 → 点 **Sign in to GitHub.com** → 浏览器里授权一次，以后不用再登。

**3）Codex 桌面版**（负责帮你改代码）

- 官方页面：https://developers.openai.com/codex/app
- 下载安装后打开，用自己的账号登录。
- 界面是英文也不用怕，你直接用中文跟它说话就行。

装完这三个就够了，后面不需要再装东西。

---

## 第 2 步 · Fork：把项目复制到你自己账号（1 分钟）

1. 打开一键链接：https://github.com/niannian01-dol/gaokao-volunteer/fork
2. 页面标题是 **Create a new fork**：
   - **Owner**：选你自己；
   - **Repository name**：保持 `gaokao-volunteer` 不用改。
3. 下面那个 **Copy the main branch only** 保持勾选（我们只用 main 这条主线）。
4. 点绿色按钮 **Create fork**。
5. 等两秒，页面地址会变成：

```
https://github.com/你的用户名/gaokao-volunteer
```

**这就是你自己的副本了**，在这里你想怎么改都行，改坏了也不影响正版。

> ⚠️ 最容易搞错的地方：以后看网址，开头是 `niannian01-dol` 的是正版（你改不动），开头是你自己用户名的是你的副本（你说了算）。

---

## 第 3 步 · 把项目下载到电脑（Clone）

1. 打开 **GitHub Desktop**。
2. 左上角菜单 **File → Clone repository**。
3. 选 **GitHub.com** 这一栏，列表里找到 **你的用户名/gaokao-volunteer**，选中它。
   - 列表里也会出现 `niannian01-dol/gaokao-volunteer`，**不要选它**（那是正版）。
4. **Local path** 填一个好找的位置，建议：

```
D:\gaokao-你的名字
```

5. 点 **Clone**，等十几秒就好了。

> 💡 路径建议放 D 盘，别用带特殊符号的文件夹名，省得以后出问题。

---

## 第 4 步 · 建一条属于你自己的分支（30 秒，很重要）

三个人同时改代码，如果都在 main 上改，很容易互相覆盖。所以**每个人一条自己的分支**。

1. GitHub Desktop 顶部中间的 **Current Branch → New Branch**。
2. 名字按这个格式写：

```
codex/你的名字-要做的事
```

例如：`codex/xiaoming-button-color`
3. 点 **Create Branch**，再点 **Publish branch**（第一次要发布一次）。

> 这条分支只存在于你自己的 Fork 里，随便折腾。

---

## 第 5 步 · 让 Codex 帮你改代码

1. 打开 **Codex 桌面版**。
2. 选择 **打开文件夹**，选第 3 步那个文件夹（`D:\gaokao-你的名字`）。
3. 新建一个对话，先把下面这段发给它，让它熟悉项目：

**提示词 1 · 先熟悉项目（第一次必发）**

```
这是一个「高考志愿填报查询平台」项目，纯静态网页 + 本地 Node 服务。
请先读 README.md、public/index.html、public/results.html、public/recommend.html、
public/assets/app.js、public/assets/styles.css，然后用大白话告诉我：
1) 三个页面分别干什么；2) 哪些文件是公共的；3) 如果我想改 XX，应该动哪几个文件。
这一轮不要改任何文件，只回答。
```

**提示词 2 · 提你的需求（说人话就行）**

```
现在帮我做这件事：把查询页的筛选按钮改成蓝色，手机上按钮再大一点。
要求：只改必要的地方，不要动其它页面，不要改 public/data 里的数据文件。
改完告诉我：改了哪几个文件、每个文件改了什么。
```

**提示词 3 · 改完让它自查（推荐）**

```
检查你刚才的改动：有没有语法错误、会不会影响别的页面、手机上会不会撑破布局。
然后列出这次改动的文件清单。
```

**三条铁律**

1. **一次只改一件事**，确认没问题再改下一件，出问题好回退。
2. **改完先别急着提交**，先看看效果（见下面的「怎么看效果」）。
3. **看不懂就直接问**：「这句代码是干嘛的？」不用怕丢人。

**不要让 AI 做的事**

- 不要让它执行 `git push --force`（强制覆盖），会把别人的改动顶掉；
- 不要提交这些：`nodejs/`、`.wrangler/`、任何带 `token`、`密码`、`.env` 的文件；
- 不要动 `public/data/` 里的数据文件（那是已经整理好的录取数据）；
- 不要删别人的文件，不确定就先在群里问。

**怎么看效果（可选，但推荐）**

- 直接让 Codex 帮你启动，例如说：「帮我启动本地预览服务，端口 8787」；
- 或者装了 Node.js 之后，在项目文件夹里运行：

```
node dev-server.mjs
```

然后浏览器打开 http://127.0.0.1:8787 ，改完的页面在这里能马上看到。

---

## 第 6 步 · 提交（Commit）

1. 回到 **GitHub Desktop**，左边会列出你改了哪些文件。
2. **取消勾选**不该提交的东西（比如 `nodejs` 文件夹、临时文件）。
3. 左下角 **Summary** 写一句话，例如：`调整查询页按钮颜色`。
4. 点 **Commit to codex/你的分支**（按钮上是你自己的分支名）。

> 提交 = 在你自己电脑上存一个存档点，还没上传。

---

## 第 7 步 · 上传（Push）

1. 点上面的 **Push origin**。
2. 如果它提示要先 **Pull**，就先点 **Pull** 再点 **Push**（说明主人刚合并了别人的东西）。
3. 上传成功后，你的 Fork 网页上就能看到这些改动了。

---

## 第 8 步 · 发合并请求（Pull Request）

1. Push 完成后，GitHub Desktop 上会出现 **Create Pull Request** 按钮，点它，浏览器会自动打开对比页。
2. 检查这两处对不对：
   - **base repository** = `niannian01-dol/gaokao-volunteer`，base = `main`
   - **head repository** = 你自己的账号，compare = 你刚才那条分支
3. 标题写清楚做了什么，例如：`查询页按钮改成蓝色`。
4. 描述里写三句话：改了哪几个文件 / 为什么改 / 有没有截图。
5. 点 **Create pull request**。

以后想手动打开也可以：https://github.com/niannian01-dol/gaokao-volunteer/compare

---

## 第 9 步 · 项目主人怎么合并（这段给主人看）

1. 打开合并请求列表：https://github.com/niannian01-dol/gaokao-volunteer/pulls
2. 点进某个请求 → 看 **Files changed**，确认改的是该改的地方。
3. 没问题就点绿色 **Merge pull request → Confirm merge**。
4. 合并后 **1~2 分钟**线上自动更新，刷新体验站就能看到。
5. 如果页面提示 **This branch has conflicts**，先别合并，让组员按第 10 步同步一次再重发。

---

## 第 10 步 · 合并之后，你要做的事（同步）

你的 Fork 会落后主项目，需要同步一次：

1. 打开你自己的 Fork 页面（`https://github.com/你的用户名/gaokao-volunteer`），页面上会显示 **This branch is N commits behind**。
2. 点 **Sync fork → Update branch**。
3. 回到 GitHub Desktop，点 **Fetch origin → Pull origin**。
4. 下次干活：**从最新的 main 新建一条分支**（回到第 4 步），不要在旧分支上接着改。

---

## 三人分工建议（不想打架就照这个来）

| 谁 | 负责的文件 | 备注 |
| --- | --- | --- |
| 组员 A | `public/index.html` 查询页 | 动手前在群里说一声 |
| 组员 B | `public/results.html` 结果页 | 同上 |
| 组员 C | `public/recommend.html` 推荐页 | 同上 |
| 谁都可以 | `public/assets/styles.css` 样式 | 同一时间只让一个人改 |
| 公共文件 | `public/assets/app.js`、`public/assets/core.js` | 三个人都会用到，改前必须在群里说 |

**三个原则**：每人一条分支；动手前先同步（第 10 步）；同一天不要两个人改同一个文件。

---

## 常见问题

**Q：Fork 是什么意思？**
A：把主项目整个复制一份到你自己的 GitHub 账号下。你改的是自己那一份，改坏了也不影响正版。

**Q：我只想看看，不想改代码。**
A：直接开体验站 https://niannian01-dol.github.io/gaokao-volunteer/ ，手机也能打开。

**Q：我直接在 main 上改了，忘了建分支，怎么办？**
A：也能提交、也能发合并请求，只是下次记得先建分支，不用重来。

**Q：Push 报错 rejected / non-fast-forward。**
A：先点 **Pull** 再 **Push**（因为主人刚合并过别人的改动）。

**Q：提示 403 / 没有权限。**
A：你八成在往正版仓库推。检查 GitHub Desktop 里 **Repository → Repository settings** 的地址，应该是 `https://github.com/你的用户名/gaokao-volunteer.git`。

**Q：改坏了想还原。**
A：在 GitHub Desktop 里右键那个文件 → **Discard changes**，就回到上次提交的样子。

**Q：能上传真实的录取数据吗？**
A：不要。仓库里的 `public/data/*.json` 已经是整理好的数据，直接用就行；也不要上传密码、token 和别人的隐私数据。

**Q：合并之后我的分支还要留着吗？**
A：可以留着，也可以删。下次从最新 main 新建分支就好。

---

## 附：可以直接复制发给组员的一段话

```
我做了个高考志愿填报查询平台，想请你一起改：
· 先看效果：https://niannian01-dol.github.io/gaokao-volunteer/
· 代码在这里：https://github.com/niannian01-dol/gaokao-volunteer
想动手的话按这 6 步走：
1) 装 GitHub Desktop（https://desktop.github.com/download/）和 Codex 桌面版；
2) 打开 https://github.com/niannian01-dol/gaokao-volunteer/fork 点 Create fork；
3) GitHub Desktop → File → Clone repository，选你自己那份，存到 D 盘；
4) 新建一条分支（Current Branch → New Branch），名字带上自己的名字；
5) 用 Codex 打开这个文件夹，直接用中文告诉它要改什么；
6) GitHub Desktop 左下角写一句话 → Commit → Push origin → Create Pull Request。
我看过就合并，合并后 1~2 分钟网站自动更新。
```

---

> 本文件位置：`D:\高考志愿\docs\组员上手指南-Codex版.md`（网页版在桌面「组员上手指南」文件夹里，能直接双击打开）
