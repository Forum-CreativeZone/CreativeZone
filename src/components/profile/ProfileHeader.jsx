export default function ProfileHeader({ profile }) {
  if (!profile) return null

  return (
    <header className="profile-header">
      <img src={profile.avatar_url || ''} alt="" />
      <h2>{profile.username}</h2>
    </header>
  )
}
