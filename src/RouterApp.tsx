import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { usePageMeta } from './articles/pageMeta'
import { SitePage } from './components/SiteChrome'
import { MaterialButton } from './material/MaterialControls'

const HomePage = lazy(() => import('./App'))
const ArticleIndexPage = lazy(() => import('./articles/ArticleIndexPage').then((module) => ({ default: module.ArticleIndexPage })))
const ArticlePage = lazy(() => import('./articles/ArticlePage').then((module) => ({ default: module.ArticlePage })))
const ConsolePage = lazy(() => import('./articles/ConsolePage').then((module) => ({ default: module.ConsolePage })))
const ConsoleCommentsPage = lazy(() => import('./articles/ConsoleCommentsPage').then((module) => ({ default: module.ConsoleCommentsPage })))
const ArticleEditorPage = lazy(() => import('./articles/ArticleEditorPage').then((module) => ({ default: module.ArticleEditorPage })))
const ConsoleDashboard = lazy(() => import('./console/ConsoleDashboard').then((module) => ({ default: module.ConsoleDashboard })))
const ConsoleProfilePage = lazy(() => import('./console/ConsoleProfilePage').then((module) => ({ default: module.ConsoleProfilePage })))
const ProjectsIndexPage = lazy(() => import('./projects/ProjectsIndexPage').then((module) => ({ default: module.ProjectsIndexPage })))
const ProjectDetailPage = lazy(() => import('./projects/ProjectDetailPage').then((module) => ({ default: module.ProjectDetailPage })))
const GalleryPage = lazy(() => import('./gallery/GalleryPage').then((module) => ({ default: module.GalleryPage })))
const ConsoleGalleryPage = lazy(() => import('./gallery/ConsoleGalleryPage').then((module) => ({ default: module.ConsoleGalleryPage })))

function ScrollManager() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    let frame = 0
    let attempts = 0
    let temporaryFocusTarget: HTMLElement | null = null
    let focusedTarget: HTMLElement | null = null

    const focusTarget = (target: HTMLElement) => {
      if (!target.hasAttribute('tabindex')) {
        target.tabIndex = -1
        temporaryFocusTarget = target
      }
      focusedTarget = target
      target.classList.add('route-focus-target')
      target.focus({ preventScroll: true })
    }

    if (hash) {
      const rawHash = hash.slice(1)
      let hashTarget = rawHash
      try {
        hashTarget = decodeURIComponent(rawHash)
      } catch {
        // A malformed percent escape must not break the whole route.
      }
      const revealHashTarget = () => {
        const target = document.getElementById(hashTarget)
        if (target) {
          target.scrollIntoView({ block: 'start' })
          focusTarget(target)
          return
        }
        attempts += 1
        // Lazy routes may need more than a handful of frames on a cold mobile
        // load. Keep looking briefly so direct /#section links remain reliable.
        if (attempts < 120) frame = window.requestAnimationFrame(revealHashTarget)
      }
      frame = window.requestAnimationFrame(revealHashTarget)
    } else {
      const revealMainTarget = () => {
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
        const main = document.getElementById('main-content')
        if (main) {
          focusTarget(main)
          return
        }
        attempts += 1
        if (attempts < 120) frame = window.requestAnimationFrame(revealMainTarget)
      }
      frame = window.requestAnimationFrame(revealMainTarget)
    }
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      focusedTarget?.classList.remove('route-focus-target')
      temporaryFocusTarget?.removeAttribute('tabindex')
    }
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
        <MaterialButton className="articles-primary-button" href="/">回到首页</MaterialButton>
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
          <Route path="/console/profile" element={<ConsoleProfilePage />} />
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
