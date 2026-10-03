export default function ReactionButton({ count = 0, onClick }) {
  return (
    <button type="button" onClick={onClick}>
      ★ {count}
    </button>
  )
}
