import { useEffect, useState, type FormEvent } from 'react'
import { articleApi } from '../articles/api'
import { ConsoleGate } from '../articles/ConsoleLayout'
import {
  DEFAULT_PROFILE_BIO,
  PROFILE_BIO_MAX_LENGTH,
  ProfileBio,
} from '../components/ProfileBio'

export function ConsoleProfilePage() {
  const [bio, setBio] = useState(DEFAULT_PROFILE_BIO)
  const [savedBio, setSavedBio] = useState(DEFAULT_PROFILE_BIO)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const length = Array.from(bio).length

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const { profile } = await articleApi.adminProfile()
      setBio(profile.bio)
      setSavedBio(profile.bio)
    } catch {
      setError('简介读取失败，请检查网络后重试。')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextBio = bio.trim()
    if (!nextBio) {
      setError('简介不能留空。')
      return
    }

    setSaving(true)
    setError('')
    setNotice('')
    try {
      const { profile } = await articleApi.updateProfile(nextBio)
      setBio(profile.bio)
      setSavedBio(profile.bio)
      setNotice('已保存，首页简介已经更新。')
    } catch {
      setError('简介保存失败，请稍后重试。')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ConsoleGate>
      <main className="console-main console-profile" id="main-content">
        <header className="console-page-heading">
          <div>
            <p className="articles-kicker">HOMEPAGE / PROFILE</p>
            <h1>简介</h1>
          </div>
        </header>

        <div className="console-profile__layout">
          <form className="console-profile__form" onSubmit={save}>
            <div className="console-profile__form-heading">
              <div>
                <p className="articles-kicker">PUBLIC COPY</p>
                <h2>首页文字</h2>
              </div>
              <output aria-live="polite">{length} / {PROFILE_BIO_MAX_LENGTH}</output>
            </div>
            <label htmlFor="site-profile-bio">我的简介</label>
            <textarea
              id="site-profile-bio"
              value={bio}
              maxLength={PROFILE_BIO_MAX_LENGTH}
              rows={10}
              disabled={loading || saving}
              onChange={(event) => {
                setBio(event.target.value)
                setNotice('')
              }}
            />
            <p>保存后显示在首页头像右侧；字号会随文字长度自动调整。</p>
            {error && <div className="console-profile__message console-profile__message--error" role="alert">{error}</div>}
            {notice && <div className="console-profile__message" role="status">{notice}</div>}
            <div className="console-profile__actions">
              <button
                className="articles-primary-button"
                type="submit"
                disabled={loading || saving || !bio.trim() || bio.trim() === savedBio}
              >
                {saving ? '正在保存…' : '保存简介'}
              </button>
              {error && (
                <button className="articles-secondary-button" type="button" disabled={loading} onClick={() => void load()}>
                  重新读取
                </button>
              )}
            </div>
          </form>

          <div className="console-profile__preview" aria-label="首页简介预览">
            <p className="articles-kicker">LIVE PREVIEW</p>
            <ProfileBio bio={bio} className="console-profile__bio" idPrefix="console-profile" />
          </div>
        </div>
      </main>
    </ConsoleGate>
  )
}
