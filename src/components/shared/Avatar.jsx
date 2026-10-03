export default function Avatar({ src, name, className = '' }) {
  return (
    <img
      className={className}
      src={src}
      alt={name || 'avatar'}
    />
  )
}
