import { Link } from 'react-router-dom'
import { Arrow, SitePage } from '../components/SiteChrome'
import { usePageMeta } from '../articles/pageMeta'
import { useProjectReveals } from './projectMotion'
import { technicalProjects } from './projectData'
import { ProjectShowcaseVisual } from './ProjectVisuals'
import './projects.css'

const showcaseCopy = {
  robot: {
    title: 'RM Robot Rust',
    titleAccent: 'Control Framework',
    description: '面向 RoboMaster 的 Rust 整车控制框架。',
    tags: ['Rust', 'STM32F407', 'RoboMaster', 'no_std'],
    bandTone: 'graphite',
  },
  network: {
    title: 'Arista Switch',
    titleAccent: 'Web Dashboard',
    description: '把交换机运行状态，收进一块真正可用的屏幕。',
    tags: ['Python', 'Arista EOS', 'Telemetry', 'Operations'],
    bandTone: 'indigo',
  },
} as const

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
        <section id="top" aria-labelledby="projects-title">
          <h1 className="sr-only" id="projects-title">技术作品</h1>
          {technicalProjects.map((project) => {
            const copy = showcaseCopy[project.tone]
            const reverse = project.tone === 'network'

            return (
              <article
                className={`feature-band feature-band--${copy.bandTone}${reverse ? ' feature-band--reverse' : ''}`}
                key={project.slug}
              >
                <div className="feature-band__pattern" aria-hidden="true" />
                <div className="feature-band__inner">
                  <div className="feature-band__visual" data-project-reveal>
                    <ProjectShowcaseVisual tone={project.tone} />
                  </div>
                  <div className="feature-band__copy" data-project-reveal>
                    <p className="feature-eyebrow">{project.eyebrow}</p>
                    <h2>
                      {copy.title}
                      <span>{copy.titleAccent}</span>
                    </h2>
                    <p className="feature-description">{copy.description}</p>
                    <p className="feature-supporting">{project.summary}</p>
                    <div className="feature-tags" aria-label={`${project.shortTitle} 技术栈`}>
                      {copy.tags.map((tag) => <span key={tag}>{tag}</span>)}
                    </div>
                    <div className="feature-band__actions">
                      <Link className="button button--light" to={`/projects/${project.slug}`}>
                        查看项目档案 <Arrow />
                      </Link>
                      <a className="feature-band__log-link" href={project.repository} target="_blank" rel="noreferrer">
                        GitHub 源码 <Arrow />
                      </a>
                    </div>
                  </div>
                </div>
              </article>
            )
          })}
        </section>
      </main>
    </SitePage>
  )
}
