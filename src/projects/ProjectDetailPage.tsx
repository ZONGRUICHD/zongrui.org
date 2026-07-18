import { Link, useParams } from 'react-router-dom'
import { SitePage } from '../components/SiteChrome'
import { usePageMeta } from '../articles/pageMeta'
import { useProjectReveals } from './projectMotion'
import { findTechnicalProject } from './projectData'
import { ProjectVisual } from './ProjectVisuals'
import './projects.css'

export function ProjectDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const project = findTechnicalProject(slug)
  useProjectReveals()
  usePageMeta({
    title: project ? `${project.title} — ZongRui` : '项目不存在 — ZongRui',
    description: project?.summary ?? '这个项目地址不存在。',
    canonical: project ? `https://zongrui.org/projects/${project.slug}` : 'https://zongrui.org/projects',
    noIndex: !project,
    language: 'zh-CN',
    ogLocale: 'zh_CN',
  })

  if (!project) {
    return (
      <SitePage compactHeader>
        <main className="project-not-found" id="main-content">
          <p className="projects-kicker">404 / PROJECT NOT FOUND</p>
          <h1>这里没有这个项目。</h1>
          <Link to="/projects">返回技术作品</Link>
        </main>
      </SitePage>
    )
  }

  return (
    <SitePage compactHeader>
      <main className={`project-detail project-detail--${project.tone}`} id="main-content">
        <section className="project-detail__hero" id="top">
          <div className="projects-shell">
            <nav className="project-breadcrumb" aria-label="面包屑">
              <Link to="/projects">技术作品</Link><span aria-hidden="true">/</span><span>{project.shortTitle}</span>
            </nav>
            <div className="project-detail__hero-grid">
              <div className="project-detail__intro" data-project-reveal>
                <div className="project-detail__eyebrow"><span>{project.number}</span><p>{project.eyebrow}</p></div>
                <h1>{project.title}</h1>
                <p className="project-detail__statement">{project.statement}</p>
                <p className="project-detail__summary">{project.summary}</p>
                <div className="project-detail__links">
                  <a href={project.repository} target="_blank" rel="noreferrer">查看 GitHub 源码 <span aria-hidden="true">↗</span></a>
                  <span>{project.status}</span>
                </div>
              </div>
              <div className="project-detail__visual" data-project-reveal>
                <ProjectVisual tone={project.tone} />
              </div>
            </div>
            <div className="project-detail__metrics" data-project-reveal>
              {project.metrics.map((metric) => (
                <div key={metric.label}><strong>{metric.value}</strong><span>{metric.label}</span></div>
              ))}
            </div>
          </div>
        </section>

        <section className="project-architecture" aria-labelledby="project-architecture-heading">
          <div className="projects-shell">
            <header className="project-section-heading" data-project-reveal>
              <p className="projects-kicker">ARCHITECTURE / DATA PATH</p>
              <h2 id="project-architecture-heading">系统怎么串起来</h2>
            </header>
            <ol className="project-architecture__flow">
              {project.architecture.map((node, index) => (
                <li data-project-reveal style={{ '--project-order': index } as React.CSSProperties} key={node.name}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <strong>{node.name}</strong>
                  <p>{node.detail}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="project-stack" aria-labelledby="project-stack-heading">
          <div className="projects-shell project-stack__layout">
            <header className="project-section-heading" data-project-reveal>
              <p className="projects-kicker">TECH STACK / WHY THESE PARTS</p>
              <h2 id="project-stack-heading">技术栈</h2>
              <p>不是徽章墙。每一项都对应一个运行约束。</p>
            </header>
            <div className="project-stack__grid">
              {project.stack.map((item, index) => (
                <article data-project-reveal style={{ '--project-order': index } as React.CSSProperties} key={item.name}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <h3>{item.name}</h3>
                  <p>{item.detail}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="project-implementation" aria-labelledby="project-implementation-heading">
          <div className="projects-shell">
            <header className="project-section-heading" data-project-reveal>
              <p className="projects-kicker">IMPLEMENTATION / DECISIONS</p>
              <h2 id="project-implementation-heading">实现方法</h2>
            </header>
            <div className="project-implementation__list">
              {project.implementation.map((item, index) => (
                <article data-project-reveal style={{ '--project-order': index } as React.CSSProperties} key={item.title}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="project-boundaries" aria-labelledby="project-boundaries-heading">
          <div className="projects-shell project-boundaries__layout">
            <header className="project-section-heading" data-project-reveal>
              <p className="projects-kicker">CURRENT BOUNDARY / READ THIS</p>
              <h2 id="project-boundaries-heading">当前边界</h2>
            </header>
            <ul>
              {project.boundaries.map((boundary, index) => (
                <li data-project-reveal style={{ '--project-order': index } as React.CSSProperties} key={boundary}>
                  <span>{String(index + 1).padStart(2, '0')}</span><p>{boundary}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="project-detail__exit">
          <div className="projects-shell" data-project-reveal>
            <p className="projects-kicker">SOURCE / NEXT PROJECT</p>
            <h2>{project.repositoryLabel}</h2>
            <div>
              <a href={project.repository} target="_blank" rel="noreferrer">打开源码仓库 ↗</a>
              <Link to="/projects">返回项目索引 →</Link>
            </div>
          </div>
        </section>
      </main>
    </SitePage>
  )
}
