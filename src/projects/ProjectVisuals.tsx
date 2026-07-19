import type { ProjectTone } from './projectData'

function RobotShowcaseVisual() {
  return (
    <figure className="robot-visual">
      <div className="robot-visual__frame">
        <img
          className="robot-visual__photo"
          src="/assets/xjtlu-robomaster-infantry.gif?v=39cca43"
          alt="2019 XJTLU RoboMaster 步兵机器人实机运行画面"
          loading="lazy"
          decoding="async"
        />
        <div className="robot-visual__rust" aria-label="使用 Rust 构建">
          <img src="/assets/rust-logo.svg" alt="" aria-hidden="true" />
          <span>BUILT WITH</span>
          <strong>RUST</strong>
        </div>
      </div>
      <figcaption>
        <span>ROBOMASTER INFANTRY / XJTLU 2019</span>
        <small>RUST · STM32 · CAN · NO_STD</small>
      </figcaption>
    </figure>
  )
}

function DashboardShowcaseVisual() {
  const ports = Array.from({ length: 14 }, (_, index) => index)

  return (
    <div
      className="dashboard-visual"
      role="img"
      aria-label="Arista 交换机仪表盘界面，展示设备健康、接口流量和端口状态"
    >
      <div className="dashboard-window">
        <div className="dashboard-window__bar">
          <span />
          <span />
          <span />
          <strong>ARISTA / EOS</strong>
        </div>
        <div className="dashboard-window__body">
          <aside>
            <b>ZR</b>
            <i />
            <i />
            <i />
            <i />
          </aside>
          <div className="dashboard-content">
            <div className="dashboard-heading">
              <div>
                <small>CORE-SWITCH-01</small>
                <strong>System overview</strong>
              </div>
              <span>HEALTHY</span>
            </div>
            <div className="dashboard-metrics">
              <div><small>CPU</small><strong>12%</strong></div>
              <div><small>MEMORY</small><strong>38%</strong></div>
              <div><small>UPLINK</small><strong>40G</strong></div>
            </div>
            <div className="dashboard-chart">
              {[34, 48, 42, 70, 58, 82, 66, 76, 54].map((height) => (
                <span style={{ height: `${height}%` }} key={height} />
              ))}
            </div>
            <div className="dashboard-ports">
              {ports.map((port) => <span key={port} className={port % 5 === 0 ? 'is-idle' : ''} />)}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function ProjectShowcaseVisual({ tone }: { tone: ProjectTone }) {
  return tone === 'robot' ? <RobotShowcaseVisual /> : <DashboardShowcaseVisual />
}

function RobotVisual() {
  return (
    <div className="project-visual project-visual--robot" aria-hidden="true">
      <span className="project-visual__axis project-visual__axis--x" />
      <span className="project-visual__axis project-visual__axis--y" />
      <div className="robot-core">
        <small>1 KHZ</small>
        <strong>F407</strong>
        <span>CONTROL</span>
      </div>
      <div className="robot-bus robot-bus--one"><span>CAN 1</span></div>
      <div className="robot-bus robot-bus--two"><span>CAN 2</span></div>
      <i className="robot-node robot-node--lf">LF</i>
      <i className="robot-node robot-node--rf">RF</i>
      <i className="robot-node robot-node--lr">LR</i>
      <i className="robot-node robot-node--rr">RR</i>
      <i className="robot-node robot-node--yaw">YAW</i>
      <i className="robot-node robot-node--pitch">PITCH</i>
      <div className="robot-signal"><span>S.BUS</span><b /></div>
    </div>
  )
}

function NetworkVisual() {
  const ports = Array.from({ length: 16 }, (_, index) => index)
  return (
    <div className="project-visual project-visual--network" aria-hidden="true">
      <div className="network-terminal__bar"><i /><i /><i /><span>ARISTA / EOS</span></div>
      <div className="network-terminal__body">
        <aside><strong>ZR</strong><i /><i /><i /></aside>
        <div className="network-panel">
          <small>SYSTEM OVERVIEW</small>
          <div className="network-metrics"><b>12%</b><b>38%</b><b>40G</b></div>
          <div className="network-chart">
            {[42, 58, 48, 78, 69, 87, 72, 83, 61].map((height, index) => <i style={{ height: `${height}%` }} key={index} />)}
          </div>
          <div className="network-ports">
            {ports.map((port) => <i className={port === 5 || port === 11 ? 'is-idle' : ''} key={port} />)}
          </div>
        </div>
      </div>
    </div>
  )
}

export function ProjectVisual({ tone }: { tone: ProjectTone }) {
  return tone === 'robot' ? <RobotVisual /> : <NetworkVisual />
}
