import { createMessage } from "./message";
import type { ChatMessage } from "./types";

const m = createMessage;

export function createWelcomeMessages(name: string, task: string): ChatMessage[] {
  return [
    m({ kind: "time", text: "今天 09:30" }),
    m({ kind: "text", from: "bot", text: `你好，我是${name}。很高兴为你服务，我会帮你${task}。` }),
    m({ kind: "choice", from: "bot", title: "你想先从哪件事开始？", options: ["看看今天的安排", "告诉我一个具体任务", "查看最近的进展"] }),
  ];
}

export const getJobMessages: ChatMessage[] = [
  m({ kind: "time", text: "11月2日周一 19:32" }),
  m({ kind: "text", from: "bot", text: "你好，我是 Get Job 👋 很高兴认识你，Anner！我可以帮你找职位、盯新岗位、改简历和准备申请。" }),
  m({ kind: "choice", from: "bot", title: "你现在最想让我先帮你做哪件事？", options: ["找合适的职位", "持续追踪新岗位", "优化简历", "准备面试"] }),
  m({ kind: "file", from: "user", name: "王敬松-Agent工程师简历.pdf", size: "117 kB" }),
  m({ kind: "text", from: "user", text: "我会发你简历，我们一起来准备专业的面试，你是我的面试助手，我会不断和你反馈面试准备，我们一起聊，一起不断进步" }),
  m({ kind: "text", from: "bot", text: "好的，我们一起准备！我先读一下你的简历。" }),
  m({ kind: "text", from: "bot", paragraphs: [
    "简历看完了，亮点很清楚：你从后端加私有化交付转到 Agent，手上有 Harness、语义层问数、沙箱、评测观测和 K8s 灰度这一整条链路。面试官最可能深挖的是 MOSS 的上下文压缩和记忆设计、沙箱的租户隔离与回收，还有公式生成准确率 90% 是怎么评测出来的。",
    "我们先热个身，我当面试官问第一题：请用两分钟介绍一下 MOSS 这个项目，重点讲你为什么这样选 Agent 框架，以及上下文压缩是怎么做的。你直接回答就行，我会点评再追问。如果你已经有目标公司或面试时间，也告诉我，我按那个来调整。",
  ] }),
  m({ kind: "time", text: "11月2日周一 21:46" }),
  m({ kind: "text", from: "user", text: "我们不仅仅是要做一个，你不需要来模拟面试官，你只是我在准备面试过程中的统筹专家，告诉我这个阶段该准备什么、还需要做什么。你需要主动思考下一步需要完善什么。你是我的面试进度管家，不只是一个模拟面试官的角色。你必须保证我可以 cover 住年薪 70 万到 80 万这个目标，并且知道我现在的状态和进度。" }),
  m({ kind: "text", from: "bot", text: "明白。我会作为你的面试统筹和进度管家，持续盯目标、缺口和每日进展，而不只是模拟提问。" }),
  m({ kind: "time", text: "今天 16:23" }),
  m({ kind: "text", from: "bot", text: "收到，御熙和国青智联都投。我先按你简历写两条开场白，你过一眼说行我再发。" }),
  m({ kind: "text", from: "bot", title: "御熙 · 给吴旭健", paragraphs: [
    "你好，我是王敬松，帆软 AI 中台做企业级 Agent。看岗位要 Agent 工作流、工具调用与可观测，以及能给 Java 团队落地的架构文档，很对口：我主导过问数 Agent 的 Harness（上下文压缩、记忆、tool search、子智能体）、语义层 + RAG，并用 Langfuse 做全链路 Trace 与效果评估；也做过租户隔离与权限。长期兼职可投入，方便简单聊聊项目范围和交付节奏吗？",
    "国青智联 · 给孙诗语",
    "你好，我是王敬松，在南京，帆软做 Agent 平台与私有化交付。岗位里从需求澄清到知识检索、评测、权限/日志、里程碑交付，和我做过的很像：问数 Agent（语义层 RAG、沙箱隔离、Langfuse 评测观测），以及客户现场交付与权限体系。远程项目制可以配合，方便确认本周可投入时间和首期范围吗？",
  ] }),
  m({ kind: "choice", from: "bot", title: "两条开场白可以这样发吗？", options: ["都行，直接发"] }),
  m({ kind: "text", from: "bot", text: "好，马上在 Boss 直聘发御熙和国青智联，发完告诉你。" }),
  m({ kind: "text", from: "bot", text: "发的时候大概要一两分钟，有结果就回你。" }),
  m({ kind: "text", from: "bot", title: "两条都发出去了（北京时间）：", list: [
    "上海御熙 · 吴旭健，16:24 — Boss 先自动发了默认招呼，定制开场白已「送达」，还没回",
    "国青智联 · 孙诗语，16:25 — 同样默认招呼 + 定制开场白「送达」，还没回",
  ], text: "我正在把这两条记进看板。" }),
  m({ kind: "images", from: "bot", images: ["/assets/chat-preview.svg", "/assets/chat-preview.svg"] }),
  m({ kind: "text", from: "bot", text: "社区那三条这轮没勾，先不动。有 HR 回信我会再帮你拟回复。" }),
  m({ kind: "text", from: "bot", text: "看板已更新：御熙、国青都进了「副业投递跟进」，副业待回复现在是 5 单。" }),
  m({ kind: "kanban", from: "bot", title: "面试机会看板 · 70–80万", subtitle: "已在下方更新" }),
  m({ kind: "time", text: "11月3日周二 23:51" }),
  m({ kind: "text", from: "user", text: "你要知道我们的面试准备，你是作为我的 Get Job 的管家，你的任务是非常的困难的。但是我相信你，但是你要拼尽全力。" }),
  m({ kind: "text", from: "bot", text: "拼尽全力。我盯着两周冲刺、缺口和管道，你按日清单推进；卡在哪回我，我立刻调切片。" }),
  m({ kind: "time", text: "11月4日周三 6:03" }),
  m({ kind: "text", from: "bot", text: "正在把第 2 天清单做成邮件草稿卡。" }),
  m({ kind: "email", from: "bot", title: "邮件", subtitle: "已发送邮件 · helloanner@qq.com" }),
  m({ kind: "text", from: "bot", text: "第 2 天清单草稿已好，请点上面卡片发送。未收到第 1 天进度，今日优先收口主仓 + 证据卡；算法 LC206 + 146。做完几项回聊天即可。" }),
  m({ kind: "time", text: "11月4日周三 7:26" }),
  m({ kind: "text", from: "bot", text: "今日清单已发到 QQ 邮箱。主仓和证据卡收口后回聊天，我好切第 3 天。" }),
  m({ kind: "time", text: "11月4日周三 8:11" }),
  m({ kind: "relay", text: "2 条消息往来：", relay: { name: "AI 趋势专家", shape: "splat", color: "#a97943" } }),
  m({ kind: "text", from: "bot", text: "趋势侧又来 4 条，我按面试用处拆进后面几天，今天不堆：优先 OpenAI Agents SDK 的安全/工具策略，其次 Cloudflare Pi 1.5（对标蚂蚁），再草一版自家 Skills 大纲；物理世界那篇只当市场信号。" }),
  m({ kind: "time", text: "11月4日周三 9:30" }),
  m({ kind: "relay", text: "消息来自", relay: { name: "市场分析专家", shape: "bean", color: "#13bfa6" } }),
  m({ kind: "text", from: "bot", text: "收到市场侧今日新岗，正在入库并重排优先。" }),
];

