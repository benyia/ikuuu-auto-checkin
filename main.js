import { appendFileSync } from "fs";

const host = process.env.HOST || "ikuuu.win";
const sckey = process.env.SCKEY; // 读取 Server酱 的 SendKey

const checkInUrl = `https://${host}/user/checkin`;

// 签到核心逻辑
async function checkIn(account) {
  const response = await fetch(checkInUrl, {
    method: "POST",
    headers: {
      Cookie: account.cookie,
    },
  });

  if (!response.ok) {
    throw new Error(`网络请求出错 - ${response.status}`);
  }

  const data = await response.json();
  console.log(`${account.name}: ${data.msg}`);

  return data.msg;
}

// 处理单个账号
async function processSingleAccount(account) {
  const checkInResult = await checkIn(account);
  return checkInResult;
}

// 输出到 GitHub Actions 日志
function setGitHubOutput(name, value) {
  appendFileSync(process.env.GITHUB_OUTPUT, `${name}<<EOF\n${value}\nEOF\n`);
}

// 发送 Server酱 通知
async function sendServerChan(title, content) {
  if (!sckey) {
    console.log("⚠️ 未配置 SCKEY，跳过 Server酱 推送。");
    return;
  }

  try {
    console.log("正在发送 Server酱 通知...");
    const res = await fetch(`https://sctapi.ftqq.com/${sckey}.send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        text: title,
        desp: content,
      }),
    });

    const data = await res.json();
    if (data.code === 0) {
      console.log("✅ Server酱 推送成功！");
    } else {
      console.error("❌ Server酱 推送失败:", data);
    }
  } catch (error) {
    console.error("❌ Server酱 推送异常:", error.message);
  }
}

// 主入口
async function main() {
  let accounts;

  try {
    if (!process.env.ACCOUNTS) {
      throw new Error("❌ 未配置账户信息。");
    }

    accounts = JSON.parse(process.env.ACCOUNTS);
  } catch (error) {
    const message = `❌ ${
      error.message.includes("JSON") ? "账户信息配置格式错误。" : error.message
    }`;
    console.error(message);
    setGitHubOutput("result", message);
    process.exit(1);
  }

  const allPromises = accounts.map((account) => processSingleAccount(account));
  const results = await Promise.allSettled(allPromises);

  const msgHeader = "\n======== 签到结果 ========\n\n";
  console.log(msgHeader);

  let hasError = false;

  const resultLines = results.map((result, index) => {
    const accountName = accounts[index].name;
    const isSuccess = result.status === "fulfilled";

    if (!isSuccess) {
      hasError = true;
    }

    const icon = isSuccess ? "✅" : "❌";
    const message = isSuccess ? result.value : result.reason.message;
    const line = `${accountName}: ${icon} ${message}`;

    isSuccess ? console.log(line) : console.error(line);
    return line;
  });

  const resultMsg = resultLines.join("\n");
  setGitHubOutput("result", resultMsg);

  // 触发 Server酱 推送
  const title = hasError ? "iKuuu 签到失败" : "iKuuu 签到成功";
  const content = `${msgHeader}${resultMsg}`;
  await sendServerChan(title, content);

  if (hasError) {
    process.exit(1);
  }
}

main();
