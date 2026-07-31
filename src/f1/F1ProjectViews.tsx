import { useRef } from 'react'
import { Link } from 'react-router-dom'
import type { TechnicalProject } from '../projects/projectData'
import { technicalProjects } from '../projects/projectData'
import { ProjectShowcaseVisual, ProjectVisual } from '../projects/ProjectVisuals'
import { useF1PageMotion } from './useF1Motion'

export function F1ProjectsView() {
  const pageRef = useRef<HTMLElement>(null)
  useF1PageMotion(pageRef, technicalProjects.length)

  return (
    <main className="f1-projects" id="main-content" ref={pageRef}>
      <header className="f1-projects__hero" id="top">
        <p className="f1-kicker"><span>ENG</span> SYSTEMS / ROBOTS / NETWORKS</p>
        <h1>
          <span className="f1-line-mask"><span data-f1-hero-line>技术</span></span>
          <span className="f1-line-mask"><span data-f1-hero-line>作品<i>.</i></span></span>
        </h1>
        <p data-f1-media>不是项目徽章墙。这里写系统怎么连、为什么这么做，以及当前边界。</p>
      </header>

      <section className="f1-projects__grid" aria-label="技术项目">
        {technicalProjects.map((project, index) => (
          <article className={`f1-project-tile f1-project-tile--${project.tone}`} key={project.slug} data-f1-reveal>
            <div className="f1-project-tile__visual" data-f1-media>
              <ProjectShowcaseVisual tone={project.tone} />
              <span className="f1-project-tile__scan" aria-hidden="true" />
            </div>
            <div className="f1-project-tile__copy">
              <header><span>{project.number}</span><small>{project.eyebrow}</small></header>
              <h2>{project.title}</h2>
              <p>{project.statement}</p>
              <dl>
                {project.metrics.map((metric) => <div key={metric.label}><dt>{metric.label}</dt><dd>{metric.value}</dd></div>)}
              </dl>
              <div className="f1-project-tile__actions">
                <Link className="f1-button f1-button--light" to={`/projects/${project.slug}`}><span>查看技术档案</span><i>→</i></Link>
                <a href={project.repository} target="_blank" rel="noreferrer">GITHUB ↗</a>
              </div>
            </div>
            <span className="f1-project-tile__position" aria-hidden="true">P{index + 1}</span>
          </article>
        ))}
      </section>
    </main>
  )
}
export function F1ProjectDetailView({ project }: { project: TechnicalProject }) {
  const pageRef = useRef<HTMLElement>(null)
  useF1PageMotion(pageRef, project.slug)

  return (
    <main className={`f1-project-detail f1-project-detail--${project.tone}`} id="main-content" ref={pageRef}>
      <header className="f1-project-detail__hero" id="top">
        <nav aria-label="面包屑"><Link to="/projects">技术作品</Link><span>/</span><span>{project.shortTitle}</span></nav>
        <div className="f1-project-detail__copy">
          <p className="f1-kicker"><span>{project.number}</span> {project.eyebrow}</p>
          <h1>
            {project.title.split(' ').map((word, index) => (
              <span className="f1-line-mask" key={`${word}-${index}`}><span data-f1-hero-line>{word}{index === project.title.split(' ').length - 1 ? <i>.</i> : ''}</span></span>
            ))}
          </h1>
          <p className="f1-project-detail__statement" data-f1-hero-line>{project.statement}</p>
          <p data-f1-hero-line>{project.summary}</p>
          <div className="f1-project-detail__actions" data-f1-hero-line>
            <a className="f1-button f1-button--red" href={project.repository} target="_blank" rel="noreferrer"><span>查看 GitHub 源码</span><i>↗</i></a>
            <span>{project.status}</span>
          </div>
        </div>
        <div className="f1-project-detail__visual" data-f1-media><ProjectVisual tone={project.tone} /></div>
        <dl className="f1-project-detail__metrics" data-f1-media>
          {project.metrics.map((metric) => <div key={metric.label}><dt>{metric.label}</dt><dd>{metric.value}</dd></div>)}
        </dl>
      </header>

      <section className="f1-tech-section f1-tech-section--architecture" aria-labelledby="f1-architecture-title">
        <header data-f1-reveal><p className="f1-kicker"><span>A</span> ARCHITECTURE / DATA PATH</p><h2 id="f1-architecture-title">系统怎么串起来</h2></header>
        <ol className="f1-tech-flow">
          {project.architecture.map((node, index) => (
            <li key={node.name} data-f1-reveal><span>{String(index + 1).padStart(2, '0')}</span><strong>{node.name}</strong><p>{node.detail}</p></li>
          ))}
        </ol>
      </section>

      <section className="f1-tech-section f1-tech-section--stack" aria-labelledby="f1-stack-title">
        <header data-f1-reveal><p className="f1-kicker"><span>B</span> STACK / OPERATING CONSTRAINTS</p><h2 id="f1-stack-title">技术栈</h2></header>
        <div className="f1-tech-cards">
          {project.stack.map((item, index) => (
            <article key={item.name} data-f1-reveal><span>{String(index + 1).padStart(2, '0')}</span><h3>{item.name}</h3><p>{item.detail}</p></article>
          ))}
        </div>
      </section>

      <section className="f1-tech-section f1-tech-section--implementation" aria-labelledby="f1-implementation-title">
        <header data-f1-reveal><p className="f1-kicker"><span>C</span> ENGINEERING DECISIONS</p><h2 id="f1-implementation-title">实现方法</h2></header>
        <div className="f1-tech-decisions">
          {project.implementation.map((item, index) => (
            <article key={item.title} data-f1-reveal><span>{String(index + 1).padStart(2, '0')}</span><h3>{item.title}</h3><p>{item.body}</p></article>
          ))}
        </div>
      </section>

      <section className="f1-tech-section f1-tech-section--boundaries" aria-labelledby="f1-boundaries-title">
        <header data-f1-reveal><p className="f1-kicker"><span>D</span> CURRENT BOUNDARY / READ THIS</p><h2 id="f1-boundaries-title">当前边界</h2></header>
        <ul>{project.boundaries.map((boundary, index) => <li key={boundary} data-f1-reveal><span>{String(index + 1).padStart(2, '0')}</span><p>{boundary}</p></li>)}</ul>
      </section>

      <section className="f1-project-detail__exit" data-f1-reveal>
        <div><p className="f1-kicker"><span>END</span> SOURCE / NEXT PROJECT</p><h2>{project.repositoryLabel}</h2></div>
        <div><a href={project.repository} target="_blank" rel="noreferrer">打开源码仓库 ↗</a><Link to="/projects">返回项目索引 →</Link></div>
      </section>
    </main>
  )
}

export function F1ProjectNotFoundView() {
  return (
    <main className="f1-not-found" id="main-content">
      <p className="f1-kicker"><span>DNF</span> PROJECT NOT FOUND</p>
      <strong>404</strong>
      <h1>这里没有<br />这个项目。</h1>
      <Link className="f1-button f1-button--red" to="/projects"><span>返回技术作品</span><i>→</i></Link>
    </main>
  )
}