export const fineMessages: ChatMessage[] = [
  m({ kind: "time", text: "11月2日周一 19:16" }),
  m({ kind: "text", from: "bot", text: "你好，Anner！我是 Fine 工作专家，很高兴认识你 👋 接下来我想先了解一下你的工作，这样才能真正帮上忙。" }),
  m({ kind: "choice", from: "bot", title: "你最希望我先帮你处理哪类工作？", options: ["整理邮件和日程", "写文档、报告或幻灯片", "调研和信息汇总", "定期提醒和跟进"] }),
  m({ kind: "text", from: "user", text: "你可以登录一下 code.fineres.com/dashboard，用户名是 anner，登录信息我已经发你了。这是我们公司的代码库，以后你会需要从这里 clone 代码。" }),
  m({ kind: "text", from: "bot", text: "好的，我先把这个登录信息存进你的保险库，然后用我电脑上的浏览器试着登录代码库。" }),
  m({ kind: "text", from: "bot", text: "为了安全，密码我不在聊天里直接用。麻烦在下面的安全表单里再填一次密码并保存到保险库，之后我就能随时自动登录了。" }),
  m({ kind: "secure", from: "bot", title: "登录帆软代码库", subtitle: "安全表单" }),
  m({ kind: "text", from: "bot", text: "已保存到保险库：code.fineres.com 登录信息。我现在去试着登录，可能需要一两分钟。" }),
  m({ kind: "text", from: "bot", text: "已经登录好了：代码库是 Bitbucket，页面显示的是“Anner-王敬松”，能看到 E-AI 下的 corevo、wufan-ops、fine-ai-service、fineinsight-ops 等仓库，目前没有待你审阅的 PR。" }),
  m({ kind: "image", from: "bot", images: ["/assets/repository.svg"] }),
  m({ kind: "time", text: "11月2日周一 20:00" }),
  m({ kind: "text", from: "user", text: "https://fanruan-x.feishu.cn/wiki/ZIWswvy6EiY4gokNFusc7xOlnkb 帮我改一下这个文档的文字措辞，AI 味太重了，核心是文档的第一个图是全部的逻辑，说清楚就行了。" }),
  m({ kind: "text", from: "bot", text: "好的，我先读一下文档和第一张图，然后再动手改措辞。" }),
  m({ kind: "text", from: "bot", text: "I've started editing the document. I'll back up the original first, then rewrite the wording around the logic in the first diagram. I'll message you when it's done." }),
  m({ kind: "text", from: "bot", text: "《WuFan Tools 分层架构设计》的措辞已经改好并更新到了飞书文档里，图片、白板和表格都没有动。" }),
];
