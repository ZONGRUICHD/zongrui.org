export const DEFAULT_PROFILE_BIO = '平时主要写 Rust，做 RoboMaster 控制，也会管 Linux 服务器和交换机。缺什么工具，就自己补一个。'

export const PROFILE_BIO_MAX_LENGTH = 320

export function profileBioSize(bio: string) {
  const length = Array.from(bio.trim()).length
  if (length <= 38) return 'display'
  if (length <= 80) return 'large'
  if (length <= 160) return 'medium'
  return 'compact'
}

type ProfileBioProps = {
  bio: string
  className?: string
  idPrefix?: string
}

export function ProfileBio({ bio, className = '', idPrefix = 'profile' }: ProfileBioProps) {
  const text = bio.trim() || DEFAULT_PROFILE_BIO
  const size = profileBioSize(text)
  const titleId = `${idPrefix}-bio-title`

  return (
    <section
      className={`profile-bio profile-bio--${size}${className ? ` ${className}` : ''}`}
      aria-labelledby={titleId}
    >
      <header className="profile-bio__header">
        <p>PROFILE / ABOUT</p>
        <h2 id={titleId}>我的简介</h2>
      </header>
      <p className="profile-bio__text">{text}</p>
    </section>
  )
}
