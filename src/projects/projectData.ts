export type ProjectTone = 'robot' | 'network'

export type TechnicalProject = {
  slug: string
  number: string
  tone: ProjectTone
  eyebrow: string
  title: string
  shortTitle: string
  summary: string
  statement: string
  repository: string
  repositoryLabel: string
  status: string
  metrics: Array<{ value: string; label: string }>
  stack: Array<{ name: string; detail: string }>
  architecture: Array<{ name: string; detail: string }>
  implementation: Array<{ title: string; body: string }>
  boundaries: string[]
}

export const technicalProjects: TechnicalProject[] = [
  {
    slug: 'rm-robot-rust',
    number: '01',
    tone: 'robot',
    eyebrow: 'EMBEDDED ROBOTICS / OPEN SOURCE',
    title: 'RM Robot Rust Control Framework',
    shortTitle: 'RM Robot Rust',
    summary: '面向 RoboMaster C 型开发板的 Rust no_std 实时控制固件，以及与控制回路隔离的 Linux 深度摘要发送器。',
    statement: '把电机控制、遥控输入和失效保护拆成有明确边界的模块，让“能动”之前先满足“能安全停下”。',
    repository: 'https://github.com/ZONGRUICHD/RM-Robot-Rust',
    repositoryLabel: 'ZONGRUICHD / RM-Robot-Rust',
    status: '实验性固件 · main 基线已实现',
    metrics: [
      { value: '1 kHz', label: '整车控制循环' },
      { value: '2× CAN', label: '底盘与云台总线' },
      { value: 'no_std', label: 'MCU 控制路径' },
    ],
    stack: [
      { name: 'Rust 1.95', detail: '固定工具链；主固件使用 no_std、定长数据结构与无堆分配控制路径。' },
      { name: 'STM32F407VGT6', detail: 'RoboMaster C 型开发板，168 MHz；stm32f4xx-hal、cortex-m 与 cortex-m-rt。' },
      { name: 'CAN / S.BUS', detail: 'CAN1 驱动四台 M3508/C620，CAN2 驱动 6623 与 GM6020；USART3 接收遥控。' },
      { name: 'Orange Pi / Orbbec', detail: '独立 Rust std 子项目采集 DaBai DCW 深度流并编码 66 字节摘要。' },
    ],
    architecture: [
      { name: '遥控输入', detail: 'FS-i6 / FS-A8S · S.BUS 100000 8E2' },
      { name: '实时核心', detail: 'STM32F407 · 1 kHz SysTick · 安全门' },
      { name: '执行机构', detail: 'CAN1 底盘四电机 · CAN2 双轴云台' },
      { name: '视觉侧车', detail: 'Orbbec → Orange Pi → 66 B 定长摘要' },
    ],
    implementation: [
      {
        title: '中断只收数据，控制集中在固定周期',
        body: 'CAN 与 S.BUS 中断只采集经过边界校验的定长帧；状态更新、PID、混控与电流输出统一进入 1 kHz 主循环，避免把不确定工作塞进中断。',
      },
      {
        title: '按领域拆开硬件和控制逻辑',
        body: 'domain 定义命令与协议，control 提供 PID 与限幅，chassis / gimbal 实现子系统，platform 负责 STM32 外设；纯逻辑可以在主机上测试。',
      },
      {
        title: '把安全门当成主流程',
        body: '上电锁定、遥控居中解锁、100 ms 遥控超时、20 ms 电机反馈新鲜度、5 ms 控制漏拍和独立看门狗共同决定是否允许输出。',
      },
      {
        title: '视觉链路不进入电机实时回路',
        body: 'Linux 发送器只负责深度采集、摘要编码和串口/UDP/stdout 传输实验；MCU 端定长解析器与 CRC 已有测试，但平台接收尚未接入 main。',
      },
    ],
    boundaries: [
      '固件会直接驱动大功率电机，机械参数、方向和 PID 必须在架空车轮与云台的条件下重新标定。',
      '云台默认未标定，因此默认锁零；IMU 与姿态融合仅保留接口。',
      'ROS 2、SLAM、Nav2 与自动驾驶闭环不在当前 main 中。',
      '视觉摘要协议已经实现，但 Orange Pi 到 MCU 的实际接收驱动尚未打通。',
    ],
  },
  {
    slug: 'arista-switch-dashboard',
    number: '02',
    tone: 'network',
    eyebrow: 'NETWORK OPERATIONS / ON-BOX WEB UI',
    title: 'Arista Switch Web Dashboard',
    shortTitle: 'Arista Dashboard',
    summary: '面向 Arista DCS-7050QX-32S-F 的单文件 on-box 运维界面，在 EOS 内直接提供受保护的状态查看与配置流程。',
    statement: '让交换机自己托管管理界面，同时把认证、配置预览、事务提交和失败回滚放在功能之前。',
    repository: 'https://github.com/ZONGRUICHD/Arista-Switch-Web-Dashboard',
    repositoryLabel: 'ZONGRUICHD / Arista-Switch-Web-Dashboard',
    status: 'EOS on-box 应用 · 安全部署链已实现',
    metrics: [
      { value: '1 file', label: '生产部署产物' },
      { value: '0 CDN', label: '外部运行依赖' },
      { value: '2480', label: '默认 HTTPS 端口' },
    ],
    stack: [
      { name: 'Python 3.9', detail: '生产端只使用 EOS 自带 Python 标准库，以 ThreadingHTTPServer 承载单文件服务。' },
      { name: 'HTML / CSS / JS', detail: '原生浏览器端界面；构建脚本确定性地嵌入 Python 产物，不依赖外部 CDN。' },
      { name: 'EOS eAPI / CLI', detail: '状态优先从本机 eAPI / Unix socket 读取，并按需回退本机 Cli 或 FastCli。' },
      { name: 'Playwright / unittest', detail: 'fixture 预览覆盖响应式交互；Python 测试检查解析、安全协议和安装器契约。' },
    ],
    architecture: [
      { name: '管理浏览器', detail: 'HTTPS · 登录会话 · CSRF' },
      { name: '单文件服务', detail: 'Python stdlib · 认证 · API · 静态前端' },
      { name: '状态采集', detail: 'localhost eAPI / Unix socket → Cli / FastCli fallback' },
      { name: '配置提交', detail: '预览差异 → 临时解锁 → transaction lock → session' },
    ],
    implementation: [
      {
        title: '为受限的 EOS 环境缩小依赖面',
        body: '唯一前端源码位于 web/；构建器把它确定性地嵌入 onbox/arista7050_web.py。生产不需要 Node.js、容器或外部 CDN。',
      },
      {
        title: '读取状态，不开放任意命令入口',
        body: '端口、邻居、VLAN、ARP/MAC、路由、环境与设备健康由固定采集器读取；诊断只接受注册命令 ID 和严格校验的参数。',
      },
      {
        title: '配置变更先预览，再事务提交',
        body: '写操作需要登录、CSRF 与 15 分钟二次解锁。服务生成命令与差异并记录 running-config 基线；提交前取得 EOS transaction lock，复核基线后通过 configuration session 应用。',
      },
      {
        title: '部署本身也是受验证的事务',
        body: '安装器只接受完整 commit 与显式 SHA-256，在 127.0.0.1:2481 启动隔离候选并验证健康、登录和核心 API，随后原子切换；失败时恢复旧产物与启动配置。',
      },
    ],
    boundaries: [
      'server.js 只提供 loopback fixture 预览，不连接真实交换机，也不能当作生产服务。',
      '生产界面只接受 HTTPS；自签名证书必须先核对 SAN 与 SHA-256 指纹。',
      '项目不会为管理网络新开外部 eAPI，推荐把 eAPI 保持在 localhost / Unix socket。',
      '任何配置变更仍应先在对应 EOS 版本与实验设备上验证，不能用网页流程代替变更审计。',
    ],
  },
]

export function findTechnicalProject(slug: string | undefined) {
  return technicalProjects.find((project) => project.slug === slug)
}
