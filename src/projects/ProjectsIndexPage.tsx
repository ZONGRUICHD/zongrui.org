import { Link } from 'react-router-dom'
import { SitePage } from '../components/SiteChrome'
import { usePageMeta } from '../articles/pageMeta'
import { moveProjectCard, resetProjectCard, useProjectReveals } from './projectMotion'
import { technicalProjects } from './projectData'
import { ProjectVisual } from './ProjectVisuals'
import './projects.css'

export function ProjectsIndexPage() {
  useProjectReveals()
  usePageMeta({
    title: '技术作品 — ZongRui',
    description: 'ZongRui 的嵌入式机器人与网络运维项目，包含实现方法、技术栈和当前边界。',
    canonical: 'https://zongrui.org/projects',
    language: 'zh-CN',
    ogLocale: 'zh_CN',
  })

  return (
    <SitePage compactHeader>
      <main className="projects-index" id="main-content">
        <section className="projects-index__hero" id="top">
          <div className="projects-shell">
            <p className="projects-kicker">PROJECT INDEX / SYSTEMS THAT RUN</p>
            <div className="projects-index__heading">
              <h1>技术作品</h1>
              <div>
                <strong>02</strong>
                <p>两个项目。一个贴着电机和总线跑，另一个留在交换机里。</p>
              </div>
            </div>
            <div className="projects-index__signal" aria-hidden="true"><span /><span /><span /><span /></div>
          </div>
        </section>

        <section className="projects-catalogue" aria-label="项目列表">
          <div className="projects-shell">
            {technicalProjects.map((project, index) => (
              <article
                className={`project-index-card project-index-card--${project.tone}`}
                data-project-reveal
                onPointerMove={moveProjectCard}
                onPointerLeave={resetProjectCard}
                style={{ '--project-order': index } as React.CSSProperties}
                key={project.slug}
              >
                <div className="project-index-card__glow" aria-hidden="true" />
                <div className="project-index-card__copy">
                  <div className="project-index-card__meta">
                    <span>{project.number}</span>
                    <p>{project.eyebrow}</p>
                  </div>
                  <h2><Link to={`/projects/${project.slug}`}>{project.title}</Link></h2>
                  <p className="project-index-card__statement">{project.statement}</p>
                  <div className="project-index-card__facts">
                    {project.metrics.map((metric) => (
                      <div key={metric.label}>
                        <strong>{metric.value}</strong>
                        <span>{metric.label}</span>
                      </div>
                    ))}
                  </div>
                  <div className="project-index-card__actions">
                    <Link to={`/projects/${project.slug}`}>打开项目档案 <span aria-hidden="true">→</span></Link>
                    <span>{project.status}</span>
                  </div>
                </div>
                <Link className="project-index-card__visual" to={`/projects/${project.slug}`} aria-label={`打开 ${project.title} 项目档案`} tabIndex={-1}>
                  <ProjectVisual tone={project.tone} />
                </Link>
              </article>
            ))}
          </div>
        </section>

        <section className="projects-index__note" data-project-reveal>
          <div className="projects-shell">
            <p className="projects-kicker">WORKING RULE / 00</p>
            <p>这里记录已经落进代码的部分，也保留还没有完成的边界。项目页不是效果图清单，是实现决策的索引。</p>
          </div>
        </section>
      </main>
    </SitePage>
  )
}
