import React from 'react'

export default function BottomNavigation({items=[]}) {
  return <nav className="bottom-navigation">{items.map((item)=><button key={item.label}>{item.label}</button>)}</nav>
}
