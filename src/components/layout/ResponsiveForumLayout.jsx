import DesktopForumLayout from '../desktop/DesktopForumLayout'
import MobileForumLayout from '../mobile/MobileForumLayout'

export default function ResponsiveForumLayout(props) {
  return (
    <>
      <div className="desktop-only">
        <DesktopForumLayout {...props} />
      </div>
      <div className="mobile-only">
        <MobileForumLayout {...props} />
      </div>
    </>
  )
}
