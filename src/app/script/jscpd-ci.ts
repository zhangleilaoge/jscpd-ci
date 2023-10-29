#!/usr/bin/env node

import path from "path"
import { triggerWebhook, getDataToSend } from "../utils"

/** 以下为ci环境变量，在.gitlab-ci.yml中声明即可使用 */
const { CI_JOB_ID, CI_COMMIT_REF_NAME, CI_COMMIT_SHA, CI_PROJECT_NAME } =
  process.env

/** 以下为pipeline_schedules的配置中需要定义的变量，也需要在.gitlab-ci.yml中声明才可使用 */
const { SCHEDULE_JOB_URL, SCHEDULE_JSCPD_THRESHOLD, SCHEDULE_WEBHOOK_URL } =
  process.env

import(`${path.join(process.cwd(), "./report/jscpd-report.json")}`)
  .then((jscpdResult) => {
    if (
      !SCHEDULE_JOB_URL ||
      !SCHEDULE_JSCPD_THRESHOLD ||
      !SCHEDULE_WEBHOOK_URL
    ) {
      console.error(
        "schedules 配置缺失，请在 ci 环境中运行当前脚本，并按照 jscpd-ci 的 README.md 进行配置"
      )
      return
    }

    if (
      !CI_JOB_ID ||
      !CI_COMMIT_REF_NAME ||
      !CI_COMMIT_SHA ||
      !CI_PROJECT_NAME
    ) {
      console.error("ci 环境变量缺失，请在 ci 环境中运行当前脚本")
      return
    }

    triggerWebhook(
      SCHEDULE_WEBHOOK_URL,
      getDataToSend({
        jscpdResult,
        scheduleJscpdThreshold: SCHEDULE_JSCPD_THRESHOLD,
        scheduleJobUrl: SCHEDULE_JOB_URL,
        ciCommitRefName: CI_COMMIT_REF_NAME!,
        ciCommitSha: CI_COMMIT_SHA!,
        ciProjectName: CI_PROJECT_NAME!,
        ciJobId: CI_JOB_ID!,
      })
    )
  })
  .catch((error) => {
    console.error("请先在根目录执行 jscpd，生成 jscpd-report.json", error)
  })
