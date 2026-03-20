# 订单组合优化器

一个可直接部署到 GitHub Pages 的纯前端网页工具。

主要功能：

- 上传 Excel 文件，自动读取订单金额列
- 或者手动输入订单金额
- 按业务规则完成订单组合优化
- 全部逻辑在浏览器本地执行，不需要后端服务

## 业务规则

- 单笔金额 `>= 100` 的订单直接单独成组
- 单笔金额 `< 100` 的订单使用贪心算法进行组合
- 每个组合的总金额必须 `>= 100`

优化目标优先级：

1. 满足条件的组合组数尽可能多
2. 每组总金额尽可能贴近 100
3. 未能成功分组的剩余金额尽可能大

## 本地打开

直接双击 [index.html](./index.html) 即可在浏览器中使用。

如果你更希望本地起一个静态服务，也可以在项目目录执行：

```powershell
python -m http.server 8000
```

然后访问 `http://localhost:8000`

## Excel 格式要求

Excel 里不需要订单编号，只需要一列金额。

推荐表头：

- `amount`
- `金额`

如果没有这两个表头，页面也会尝试自动寻找第一列可识别的数字列。

## 部署到 GitHub Pages

### 方案一：最简单

1. 在 GitHub 创建一个新仓库
2. 把本项目文件上传到仓库根目录
3. 进入 GitHub 仓库的 `Settings`
4. 打开 `Pages`
5. 在 `Build and deployment` 中选择：
   - `Source`: `Deploy from a branch`
   - `Branch`: `main`
   - `Folder`: `/ (root)`
6. 保存后等待 GitHub 发布

发布成功后，访问：

`https://你的用户名.github.io/你的仓库名/`

### 方案二：命令行推送

如果你已经在本机安装并登录 Git：

```powershell
git init
git add .
git commit -m "Initial commit: order grouping web app"
git branch -M main
git remote add origin https://github.com/你的用户名/你的仓库名.git
git push -u origin main
```

然后再到 GitHub 开启 Pages。

## 技术说明

- 页面：`index.html`
- 样式：`styles.css`
- 逻辑：`app.js`
- Excel 解析：浏览器端使用 SheetJS CDN

## 算法说明

网页版使用的是高效贪心策略，而不是暴力组合枚举：

1. 先把 `>=100` 的订单直接单独成组
2. 对剩余订单按金额排序
3. 每次取当前最大金额作为锚点
4. 优先寻找一个能直接补足到 `>=100` 的最小订单
5. 如果找不到，就先加入当前最小订单继续凑组

这样可以避免订单数量上来后出现组合爆炸，更适合浏览器内实时运行。
