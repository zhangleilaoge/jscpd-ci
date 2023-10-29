## 简介

`jscpd-ci` 提供**ci 代码重复度检查**以及**检查报告发送 webhook**的能力。

## 效果预览

![机器人通知信息](https://img01.yzcdn.cn/upload_files/2023/10/23/Fi5EJkPzm1945_K7sU2JEdBCkAic.jpeg)

如图所示，检查报告包含：

1. 检查结果：检查结果是否超过给定的阈值
2. 检查时间：检查发生的时间
3. 结果详情：结果具体说明
4. 分支：检查的目标分支
5. commit：检查代码对应的 commit
6. 最新重复代码：最新产生的重复代码详情，包含代码位置、作者、时间、commitMessage、具体代码
7. 查看详情：跳转至 gitlab 的 ciJob 执行现场

![ciJob执行明细](https://img01.yzcdn.cn/upload_files/2023/10/19/Fvr0AYnlsD_IG6y5r22BIt9f2Ydr.png)

## 接入方法

### 1.添加依赖

本包的能力基于 `jscpd`，因此适用方首先需要添加 `jscpd` 以及本能力包至 `devDependencies`中：

```shell
yarn add jscpd -D # jscpd 建议版本为 ^3.5.9

yarn add jscpd-ci
```

jscpd 需要进行一些简单的配置，推荐直接在 package.json 中配置，如下（注意 `reporters` 的配置必须包含 `json` 方式，因为脚本能力依赖 jscpd 的 json 格式产物）：

```json
// package.json
{
  ...
  "jscpd": {
    "threshold": 3.6, // 百分比重复度的阈值，超出则视为代码重复度过高
    "reporters": [
      "html",
      "console",
      "json"
    ], // 报告输出的方式，注意 "reporters" 的配置必须包含 "json" 方式，因为脚本能力依赖 jscpd 的 json 格式产物
    "ignore": [
      ".git",
      "**/node_modules",
      ".husky",
      "**/dist",
      "run",
      ...
    ],
    "format": [
      "javascript",
      "typescript"
    ]
  }
}


```

### 2.添加 webhook 机器人

> 机器人配置平台 https://robot.qima-inc.com/#/robot/list?scope=self&pluginId=&name=&status=all&page=1&pageSize=10

![机器人配置平台](https://img01.yzcdn.cn/upload_files/2023/10/19/FjPkqGZONkGmxWPcPOoewZTcRw7c.png)

一般 ci 环境 git-runner 的运行环境不允许访问外网，我们不能直接使用飞书、企微等平台提供的 webhook 地址，需要在机器人配置平台生成 webhook 的内网映射。

新增机器人映射时，需要消息插件将请求体转换为对应平台的卡片展示数据结构。以下是飞书卡片的插件代码如下：

```javascript
function main(ctx, utils) {
  const { ciProjectName, jobDetailStr, copyFragment, tip, jobUrl } = ctx.body
  return {
    feishu: {
      msg_type: "interactive",
      card: {
        elements: [
          {
            tag: "div",
            text: {
              content: jobDetailStr,
              tag: "lark_md",
            },
          },
          {
            tag: "column_set",
            flex_mode: "none",
            background_style: "grey",
            columns: [
              {
                tag: "column",
                elements: [
                  {
                    tag: "markdown",
                    content: copyFragment,
                  },
                ],
              },
            ],
          },
          {
            tag: "div",
            text: {
              content: tip,
              tag: "lark_md",
            },
          },
          {
            actions: [
              {
                tag: "button",
                text: {
                  content: "查看详情",
                  tag: "lark_md",
                },
                url: jobUrl,
                type: "primary",
                value: {},
              },
            ],
            tag: "action",
          },
        ],
        header: {
          title: {
            content: `[${ciProjectName}] 代码重复度检查通知`,
            tag: "plain_text",
          },
        },
      },
    },
  }
}
```

### 3.配置 gitlab 上的 schedules

配置 `schedules`，用于定期触发重复度检查，以及给检查脚本传递必要参数：

- `SCHEDULE_JOB_URL`，用于构成执行明细的地址
- `SCHEDULE_JSCPD_THRESHOLD`，`jscpd` 检查的百分比阈值，与 package.json 中的配置保持一致
- `SCHEDULE_WEBHOOK_URL`，机器人 webhook 的地址

![CI/CD schedule](https://img01.yzcdn.cn/upload_files/2023/10/19/Fudv5BKgYYrGhmg7jvfEfuQUeXSs.png)

### 4.配置 gitlab-ci.yml

```yml
image: "harbor.qima-inc.com/node/node:14.15.0"

stages:
  - repeat-check

check-repeat:
  stage: repeat-check
  only:
    refs:
      - schedules
  before_script:
    - yarn --ignore-engines
  script:
    - npx jscpd -b || true # 超出阈值时脚本会 exit，此处需要让脚本继续执行下去
    # ci 环境变量，用于构建检查报告
    - export CI_JOB_ID
    - export CI_COMMIT_REF_NAME
    - export CI_COMMIT_SHA
    - export CI_PROJECT_NAME
    # 来自 schedules 配置的变量，用于构建检查报告
    - export SCHEDULE_JOB_URL
    - export SCHEDULE_JSCPD_THRESHOLD
    - export SCHEDULE_WEBHOOK_URL
    - npx jscpd-ci
```

### 5.完成

配置完成，可以 gitlab 上手动触发 schedule，来体验代码重复度检查的效果

## 常见问题

### 1.npm ERR! network request to https://xxx failed, reason: connect ETIMEDOUT

![npm Error](https://img01.yzcdn.cn/upload_files/2023/10/23/FojuTwohgiYvVHZOBifZym-g1786.jpeg)

原因：ci 环境 git-runner 的运行环境不允许访问公网，一些公网 npm 包依赖无法拉取

解决方法：将 yarn.lock 中依赖的包资源地址换成内网地址，以下是笔者切换包资源地址的小技巧，仅供参考

1. 确认当前 yarn 的 registry 为内网地址

```shell
➜  jscpd-ci git:(master) yarn config get registry
http://registry.npm.qima-inc.com/
```

2. 正则匹配 yarn.lock 中所有公网地址资源语句，替换为空字符串

```
resolved "http:\/\/registry\.yarnpkg\.com[^"]+?"
```

3. 重新 yarn

### 2.应用已经配置了一些 ci-schedule 和 ci-job，不想要串行执行 ci-job 怎么办

![ci-job](https://img01.yzcdn.cn/upload_files/2023/10/23/FiUjr6OhQYnxD4U6chAzTGVdJJ3y.jpeg)

解决办法：如果你的项目存在多个 schedule 触发的任务，你可以通过在不同的 schedule 中配置指定字段来控制执行不同的任务：

```yml
check-repeat:
  stage: repeat-check
  only:
    refs:
      - schedules
  script: ...
  # 用 rules 替换 only，仅 RUN_CHECK_REPEAT 为 true 且当前ci由 schedule 触发时，才会执行 check-repeat
  rules:
    - if: $RUN_CHECK_REPEAT == "true" && $CI_PIPELINE_SOURCE == "schedule"
```
