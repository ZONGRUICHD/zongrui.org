import { Link } from 'react-router-dom'
import { ConsoleGate } from '../articles/ConsoleLayout'

const consoleAreas = [
  {
    index: '01',
    label: 'ARTICLES',
    title: '文章',
    description: '写作、排版、翻译、发布和修订记录。',
    href: '/console/articles',
  },
  {
    index: '02',
    label: 'GALLERY',
    title: '图片',
    description: '上传图片，补充说明并控制公开顺序。',
    href: '/console/gallery',
  },
  {
    index: '03',
    label: 'COMMENTS',
    title: '评论',
    description: '查看、隐藏、恢复或删除文章评论。',
    href: '/console/comments',
  },
]

export function ConsoleDashboard() {
  return (
    <ConsoleGate>
      <main className="console-main console-dashboard" id="main-content">
        <header className="console-page-heading">
          <div>
            <p className="articles-kicker">ZONGRUI / PRIVATE CONSOLE</p>
            <h1>管理台</h1>
          </div>
          <Link className="articles-secondary-button" to="/" target="_blank">查看网站 ↗</Link>
        </header>
        <div className="console-dashboard__grid">
          {consoleAreas.map((area) => (
            <Link className="console-dashboard__card" to={area.href} key={area.href}>
              <span>{area.index}</span>
              <p>{area.label}</p>
              <h2>{area.title}</h2>
              <small>{area.description}</small>
              <b aria-hidden="true">↗</b>
            </Link>
          ))}
        </div>
      </main>
    </ConsoleGate>
  )
}
