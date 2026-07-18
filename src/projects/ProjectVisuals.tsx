import type { ProjectTone } from './projectData'

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
