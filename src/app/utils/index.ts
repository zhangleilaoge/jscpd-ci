import https from "https"
import { URL } from "url"
import { IJscpdResult } from "../../types"
import { parse, distanceInWordsToNow, format } from "date-fns"
import { execSync } from "child_process"

interface IGetLatestCopy {
  jscpdResult: IJscpdResult
}

interface IGetDataToSend {
  jscpdResult: IJscpdResult
  scheduleJscpdThreshold: string
  scheduleJobUrl: string
  ciCommitRefName: string
  ciCommitSha: string
  ciProjectName: string
  ciJobId: string
}

/** @description 获取指定文件指定行的commitMessage */
export const getCommitMessage = (line: number, path: string) => {
  const commitInfo = execSync(`git blame -L ${line},${line} ${path}`, {
    encoding: "utf-8",
  })
  const commitMatch = commitInfo.match(/\w+/)

  if (!commitMatch) {
    return "unknown commit"
  }

  const commitHash = commitMatch[0]

  const commitMessage = execSync(`git log --format="%s" -n 1 ${commitHash}`, {
    encoding: "utf-8",
  })

  return commitMessage.trim()
}

/** @description 触发webhook */
export const triggerWebhook = (webhookUrl: string, data: Object) => {
  const url = new URL(webhookUrl)
  const postData = JSON.stringify(data)
  const postDataLen = Buffer.byteLength(postData)
  const req = https.request({
    method: "POST",
    hostname: url.hostname,
    port: url.port,
    path: url.pathname,
    headers: {
      "Content-Type": "application/json",
      "Content-Length": postDataLen,
    },
  })

  req.write(postData)
  req.end()
}

/** @description 获取最近新增重复代码相关信息 */
export const getLatestCopy = ({ jscpdResult }: IGetLatestCopy) => {
  const { duplicates: JSCPD_DUPLICATES } = jscpdResult

  let latestTime = 0
  let copySource = ""
  let copyFragment = ""

  JSCPD_DUPLICATES.forEach((duplicate) => {
    const { firstFile, secondFile, fragment } = duplicate

    const {
      startLoc: startLoc1st,
      endLoc: endLoc1st,
      blame: blame1st,
      name: name1st,
    } = firstFile
    const {
      startLoc: startLoc2nd,
      endLoc: endLoc2nd,
      blame: blame2nd,
      name: name2nd,
    } = secondFile

    const { line: startLine1st, column: startColumn1st } = startLoc1st
    const { line: endLine1st, column: endColumn1st } = endLoc1st
    const { line: startLine2nd, column: startColumn2nd } = startLoc2nd
    const { line: endLine2nd, column: endColumn2nd } = endLoc2nd

    const blame1stKeys = Object.keys(blame1st)
    const blame2ndKeys = Object.keys(blame2nd)
    const noBlame1st = blame1stKeys.length === 0
    const noBlame2nd = blame2ndKeys.length === 0

    // 只处理有作者信息和时间信息的代码
    if (noBlame1st || noBlame2nd) {
      return
    }

    const blameSample1st = blame1st[blame1stKeys[0] as unknown as number]
    const blameSample2nd = blame2nd[blame2ndKeys[0] as unknown as number]

    const { author: blameAuthor1st, date: blameDate1st } = blameSample1st
    const { author: blameAuthor2nd, date: blameDate2nd } = blameSample2nd

    const blameTime1st = parse(blameDate1st).getTime()
    const blameTime2nd = parse(blameDate2nd).getTime()

    const currentLatestTime = Math.max(blameTime1st, blameTime2nd)

    if (latestTime < currentLatestTime) {
      latestTime = currentLatestTime

      const distance1st = distanceInWordsToNow(blameTime1st)
      const distance2nd = distanceInWordsToNow(blameTime2nd)
      // example: /builds/fe/guide-b-pc/client/pages/shopping-guide/view/incentive/detail/goods/components/filter/index.tsx (63:11 - 70:2) (zhanglei_zl，13 days • feat: init)
      const source1st = `${name1st} (${startLine1st}:${startColumn1st} - ${endLine1st}:${endColumn1st}) (${blameAuthor1st}，${distance1st} ago • ${getCommitMessage(
        startLine1st,
        name1st
      )})`
      const source2nd = `${name2nd} (${startLine2nd}:${startColumn2nd} - ${endLine2nd}:${endColumn2nd}) (${blameAuthor2nd}，${distance2nd} ago • ${getCommitMessage(
        startLine2nd,
        name2nd
      )})`

      copySource = `${source1st},\n${source2nd}`
      copyFragment = fragment
    }
  })
  return { copySource, copyFragment }
}

/** @description 组装webhook的postData */
export const getDataToSend = ({
  jscpdResult,
  scheduleJscpdThreshold,
  scheduleJobUrl,
  ciCommitRefName,
  ciCommitSha,
  ciProjectName,
  ciJobId,
}: IGetDataToSend) => {
  const { statistics: JSCPD_STATISTICS } = jscpdResult
  const { total: JSCPD_TOTAL } = JSCPD_STATISTICS
  const isPass = +JSCPD_TOTAL.percentage <= +scheduleJscpdThreshold
  const { copySource, copyFragment } = getLatestCopy({ jscpdResult })
  const tip = isPass
    ? "✅ 代码重复度低于阈值，请继续保持"
    : "❌ 代码重复度超过阈值，请检查近期发布是否存在重复代码拷贝"
  const statusMsg = `**检查结果**：${isPass ? "通过" : "失败"}`
  const dateMsg = `**检查时间**：${format(Date.now(), "MM-DD HH:mm:ss")}`
  const errorMsg = `**结果详情**：jscpd found too many duplicates (${JSCPD_TOTAL.percentage}%) over threshold (${scheduleJscpdThreshold}%) in ${ciProjectName}`
  const successMsg = `**结果详情**：the code repetition rate (${JSCPD_TOTAL.percentage}%) is lower than  threshold (${scheduleJscpdThreshold}%) in ${ciProjectName}`
  const branchMsg = `**分支**：${ciCommitRefName}`
  const commitMsg = `**commit**：${ciCommitSha}`
  const latestCopyMsg = `**最近新增的重复代码**：\n${copySource}`
  const jobDetailStr = [
    statusMsg,
    dateMsg,
    isPass ? successMsg : errorMsg,
    branchMsg,
    commitMsg,
    latestCopyMsg,
  ].join("\n")
  const jobUrl = `${scheduleJobUrl}${ciJobId}`

  const dataToSend = {
    ciProjectName,
    jobDetailStr,
    copyFragment,
    tip,
    jobUrl,
  }

  return dataToSend
}
