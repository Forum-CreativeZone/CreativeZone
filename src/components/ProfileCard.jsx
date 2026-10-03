export function ProfileCard({ profile }) {
  if (!profile) return null

  return (
    <section className="profile-card">
      <img src={profile.avatar_url} alt="" />
      <h2>{profile.display_name || profile.username}</h2>
      <p>{profile.bio}</p>
    </section>
  )
}
