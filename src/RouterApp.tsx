import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { usePageMeta } from './articles/pageMeta'
import { SitePage } from './components/SiteChrome'

const HomePage = lazy(() => import('./App'))
const ArticleIndexPage = lazy(() => import('./articles/ArticleIndexPage').then((module) => ({ default: module.ArticleIndexPage })))
const ArticlePage = lazy(() => import('./articles/ArticlePage').then((module) => ({ default: module.ArticlePage })))
const ConsolePage = lazy(() => import('./articles/ConsolePage').then((module) => ({ default: module.ConsolePage })))
const ConsoleCommentsPage = lazy(() => import('./articles/ConsoleCommentsPage').then((module) => ({ default: module.ConsoleCommentsPage })))
const ArticleEditorPage = lazy(() => import('./articles/ArticleEditorPage').then((module) => ({ default: module.ArticleEditorPage })))
const ConsoleDashboard = lazy(() => import('./console/ConsoleDashboard').then((module) => ({ default: module.ConsoleDashboard })))
const ProjectsIndexPage = lazy(() => import('./projects/ProjectsIndexPage').then((module) => ({ default: module.ProjectsIndexPage })))
const ProjectDetailPage = lazy(() => import('./projects/ProjectDetailPage').then((module) => ({ default: module.ProjectDetailPage })))
const GalleryPage = lazy(() => import('./gallery/GalleryPage').then((module) => ({ default: module.GalleryPage })))
const ConsoleGalleryPage = lazy(() => import('./gallery/ConsoleGalleryPage').then((module) => ({ default: module.ConsoleGalleryPage })))

function ScrollManager() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (hash) {
      window.requestAnimationFrame(() => document.getElementById(hash.slice(1))?.scrollIntoView())
    } else {
      window.scrollTo({ top: 0, left: 0 })
    }
    window.requestAnimationFrame(() => {
      const main = document.getElementById('main-content')
      if (main) {
        main.tabIndex = -1
        main.focus({ preventScroll: true })
      }
    })
  }, [hash, pathname])
  return null
}

function LegacyConsoleRedirect() {
  const { pathname, search, hash } = useLocation()
  const suffix = pathname.slice('/articles/console'.length)
  const destination = !suffix
    ? '/console/articles'
    : suffix === '/new' || suffix.startsWith('/edit/')
      ? `/console/articles${suffix}`
      : `/console${suffix}`
  return <Navigate replace to={`${destination}${search}${hash}`} />
}

function NotFoundPage() {
  const { pathname } = useLocation()
  usePageMeta({
    title: '页面不存在 — ZongRui',
    description: '这个地址没有对应的公开页面。',
    canonical: `https://zongrui.org${pathname}`,
    noIndex: true,
    language: 'zh-CN',
    ogLocale: 'zh_CN',
  })

  return (
    <SitePage compactHeader>
      <main className="article-error" id="main-content">
        <p className="articles-kicker">404 / NOT FOUND</p>
        <h1>这个地址没有页面。</h1>
        <Link className="articles-primary-button" to="/">回到首页</Link>
      </main>
    </SitePage>
  )
}

export default function RouterApp() {
  return (
    <BrowserRouter>
      <ScrollManager />
      <Suspense fallback={<main className="route-loading" aria-label="正在读取页面" aria-busy="true" />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/articles" element={<ArticleIndexPage />} />
          <Route path="/articles/console/*" element={<LegacyConsoleRedirect />} />
          <Route path="/console" element={<ConsoleDashboard />} />
          <Route path="/console/articles" element={<ConsolePage />} />
          <Route path="/console/gallery" element={<ConsoleGalleryPage />} />
          <Route path="/console/comments" element={<ConsoleCommentsPage />} />
          <Route path="/console/articles/new" element={<ArticleEditorPage />} />
          <Route path="/console/articles/edit/:id" element={<ArticleEditorPage />} />
          <Route path="/articles/:slug" element={<ArticlePage />} />
          <Route path="/projects" element={<ProjectsIndexPage />} />
          <Route path="/projects/:slug" element={<ProjectDetailPage />} />
          <Route path="/gallery" element={<GalleryPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
