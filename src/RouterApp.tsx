import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router-dom'
import { SitePage } from './components/SiteChrome'

const HomePage = lazy(() => import('./App'))
const ArticleIndexPage = lazy(() => import('./articles/ArticleIndexPage').then((module) => ({ default: module.ArticleIndexPage })))
const ArticlePage = lazy(() => import('./articles/ArticlePage').then((module) => ({ default: module.ArticlePage })))
const ConsolePage = lazy(() => import('./articles/ConsolePage').then((module) => ({ default: module.ConsolePage })))
const ConsoleCommentsPage = lazy(() => import('./articles/ConsoleCommentsPage').then((module) => ({ default: module.ConsoleCommentsPage })))
const ArticleEditorPage = lazy(() => import('./articles/ArticleEditorPage').then((module) => ({ default: module.ArticleEditorPage })))

function ScrollManager() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (hash) {
      window.requestAnimationFrame(() => document.getElementById(hash.slice(1))?.scrollIntoView())
    } else {
      window.scrollTo({ top: 0, left: 0 })
    }
  }, [hash, pathname])
  return null
}

function NotFoundPage() {
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
          <Route path="/articles/console" element={<ConsolePage />} />
          <Route path="/articles/console/comments" element={<ConsoleCommentsPage />} />
          <Route path="/articles/console/new" element={<ArticleEditorPage />} />
          <Route path="/articles/console/edit/:id" element={<ArticleEditorPage />} />
          <Route path="/articles/:slug" element={<ArticlePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
